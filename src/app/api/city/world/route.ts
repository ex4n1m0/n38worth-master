import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, and, sql, inArray, notInArray } from "drizzle-orm";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";
import { buildingTier, heroStageOf, protectionState } from "@/lib/city/projection";
import { familyIndex } from "@/lib/city/map2d/families";
import { canonicalLandmarks, type WorldCity, type WorldBuilding } from "@/lib/city/map2d/layout";

/**
 * THE SHARED 2D WORLD MAP (CITY_2D_WORLD_STUDY.md §3.3) — replaces
 * /api/city/universe for the 2D renderer.
 *
 * Public, CDN-cached, IDENTICAL for every viewer (never per-user data — the
 * s-maxage rule). "Literally every visible city, fully rendered" (user
 * ruling 2026-10-01): no caps, no aggregation — every visible player's city
 * ships with ALL its owned buildings. Visibility matches every other public
 * surface (completed avatar for humans, no onboarding pool, inactive hidden);
 * NPCs only appear as cities in the degenerate case that one OWNS a building
 * (they are cards, not cities). Goddesses/removed Agent are never cities.
 *
 * The client lays this payload out deterministically (map2d/layout.ts) —
 * same data, same map, everyone.
 */

export const dynamic = "force-dynamic";

const CACHE = "public, s-maxage=60, stale-while-revalidate=300";
const CHUNK = 400;

export async function GET() {
  try {
    const excluded = [...GODDESS_USERNAMES, ...REMOVED_AGENT_USERNAMES];

    // 1. Cities: active + visible + (human OR owns ≥1 building).
    const cityRows = await db
      .select({
        id: users.id,
        username: users.username,
        profession: users.profession,
        isNpc: users.isNpc,
        playerValue: users.playerValue,
      })
      .from(users)
      .where(
        and(
          eq(users.isActive, 1),
          eq(users.isOnboardingPool, 0),
          notInArray(users.username, excluded),
          sql`(${users.isNpc} = 1 OR (${users.avatarUrl} IS NOT NULL AND ${users.avatarCompleted} = 1))`,
          sql`(${users.isNpc} = 0 OR EXISTS (SELECT 1 FROM ownership o WHERE o.owner_id = ${users.id}))`
        )
      );

    if (cityRows.length === 0) {
      return NextResponse.json(
        { epoch: 0, generatedAt: new Date().toISOString(), cities: [], roads: [] },
        { headers: { "Cache-Control": CACHE } }
      );
    }

    const cityIds = cityRows.map((c) => c.id);
    const idToCity = new Map(cityRows.map((c) => [c.id, c]));

    // 2. Game-max value (HQ stage input — same rule as the per-city route).
    const [maxRow] = await db
      .select({ max: sql<number>`COALESCE(MAX(${users.playerValue}), 0)` })
      .from(users)
      .where(and(eq(users.isActive, 1), notInArray(users.username, excluded)));
    const gameMax = Number(maxRow?.max ?? 0);

    // 3. Landmarks: goddess cards owned by mapped cities.
    const goddessRows = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.username, GODDESS_USERNAMES));
    const goddessIds = goddessRows.map((g) => g.id);
    const goddessNameById = new Map(goddessRows.map((g) => [g.id, g.username]));
    const landmarksByOwner = new Map<number, Set<string>>();
    if (goddessIds.length > 0) {
      // NOTE: unchunked IN(cityIds) — fine to ~10× the current player base;
      // chunk alongside the buildings query if the map ever exceeds ~10k cities.
      const lmRows = await db
        .select({ ownerId: ownership.ownerId, ownedId: ownership.ownedId })
        .from(ownership)
        .where(
          and(
            inArray(ownership.ownedId, goddessIds),
            inArray(ownership.ownerId, cityIds)
          )
        );
      for (const r of lmRows) {
        const name = goddessNameById.get(r.ownedId);
        if (!name) continue;
        const set = landmarksByOwner.get(r.ownerId) ?? new Set<string>();
        set.add(name);
        landmarksByOwner.set(r.ownerId, set);
      }
    }

    // 4. Buildings — ALL owned cards per city, value-desc (layout order),
    //    tier + protection server-computed (the client never re-derives).
    const buildingsByOwner = new Map<number, WorldBuilding[]>();
    const now = new Date();
    for (let i = 0; i < cityIds.length; i += CHUNK) {
      const chunk = cityIds.slice(i, i + CHUNK);
      const rows = await db
        .select({
          ownerId: ownership.ownerId,
          id: users.id,
          username: users.username,
          playerValue: users.playerValue,
          valueFloor: users.valueFloor,
          profession: users.profession,
          blockSellUntil: ownership.blockSellUntil,
          permBlockUntil: ownership.permBlockUntil,
        })
        .from(ownership)
        .innerJoin(users, eq(ownership.ownedId, users.id))
        .where(
          and(
            inArray(ownership.ownerId, chunk),
            // Goddesses are LANDMARKS, never ordinary building squares
            // (projection invariant); hidden cards (avatarless humans) stay
            // off every public surface — both match the per-city route.
            ...(goddessIds.length > 0 ? [notInArray(ownership.ownedId, goddessIds)] : []),
            sql`(${users.isNpc} = 1 OR (${users.avatarUrl} IS NOT NULL AND ${users.avatarCompleted} = 1))`
          )
        )
        .orderBy(sql`${users.playerValue} DESC, ${users.id} ASC`);
      for (const r of rows) {
        const b: WorldBuilding = {
          id: r.id,
          u: r.username,
          f: familyIndex(r.profession),
          t: buildingTier(Number(r.playerValue), Number(r.valueFloor ?? 1)),
          p: protectionState(
            {
              blockSellUntil: r.blockSellUntil ? r.blockSellUntil.toISOString() : null,
              permBlockUntil: r.permBlockUntil ? r.permBlockUntil.toISOString() : null,
            },
            now
          ),
        };
        const list = buildingsByOwner.get(r.ownerId) ?? [];
        list.push(b);
        buildingsByOwner.set(r.ownerId, list);
      }
    }

    // 5. Roads: ownership edges between two mapped cities.
    const roadRows = await db
      .select({
        ownerId: ownership.ownerId,
        ownedId: ownership.ownedId,
      })
      .from(ownership)
      .where(
        and(inArray(ownership.ownerId, cityIds), inArray(ownership.ownedId, cityIds))
      );

    const cities: WorldCity[] = cityRows.map((c) => ({
      username: c.username,
      profession: c.profession,
      ownedCount: buildingsByOwner.get(c.id)?.length ?? 0,
      hqStage: heroStageOf(Number(c.playerValue), gameMax),
      // Canonical GODDESS_USERNAMES order → stable hex slots across regens.
      landmarks: canonicalLandmarks([...(landmarksByOwner.get(c.id) ?? [])]),
      buildings: buildingsByOwner.get(c.id) ?? [],
    }));

    const roads = roadRows
      .map((r) => ({
        from: idToCity.get(r.ownerId)?.username ?? null,
        to: idToCity.get(r.ownedId)?.username ?? null,
      }))
      .filter((r): r is { from: string; to: string } => !!r.from && !!r.to);

    const payload = {
      epoch: Date.now(),
      generatedAt: new Date().toISOString(),
      cities,
      roads,
    };
    return NextResponse.json(payload, { headers: { "Cache-Control": CACHE } });
  } catch (error) {
    console.error("City world route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
