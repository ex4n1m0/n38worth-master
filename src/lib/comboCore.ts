import { db } from "@/db";
import { users, ownership, transactions, gameHistory } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { sql } from "drizzle-orm";
import { createRandomPlayer } from "@/lib/random-player";
import { broadcastMarketRefresh } from "@/lib/market-broadcast";

/** Number of fresh NPCs spawned into the market as part of a combo sale. */
const COMBO_NPC_SPAWN_COUNT = 6;

/** One-time hire-slot bonus on a player's FIRST combo sale. */
const FIRST_COMBO_SLOTS_BONUS = 50;

/**
 * Payouts above this are logged as errors so they surface in Vercel logs —
 * the historical combo+overclock exploit minted 1e17 credits, so any sale in
 * this range deserves a human look.
 */
const COMBO_PAYOUT_ALERT_THRESHOLD = 1_000_000_000;

export interface SellComboResult {
  success?: boolean;
  error?: string;
  reward?: number;
  sumValue?: number;
  resetPlayerCount?: number;
  resetPlayerNames?: string;
  createdNpcCount?: number;
  /** 50 on the seller's first-ever combo sale, 0 otherwise. */
  firstComboBonus?: number;
}

/**
 * Session-free core of the profession-combo sale.
 *
 * The owner is supplied explicitly as `ownerId` so this can be reused by the
 * `sellProfessionCombo` server action (owner from auth session) and by
 * automated players such as the AI Agent cron (no browser session).
 *
 * Behavior is identical to the original server-action body.
 */
export async function sellComboCore(ownerId: number, playerIds: number[]): Promise<SellComboResult> {
  if (!Array.isArray(playerIds) || playerIds.length !== 6) {
    return { error: "Exactly 6 players are required for a profession combo" };
  }

  const uniqueIds = new Set(playerIds);
  if (uniqueIds.size !== 6) {
    return { error: "All 6 players must be unique" };
  }

  try {
    // 1. Fetch all ownership records - verify user owns all 6
    const ownershipRecords = await db
      .select()
      .from(ownership)
      .where(
        and(
          eq(ownership.ownerId, ownerId),
          inArray(ownership.ownedId, playerIds)
        )
      );

    if (ownershipRecords.length !== 6) {
      return { error: "You must own all 6 players in the combo" };
    }

    // 2. Fetch the 6 players and validate professions
    const targetPlayers = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        valueFloor: users.valueFloor,
        isNpc: users.isNpc,
        profession: users.profession,
        credits: users.credits,
      })
      .from(users)
      .where(inArray(users.id, playerIds));

    if (targetPlayers.length !== 6) {
      return { error: "Some players were not found" };
    }

    // 3. Validate all 6 have distinct non-null professions
    const professions = targetPlayers.map((p) => p.profession);
    const professionSet = new Set(professions);

    if (professions.some((p) => !p)) {
      return { error: "All 6 players must have a profession" };
    }
    if (professionSet.size !== 6) {
      return { error: "All 6 players must have different professions" };
    }

    // 4. Check for active sell blocks
    for (const record of ownershipRecords) {
      if (
        record.blockSellUntil &&
        new Date(record.blockSellUntil) > new Date()
      ) {
        const target = targetPlayers.find((p) => p.id === record.ownedId);
        const expiresAt = new Date(record.blockSellUntil);
        const minutesLeft = Math.ceil(
          (expiresAt.getTime() - Date.now()) / 60000
        );
        return {
          error: `${target?.username ?? "A building"} is firewalled and can't be sold for ${minutesLeft} more minute${minutesLeft !== 1 ? "s" : ""}`,
        };
      }
    }

    // 5. Calculate reward
    const sumValue = targetPlayers.reduce((sum, p) => sum + p.playerValue, 0);
    const reward = sumValue * 10;

    if (reward > COMBO_PAYOUT_ALERT_THRESHOLD) {
      console.error("[COMBO PAYOUT ALERT]", {
        ownerId,
        reward,
        sumValue,
      });
    }

    // 5b. First-sale check (before this sale's history row exists). A
    // player's first-ever combo sale pays a hire-slot bonus, surfaced as a
    // mission-style reward and announced in the client toast.
    const [priorSaleRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(gameHistory)
      .where(and(eq(gameHistory.eventType, "sell_combo"), eq(gameHistory.actorId, ownerId)));
    const isFirstComboSale = Number(priorSaleRow?.count ?? 0) === 0;

    // 6. All 6 players (NPCs and humans) are treated the same way:
    //    - Ownership is removed (they become ownerless)
    //    - Value is reset to floor value
    //    - They are NOT deleted — they stay in the game
    const allPlayerIds = targetPlayers.map((p) => p.id);

    // 7. Execute cleanup (Neon HTTP driver: no transactions)
    //    a) Delete ALL ownership records for these 6 players (as owned)
    //    b) Reset all 6 players to their floor value

    // 7a. Delete ownership: the caller's 6 ownership records, plus any other
    //     ownership where these players are the owned card (they may have been
    //     stolen and re-owned by someone else — unlikely in a combo but safe).
    const ownershipIds = ownershipRecords.map((r) => r.id);
    if (ownershipIds.length > 0) {
      await db.delete(ownership).where(inArray(ownership.id, ownershipIds));
    }
    // Also remove any ownership where these players are owned by others
    if (allPlayerIds.length > 0) {
      await db.delete(ownership).where(inArray(ownership.ownedId, allPlayerIds));
    }

    // 7b. Reset ALL 6 players to their floor value (NPCs and humans alike)
    for (const player of targetPlayers) {
      await db
        .update(users)
        .set({
          playerValue: player.valueFloor ?? 1,
          ownerlessAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, player.id));
    }

    // 8. Award credits to the owner
    const [ownerRecord] = await db
      .select({ credits: users.credits, username: users.username })
      .from(users)
      .where(eq(users.id, ownerId));

    if (!ownerRecord) {
      return { error: "Owner not found" };
    }

    const newCredits = Math.min(ownerRecord.credits + reward, Number.MAX_SAFE_INTEGER);

    await db
      .update(users)
      .set({
        credits: sql`LEAST(credits + ${reward}, ${sql.raw(MAX_CREDITS_SQL)})`,
        ...(isFirstComboSale
          ? { hireSlots: sql`${users.hireSlots} + ${FIRST_COMBO_SLOTS_BONUS}` }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, ownerId));

    // 8b. Spawn fresh NPCs into the market as part of the combo reward. Missions
    // are core to the game (owned-card count drives the ladder), and a combo
    // consumes 6 human cards, so each sale replenishes the world with 6 new
    // ownerless NPCs. Best-effort & parallel so a slow/failed avatar fetch never
    // fails the already-completed sale.
    let createdNpcCount = 0;
    try {
      const spawnResults = await Promise.allSettled(
        Array.from({ length: COMBO_NPC_SPAWN_COUNT }, () => createRandomPlayer())
      );
      createdNpcCount = spawnResults.filter(
        (r) => r.status === "fulfilled" && (r.value as { success?: boolean })?.success
      ).length;
    } catch (e) {
      console.error("Combo NPC spawn error (non-fatal):", e);
    }

    // 9. Log transaction
    await db.insert(transactions).values({
      buyerId: ownerId,
      targetId: ownerId,
      type: "sell_combo",
      amount: reward,
    });

    // 10. Log to game history
    const allNames = targetPlayers.map((p) => p.username).join(", ");

    await db.insert(gameHistory).values({
      eventType: "sell_combo",
      actorId: ownerId,
      targetId: ownerId,
      details: JSON.stringify({
        reward,
        sumValue,
        multiplier: 10,
        resetPlayers: allNames,
        professions: professions,
        createdNpcCount,
      }),
    });

    // 11. Trigger real-time updates (best-effort)
    // Wrapped in try/catch because pusher.trigger can throw synchronously
    // (e.g. HMAC signing fails when PUSHER_SECRET is undefined), which would
    // otherwise bubble up and fail the already-completed combo sell.
    try {
      Promise.all([
        pusher.trigger(`player-${ownerId}`, "credits-updated", { newCredits }),
        ...targetPlayers.map((p) =>
          pusher.trigger(`player-${p.id}`, "ownership-changed", {
            type: "sell_combo",
            initiator: ownerRecord.username,
          })
        ),
      ]).catch((e) => console.error("Pusher error:", e));
    } catch (e) {
      console.error("Pusher trigger error (non-fatal):", e);
    }

    // Bulk change — ask connected clients to refetch their market views.
    await broadcastMarketRefresh("combo-sale");

    return {
      success: true,
      reward,
      sumValue,
      resetPlayerCount: targetPlayers.length,
      resetPlayerNames: allNames,
      createdNpcCount,
      firstComboBonus: isFirstComboSale ? FIRST_COMBO_SLOTS_BONUS : 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Sell profession combo error:", message);
    return { error: `Sell combo failed: ${message}` };
  }
}
