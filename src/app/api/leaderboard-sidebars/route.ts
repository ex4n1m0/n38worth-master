import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, gameHistory } from "@/db/schema";
import { eq, and, sql, desc, isNotNull, inArray } from "drizzle-orm";
import { GODDESS_USERNAMES } from "@/lib/goddesses";

export const dynamic = "force-dynamic";

/**
 * Returns 4 sidebar lists for the leaderboard page (and the landing page):
 *   1. lastOnlineHumans  — 5 most-recently-online players (humans + AGIs +
 *      goddesses — all autonomous players, online first)
 *   2. recentGets        — last 5 purchase (GET) events
 *   3. recentPumps       — last 5 pump events
 *   4. topScorePlayers    — top 5 players by photo_score
 *
 * Public — no auth required. The data (usernames, online times, game events,
 * photo scores) is all non-sensitive and is shown on both the landing page
 * (for logged-out visitors) and the leaderboard (for logged-in players).
 */
export async function GET() {
  try {
    // Run all 4 sidebar queries in parallel
    const [onlineHumans, getEvents, pumpEvents, topScore] = await Promise.all([
      // 1. Last 10 players online (sorted by lastOnlineAt desc — most recent
      //    first). Includes humans + AGIs (isNpc=0) and the 6 goddesses (isNpc=1
      //    but autonomous AI players). All must have an avatar to be visible.
      db
        .select({
          id: users.id,
          username: users.username,
          lastOnlineAt: users.lastOnlineAt,
        })
        .from(users)
        .where(and(
          sql`${users.isNpc} = 0 OR ${users.username} IN (${sql.join(GODDESS_USERNAMES.map((u) => sql`${u}`), sql`, `)})`,
          eq(users.isActive, 1),
          isNotNull(users.avatarUrl)
        ))
        .orderBy(desc(users.lastOnlineAt))
        .limit(5),

      // 2. Last 10 GET (purchase) events.
      db
        .select({
          id: gameHistory.id,
          actorId: gameHistory.actorId,
          targetUsername: gameHistory.targetUsername,
          details: gameHistory.details,
          createdAt: gameHistory.createdAt,
        })
        .from(gameHistory)
        .where(eq(gameHistory.eventType, "purchase"))
        .orderBy(desc(gameHistory.createdAt))
        .limit(5),

      // 3. Last 10 PUMP events.
      db
        .select({
          id: gameHistory.id,
          actorId: gameHistory.actorId,
          targetUsername: gameHistory.targetUsername,
          details: gameHistory.details,
          createdAt: gameHistory.createdAt,
        })
        .from(gameHistory)
        .where(eq(gameHistory.eventType, "pump"))
        .orderBy(desc(gameHistory.createdAt))
        .limit(5),

      // 4. Top 10 players by photo_score (NPCs with Unsplash scores).
      db
        .select({
          id: users.id,
          username: users.username,
          photoScore: users.photoScore,
        })
        .from(users)
        .where(and(eq(users.isActive, 1), sql`${users.photoScore} > 0`))
        .orderBy(desc(users.photoScore))
        .limit(5),
    ]);

    // Enrich event lists with actor usernames.
    const actorIds = Array.from(
      new Set(
        [...getEvents, ...pumpEvents]
          .map((e) => e.actorId)
          .filter((id): id is number => id != null)
      )
    );

    let actorMap = new Map<number, string>();
    if (actorIds.length > 0) {
      const actorRows = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, actorIds));
      actorMap = new Map(actorRows.map((r) => [r.id, r.username]));
    }

    const enrichEvents = (events: typeof getEvents) =>
      events.map((e) => {
        let parsedDetails: Record<string, unknown> | null = null;
        if (e.details) {
          try { parsedDetails = JSON.parse(e.details); } catch { /* ignore */ }
        }
        return {
          id: e.id,
          actorUsername: e.actorId ? actorMap.get(e.actorId) ?? null : null,
          targetUsername: e.targetUsername,
          cost: parsedDetails?.cost ?? parsedDetails?.price ?? null,
          createdAt: e.createdAt,
        };
      });

    return NextResponse.json({
      lastOnlineHumans: onlineHumans.map((h) => ({
        id: h.id,
        username: h.username,
        lastOnlineAt: h.lastOnlineAt,
      })),
      recentGets: enrichEvents(getEvents),
      recentPumps: enrichEvents(pumpEvents),
      topScorePlayers: topScore.map((p) => ({
        id: p.id,
        username: p.username,
        photoScore: p.photoScore,
      })),
    });
  } catch (error) {
    console.error("Leaderboard sidebars API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
