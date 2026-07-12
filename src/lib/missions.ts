/**
 * Marketplace missions.
 *
 * Sequential "collect N cards" missions shown on the market page. Only one
 * mission is active at a time; completing it advances `users.mission_level`
 * and reveals the next one. Progress is measured by the number of players the
 * user currently owns (ownership rows where owner_id = user).
 *
 * When a mission completes, its reward card(s) are awarded to the player for
 * FREE: ownership is force-transferred (bypassing slot limits and block/partner
 * protection) and the previous owner is paid the card's current value.
 */

import { db } from "@/db";
import { users, ownership, rewardHistory, gameHistory } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { getCountdownState, startCountdown } from "@/lib/goddess-countdown";
import { pusher } from "@/lib/pusher-server";
// Single source of truth for the mission ladder (client-safe). Re-exported so
// server consumers can keep importing MISSIONS / Mission from "@/lib/missions".
import { MISSIONS, type Mission, MASS_HIRE_CARD, UNLOCK_GAME_HIRE_SLOTS } from "@/lib/missions-data";

export { MISSIONS };
export type { Mission };

// Goddesses get a fixed 30-min unbreakable block when acquired,
// matching the behavior in purchasePlayer.
const UNBREAKABLE_BLOCK_MS = 30 * 60 * 1000;

/** Count how many players a user currently owns. */
export async function getOwnedCount(userId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ownership)
    .where(eq(ownership.ownerId, userId));
  return Number(row?.count ?? 0);
}

/** Read the user's current mission level. Returns null if unavailable. */
async function getMissionLevel(userId: number): Promise<number | null> {
  try {
    const [row] = await db
      .select({ missionLevel: users.missionLevel })
      .from(users)
      .where(eq(users.id, userId));
    return row ? Number(row.missionLevel) : null;
  } catch {
    // mission_level column may not exist yet
    return null;
  }
}

/**
 * Map of lockable card username → index of the mission that awards it. Built
 * from MISSIONS so it always stays in sync. Only these cards (the 3 passive
 * bonus cards and the goddesses) can be locked behind missions; every other
 * card / player is always purchasable.
 */
const MISSION_CARD_LEVEL: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  MISSIONS.forEach((mission, index) => {
    for (const card of mission.rewardCards) {
      if (!(card in map)) map[card] = index;
    }
  });
  return map;
})();

/**
 * Whether `cardUsername` can be bought with credits by this buyer.
 *
 * Goddesses and the 3 passive bonus cards are locked until the buyer has
 * completed the mission that awards them (i.e. mission_level has advanced past
 * that mission's index). All other cards and regular players are always
 * purchasable, so this returns true immediately without a DB hit. If the
 * mission feature is unavailable (mission_level column missing), nothing is
 * locked.
 */
export async function canPurchaseCard(
  buyerId: number,
  cardUsername: string
): Promise<boolean> {
  const requiredIndex = MISSION_CARD_LEVEL[cardUsername];
  if (requiredIndex === undefined) return true; // not a lockable card

  const level = await getMissionLevel(buyerId);
  if (level === null) return true; // missions disabled / column missing

  // A mission is complete once mission_level has advanced past its index.
  return level > requiredIndex;
}

/**
 * Force-award a single card to the buyer for free.
 * - Skips silently if the card user does not exist.
 * - If the buyer already owns it, does nothing (treated as already won).
 * - Otherwise pays the previous owner the card's current value and transfers
 *   ownership with a 30-min unbreakable block.
 * Returns true if the buyer owns the card after this call.
 */
async function forceAwardCard(
  buyerId: number,
  buyerUsername: string,
  cardUsername: string
): Promise<boolean> {
  const [card] = await db
    .select({ id: users.id, username: users.username, playerValue: users.playerValue })
    .from(users)
    .where(eq(users.username, cardUsername))
    .limit(1);

  if (!card) return false;

  // Already owned by buyer? Skip & advance.
  const existing = await db
    .select({ id: ownership.id })
    .from(ownership)
    .where(and(eq(ownership.ownerId, buyerId), eq(ownership.ownedId, card.id)));
  if (existing.length > 0) return true;

  // Mission awards (Mass Hire + 6 goddesses). The previous owner is paid the
  // card's current value.
  const cost = card.playerValue;

  // Pay the previous owner (if any) the card's current value, then remove their ownership.
  const [currentOwner] = await db
    .select()
    .from(ownership)
    .where(eq(ownership.ownedId, card.id));

  if (currentOwner) {
    await db
      .update(users)
      .set({ credits: sql`LEAST(credits + ${cost}, ${sql.raw(MAX_CREDITS_SQL)})` })
      .where(eq(users.id, currentOwner.ownerId));

    try {
      await db.insert(rewardHistory).values({
        userId: currentOwner.ownerId,
        type: "mission_reward",
        amount: cost,
        details: JSON.stringify({
          wonBy: buyerUsername,
          cardUsername: card.username,
          reason: "mission_award",
          salePrice: cost,
        }),
      });
    } catch (e) {
      console.error("Mission reward history insert error:", e);
    }

    await db.delete(ownership).where(eq(ownership.id, currentOwner.id));
  }

  const blockExpiry = new Date(Date.now() + UNBREAKABLE_BLOCK_MS);
  await db.insert(ownership).values({
    ownerId: buyerId,
    ownedId: card.id,
    purchasePrice: 0,
    blockSellUntil: blockExpiry,
    blockSellBy: buyerUsername,
    blockUnbreakableUntil: blockExpiry,
  });

  try {
    await db.insert(gameHistory).values({
      eventType: "mission_reward",
      actorId: buyerId,
      targetId: card.id,
      targetUsername: card.username,
      details: JSON.stringify({
        reason: "mission_award",
        cost,
        ...(currentOwner ? { previousOwnerId: currentOwner.ownerId } : {}),
      }),
    });
  } catch (e) {
    console.error("Mission game history insert error:", e);
  }

  return true;
}

/**
 * If the buyer now owns all 6 goddesses, start the win countdown (mirrors the
 * logic in purchasePlayer for the "owns all goddesses" case).
 */
async function maybeStartGoddessCountdown(buyerId: number, buyerUsername: string) {
  try {
    const goddesses = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.username, GODDESS_USERNAMES));
    const goddessIds = goddesses.map((g) => g.id);
    if (goddessIds.length === 0) return;

    const [cnt] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(and(eq(ownership.ownerId, buyerId), inArray(ownership.ownedId, goddessIds)));

    if (Number(cnt?.count ?? 0) >= 6) {
      const existing = await getCountdownState();
      if (!(existing.active && existing.userId === buyerId)) {
        await startCountdown(buyerId);
        try {
          const state = await getCountdownState();
          await pusher.trigger("game-global", "countdown-started", {
            username: buyerUsername,
            userId: buyerId,
            durationMinutes: state.durationMinutes,
          });
        } catch (e) {
          console.error("Mission countdown pusher error:", e);
        }
      }
    }
  } catch (e) {
    console.error("Mission goddess countdown error:", e);
  }
}

/**
 * Check the buyer's mission progress and award reward cards for every mission
 * whose threshold is now met. Advances mission_level as missions complete.
 * Safe to call after any successful hire; no-ops if the column is missing.
 */
export async function checkAndAwardMissions(buyerId: number): Promise<void> {
  const level = await getMissionLevel(buyerId);
  if (level === null || level >= MISSIONS.length) return;

  const [buyer] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, buyerId));
  if (!buyer) return;

  let currentLevel = level;
  let awardedGoddess = false;
  let ownedCount = await getOwnedCount(buyerId);

  while (currentLevel < MISSIONS.length && ownedCount >= MISSIONS[currentLevel].threshold) {
    const mission = MISSIONS[currentLevel];

    for (const cardName of mission.rewardCards) {
      const owned = await forceAwardCard(buyerId, buyer.username, cardName);
      if (owned && GODDESS_USERNAMES.includes(cardName)) awardedGoddess = true;
    }

    // Upgrade hire slots if the mission specifies it (e.g. unlock-game mission).
    if (mission.upgradeHireSlots) {
      await db
        .update(users)
        .set({ hireSlots: mission.upgradeHireSlots, updatedAt: new Date() })
        .where(eq(users.id, buyerId));
    }

    currentLevel += 1;
    await db
      .update(users)
      .set({ missionLevel: currentLevel, updatedAt: new Date() })
      .where(eq(users.id, buyerId));

    // Awarded cards increase the owned count; recompute before the next loop.
    ownedCount = await getOwnedCount(buyerId);
  }

  if (awardedGoddess) {
    await maybeStartGoddessCountdown(buyerId, buyer.username);
  }
}
