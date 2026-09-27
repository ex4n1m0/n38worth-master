import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, userRankSnapshots } from "@/db/schema";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import {
  UNIVERSE_CITY_CAP,
  universeEpochOf,
  type UniverseCity,
  type UniversePayload,
} from "@/lib/city/universe";

/**
 * Mainframe City — the shared UNIVERSE map payload (2026-09-28).
 *
 * PUBLIC/CDN-SAFE BY CONSTRUCTION: never calls auth(), no viewer-specific
 * branches — the payload is the SAME for every requester (each viewer
 * translates the constellation onto their own city client-side), so the
 * CDN can serve repeat polls without invoking the function.
 *
 * Source of truth: user_rank_snapshots.portfolio_rank, precomputed every
 * 10 min by /api/cron/rank-snapshot with the canonical portfolio formula
 * (mirrors /api/leaderboard — never forked here). Only summaries travel:
 * username + profession + rank. Building lists NEVER travel on this route
 * — close-up detail is the existing CDN-cached /api/city/[username].
 *
 * Rank ties (RANK() gives equal ranks to equal portfolios) are broken by
 * user id for a stable total order.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select({
        rank: userRankSnapshots.portfolioRank,
        username: users.username,
        profession: users.profession,
      })
      .from(userRankSnapshots)
      .innerJoin(users, eq(users.id, userRankSnapshots.userId))
      .where(
        and(
          lte(userRankSnapshots.portfolioRank, UNIVERSE_CITY_CAP),
          eq(users.isActive, 1),
          // Hidden/removed avatars keep no city on the shared map (same
          // visibility basis as the leaderboard the ranks come from).
          sql`${users.avatarUrl} IS NOT NULL AND ${users.avatarCompleted} = 1`,
          eq(users.isNpc, 0)
        )
      )
      .orderBy(asc(userRankSnapshots.portfolioRank), asc(users.id))
      .limit(UNIVERSE_CITY_CAP);

    // RANK() ties share a number — renumber densely (1..N) so every city
    // gets a unique orbit slot while preserving the snapshot order.
    const cities: UniverseCity[] = rows.map((row, i) => ({
      rank: i + 1,
      username: row.username,
      profession: row.profession,
    }));

    const payload: UniversePayload = {
      epoch: universeEpochOf(cities),
      generatedAt: new Date().toISOString(),
      cities,
    };
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("[city/universe] failed:", err);
    return NextResponse.json(
      { error: "Universe unavailable" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
