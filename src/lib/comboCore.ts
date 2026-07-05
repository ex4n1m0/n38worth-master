import { db } from "@/db";
import { users, ownership, transactions, gameHistory, messages, rewardHistory, avatarReveals } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { sql } from "drizzle-orm";
import { createRandomPlayer } from "@/lib/random-player";

/** Number of fresh NPCs spawned into the market as part of a combo sale. */
const COMBO_NPC_SPAWN_COUNT = 6;

export interface SellComboResult {
  success?: boolean;
  error?: string;
  reward?: number;
  sumValue?: number;
  deletedNpcCount?: number;
  resetHumanCount?: number;
  deletedNpcNames?: string;
  resetHumanNames?: string;
  createdNpcCount?: number;
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
          error: `${target?.username ?? "A player"} is blocked and cannot be sold for ${minutesLeft} more minute${minutesLeft !== 1 ? "s" : ""}`,
        };
      }
    }

    // 5. Calculate reward
    const sumValue = targetPlayers.reduce((sum, p) => sum + p.playerValue, 0);
    const reward = sumValue * 10;

    // 6. Separate NPCs and humans
    const npcs = targetPlayers.filter((p) => p.isNpc === 1);
    const humans = targetPlayers.filter((p) => p.isNpc !== 1);
    const npcIds = npcs.map((p) => p.id);
    const humanIds = humans.map((p) => p.id);

    // 7. Execute deletions in FK-safe order (Neon HTTP driver: no transactions)
    //    a) Delete ALL ownership records referencing any of the 6 players
    //    b) Clean up messages/transactions referencing NPCs
    //    c) Delete reward history referencing NPCs
    //    d) Delete NPC users (now no FKs point to them)
    //    e) Reset humans to floor value

    // 7a. Delete ownership: current user's these 6, NPCs as owned, NPCs as owner, humans as owned
    const ownershipIds = ownershipRecords.map((r) => r.id);
    if (ownershipIds.length > 0) {
      await db.delete(ownership).where(inArray(ownership.id, ownershipIds));
    }
    if (npcIds.length > 0) {
      await db.delete(ownership).where(inArray(ownership.ownedId, npcIds));
      await db.delete(ownership).where(inArray(ownership.ownerId, npcIds));
    }
    if (humanIds.length > 0) {
      await db.delete(ownership).where(inArray(ownership.ownedId, humanIds));
    }

    // 7b. Delete messages referencing NPCs
    if (npcIds.length > 0) {
      await db.delete(messages).where(inArray(messages.senderId, npcIds));
      await db.delete(messages).where(inArray(messages.recipientId, npcIds));
    }

    // 7c. Delete transactions referencing NPCs
    if (npcIds.length > 0) {
      await db.delete(transactions).where(inArray(transactions.buyerId, npcIds));
      await db.delete(transactions).where(inArray(transactions.targetId, npcIds));
    }

    // 7d. Delete reward history referencing NPCs
    if (npcIds.length > 0) {
      await db.delete(rewardHistory).where(inArray(rewardHistory.userId, npcIds));
    }

    // 7d-2. Delete avatar reveals referencing NPCs (as viewer or target)
    if (npcIds.length > 0) {
      await db.delete(avatarReveals).where(inArray(avatarReveals.viewerId, npcIds));
      await db.delete(avatarReveals).where(inArray(avatarReveals.targetId, npcIds));
    }

    // 7e. Delete NPCs from users table (now no FKs point to them)
    if (npcIds.length > 0) {
      await db.delete(users).where(inArray(users.id, npcIds));
    }

    // 7f. Reset humans to floor value
    for (const human of humans) {
      await db
        .update(users)
        .set({
          playerValue: human.valueFloor ?? 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, human.id));
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
    const npcNames = npcs.map((p) => p.username).join(", ");
    const humanNames = humans.map((p) => p.username).join(", ");

    await db.insert(gameHistory).values({
      eventType: "sell_combo",
      actorId: ownerId,
      targetId: ownerId,
      details: JSON.stringify({
        reward,
        sumValue,
        multiplier: 10,
        deletedNpcs: npcNames,
        resetHumans: humanNames,
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

    return {
      success: true,
      reward,
      sumValue,
      deletedNpcCount: npcs.length,
      resetHumanCount: humans.length,
      deletedNpcNames: npcNames,
      resetHumanNames: humanNames,
      createdNpcCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Sell profession combo error:", message);
    return { error: `Sell combo failed: ${message}` };
  }
}
