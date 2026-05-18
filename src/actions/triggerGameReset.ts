"use server";

import { db } from "@/db";
import {
  users,
  ownership,
  transactions,
  messages,
  hallOfFame,
  gameHistory,
  rewardHistory,
  avatarReveals,
} from "@/db/schema";
import { sql, notInArray, desc, eq, and } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { GODDESS_USERNAMES, GODDESS_VALUES } from "@/lib/goddesses";
import {
  clearCountdown,
  getCountdownState,
  getLastProcessedCountdownStart,
  markCountdownProcessed,
} from "@/lib/goddess-countdown";

/**
 * Triggered when a player owns all 6 goddesses AND the countdown has expired.
 * Records the winner in the Hall of Fame, then resets the entire game.
 *
 * Reset semantics (per game spec):
 *   - All ownership rows are deleted
 *   - All transactions, messages, and avatar reveals are deleted
 *   - ALL non-goddess NPCs are HARD DELETED (the NPC population is wiped so
 *     the random-player cron can repopulate from scratch)
 *   - All remaining humans are reset to credits=100, playerValue=1, valueFloor=1
 *     with rank-bonus / login-reward timestamps cleared (derived ranks drop
 *     back to the lowest tier automatically)
 *   - Goddesses are reset to their original floor values (and marked isProtected)
 *   - Winner is recorded in hall_of_fame with wasReset=0 (so they do not see
 *     the "world has been reset" toast meant for the rest of the world)
 *
 * Idempotency:
 *   - `hall_of_fame` check (60s window on the same winner)
 *   - `goddess_countdown_last_processed_start` marker written AFTER destructive
 *     work succeeds, so a partial/crashed reset can be safely retried by the
 *     next cron tick.
 */
export async function triggerGameReset(
  winnerId: number,
  winnerUsername: string,
  countdownStart?: number
) {
  try {
    // 0a. Idempotency via processed-start marker (fast-path bail for retries)
    if (countdownStart && countdownStart > 0) {
      const lastProcessed = await getLastProcessedCountdownStart();
      if (lastProcessed === countdownStart) {
        console.warn(
          `Game reset already processed for countdown start=${countdownStart} (winner ${winnerId})`
        );
        return { success: true, duplicate: true };
      }
    }

    // 0b. Defensive 60-second duplicate guard on hallOfFame
    const recentWin = await db
      .select({ id: hallOfFame.id })
      .from(hallOfFame)
      .where(
        sql`${hallOfFame.userId} = ${winnerId} AND ${hallOfFame.wonAt} > NOW() - INTERVAL '60 seconds'`
      )
      .orderBy(desc(hallOfFame.wonAt))
      .limit(1);

    if (recentWin.length > 0) {
      console.warn(`Duplicate win attempt blocked for user ${winnerId} (${winnerUsername})`);
      // Still mark processed so the cron stops retrying.
      if (countdownStart && countdownStart > 0) {
        await markCountdownProcessed(countdownStart);
      }
      try {
        await clearCountdown();
      } catch {}
      return { success: true, duplicate: true };
    }

    // 1. Record the winner in the Hall of Fame
    await db.insert(hallOfFame).values({
      userId: winnerId,
      username: winnerUsername,
    });

    // 2. Log to game history
    await db.insert(gameHistory).values({
      eventType: "game_won",
      actorId: winnerId,
      targetId: winnerId,
      targetUsername: winnerUsername,
      details: JSON.stringify({
        message: `${winnerUsername} collected all 6 goddesses and won the game!`,
      }),
    });

    // 3. Delete all ownership records (wipes the economy graph)
    await db.delete(ownership);

    // 4. Delete all transactions
    await db.delete(transactions);

    // 5. Delete all messages
    await db.delete(messages);

    // 5b. Delete all avatar reveals.
    // avatar_reveals.viewer_id / target_id are FKs to users.id with no
    // ON DELETE clause (default NO ACTION), so any reveal row pointing at
    // an NPC would block the NPC hard-delete below. Reveals are meaningless
    // after a game reset anyway (all ownership is gone), so wipe the table.
    await db.delete(avatarReveals);

    // 6. Hard-delete ALL non-goddess NPCs.
    // Ownership is already cleared (step 3) so we only need to remove the
    // NPC users themselves plus their reward_history rows. Goddesses are
    // excluded by isProtected=1.
    const nonGoddessNpcs = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(and(eq(users.isNpc, 1), eq(users.isProtected, 0)));

    if (nonGoddessNpcs.length > 0) {
      const npcIds = nonGoddessNpcs.map((n) => n.id);

      // Bulk-clean reward_history for these NPCs (FK to users.id).
      try {
        await db
          .delete(rewardHistory)
          .where(sql`${rewardHistory.userId} IN (${sql.join(npcIds, sql`, `)})`);
      } catch (rhErr) {
        console.error("Failed to bulk-delete rewardHistory for NPCs:", rhErr);
      }

      // Delete the NPC users. ownership/transactions/messages were already
      // wiped, so there are no remaining FK references.
      await db
        .delete(users)
        .where(
          sql`${users.id} IN (${sql.join(npcIds, sql`, `)})`
        );

      // Single audit row summarizing the mass deletion.
      await db.insert(gameHistory).values({
        eventType: "npc_mass_deletion",
        actorId: winnerId,
        targetId: null,
        targetUsername: null,
        details: JSON.stringify({
          reason: "game_win_reset",
          winnerId,
          winnerUsername,
          deletedCount: nonGoddessNpcs.length,
          deletedUsernames: nonGoddessNpcs.map((n) => n.username),
        }),
      });
    }

    // 7. Clear reward_history for all non-goddess players (humans + winner).
    // This resets Income History and Boss Income displays to zero.
    await db
      .delete(rewardHistory)
      .where(
        sql`${rewardHistory.userId} IN (SELECT id FROM users WHERE username != ALL(ARRAY[${sql.join(GODDESS_USERNAMES.map((u) => sql`${u}`), sql`, `)}]))`
      );

    // 7b. Reset ALL remaining players EXCEPT goddess NPCs (i.e., humans).
    // Keep onboardingComplete / avatar fields intact.
    // Set wasReset = 2 to indicate GAME reset (not account reset).
    // Clear rank-bonus / login-reward timestamps so those UIs start clean,
    // and bump lastDividendAt to now so the next portfolio-reward cron tick
    // doesn't retroactively pay for time before the reset.
    const resetNow = new Date();
    await db
      .update(users)
      .set({
        credits: 100,
        playerValue: 1,
        valueFloor: 1,
        wasReset: 2,
        blockSellUntil: null,
        blockSellBy: null,
        estimatedDeletionAt: null,
        ownerlessAt: null,
        lastOwnershipDecayAt: null,
        lastRankBonusAt: null,
        lastLoginRewardAt: null,
        lastDividendAt: resetNow,
        hireSlots: 20,
        purchaseCount: 0,
        updatedAt: resetNow,
      })
      .where(notInArray(users.username, GODDESS_USERNAMES));

    // 7b. Winner should not receive the "world reset" toast intended for everyone else —
    // they just saw the game-won broadcast. Clear their wasReset flag.
    await db
      .update(users)
      .set({ wasReset: 0 })
      .where(eq(users.id, winnerId));

    // 8. Reset goddess NPCs to their original values and ensure they are protected.
    // Set goddess credits to 100 to match the rest of the world (cosmetic consistency).
    for (const [username, originalValue] of Object.entries(GODDESS_VALUES)) {
      await db
        .update(users)
        .set({
          playerValue: originalValue,
          valueFloor: originalValue,
          credits: 100,
          blockSellUntil: null,
          blockSellBy: null,
          estimatedDeletionAt: null,
          ownerlessAt: null,
          isProtected: 1, // Ensure goddesses are always protected
          purchaseCount: 0,
          updatedAt: new Date(),
        })
        .where(sql`${users.username} = ${username}`);
    }

    // 9. Clear any active goddess countdown (safe to call — no-op if already cleared).
    try {
      await clearCountdown();
    } catch (clearError) {
      console.error("Failed to clear countdown during reset:", clearError);
    }

    // 9b. Mark processed marker AFTER destructive work so a partial failure
    // can be retried. If caller didn't supply countdownStart, record whatever
    // start is currently in game_settings.
    try {
      if (countdownStart && countdownStart > 0) {
        await markCountdownProcessed(countdownStart);
      } else {
        const current = await getCountdownState();
        if (current.startedAt > 0) {
          await markCountdownProcessed(current.startedAt);
        }
      }
    } catch (markErr) {
      console.error("Failed to mark countdown processed:", markErr);
      // non-critical
    }

    // 10. Broadcast game reset to all connected players via Pusher
    try {
      await pusher.trigger("game-global", "game-won", {
        winnerUsername,
        winnerId,
        message: `🏆 ${winnerUsername} has collected all 6 Goddesses and WON THE GAME! The world has been reset!`,
      });
    } catch (pusherError) {
      console.error("Pusher error during game reset broadcast:", pusherError);
    }

    return {
      success: true,
      deletedNpcCount: nonGoddessNpcs.length,
    };
  } catch (error) {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("Game reset error:", error);

    // Tell any clients that were showing a "resetting the world" overlay to
    // stop waiting. The cron will retry on its next tick.
    try {
      await pusher.trigger("game-global", "game-reset-aborted", {
        winnerId,
        winnerUsername,
        reason: message,
      });
    } catch (pusherError) {
      console.error("Pusher error during game-reset-aborted broadcast:", pusherError);
    }

    return { error: "Failed to reset the game", detail: message };
  }
}
