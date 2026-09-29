/**
 * Mainframe City — DERIVED placement policy (pure, node-safe).
 *
 * Since 2026-09-27 placement is a pure function of economy state (user
 * ruling "value orbits"): landmarks + HQ hold the center, every other owned
 * building fills clockwise rings around the HQ in VALUE order — priciest
 * nearest the core, cheapest at the rim. A value change re-ranks the orbit
 * on the next projection sync and the building drifts to its new ring
 * automatically. Nothing here reads or writes the DB; the persisted
 * city_layout machinery (layout-schema POST validation) is retained for the
 * legacy API but is no longer part of rendering.
 *
 * Ring geometry lives in rings.ts (global-tile orbit walk); this module
 * owns the VALUE RANKING policy and the tile identity helpers the scene
 * reuses (occupancy keys, fixture reservations).
 */

import type { CityBuilding } from "@/lib/city/types";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import {
  ORBIT_START_RING,
  hqGlobalTile,
  spacedOrbitOrder,
  type RingTile,
} from "@/lib/city/rings";

/** A tile address in the city (sector key + local x/y). */
export interface TileRef {
  sector: string;
  x: number;
  y: number;
}

/** String identity of a tile (same format as layout-schema.tileKey). */
export function tileRefKey(tile: TileRef): string {
  return `${tile.sector}:${tile.x}:${tile.y}`;
}

/**
 * CIVIC BUILDINGS (2026-09-29 user ruling): four city-service landmarks —
 * Police, Fire, School, Hospital — that materialize on the four DIAGONAL
 * tiles of the first orbit ring (Chebyshev 4 from the HQ, roster order
 * police/fire/school/hospital). The diagonals are the only ring-4 on-ladder
 * slots the monument moat leaves completely clear, and they sit ON the
 * road-grid checkerboard, so the civic square paves exactly like every
 * ordinary block. One tier per growth threshold (10 / 100 / 1000 owned
 * buildings — projection.ts CIVIC_TIER_THRESHOLDS): the same four tiles,
 * progressively grander architecture.
 */
export const CIVIC_RING_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 4, dy: -4 }, // police  — screen-east diagonal
  { dx: 4, dy: 4 }, // fire    — screen-south (front) diagonal
  { dx: -4, dy: -4 }, // school  — screen-north (back) diagonal
  { dx: -4, dy: 4 }, // hospital — screen-west diagonal
];

/** Civic tile of kind index 0..3 (CIVIC_RING_OFFSETS order), s0-local. */
export function civicTileRef(index: number): TileRef {
  const off = CIVIC_RING_OFFSETS[((index % 4) + 4) % 4];
  const c = GRID_SIZE >> 1;
  return { sector: "s0", x: c + off.dx, y: c + off.dy };
}

/** All four civic tiles as occupancy keys (reserved for the civic set). */
export function civicTileKeys(): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < CIVIC_RING_OFFSETS.length; i++) {
    keys.add(tileRefKey(civicTileRef(i)));
  }
  return keys;
}

/** One building + the derived tile it renders on. */
export interface RankEntry {
  building: CityBuilding;
  tile: TileRef;
  /** Chebyshev ring radius from the HQ core (value rank made spatial). */
  ring: number;
}

export interface RankArrangeResult {
  /** Buildings in canonical value order, each with its orbit tile. */
  entries: RankEntry[];
  /**
   * Ring to resume the orbit at for whatever renders AFTER the detailed
   * buildings (aggregate slabs continue outward on the same walk).
   * ORBIT_START_RING when there are no buildings.
   */
  resumeRing: number;
}

/**
 * Derive every building's tile: sort by value desc (cardId asc tie-break —
 * the projection's canonical stable order), then take orbit tiles from the
 * SPACED walk (spacedOrbitOrder: every other ring + checkerboard, airy
 * tiles first then infill — 2026-09-29 user ruling "buildings don't need
 * to be cramped on top of each other"), skipping tiles the caller blocks
 * (HQ/landmark reservations, monument moat, and anything already
 * standing). Deterministic: same inputs → same layout, so a value change
 * moves exactly the buildings whose rank crossed another's.
 *
 * Overflow (more buildings than usable tiles — only reachable with the
 * dev-only CITY_DETAILED_LIMIT override on a single-sector city) wraps
 * modulo the tile list: extras share rim tiles rather than crashing.
 */
export function rankArrangeTiles(
  buildings: readonly CityBuilding[],
  sectorCount: number,
  isBlocked: (key: string) => boolean
): RankArrangeResult {
  const ranked = [...buildings].sort(
    (a, b) => b.value - a.value || a.cardId - b.cardId
  );
  if (ranked.length === 0) {
    return { entries: [], resumeRing: ORBIT_START_RING };
  }
  const tiles = spacedOrbitOrder(hqGlobalTile(), ORBIT_START_RING, sectorCount, undefined, (t) =>
    !isBlocked(tileRefKey(t))
  );
  const entries: RankEntry[] = ranked.map((building, i) => {
    const tile: RingTile | undefined = tiles[i % tiles.length];
    return {
      building,
      tile: tile
        ? { sector: tile.sector, x: tile.x, y: tile.y }
        : // Zero usable tiles at all (degenerate grid) — park at Boot origin.
          { sector: "s0", x: 0, y: 0 },
      ring: tile?.ring ?? ORBIT_START_RING,
    };
  });
  const resumeRing = entries.length
    ? entries[entries.length - 1].ring
    : ORBIT_START_RING;
  return { entries, resumeRing };
}
