/**
 * Mainframe City — pure layout fold-in for the derived projection.
 *
 * Reads only; the write path lives in POST /api/city/layout. Two jobs:
 * 1. Attach persisted placements (city_layout rows joined by the route) to
 *    matching detailed buildings.
 * 2. §D7 safety net: when two PLACED detailed buildings share a tile (the
 *    orphan-resurrection corner case two saves can produce under
 *    no-transactions), deterministically keep the higher one (value desc,
 *    cardId asc) and demote the loser's placement to null — it renders in the
 *    queue until the owner's next save self-heals the row set.
 *
 * Pure: never mutates the input projection; tier/protection math is imported
 * from projection.ts, never duplicated.
 */

import {
  buildingTier,
  protectionState,
} from "./projection";
import type {
  CityBuilding,
  CityOwnedCard,
  CityPlacement,
  CityProjection,
} from "./types";
import { tileKey } from "./layout-schema";

/**
 * Fold placements into a projected city and stamp the layout epoch. Does NOT
 * mutate `city` — families/buildings are rebuilt. Placements whose cardId has
 * no detailed building (aggregated, goddess landmark, or orphaned row) are
 * ignored; the §D7 collision demotion only applies to detailed buildings.
 */
export function mergePlacements(
  city: CityProjection,
  placements: Map<number, CityPlacement>,
  layoutVersion: number
): CityProjection {
  // Pass 1: attach placements to matching detailed buildings (fresh objects).
  const families = city.families.map((family) => ({
    ...family,
    buildings: family.buildings.map((building) => ({
      ...building,
      placement: placements.get(building.cardId) ?? null,
    })),
  }));

  // Pass 2: §D7 safety net — one building per tile. Winner: value desc, then
  // cardId asc (the projection's canonical stable order).
  const losers = new Set<number>();
  const byTile = new Map<string, CityBuilding[]>();
  for (const family of families) {
    for (const building of family.buildings) {
      if (!building.placement) continue;
      const key = tileKey(building.placement);
      const group = byTile.get(key);
      if (group) group.push(building);
      else byTile.set(key, [building]);
    }
  }
  for (const group of byTile.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort(
      (a, b) => b.value - a.value || a.cardId - b.cardId
    );
    for (const loser of ranked.slice(1)) losers.add(loser.cardId);
  }
  if (losers.size > 0) {
    for (const family of families) {
      for (const building of family.buildings) {
        if (losers.has(building.cardId)) building.placement = null;
      }
    }
  }

  return { ...city, families, layoutVersion };
}

/**
 * Map one ownership row (CityOwnedCard shape) to a CityBuilding queue item
 * for GET /api/city/my-layout. Single implementation of the tier/protection
 * derivation — imported from projection.ts so the queue and the public city
 * can never disagree. Queue items are unplaced by definition (placement null);
 * the owner correlates placed cards against the public projection.
 */
export function toQueueBuilding(card: CityOwnedCard, now: Date): CityBuilding {
  return {
    cardId: card.cardId,
    username: card.username,
    profession: card.profession,
    isNpc: card.isNpc,
    tier: buildingTier(card.playerValue, card.valueFloor),
    value: card.playerValue,
    protection: protectionState(card, now),
    placement: null,
  };
}
