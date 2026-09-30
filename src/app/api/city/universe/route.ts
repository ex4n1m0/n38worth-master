import { NextResponse } from "next/server";
import { db } from "@/db";
import { ownership, users, userRankSnapshots } from "@/db/schema";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import {
  UNIVERSE_CITY_CAP,
  UNIVERSE_SKYLINE_LIMIT,
  attachUniverseSkylines,
  universeEpochOf,
  type UniverseCity,
  type UniversePayload,
} from "@/lib/city/universe";

/**
 * Mainframe City — the shared UNIVERSE map payload.
 *
 * PUBLIC/CDN-SAFE BY CONSTRUCTION: never calls auth(), no viewer-specific
 * branches — the payload is the SAME for every requester (each viewer
 * translates the constellation onto their own city client-side), so the
 * CDN can serve repeat polls without invoking the function.
 *
 * Source of truth: user_rank_snapshots.portfolio_rank, precomputed every
 * 10 min by /api/cron/rank-snapshot with the canonical portfolio formula
 * (mirrors /api/leaderboard — never forked here).
 *
 * FULL RENDERING (2026-09-30, CITY_SHARED_UNIVERSE_STUDY §5): each city
 * also ships its top UNIVERSE_SKYLINE_LIMIT visible buildings by value as
 * [tier, familyIndex] tuples — the bounded "fully rendered" line the
 * satellite ruling blessed (top-24 + "+N more"). Goddess cards are
 * excluded from tuples AND counts (they are landmark content, not
 * skyline mass — the same BUILDING basis as the satellite window in
 * /api/city/[username]; note the satellites' visibleOwnedCount is a
 * slightly wider basis that still includes goddess cards). One windowed
 * query serves all owners (no per-city fan-out); close-up detail stays
 * on /api/city/[username].
 *
 * Rank ties (RANK() gives equal ranks to equal portfolios) are broken by
 * user id for a stable total order.
 */

export const dynamic = "force-dynamic";

const visibleSql = sql`("users"."is_npc" = 1 OR ("users"."avatar_url" IS NOT NULL AND "users"."avatar_completed" = 1))`;

export async function GET() {
  try {
    const cityRows = await db
      .select({
        id: users.id,
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
    const ranked = cityRows.map((row, i) => ({ ...row, rank: i + 1 }));

    let cities: UniverseCity[] = ranked;
    if (ranked.length > 0) {
      const goddessNamesSql = sql.join(
        GODDESS_USERNAMES.map((name) => sql`${name}`),
        sql`, `
      );
      // Windowed top-N per owner over ALL ranked owners at once (the city
      // route's neighbor fetch generalized from 8 to ≤ 500 owners): rn is
      // filtered in SQL so the outer LIMIT is exactly owners × limit rows.
      // visibleCount rides along as COUNT(*) OVER — no second query.
      const windowed = db
        .select({
          rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${ownership.ownerId} ORDER BY ${users.playerValue} DESC, ${users.id} ASC)`.as("rn"),
          ownerId: ownership.ownerId,
          profession: users.profession,
          playerValue: users.playerValue,
          valueFloor: users.valueFloor,
          visibleCount: sql<number>`COUNT(*) OVER (PARTITION BY ${ownership.ownerId})`.as("visible_count"),
        })
        .from(ownership)
        .innerJoin(users, eq(ownership.ownedId, users.id))
        .where(
          and(
            inArray(ownership.ownerId, ranked.map((r) => r.id)),
            visibleSql,
            sql`"users"."username" NOT IN (${goddessNamesSql})`
          )
        )
        .as("world_rows");
      const buildingRows = await db
        .select()
        .from(windowed)
        .where(lte(windowed.rn, UNIVERSE_SKYLINE_LIMIT))
        .orderBy(asc(windowed.ownerId), desc(windowed.playerValue))
        .limit(UNIVERSE_CITY_CAP * UNIVERSE_SKYLINE_LIMIT);
      cities = attachUniverseSkylines(
        ranked,
        buildingRows.map((r) => ({
          ownerId: Number(r.ownerId),
          profession: r.profession,
          playerValue: Number(r.playerValue),
          valueFloor: Number(r.valueFloor ?? 1),
          visibleCount: Number(r.visibleCount),
        }))
      );
    }

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
