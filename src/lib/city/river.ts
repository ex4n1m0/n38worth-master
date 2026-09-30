/**
 * Mainframe City — the WORLD RIVER (pure, node-safe, no Pixi).
 *
 * 2026-10-01 ("do all proposed modifications" — water/bridge world
 * flavor): a straight water band on the shared world plate, rendered from
 * the Kenney 3D Road Tiles pack's water plates.
 *
 * PLACEMENT (the only always-empty band): the world plate is fully
 * allocated — a full 3×3 city's satellite clusters reach Chebyshev ~67
 * (anchor ring ~60 + cluster radius 7) and universe cities start at
 * WORLD_BASE_RING 64 and spiral outward ring by ring. The one gap that is
 * EMPTY BY CONSTRUCTION sits just past the LAST POPULATED universe ring:
 * that ring's cities span ±4 tiles of its radius, the NEXT ring (+8) is
 * unpopulated, so a 3-tile band at lastRadius + 5 … + 7 never touches a
 * city, satellite cluster, or skyline. The offset therefore follows the
 * city population (it slides outward when a new universe ring populates).
 *
 * Nothing is persisted; the band is a pure function of the city count.
 */

import {
  WORLD_BASE_RING,
  universeRingForRank,
  universeRingRadius,
} from "./universe";

/** River width in tiles. */
export const RIVER_WIDTH_TILES = 3;

/**
 * Gap from the last populated universe ring's radius to the river's near
 * edge (5 = clear of that ring's mini span ±4, with 1 bank tile).
 */
export const RIVER_RING_GAP_TILES = 5;

/**
 * River half-length in tiles along the band (|gx| ≤ span → up to
 * 2·span+1 tiles long). Bounded rendering: 193 × 3 = 579 instances in
 * ONE instanced pool per material.
 */
export const RIVER_SPAN_TILES = 96;

/** Fixed default: the ring-1 case (few cities — offset = base + gap). */
export const RIVER_OFFSET_TILES = WORLD_BASE_RING + RIVER_RING_GAP_TILES;

/** River band rows run along the world-x axis at NEGATIVE gy (screen-north). */
export interface RiverTile {
  gx: number;
  gy: number;
}

/**
 * The river's Chebyshev offset for a world with `cityCount` cities on the
 * shared map: just past the LAST populated universe ring, in the gap
 * before the next one. cityCount ≤ 0 → the ring-1 default.
 */
export function riverOffsetForCities(
  cityCount: number,
  base: number = WORLD_BASE_RING
): number {
  const lastRing = universeRingForRank(Math.max(2, cityCount), base);
  return universeRingRadius(lastRing, base) + RIVER_RING_GAP_TILES;
}

/**
 * The river band — every tile of the WIDTH rows starting at `offset`,
 * spanning ±RIVER_SPAN_TILES along gx. Pure and deterministic: same
 * (offset) → same tiles, always.
 */
export function deriveRiver(
  offset: number = RIVER_OFFSET_TILES,
  width: number = RIVER_WIDTH_TILES,
  span: number = RIVER_SPAN_TILES
): RiverTile[] {
  const out: RiverTile[] = [];
  for (let gy = -(offset + width - 1); gy <= -offset; gy++) {
    for (let gx = -span; gx <= span; gx++) {
      out.push({ gx, gy });
    }
  }
  return out;
}
