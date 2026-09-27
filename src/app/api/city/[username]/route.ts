import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership, cityLayout, cityLayoutMeta } from "@/db/schema";
import { eq, sql, and, desc, asc, inArray } from "drizzle-orm";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { getGameWinCount } from "@/lib/game-wins";
import { DETAILED_LIMIT, projectCity } from "@/lib/city/projection";
import { mergePlacements } from "@/lib/city/layout-merge";
import { FIXTURE_NOW, makeCityFixture } from "@/lib/city/fixtures";
import {
  UNASSIGNED_FAMILY,
  type CityAggregates,
  type CityOwnedCard,
  type CityPlacement,
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
  // Same pipeline as real cities: projectCity + placement fold-in (empty
  // placements → every building queued, layoutVersion 0) + this route's
  // response extras. FIXTURE_NOW (not the wall clock) keeps the fixture's
  // protection windows deterministically "active" for visual QA.
  // "fixture-six" (Phase E): 100 cards with ALL SIX goddesses owned — the
  // landmark/Root-Sequence beam QA state (seed 42 otherwise yields 4).
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
    const city = mergePlacements(
      projectCity(profile, ownedCards, FIXTURE_NOW, aggregates),
      new Map(),
      0
    );
    const familyPlaced: Record<string, number> = {};
    for (const key of Object.keys(aggregates.familyTotals)) {
      familyPlaced[key] = 0;
    }
    return NextResponse.json(
      { ...city, owner: { ...city.owner, profession: null }, familyPlaced },
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
    // Placement fold-in (§D5/TH-01): city_layout is ONLY ever read through
    // this ownership+visibleSql join — never standalone — so orphaned rows
    // are invisible and hidden cards never leak placements. LEFT JOIN: an
    // unplaced building simply has NULL placement columns.
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
        placementSector: cityLayout.sectorKey,
        placementX: cityLayout.tileX,
        placementY: cityLayout.tileY,
        placementRotation: cityLayout.rotation,
        placementVariant: cityLayout.variant,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .leftJoin(
        cityLayout,
        and(
          eq(cityLayout.ownerUserId, owner.id),
          eq(cityLayout.ownedPlayerId, users.id)
        )
      )
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
    // per-family visible non-goddess owned counts (goddesses are landmarks),
    // plus a placed-count per family on the same visible basis (LEFT JOIN
    // keeps unplaced rows in COUNT(*) while COUNT(cl.id) counts placed only).
    const goddessNamesSql = sql.join(
      GODDESS_USERNAMES.map((name) => sql`${name}`),
      sql`, `
    );
    const familyRows = await db
      .select({
        profession: users.profession,
        count: sql<number>`COUNT(*)`,
        placed: sql<number>`COUNT(${cityLayout.id})`,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .leftJoin(
        cityLayout,
        and(
          eq(cityLayout.ownerUserId, owner.id),
          eq(cityLayout.ownedPlayerId, users.id)
        )
      )
      .where(
        and(
          eq(ownership.ownerId, owner.id),
          visibleSql,
          sql`"users"."username" NOT IN (${goddessNamesSql})`
        )
      )
      .groupBy(users.profession);

    const familyTotals: Record<string, number> = {};
    // Sibling structure to CityFamily (types.ts is owned by the parallel
    // types agent — placed counts live HERE until the type grows a field):
    // top-level `familyPlaced: Record<familyKey, placedCount>`, keys on the
    // same DB-profession / UNASSIGNED_FAMILY basis as familyTotals.
    const familyPlaced: Record<string, number> = {};
    let totalBuildings = 0;
    for (const row of familyRows) {
      const key = row.profession ?? UNASSIGNED_FAMILY;
      familyTotals[key] = Number(row.count);
      familyPlaced[key] = Number(row.placed);
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
      goddessOwned
    );

    // Fold placements into detailed buildings + stamp the layout epoch (the
    // merge also runs the §D7 same-tile demotion safety net). layoutVersion
    // is 0 for owners who never saved a layout.
    const placements = new Map<number, CityPlacement>();
    for (const row of detailedRows) {
      if (
        row.placementSector === null ||
        row.placementX === null ||
        row.placementY === null
      ) {
        continue;
      }
      placements.set(row.cardId, {
        sector: row.placementSector,
        x: row.placementX,
        y: row.placementY,
        rotation: row.placementRotation ?? 0,
        variant: row.placementVariant ?? 0,
      });
    }
    const [layoutMetaRow] = await db
      .select({ layoutVersion: cityLayoutMeta.layoutVersion })
      .from(cityLayoutMeta)
      .where(eq(cityLayoutMeta.ownerUserId, owner.id));
    const cityWithLayout = mergePlacements(
      city,
      placements,
      layoutMetaRow?.layoutVersion ?? 0
    );

    return NextResponse.json(
      {
        ...cityWithLayout,
        owner: { ...cityWithLayout.owner, profession: owner.profession },
        familyPlaced,
      },
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
