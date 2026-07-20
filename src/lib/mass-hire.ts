/**
 * "Mass Hire" — a special bonus card that mass-hires ownerless players.
 *
 * - Locked by default; unlocks at 50 owned cards (mission 0 threshold).
 * - When activated, hires the cheapest ownerless players the buyer can afford,
 *   up to (1 + 10% of the buyer's current owned count) hires per use.
 * - Dynamic cooldown between uses (1–5+ min based on owned card count).
 * - Pinned at the top-left of the market page regardless of sort/filter.
 * - Avatar: /masshire.webp
 */

import { db } from "@/db";
import { users, gameSettings, ownership, rewardHistory } from "@/db/schema";
import { eq, and, sql, asc, ne, isNotNull, notInArray } from "drizzle-orm";
import { capPlayerValue, MAX_CREDITS_SQL } from "@/lib/safeguards";
import { checkAndAwardMissions, canPurchaseCard } from "@/lib/missions";
import { getProfessionPerks } from "@/lib/professionPerks";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { AGENT_USERNAMES, isAIPlayerUsername } from "@/lib/agent/roster";

const PERM_BLOCK_MS = 24 * 60 * 60 * 1000;
const MAX_PERM_BLOCKS = 10;

export const MASS_HIRE_USERNAME = "Mass Hire";
export const MASS_HIRE_AVATAR_URL = "/masshire.webp";

/** Mission threshold (owned cards) to unlock the Mass Hire card. */
export const MASS_HIRE_UNLOCK_THRESHOLD = 50;

/**
 * Dynamic cooldown based on the buyer's owned card count:
 *   50–100    → 10 sec
 *   100–500   → 20 sec
 *   500–1000  → 30 sec
 *   1000–2000 → 40 sec
 *   2000–3000 → 50 sec
 *   3000–4000 → 60 sec
 *   …each additional 1000 cards adds 10 sec.
 */
export function getMassHireCooldownMs(ownedCount: number): number {
  if (ownedCount < 100) return 10 * 1000;
  if (ownedCount < 500) return 20 * 1000;
  if (ownedCount < 1000) return 30 * 1000;
  // >= 1000: 30 sec base + 10 sec per additional 1000 cards.
  const extraSecs = (Math.floor((ownedCount - 1000) / 1000) + 1) * 10;
  return (30 + extraSecs) * 1000;
}

/** game_settings key storing the buyer's last mass-hire timestamp (epoch ms). */
function cooldownKey(buyerId: number) {
  return `mass_hire_last_${buyerId}`;
}

/**
 * Ensures the "Mass Hire" special NPC card exists in the database.
 * Returns its user id. Like the Agent seed, the id is cached in game_settings.
 */
export async function ensureMassHireCard(): Promise<number> {
  const CACHE_KEY = "mass_hire_card_id";

  // 1. Try cached id.
  const [cached] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, CACHE_KEY))
    .limit(1);

  if (cached?.value) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, cached.value))
      .limit(1);
    if (existing) return existing.id;
  }

  // 2. Fall back to username lookup.
  const [byName] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, MASS_HIRE_USERNAME))
    .limit(1);

  let cardId: number;
  if (byName) {
    cardId = byName.id;
    // Keep avatar/flags correct.
    await db
      .update(users)
      .set({ avatarUrl: MASS_HIRE_AVATAR_URL, isNpc: 1, isProtected: 1, isActive: 1 })
      .where(eq(users.id, cardId));
  } else {
    // 3. Create the card.
    const [created] = await db
      .insert(users)
      .values({
        username: MASS_HIRE_USERNAME,
        passwordHash: null,
        avatarUrl: MASS_HIRE_AVATAR_URL,
        avatarCompleted: 1,
        credits: 0,
        playerValue: 1,
        valueFloor: 1,
        isActive: 1,
        isVerified: 0,
        isNpc: 1,
        isProtected: 1,
        onboardingComplete: 1,
      })
      .returning({ id: users.id });
    cardId = created.id;
  }

  // Cache the id.
  await db
    .insert(gameSettings)
    .values({ settingKey: CACHE_KEY, settingValue: cardId })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: cardId, updatedAt: new Date() },
    });

  return cardId;
}

/**
 * Returns the epoch-SECONDS timestamp of the buyer's last Mass Hire cooldown end, or 0.
 * Stored in seconds (not ms) because game_settings.setting_value is a 32-bit integer.
 */
export async function getMassHireCooldownEnd(buyerId: number): Promise<number> {
  const [row] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, cooldownKey(buyerId)))
    .limit(1);
  return row ? Number(row.value) : 0;
}

export interface MassHireResult {
  success?: boolean;
  error?: string;
  hired?: { id: number; username: string; cost: number }[];
  totalSpent?: number;
  cooldownEndsAt?: number;
}

/**
 * Executes a Mass Hire: hires the cheapest ownerless players the buyer can
 * afford, up to (1 + floor(10% of buyer's current owned count)) hires.
 *
 * Each individual hire follows the same mechanics as a normal purchase:
 *   - cost = target's current playerValue
 *   - target value doubles (capped at MAX_PLAYER_VALUE)
 *   - 30-second sell block
 *   - ownership limit is respected
 *   - mission progress is checked after all hires
 *
 * The buyer's `lastOnlineAt` is NOT touched here (the buyer is actively using
 * the card). A dynamic cooldown is enforced via game_settings.
 */
export async function executeMassHire(buyerId: number): Promise<MassHireResult> {
  try {
    // 0. Cooldown check. Timestamps are stored as epoch SECONDS (int32).
    const cooldownEnd = await getMassHireCooldownEnd(buyerId);
    const nowSec = Math.floor(Date.now() / 1000);
    if (cooldownEnd > nowSec) {
      const remaining = cooldownEnd - nowSec;
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      return { error: `Mass Hire is on cooldown (${mins}m ${secs}s remaining)` };
    }

    // 1. Get buyer.
    const [buyer] = await db
      .select({
        id: users.id,
        username: users.username,
        credits: users.credits,
        hireSlots: users.hireSlots,
      })
      .from(users)
      .where(eq(users.id, buyerId))
      .limit(1);

    if (!buyer) return { error: "Player not found" };

    // 2. Check unlock: buyer must have completed mission 0 (50 cards) which
    //    unlocks the Mass Hire feature. Uses the mission level check.
    const unlocked = await canPurchaseCard(buyerId, MASS_HIRE_USERNAME);
    if (!unlocked) {
      const [ownedCountRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ownership)
        .where(eq(ownership.ownerId, buyerId));
      const currentOwned = Number(ownedCountRow?.count ?? 0);
      return {
        error: `🔒 Mass Hire unlocks at ${MASS_HIRE_UNLOCK_THRESHOLD} cards (Mission 1). You own ${currentOwned}.`,
      };
    }

    const [ownedCountRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(eq(ownership.ownerId, buyerId));
    const currentOwned = Number(ownedCountRow?.count ?? 0);

    // 3. Compute hire limit: 1 + floor(10% of owned count).
    // Plague Cartographer perk (Charted Spread): Mass Hire grabs +1 extra card.
    const buyerPerks = await getProfessionPerks(buyerId);
    const cartographerBonus = buyerPerks.has("Plague Cartographer") ? 1 : 0;
    const hireLimit = 1 + Math.floor(currentOwned * 0.1) + cartographerBonus;

    // 4. Check ownership slots.
    // Iron Choir Marshal perk (Rally the Choir): +2 hire slots.
    const marshalBonus = buyerPerks.has("Iron Choir Marshal") ? 2 : 0;
    const slotLimit = buyer.hireSlots + marshalBonus;
    const availableSlots = slotLimit - currentOwned;
    if (availableSlots <= 0) {
      return { error: `You've reached your hire limit of ${slotLimit} players.` };
    }
    const maxHires = Math.min(hireLimit, availableSlots);

    // 5. Find cheapest ownerless players first (excluding self, Mass Hire,
    //    goddesses, and every AGI). Sort by playerValue ascending.
    //    Cap ownerless hires at maxHires - 1 so at least 1 slot is reserved for
    //    a poach (owned card). Poaching awards +1 hire slot.
    const excludedSpecialNames = [MASS_HIRE_USERNAME, ...GODDESS_USERNAMES, ...AGENT_USERNAMES];

    const ownerlessCap = Math.max(0, maxHires - 1);

    const ownerlessCandidates = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        isNpc: users.isNpc,
      })
      .from(users)
      .where(
        and(
          ne(users.id, buyerId),
          eq(users.isActive, 1),
          sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = ${users.id}) = 0`,
          notInArray(users.username, excludedSpecialNames)
        )
      )
      .orderBy(asc(users.playerValue))
      .limit(ownerlessCap * 3);

    // Always fetch owned (poachable) candidates to fill the remaining slots
    // (at least 1). Exclude partnered/blocked players (those with an active
    // blockSellUntil) and Goddess of Fate holders' teams.
    let ownedCandidates: typeof ownerlessCandidates = [];
    if (ownerlessCap < maxHires) {
      ownedCandidates = await db
        .select({
          id: users.id,
          username: users.username,
          playerValue: users.playerValue,
          isNpc: users.isNpc,
        })
        .from(users)
        .where(
          and(
            ne(users.id, buyerId),
            eq(users.isActive, 1),
            sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = ${users.id}) > 0`,
            // Not already owned by the buyer.
            sql`NOT EXISTS (SELECT 1 FROM ownership o2 WHERE o2.owner_id = ${buyerId} AND o2.owned_id = ${users.id})`,
            // Not currently partnered (blockSellUntil or permBlockUntil in the future).
            sql`NOT EXISTS (SELECT 1 FROM ownership o3 WHERE o3.owned_id = ${users.id} AND ((o3.block_sell_until IS NOT NULL AND o3.block_sell_until > NOW()) OR (o3.perm_block_until IS NOT NULL AND o3.perm_block_until > NOW())))`,
            notInArray(users.username, excludedSpecialNames)
          )
        )
        .orderBy(asc(users.playerValue))
        .limit((maxHires - Math.min(ownerlessCandidates.length, ownerlessCap)) * 3);
    }

    // Combine: ownerless first, then owned (poachable).
    const candidates = [...ownerlessCandidates, ...ownedCandidates];

    if (candidates.length === 0) {
      return { error: "No players available to hire." };
    }

    // 6. Hire candidates from cheapest, while credits last.
    //    Ownerless players are simple hires. Owned players are poached:
    //    previous owner is paid cost × (1 + 1% per their owned count) and their
    //    ownership row is removed before creating the buyer's.
    let remainingCredits = Number(buyer.credits);
    const hired: { id: number; username: string; cost: number }[] = [];
    let totalSpent = 0;
    const now30s = new Date(Date.now() + 30 * 1000);

    let remainingPermBlocks = 0;
    if (!isAIPlayerUsername(buyer.username)) {
      const [permCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ownership)
        .where(and(eq(ownership.ownerId, buyerId), isNotNull(ownership.permBlockUntil)));
      remainingPermBlocks = Math.max(0, MAX_PERM_BLOCKS - permCount.count);
    }

    for (const target of candidates) {
      if (hired.length >= maxHires) break;

      const cost = Math.max(1, Math.round(Number(target.playerValue)));
      if (cost > remainingCredits) break;

      // Check not already owned by buyer (race safety).
      const [existing] = await db
        .select({ id: ownership.id })
        .from(ownership)
        .where(and(eq(ownership.ownerId, buyerId), eq(ownership.ownedId, target.id)))
        .limit(1);
      if (existing) continue;

      // Check if this target is currently owned by someone else (poach).
      const [currentOwner] = await db
        .select({
          id: ownership.id,
          ownerId: ownership.ownerId,
          blockSellUntil: ownership.blockSellUntil,
          permBlockUntil: ownership.permBlockUntil,
        })
        .from(ownership)
        .where(eq(ownership.ownedId, target.id))
        .limit(1);

      // Skip partnered/blocked players (shouldn't happen due to query filter,
      // but race safety). Perm blocks are unbreakable.
      if (currentOwner) {
        const blockEnd = currentOwner.blockSellUntil ? new Date(currentOwner.blockSellUntil).getTime() : 0;
        const permEnd = currentOwner.permBlockUntil ? new Date(currentOwner.permBlockUntil).getTime() : 0;
        if (Math.max(blockEnd, permEnd) > Date.now()) {
          continue;
        }
      }

      // Deduct credits from buyer.
      await db
        .update(users)
        .set({ credits: sql`GREATEST(credits - ${cost}, 0)`, updatedAt: new Date() })
        .where(eq(users.id, buyerId));

      // If poaching, pay the previous owner (cost × (1 + 1% per owned player))
      // and remove their ownership.
      if (currentOwner && currentOwner.ownerId !== buyerId) {
        const [prevOwnerOwnedRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(ownership)
          .where(eq(ownership.ownerId, currentOwner.ownerId));
        const prevOwnedCount = Number(prevOwnerOwnedRow?.count ?? 0);
        const bonusMultiplier = 1 + prevOwnedCount * 0.01;
        const ownerShare = Math.floor(cost * bonusMultiplier);

        await db
          .update(users)
          .set({ credits: sql`LEAST(credits + ${ownerShare}, ${sql.raw(MAX_CREDITS_SQL)})` })
          .where(eq(users.id, currentOwner.ownerId));

        // Remove the previous owner's ownership.
        await db.delete(ownership).where(eq(ownership.id, currentOwner.id));

        // Award +1 hire slot for poaching (same as regular purchases).
        try {
          await db
            .update(users)
            .set({ hireSlots: sql`${users.hireSlots} + 1`, updatedAt: new Date() })
            .where(eq(users.id, buyerId));

          await db.insert(rewardHistory).values({
            userId: buyerId,
            type: "slot_reward",
            amount: 1,
            details: JSON.stringify({
              reason: "mass_hire_poach",
              playerUsername: target.username,
            }),
          });
        } catch (slotError) {
          console.error("Mass Hire slot reward error:", slotError);
        }
      }

      // Double the target's value (capped), pay the target.
      const newValue = capPlayerValue(Math.round(Number(target.playerValue) * 2));
      await db
        .update(users)
        .set({
          playerValue: newValue,
          credits: sql`LEAST(credits + ${cost}, ${sql.raw(MAX_CREDITS_SQL)})`,
          purchaseCount: sql`${users.purchaseCount} + 1`,
          photoScore: sql`${users.photoScore} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, target.id));

      // Create ownership with a 30-second sell block. Grant a permanent 24h block
      // for the first 10 players this user acquires (excluding the Agent).
      let permBlockUntil = null;
      if (remainingPermBlocks > 0) {
        permBlockUntil = new Date(Date.now() + PERM_BLOCK_MS);
        remainingPermBlocks--;
      }

      await db.insert(ownership).values({
        ownerId: buyerId,
        ownedId: target.id,
        purchasePrice: cost,
        blockSellUntil: now30s,
        blockSellBy: buyer.username,
        permBlockUntil,
      });

      remainingCredits -= cost;
      totalSpent += cost;
      hired.push({ id: target.id, username: target.username, cost });
    }

    if (hired.length === 0) {
      return { error: "Could not afford any players." };
    }

    // 7. Set cooldown — duration depends on the buyer's current owned count.
    const cooldownMs = getMassHireCooldownMs(currentOwned);
    const cooldownEndsAtSec = Math.floor(Date.now() / 1000) + Math.floor(cooldownMs / 1000);
    await db
      .insert(gameSettings)
      .values({ settingKey: cooldownKey(buyerId), settingValue: cooldownEndsAtSec })
      .onConflictDoUpdate({
        target: gameSettings.settingKey,
        set: { settingValue: cooldownEndsAtSec, updatedAt: new Date() },
      });

    // 8. Check mission progress (mass hires count toward card count).
    await checkAndAwardMissions(buyerId);

    return {
      success: true,
      hired,
      totalSpent,
      cooldownEndsAt: cooldownEndsAtSec,
    };
  } catch (error) {
    console.error("Mass Hire error:", error);
    return { error: "Mass Hire failed. Please try again." };
  }
}
