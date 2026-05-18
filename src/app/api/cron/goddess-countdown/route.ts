import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  getCountdownState,
  clearCountdown,
  getLastProcessedCountdownStart,
} from "@/lib/goddess-countdown";
import { triggerGameReset } from "@/actions/triggerGameReset";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { pusher } from "@/lib/pusher-server";

/**
 * Cron job that runs every minute to check the goddess countdown.
 * If the countdown has expired and the user still owns all 6 goddesses,
 * triggers the game reset and records the winner.
 *
 * The reset is idempotent via a `last_processed_start` marker in game_settings,
 * so retries after transient failures are safe.
 */
export async function GET(req: Request) {
  // Verify the request is from Vercel Cron (skip if CRON_SECRET not configured)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const state = await getCountdownState();

    // No active countdown
    if (state.userId === 0 || state.startedAt === 0) {
      return NextResponse.json({ status: "no_countdown" });
    }

    // Countdown still running
    if (state.remainingSeconds > 0) {
      return NextResponse.json({
        status: "counting_down",
        userId: state.userId,
        remainingSeconds: state.remainingSeconds,
      });
    }

    // Countdown expired. Skip if this particular start has already been processed.
    const lastProcessed = await getLastProcessedCountdownStart();
    if (lastProcessed === state.startedAt) {
      // Stale leftover — clear and bail
      await clearCountdown();
      return NextResponse.json({ status: "already_processed" });
    }

    // Verify the user STILL owns all 6 goddesses
    const goddesses = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.username, GODDESS_USERNAMES));

    const goddessIds = goddesses.map((g) => g.id);

    const [goddessOwnershipCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(
        and(
          eq(ownership.ownerId, state.userId),
          inArray(ownership.ownedId, goddessIds)
        )
      );

    if (Number(goddessOwnershipCount.count) < 6) {
      // User lost a goddess but countdown wasn't cancelled (edge case)
      console.warn(
        `Countdown expired but user ${state.userId} only owns ${goddessOwnershipCount.count} goddesses. Cancelling.`
      );
      await clearCountdown();

      try {
        await pusher.trigger("game-global", "countdown-cancelled", {
          reason: "Goddess ownership lost",
        });
      } catch (pusherError) {
        console.error("Pusher error:", pusherError);
      }

      return NextResponse.json({ status: "cancelled_no_goddesses" });
    }

    // Fetch the candidate winner and verify eligibility
    const [winner] = await db
      .select({
        username: users.username,
        isActive: users.isActive,
        multiAccountPenalized: users.multiAccountPenalized,
      })
      .from(users)
      .where(eq(users.id, state.userId));

    if (!winner) {
      console.error(`Countdown user ${state.userId} not found — clearing countdown`);
      await clearCountdown();
      try {
        await pusher.trigger("game-global", "countdown-cancelled", {
          reason: "Challenger account no longer exists",
        });
      } catch (pusherError) {
        console.error("Pusher error:", pusherError);
      }
      return NextResponse.json({ status: "error_user_not_found" });
    }

    if (winner.isActive !== 1 || winner.multiAccountPenalized === 1) {
      console.warn(
        `Countdown winner ${state.userId} (${winner.username}) is ineligible (isActive=${winner.isActive}, penalized=${winner.multiAccountPenalized}). Cancelling.`
      );
      await clearCountdown();
      try {
        await pusher.trigger("game-global", "countdown-cancelled", {
          reason: "Challenger is ineligible",
        });
      } catch (pusherError) {
        console.error("Pusher error:", pusherError);
      }
      return NextResponse.json({ status: "cancelled_ineligible_winner" });
    }

    // All good — trigger the reset. We DO NOT pre-clear the countdown anymore:
    // triggerGameReset is idempotent (via processed-start marker) and clears
    // the countdown itself on success. If the reset fails, the countdown stays
    // in its expired state and the next cron tick will retry.
    const resetResult = await triggerGameReset(
      state.userId,
      winner.username,
      state.startedAt
    );

    if (resetResult.success) {
      return NextResponse.json({
        status: "game_won",
        winnerId: state.userId,
        winnerUsername: winner.username,
        duplicate: resetResult.duplicate ?? false,
      });
    } else {
      console.error("Game reset failed from cron:", resetResult.error);
      return NextResponse.json(
        { status: "reset_failed", error: resetResult.error },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Goddess countdown cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
