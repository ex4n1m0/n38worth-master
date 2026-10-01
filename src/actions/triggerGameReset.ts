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
  raidState,
  raidLog,
  gameSettings,
} from "@/db/schema";
import { sql, notInArray, desc, eq, and } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { GODDESS_USERNAMES, GODDESS_VALUES } from "@/lib/goddesses";
import { isAdminUser } from "@/lib/admins";
import { expireAllBountiesForWorldReset } from "@/lib/bounties";
import { cancelAllTradesForWorldReset } from "@/lib/blueprint-service";
import { VAULT_BASE_GOAL } from "@/lib/world-vault";
import {
  clearCountdown,
  getCountdownState,
  getLastProcessedCountdownStart,
  markCountdownProcessed,
} from "@/lib/goddess-countdown";
import { incrementGameWinCount } from "@/lib/game-wins";
import { broadcastMarketRefresh } from "@/lib/market-broadcast";

/**
 * Triggered when a player owns all 6 goddesses AND the countdown has expired.
 * Records the winner in the Hall of Fame, then resets the entire game.
 *
 * Reset semantics (per game spec):
 *   - All ownership rows are deleted
 *   - All transactions, messages, and avatar reveals are deleted
 *   - NOTHING is deleted from the users table: every human and every NPC is
 *     KEPT and reset to the fresh-start baseline (the world persists, only its
 *     state is wiped). Goddess cards are kept and reset to floor values.
 *   - All non-goddess accounts are reset to credits=100, playerValue=1,
 *     valueFloor=1 with rank-bonus / login-reward timestamps cleared (derived
 *     ranks drop back to the lowest tier automatically)
 *   - Goddesses are reset to their original floor values (and marked isProtected)
 *   - Winner is recorded in hall_of_fame with wasReset=0 (so they do not see
 *     the "simulation has been rebooted" toast meant for the rest of the world)
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
  countdownStart?: number,
  opts: { skipHallOfFame?: boolean } = {}
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

    // 1. Record the winner in the Hall of Fame — skipped for test resets AND
    //    for admin (owner) accounts. The owner is the game operator and should
    //    never be declared a "champion" even if they trigger a real win (e.g.
    //    during testing or by accident). The game still resets normally; only
    //    the Hall of Fame entry is suppressed.
    if (!opts.skipHallOfFame && !isAdminUser(winnerUsername)) {
      await db.insert(hallOfFame).values({
        userId: winnerId,
        username: winnerUsername,
      });

      // Every real win raises the final Goddess unlock threshold by +1,000
      // owned cards (base 5,000). Test resets and admin wins don't count.
      try {
        await incrementGameWinCount();
      } catch (e) {
        console.error("Game win count increment error:", e);
      }
    }

    // 2. Log to game history
    await db.insert(gameHistory).values({
      eventType: "game_won",
      actorId: winnerId,
      targetId: winnerId,
      targetUsername: winnerUsername,
      details: JSON.stringify({
        message: `${winnerUsername} assembled all six Founders and crowned the skyline!`,
      }),
    });

    // 2b. Broadcast "world-rebooting" to all connected clients so they show
    //     the full-screen reboot overlay with a progress bar.
    try {
      await pusher.trigger("game-global", "world-rebooting", {
        winnerUsername,
        winnerId,
        durationSeconds: 60,
      });
    } catch (pusherError) {
      console.error("Pusher error during world-rebooting broadcast:", pusherError);
    }

    // 3. Delete all ownership records (wipes the economy graph)
    await db.delete(ownership);

    // 4. Delete all transactions
    await db.delete(transactions);

    // 5. Delete all messages
    await db.delete(messages);

    // 5b. Delete all avatar reveals. Reveals are meaningless after a game reset
    // (all ownership is gone), so wipe the table to reset reveal state.
    await db.delete(avatarReveals);

    // 5d. World Vault re-arm (gameHistory SURVIVES resets — deleting the
    //     epoch row would let pre-reset damage instantly re-break the vault,
    //     so write a fresh epoch + base goal explicitly).
    try {
      await db
        .insert(gameSettings)
        .values([
          { settingKey: "fd_epoch_start", settingValue: Math.floor(Date.now() / 1000) },
          { settingKey: "fd_goal", settingValue: VAULT_BASE_GOAL },
          { settingKey: "fd_breaks", settingValue: 0 },
          { settingKey: "fd_last_break", settingValue: 0 },
        ])
        .onConflictDoUpdate({
          target: gameSettings.settingKey,
          set: { settingValue: sql`excluded.setting_value`, updatedAt: new Date() },
        });
    } catch (vaultResetError) {
      console.error("World-vault re-arm error (continuing):", vaultResetError);
    }

    // 5e. Heist layer reset: expire every open bounty WITHOUT refunds (credits
    // are hard-reset below anyway — refunding after would mint money), wipe the
    // raid log, and reset raid charges to a fresh 3 (rows recreate on next
    // touch; deleting is the reset). Blueprint COLLECTIONS survive (cosmetic
    // retention anchor); their open trades cancel WITH escrow refunds.
    await expireAllBountiesForWorldReset();
    await cancelAllTradesForWorldReset();
    try {
      await db.delete(raidLog);
      await db.delete(raidState);
    } catch (heistResetError) {
      console.error("Heist-layer reset error (continuing):", heistResetError);
    }

    // 6. No purge. Every account is KEPT — all humans, all NPCs, and the
    // goddess cards. Nothing is deleted; only world state (ownership,
    // economy, missions, blocks) is wiped and every account is reset to the
    // fresh-start baseline below. The winner was recorded in hall_of_fame above.

    // 7. Clear reward_history for every non-goddess player (the whole world).
    await db
      .delete(rewardHistory)
      .where(
        sql`${rewardHistory.userId} IN (SELECT id FROM users WHERE username != ALL(ARRAY[${sql.join(GODDESS_USERNAMES.map((u) => sql`${u}`), sql`, `)}]))`
      );

    // 7a. Count the accounts being reset (everything except the goddess cards),
    // for the audit log. No deletion happens — the world persists.
    const [{ count: keptCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(notInArray(users.username, GODDESS_USERNAMES));

    await db.insert(gameHistory).values({
      eventType: "world_reset",
      actorId: winnerId,
      targetId: null,
      targetUsername: null,
      details: JSON.stringify({
        reason: "game_win_reset",
        winnerId,
        winnerUsername,
        keptCount: Number(keptCount),
      }),
    });

    // 7b. Reset ALL non-goddess accounts (every human + every NPC)
    // to the same fresh-start baseline and leave them ownerless. Keep
    // onboardingComplete / avatar fields intact.
    // Set wasReset = 2 to indicate GAME reset (not account reset).
    // Clear rank-bonus / login-reward timestamps so those UIs start clean,
    // bump lastDividendAt to now so the next portfolio-reward cron tick
    // doesn't retroactively pay for time before the reset, and wipe every
    // profession (humans AND NPCs) so the new world starts professionless.
    const resetNow = new Date();
    await db
      .update(users)
      .set({
        credits: 100,
        playerValue: 1,
        valueFloor: 1,
        wasReset: 2,
        profession: null,
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
        missionLevel: 0,
        // Clear onboarding NPC references — ownership is wiped, so any mid-
        // onboarding player gets fresh NPCs reassigned by /api/onboarding on
        // their next visit. Don't touch onboardingComplete/onboardingStarted
        // so finished players stay finished.
        onboardingNpcs: [],
        onboardingOwnedCount: 0,
        updatedAt: resetNow,
      })
      .where(notInArray(users.username, GODDESS_USERNAMES));

    // 7a-bis. Reset the HUMAN card "Score" (photo_score = times purchased/pumped)
    // so each new game starts everyone at 0, mirroring purchaseCount. NPC
    // photo_score is their intrinsic Unsplash-likes score and is left intact.
    await db
      .update(users)
      .set({ photoScore: 0, updatedAt: resetNow })
      .where(
        and(eq(users.isNpc, 0), notInArray(users.username, GODDESS_USERNAMES))
      );

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
          profession: null, // Goddesses are not combo-eligible — never a profession
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
        message: `🏆 ${winnerUsername} has assembled all six Founders and CROWNED THE SKYLINE! The city has been rebuilt!`,
      });
    } catch (pusherError) {
      console.error("Pusher error during game reset broadcast:", pusherError);
    }

    // The whole market changed — everyone refetches (throttled client-side).
    await broadcastMarketRefresh("game-reset");

    return {
      success: true,
      keptCount: Number(keptCount),
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
