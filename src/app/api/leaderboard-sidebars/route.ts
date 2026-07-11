import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, gameHistory } from "@/db/schema";
import { eq, and, sql, desc, isNotNull, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Returns 4 sidebar lists for the leaderboard page:
 *   1. lastOnlineHumans  — 10 most-recently-online humans (online first)
 *   2. recentGets        — last 10 purchase (GET) events
 *   3. recentPumps       — last 10 pump events
 *   4. topScorePlayers    — top 10 players by photo_score
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Last 10 humans online (sorted by lastOnlineAt desc — most recent first).
    const onlineHumans = await db
      .select({
        id: users.id,
        username: users.username,
        lastOnlineAt: users.lastOnlineAt,
      })
      .from(users)
      .where(and(eq(users.isNpc, 0), eq(users.isActive, 1), isNotNull(users.avatarUrl)))
      .orderBy(desc(users.lastOnlineAt))
      .limit(10);

    // 2. Last 10 GET (purchase) events.
    const getEvents = await db
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
      .limit(10);

    // 3. Last 10 PUMP events.
    const pumpEvents = await db
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
      .limit(10);

    // 4. Top 10 players by photo_score (NPCs with Unsplash scores).
    const topScore = await db
      .select({
        id: users.id,
        username: users.username,
        photoScore: users.photoScore,
      })
      .from(users)
      .where(and(eq(users.isActive, 1), sql`${users.photoScore} > 0`))
      .orderBy(desc(users.photoScore))
      .limit(10);

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
