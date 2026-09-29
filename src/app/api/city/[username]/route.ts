import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, and, desc, asc, inArray, lte } from "drizzle-orm";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { getGameWinCount } from "@/lib/game-wins";
import { DETAILED_LIMIT, projectCity, type CityHeroInput } from "@/lib/city/projection";
import { FIXTURE_NOW, makeCityFixture, makeFixtureNeighbors } from "@/lib/city/fixtures";
import {
  NEIGHBOR_BUILDING_LIMIT,
  NEIGHBOR_CITY_LIMIT,
  assembleCityNeighbors,
} from "@/lib/city/neighbors";
import {
  UNASSIGNED_FAMILY,
  type CityAggregates,
  type CityNeighbor,
  type CityOwnedCard,
} from "@/lib/city/types";

/**
 * Mainframe City — public, derived, read-only city projection for a player.
 *
 * PUBLIC/CDN-SAFE BY CONSTRUCTION: this route NEVER calls auth(). It has no
 * viewer-specific branches — hidden players 404 unconditionally — so the
 * response is identical for every requester and safe to cache on the CDN
 * (see AGENTS.md CDN conventions; do NOT add auth() or per-user data here).
 *
 * The city is fully derived: no economy values are computed beyond the
 * visual bucketing in src/lib/city/projection.ts. The portfolio expression
 * below mirrors /api/cron/rank-snapshot (which mirrors /api/leaderboard)
 * EXACTLY — owned cards' value × (1 + cards each owned card owns), summed,
 * × max(ownerCount, 1); own player_value NOT included. Keep the three
 * copies in lockstep when the formula changes.
 */

const visibleSql = sql`("users"."is_npc" = 1 OR ("users"."avatar_url" IS NOT NULL AND "users"."avatar_completed" = 1))`;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  if (REMOVED_AGENT_USERNAMES.includes(username)) {
    return notFound();
  }

  // Dev-only fixture branch (§D9): deterministic QA cities at 20/100/500/
  // 1000/5000 cards, NO DB read. Double-gated (NODE_ENV + CITY_FIXTURES) so
  // it is unreachable in production. Always no-store — fixtures are not
  // real viewer-independent city data and must never reach the CDN cache.
  // Same pipeline as real cities: projectCity (placement is DERIVED
  // client-side from value order — the city_layout table is no longer read).
  // FIXTURE_NOW (not the wall clock) keeps the fixture's protection windows
  // deterministically "active" for visual QA. "fixture-six" (Phase E): 100
  // cards with ALL SIX goddesses owned — the landmark/Root-Sequence beam QA
  // state (seed 42 otherwise yields 4).
  if (
    process.env.NODE_ENV === "development" &&
    process.env.CITY_FIXTURES === "1" &&
    /^fixture-(20|100|500|1000|5000|six)$/.test(username)
  ) {
    const isSix = username === "fixture-six";
    const { profile, ownedCards, aggregates } = makeCityFixture(
      isSix ? 100 : Number(username.slice("fixture-".length)),
      42,
      FIXTURE_NOW,
      isSix ? 6 : undefined
    );
    // Fixture satellites (QA for the steal surface): 3 deterministic
    // neighbor clusters with a firewall + a co-owned building in the mix.
    const neighbors = makeFixtureNeighbors(ownedCards);
    // Hero stages for fixtures: the fixture world's max card value is the
    // "game max", the owner sits at 55% of it (final HQ form on display);
    // goddess stages derive from their fixture values naturally.
    const fixtureMax = Math.max(0, ...ownedCards.map((c) => c.playerValue));
    const hero: CityHeroInput = {
      ownerValue: Math.round(fixtureMax * 0.55),
      gameMaxValue: fixtureMax,
      goddessValues: new Map(
        ownedCards
          .filter((c) => GODDESS_USERNAMES.includes(c.username))
          .map((c) => [c.username, c.playerValue])
      ),
    };
    const city = projectCity(
      profile,
      ownedCards,
      FIXTURE_NOW,
      aggregates,
      0,
      undefined,
      neighbors,
      hero
    );
    return NextResponse.json(
      { ...city, owner: { ...city.owner, profession: null } },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    // Canonical portfolio formula — see header comment. Literal "users"."id"
    // per the Drizzle no-join select-field gotcha (bare "id" would resolve
    // to the subquery's own table).
    const portfolioValueExpr = sql<number>`COALESCE((SELECT SUM(u2.player_value * (1 + (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id))) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = "users"."id"), 0) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1)`;
    const visibleOwnedCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o JOIN users u3 ON o.owned_id = u3.id WHERE o.owner_id = "users"."id" AND (u3.is_npc = 1 OR (u3.avatar_url IS NOT NULL AND u3.avatar_completed = 1)))`;

    const [owner] = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        avatarCompleted: users.avatarCompleted,
        isNpc: users.isNpc,
        profession: users.profession,
        missionLevel: users.missionLevel,
        playerValue: users.playerValue,
        portfolioValue: portfolioValueExpr.as("portfolio_value"),
        ownedCount: visibleOwnedCountExpr.as("visible_owned_count"),
        onboardingCreatedBy: users.onboardingCreatedBy,
      })
      .from(users)
      .where(eq(users.username, username));

    if (!owner) {
      return notFound();
    }

    // Hidden humans are invisible to everyone on this public route (no
    // self-view exception — that would require auth() and break CDN safety).
    if (owner.isNpc === 0 && (!owner.avatarUrl || owner.avatarCompleted !== 1)) {
      return notFound();
    }
    // Onboarding-pool players stay hidden until their creator finishes
    // onboarding (same rule as /api/players/[username], stranger branch).
    if (owner.onboardingCreatedBy) {
      const [creator] = await db
        .select({ onboardingComplete: users.onboardingComplete })
        .from(users)
        .where(eq(users.id, owner.onboardingCreatedBy));
      if (creator && creator.onboardingComplete !== 1) {
        return notFound();
      }
    }

    // Detailed buildings: top N visible owned cards by value (goddesses
    // included — the projection routes them to landmarks, not buildings).
    // Building TILES are no longer fetched: placement is derived on the
    // client from live value order (value-orbit rings), so the city_layout
    // join is gone from this hot CDN-cached path.
    // NOTE: avatar URLs are deliberately NOT selected — legacy NPC rows carry
    // multi-hundred-KB `data:` URI avatars that blew the response up to MBs
    // and killed the Neon HTTP socket mid-transfer. The client lazy-loads
    // avatars via the CDN-cached /api/avatar/[username] route instead.
    const detailedRows = await db
      .select({
        cardId: users.id,
        username: users.username,
        profession: users.profession,
        playerValue: users.playerValue,
        valueFloor: users.valueFloor,
        isNpc: users.isNpc,
        blockSellUntil: ownership.blockSellUntil,
        permBlockUntil: ownership.permBlockUntil,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(and(eq(ownership.ownerId, owner.id), visibleSql))
      .orderBy(desc(users.playerValue), asc(users.id))
      .limit(DETAILED_LIMIT);

    const ownedCards: CityOwnedCard[] = detailedRows.map((row) => ({
      cardId: row.cardId,
      username: row.username,
      profession: row.profession,
      playerValue: row.playerValue,
      valueFloor: row.valueFloor,
      isNpc: row.isNpc,
      blockSellUntil: row.blockSellUntil ? row.blockSellUntil.toISOString() : null,
      permBlockUntil: row.permBlockUntil ? row.permBlockUntil.toISOString() : null,
    }));

    // SQL-side aggregates for portfolios larger than the detailed fetch:
    // per-family visible non-goddess owned counts (goddesses are landmarks).
    const goddessNamesSql = sql.join(
      GODDESS_USERNAMES.map((name) => sql`${name}`),
      sql`, `
    );
    const familyRows = await db
      .select({
        profession: users.profession,
        count: sql<number>`COUNT(*)`,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(
        and(
          eq(ownership.ownerId, owner.id),
          visibleSql,
          sql`"users"."username" NOT IN (${goddessNamesSql})`
        )
      )
      .groupBy(users.profession);

    const familyTotals: Record<string, number> = {};
    let totalBuildings = 0;
    for (const row of familyRows) {
      const key = row.profession ?? UNASSIGNED_FAMILY;
      familyTotals[key] = Number(row.count);
      totalBuildings += Number(row.count);
    }
    const aggregates: CityAggregates = { totalBuildings, familyTotals };

    // Global win counter → dynamic final-sector threshold (§D3). Global, not
    // viewer-specific, so CDN safety is unaffected. getGameWinCount is the
    // canonical reader (try/catch inside, 0 on failure).
    const gameWinCount = await getGameWinCount();

    // H1 (2026-09-27): landmark ownership must NOT derive from the
    // DETAILED_LIMIT ordering — pinned goddess values (Wealth 100k,
    // Knowledge 1M) fall out of the top-200 for exactly the all-six
    // holders. One dedicated value-independent query returns the ≤6
    // authoritative rows (plain ownership rows, same basis the six-goddess
    // checks in purchasePlayer/missions use; goddesses are never hidden).
    const goddessRows = await db
      .select({ username: users.username })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(
        and(
          eq(ownership.ownerId, owner.id),
          inArray(users.username, GODDESS_USERNAMES)
        )
      );
    const goddessOwned = new Set(goddessRows.map((r) => r.username));

    // ── Hero stages (2026-09-28): HQ + monument value forms ──────────────
    // Global/owner-public data only (never viewer-specific — CDN safe):
    // the current max player value across ACTIVE non-goddess players is
    // the "game max" the HQ's final form is reserved for, and the six
    // goddess cards' live values stage their monuments against the priciest
    // of the six.
    const excludedNamesSql = sql.join(
      [...GODDESS_USERNAMES, ...REMOVED_AGENT_USERNAMES].map((name) => sql`${name}`),
      sql`, `
    );
    const [maxRow] = await db
      .select({ maxValue: sql<number>`MAX(${users.playerValue})` })
      .from(users)
      .where(
        and(
          eq(users.isActive, 1),
          sql`"users"."username" NOT IN (${excludedNamesSql})`
        )
      );
    const goddessValueRows = await db
      .select({ username: users.username, playerValue: users.playerValue })
      .from(users)
      .where(inArray(users.username, GODDESS_USERNAMES));
    const hero: CityHeroInput = {
      ownerValue: owner.playerValue,
      gameMaxValue: Number(maxRow?.maxValue ?? 0),
      goddessValues: new Map(
        goddessValueRows.map((r) => [r.username, r.playerValue])
      ),
    };

    // ── Satellite cities (2026-09-27) ────────────────────────────────────
    // Owned cards that themselves own visible cards render as FOREIGN mini
    // clusters outside the macro grid; their buildings are stealable via the
    // ordinary purchase flow. Two bounded queries: (1) per-candidate visible
    // owned counts (cheap GROUP BY over ≤ DETAILED_LIMIT ids), (2) the top
    // NEIGHBOR_BUILDING_LIMIT cards per CHOSEN neighbor (≤ 8 — window-ranked,
    // hard LIMIT 8×NEIGHBOR_BUILDING_LIMIT rows). `ownedByCityOwner` is an EXISTS on the CITY
    // OWNER's ownership (public data — same basis as the rest of the
    // projection; NOT viewer-specific, so CDN safety holds).
    let neighbors: CityNeighbor[] = [];
    const candidateIds = detailedRows.map((r) => r.cardId);
    let visibleOwnedCounts = new Map<number, number>();
    if (candidateIds.length > 0) {
      const ownedCountRows = await db
        .select({ ownerId: ownership.ownerId, count: sql<number>`COUNT(*)` })
        .from(ownership)
        .innerJoin(users, eq(ownership.ownedId, users.id))
        .where(and(inArray(ownership.ownerId, candidateIds), visibleSql))
        .groupBy(ownership.ownerId);
      visibleOwnedCounts = new Map<number, number>(
        ownedCountRows.map((r) => [Number(r.ownerId), Number(r.count)])
      );
    }
    const chosenNeighborIds = detailedRows
      .filter(
        (r) =>
          !GODDESS_USERNAMES.includes(r.username) &&
          (visibleOwnedCounts.get(r.cardId) ?? 0) > 0
      )
      .slice(0, NEIGHBOR_CITY_LIMIT)
      .map((r) => r.cardId);
    if (chosenNeighborIds.length > 0) {
      // Subquery + SQL-side rn filter: a single flat LIMIT would let the
      // first owner id consume the whole row budget and silently starve the
      // later satellites. Filtering rn ≤ NEIGHBOR_BUILDING_LIMIT in SQL first
      // means 8 owners × NEIGHBOR_BUILDING_LIMIT rows exactly fit the outer LIMIT.
      const windowed = db
        .select({
          rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${ownership.ownerId} ORDER BY ${users.playerValue} DESC, ${users.id} ASC)`.as("rn"),
          ownerId: ownership.ownerId,
          cardId: users.id,
          username: users.username,
          profession: users.profession,
          playerValue: users.playerValue,
          valueFloor: users.valueFloor,
          isNpc: users.isNpc,
          blockSellUntil: ownership.blockSellUntil,
          permBlockUntil: ownership.permBlockUntil,
          ownedByCityOwner: sql<number>`EXISTS(SELECT 1 FROM ownership o5 WHERE o5.owner_id = ${owner.id} AND o5.owned_id = ${users.id})`.as("owned_by_city_owner"),
        })
        .from(ownership)
        .innerJoin(users, eq(ownership.ownedId, users.id))
        .where(
          and(
            inArray(ownership.ownerId, chosenNeighborIds),
            visibleSql,
            sql`"users"."username" NOT IN (${goddessNamesSql})`
          )
        )
        .as("city_rows");
      const cityRows = await db
        .select()
        .from(windowed)
        .where(lte(windowed.rn, NEIGHBOR_BUILDING_LIMIT))
        .orderBy(asc(windowed.ownerId), desc(windowed.playerValue))
        .limit(NEIGHBOR_CITY_LIMIT * NEIGHBOR_BUILDING_LIMIT);
      // Mini monument ring (2026-09-28): which of the six goddesses each
      // chosen neighbor owns — same value-independent basis as the owner's
      // landmark query above (H1); bounded ≤ 8 owners × 6 goddesses. The
      // windowed building rows EXCLUDE goddesses by design, so ownership
      // needs this dedicated query.
      const neighborGoddessRows = await db
        .select({ ownerId: ownership.ownerId, username: users.username })
        .from(ownership)
        .innerJoin(users, eq(ownership.ownedId, users.id))
        .where(
          and(
            inArray(ownership.ownerId, chosenNeighborIds),
            inArray(users.username, GODDESS_USERNAMES)
          )
        );
      neighbors = assembleCityNeighbors(
        detailedRows,
        visibleOwnedCounts,
        cityRows.map((r) => ({
          ...r,
          ownedByCityOwner: Number(r.ownedByCityOwner) === 1,
        })),
        owner.username,
        new Date(),
        neighborGoddessRows,
        hero.gameMaxValue
      );
    }

    const city = projectCity(
      {
        username: owner.username,
        missionLevel: owner.missionLevel,
        portfolioValue: Number(owner.portfolioValue),
        ownedCount: Number(owner.ownedCount),
      },
      ownedCards,
      new Date(),
      aggregates,
      gameWinCount,
      goddessOwned,
      neighbors,
      hero
    );

    return NextResponse.json(
      { ...city, owner: { ...city.owner, profession: owner.profession } },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("City API error:", error);
    return NextResponse.json({ error: "Failed to fetch city" }, { status: 500 });
  }
}

function notFound() {
  // English error strings are the v1 server-side canon (CHINESE_I18N_STUDY §6).
  return NextResponse.json({ error: "City not found" }, { status: 404 });
}
