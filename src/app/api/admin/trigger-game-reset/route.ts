import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { triggerGameReset } from "@/actions/triggerGameReset";

/**
 * Admin endpoint to force a game-win reset for a specific user.
 *
 * Use this when the goddess-countdown cron failed to process an expired
 * countdown (e.g. Vercel plan cron limitation, CRON_SECRET mismatch, or
 * a transient DB error caused the reset to be skipped).
 *
 * Auth: Bearer CRON_SECRET (same gating as Vercel crons).
 *
 * Body: { userId: number, force?: boolean }
 *   - force: skip the 5/5 goddess ownership verification (dangerous)
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 503 }
    );
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { userId?: number; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = Number(body.userId);
  const force = body.force === true;

  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json(
      { error: "userId is required (positive integer)" },
      { status: 400 }
    );
  }

  const [winner] = await db
    .select({
      id: users.id,
      username: users.username,
      isActive: users.isActive,
      multiAccountPenalized: users.multiAccountPenalized,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!winner) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!force) {
    if (winner.isActive !== 1 || winner.multiAccountPenalized === 1) {
      return NextResponse.json(
        {
          error: "User not eligible (inactive or penalized). Pass force=true to override.",
          isActive: winner.isActive,
          multiAccountPenalized: winner.multiAccountPenalized,
        },
        { status: 409 }
      );
    }

    const goddesses = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.username, GODDESS_USERNAMES));
    const goddessIds = goddesses.map((g) => g.id);

    const [ownedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(
        and(
          eq(ownership.ownerId, userId),
          inArray(ownership.ownedId, goddessIds)
        )
      );

    if (Number(ownedCount.count) < 6) {
      return NextResponse.json(
        {
          error: `User only owns ${ownedCount.count}/6 goddesses. Pass force=true to override.`,
          ownedCount: Number(ownedCount.count),
        },
        { status: 409 }
      );
    }
  }

  const result = await triggerGameReset(winner.id, winner.username);

  if ("error" in result && result.error) {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json({
    status: "ok",
    winnerId: winner.id,
    winnerUsername: winner.username,
    result,
  });
}
