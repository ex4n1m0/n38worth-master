import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership, hallOfFame, gameHistory, gameSettings } from "@/db/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { getCountdownState, getLastProcessedCountdownStart } from "@/lib/goddess-countdown";

/**
 * Admin diagnostic endpoint for the Goddess countdown / game-win pipeline.
 *
 * Auth: Bearer CRON_SECRET (same gating as Vercel crons). Returns 401 if
 *       CRON_SECRET is set and the header doesn't match. If CRON_SECRET is
 *       not set, the endpoint returns a 503 so it can never be publicly open.
 *
 * Returns:
 *   - countdown: current state from game_settings
 *   - lastProcessedStart: idempotency marker
 *   - allGoddessCountdownSettings: raw game_settings rows starting with
 *     `goddess_countdown_` for quick inspection
 *   - challengerOwnership: if a challenger is active, how many goddesses they
 *     actually own right now
 *   - recentHallOfFame: last 5 winners
 *   - recentGoddessPurchases: last 15 purchase events involving a goddess
 */
export async function GET(req: Request) {
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

  try {
    const countdown = await getCountdownState();
    const lastProcessedStart = await getLastProcessedCountdownStart();

    // Raw game_settings for all countdown-related keys
    const allSettings = await db
      .select()
      .from(gameSettings)
      .where(sql`${gameSettings.settingKey} LIKE 'goddess_countdown_%'`);

    // Current challenger ownership check
    let challengerOwnership: null | {
      userId: number;
      username: string | null;
      ownedGoddesses: string[];
      missingGoddesses: string[];
    } = null;

    if (countdown.userId !== 0) {
      const [challenger] = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, countdown.userId));

      const goddesses = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.username, GODDESS_USERNAMES));
      const goddessIds = goddesses.map((g) => g.id);

      const owned = goddessIds.length
        ? await db
            .select({ ownedId: ownership.ownedId })
            .from(ownership)
            .where(
              and(
                eq(ownership.ownerId, countdown.userId),
                inArray(ownership.ownedId, goddessIds)
              )
            )
        : [];

      const ownedSet = new Set(owned.map((o) => o.ownedId));
      challengerOwnership = {
        userId: countdown.userId,
        username: challenger?.username ?? null,
        ownedGoddesses: goddesses
          .filter((g) => ownedSet.has(g.id))
          .map((g) => g.username),
        missingGoddesses: goddesses
          .filter((g) => !ownedSet.has(g.id))
          .map((g) => g.username),
      };
    }

    const recentHallOfFame = await db
      .select({
        id: hallOfFame.id,
        userId: hallOfFame.userId,
        username: hallOfFame.username,
        wonAt: hallOfFame.wonAt,
      })
      .from(hallOfFame)
      .orderBy(desc(hallOfFame.wonAt))
      .limit(5);

    // Goddess user IDs for filtering purchase history
    const goddesses = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.username, GODDESS_USERNAMES));
    const goddessIds = goddesses.map((g) => g.id);

    const recentGoddessPurchases = goddessIds.length
      ? await db
          .select({
            id: gameHistory.id,
            createdAt: gameHistory.createdAt,
            actorId: gameHistory.actorId,
            targetId: gameHistory.targetId,
            targetUsername: gameHistory.targetUsername,
            eventType: gameHistory.eventType,
            details: gameHistory.details,
          })
          .from(gameHistory)
          .where(
            and(
              eq(gameHistory.eventType, "purchase"),
              inArray(gameHistory.targetId, goddessIds)
            )
          )
          .orderBy(desc(gameHistory.createdAt))
          .limit(15)
      : [];

    return NextResponse.json({
      now: Math.floor(Date.now() / 1000),
      countdown,
      lastProcessedStart,
      allGoddessCountdownSettings: allSettings,
      challengerOwnership,
      recentHallOfFame,
      recentGoddessPurchases,
    });
  } catch (error) {
    console.error("admin/countdown-state error:", error);
    return NextResponse.json(
      { error: "Failed to fetch diagnostic state" },
      { status: 500 }
    );
  }
}
