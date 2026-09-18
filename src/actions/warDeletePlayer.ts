"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  users,
  ownership,
  transactions,
  messages,
  gameHistory,
  rewardHistory,
  hallOfFame,
  avatarReveals,
  gameSettings,
} from "@/db/schema";
import { eq, or, and, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { getGoddessPowers } from "@/lib/goddess-powers";
import { isAIPlayerUsername } from "@/lib/agent/roster";
import { createRandomPlayer } from "@/lib/random-player";
import { broadcastMarketRefresh } from "@/lib/market-broadcast";

/** Fresh NPCs spawned into the market for each NPC destroyed by War power. */
const WAR_DELETE_NPC_RESPAWN_COUNT = 2;
/** Cooldown between War deletes — one destruction per minute per player. */
const WAR_DELETE_COOLDOWN_MS = 60 * 1000;

function warDeleteCooldownKey(userId: number) {
  return `war_delete_cooldown_until_${userId}`;
}

/**
 * Returns the ISO timestamp until which the user's War delete is on cooldown,
 * or null when the power is ready. Read by the goddess-powers GET route so
 * the UI can disable the button while cooling down.
 */
export async function getWarDeleteCooldownUntil(userId: number): Promise<string | null> {
  const [row] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, warDeleteCooldownKey(userId)))
    .limit(1);
  if (!row) return null;
  const until = Number(row.value);
  if (!Number.isFinite(until) || until <= Date.now()) return null;
  return new Date(until).toISOString();
}

/** Starts the 1-minute War-delete cooldown. Returns the ISO end timestamp. */
async function setWarDeleteCooldown(userId: number): Promise<string> {
  const until = Date.now() + WAR_DELETE_COOLDOWN_MS;
  await db
    .insert(gameSettings)
    .values({ settingKey: warDeleteCooldownKey(userId), settingValue: until })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: until, updatedAt: new Date() },
    });
  return new Date(until).toISOString();
}

/**
 * Goddess of War power: destroy an owned card.
 *
 *   - Owned NPC: permanently deleted from the game; 2 fresh NPCs are spawned
 *     into the market as replacements (same best-effort pattern as the
 *     combo-sale respawn in comboCore.ts).
 *   - Owned human: never deleted — their card value resets to $1 (1¢) and
 *     the War holder LOSES ownership of them.
 *
 * Cooldown: after any War delete the player must wait 1 minute before
 * deleting again (`war_delete_cooldown_until_<userId>` in game_settings).
 *
 * The delete cascade mirrors `adminDeletePlayer.ts`, minus the owner
 * refunds: the actor IS the owner here, and refunding would turn the power
 * into a credit printer (delete → refund → respawn → repeat).
 *
 * Audit rows use `eventType: "war_delete"` with a `kind` detail of
 * "npc_deleted" or "human_value_reset".
 */
export async function warDeletePlayer(targetUserId: number) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" } as const;
  }

  const userId = parseInt(session.user.id);

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return { error: "Invalid target id" } as const;
  }
  if (targetUserId === userId) {
    return { error: "You cannot delete yourself" } as const;
  }

  try {
    // The War power is the gate: owning the Goddess of War (or the all-powers
    // Goddess) with the power toggled on.
    const powers = await getGoddessPowers(userId);
    if (!powers.hasWar) {
      return { error: "Requires the NullPointer power" } as const;
    }

    // 1-minute cooldown between deletes.
    const cooldownUntil = await getWarDeleteCooldownUntil(userId);
    if (cooldownUntil) {
      const retryAfterSec = Math.ceil((new Date(cooldownUntil).getTime() - Date.now()) / 1000);
      return {
        error: `War Delete is on cooldown — ${retryAfterSec}s remaining`,
        cooldownUntil,
      } as const;
    }

    // The power only works on cards the War holder owns.
    const [ownershipRecord] = await db
      .select()
      .from(ownership)
      .where(
        and(
          eq(ownership.ownerId, userId),
          eq(ownership.ownedId, targetUserId)
        )
      );
    if (!ownershipRecord) {
      return { error: "You don't own this card" } as const;
    }

    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId));

    if (!target) {
      return { error: "Player not found" } as const;
    }
    if (target.isProtected === 1) {
      return { error: "This account is protected and cannot be deleted." } as const;
    }
    if (isAIPlayerUsername(target.username)) {
      return { error: "Autonomous goddesses cannot be deleted." } as const;
    }

    if (target.isNpc !== 1) {
      // Human card: value resets to $1 (1¢) and the War holder LOSES
      // ownership — the player stays in the game, now ownerless.
      await db
        .update(users)
        .set({ playerValue: 1, updatedAt: new Date() })
        .where(eq(users.id, targetUserId));

      await db
        .delete(ownership)
        .where(eq(ownership.id, ownershipRecord.id));

      await db.insert(gameHistory).values({
        eventType: "war_delete",
        actorId: userId,
        targetId: targetUserId,
        targetUsername: target.username,
        details: JSON.stringify({
          kind: "human_value_reset",
          previousValue: target.playerValue,
          newValue: 1,
          ownershipReleased: true,
        }),
      });

      const newCooldownUntil = await setWarDeleteCooldown(userId);

      try {
        await pusher.trigger(`player-${targetUserId}`, "ownership-changed", {
          type: "war-delete",
          initiator: session.user.name,
          newValue: 1,
        });
      } catch (pusherError) {
        console.error("Pusher error:", pusherError);
      }

      // Bulk change — throttled client refetch.
      await broadcastMarketRefresh("war-delete");

      return {
        success: true,
        kind: "human" as const,
        username: target.username,
        cooldownUntil: newCooldownUntil,
      } as const;
    }

    // NPC card: full delete. neon-http has no transactions; run sequentially.
    // Order matters: clean up every FK-referencing row before deleting the
    // user record (mirrors adminDeletePlayer).
    const tx = db;

    // 1. Release every player owned by the target (reset value to floor).
    //    NPCs additionally get `ownerlessAt` stamped so the decay loop can
    //    eventually reclaim them.
    const ownedPlayers = await tx
      .select({
        ownedId: ownership.ownedId,
        isNpc: users.isNpc,
      })
      .from(ownership)
      .innerJoin(users, eq(users.id, ownership.ownedId))
      .where(eq(ownership.ownerId, targetUserId));

    for (const record of ownedPlayers) {
      await tx
        .update(users)
        .set({
          playerValue: sql`value_floor`,
          updatedAt: new Date(),
          ...(record.isNpc === 1 ? { ownerlessAt: new Date() } : {}),
        })
        .where(eq(users.id, record.ownedId));
    }

    // 2. Audit log BEFORE deleting the user, so it survives FK cleanup.
    await tx.insert(gameHistory).values({
      eventType: "war_delete",
      actorId: userId,
      targetId: targetUserId,
      targetUsername: target.username,
      details: JSON.stringify({
        kind: "npc_deleted",
        playerValue: target.playerValue,
        playersReleased: ownedPlayers.length,
      }),
    });

    // 3. Delete every row that FK-references the target.
    await tx
      .update(users)
      .set({ onboardingCreatedBy: null })
      .where(eq(users.onboardingCreatedBy, targetUserId));

    await tx.delete(ownership).where(
      or(eq(ownership.ownerId, targetUserId), eq(ownership.ownedId, targetUserId))
    );
    await tx.delete(transactions).where(
      or(eq(transactions.buyerId, targetUserId), eq(transactions.targetId, targetUserId))
    );
    await tx.delete(messages).where(
      or(eq(messages.senderId, targetUserId), eq(messages.recipientId, targetUserId))
    );
    await tx.delete(rewardHistory).where(eq(rewardHistory.userId, targetUserId));
    await tx.delete(hallOfFame).where(eq(hallOfFame.userId, targetUserId));
    await tx.delete(avatarReveals).where(
      or(eq(avatarReveals.viewerId, targetUserId), eq(avatarReveals.targetId, targetUserId))
    );

    // 4. Finally the user row itself.
    await tx.delete(users).where(eq(users.id, targetUserId));

    // 5. Spawn 2 fresh NPCs into the market to replace the destroyed one.
    //    Best-effort & parallel so a slow/failed avatar fetch never fails the
    //    already-completed deletion.
    let respawnedCount = 0;
    try {
      const spawnResults = await Promise.allSettled(
        Array.from({ length: WAR_DELETE_NPC_RESPAWN_COUNT }, () => createRandomPlayer())
      );
      respawnedCount = spawnResults.filter(
        (r) => r.status === "fulfilled" && (r.value as { success?: boolean })?.success
      ).length;
    } catch (spawnError) {
      console.error("War-delete NPC respawn error (non-fatal):", spawnError);
    }

    try {
      await pusher.trigger(`player-${targetUserId}`, "ownership-changed", {
        type: "war-delete",
        initiator: session.user.name,
      });
    } catch (pusherError) {
      console.error("Pusher error:", pusherError);
    }

    const newCooldownUntil = await setWarDeleteCooldown(userId);

    // Bulk change — throttled client refetch.
    await broadcastMarketRefresh("war-delete");

    return {
      success: true,
      kind: "npc" as const,
      username: target.username,
      respawnedCount,
      cooldownUntil: newCooldownUntil,
    } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("War delete error:", message, error);
    return { error: "War delete failed. Please try again." } as const;
  }
}
