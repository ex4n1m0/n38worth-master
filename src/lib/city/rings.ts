/**
 * Mainframe City — value-orbit ring math (pure, node-safe, no Pixi).
 *
 * Placement rules (2026-09-27): the six goddess landmarks and the HQ core
 * hold the center; every other owned building fills CLOCKWISE square rings
 * around the HQ, priciest first — inner rings are the high-value core, the
 * rim is the cheap sprawl, and a value change re-ranks the whole orbit on
 * the next projection (nothing is persisted; the layout is a pure function
 * of owned cards + values + unlocked sectors).
 *
 * All math runs in GLOBAL tile space (the 3×3 sector macro grid, iso.ts) so
 * rings cross sector borders naturally: a ring tile is usable when it lands
 * inside ANY UNLOCKED sector's grid — the 2-tile macro gaps and locked
 * sector pads are skipped, which keeps the mission-ladder unlock authority
 * intact (a locked sector's rim simply stays empty until it opens).
 */

import { GRID_SIZE } from "@/lib/city/layout-schema";
import {
  SECTOR_MACRO,
  globalTile,
  macroStride,
  sectorOfGlobalTile,
  type Point,
} from "@/lib/city/scene/iso";

/**
 * First ring ordinary buildings may occupy. The landmark hexagon's farthest
 * monument sits at Chebyshev radius 3 from the HQ; the monument MOAT (its
 * 8 neighbors) keeps a one-tile halo, so buildings start at ring 4 —
 * "just enough space" around the Six (2026-09-29 user ruling: tighten the
 * core plaza; the old empty ring 4 is gone, the moat alone separates).
 */
export const ORBIT_START_RING = 4;

/**
 * Inter-building breathing room (2026-09-29 user rulings "buildings don't
 * need to be cramped on top of each other", then "still more space"): the
 * SPACED orbit occupies every THIRD ring (two empty avenues between
 * building rings) and every OTHER tile along a ring (checkerboard) — the
 * wide procedural megaforms then never stack at the 64px screen offsets of
 * adjacent tiles/rings (same-ring neighbors sit ~143px apart, cross-ring
 * ~190px+). `spacedOrbitOrder` lists the airy tiles first and the skipped
 * (infill) tiles after, so a city densifies gracefully at the rim only
 * once every airy slot is taken; the value story (priciest innermost) is
 * unchanged. Satellite mini cities import the SAME stride (mirroring the
 * home rules — see satellites.ts).
 */
export const ORBIT_RING_STRIDE = 3;
export const ORBIT_TILE_STRIDE = 2;

/** The orbit center: the HQ core tile (sector 0 center) in global tiles. */
export function hqGlobalTile(gridSize: number = GRID_SIZE): Point {
  return globalTile(0, gridSize >> 1, gridSize >> 1, gridSize);
}

/** One usable tile on an orbit ring (TileRef + metadata for filters/tests). */
export interface RingTile {
  /** Sector key "s0".."s8". */
  sector: string;
  sectorIndex: number;
  x: number;
  y: number;
  /** Chebyshev ring radius from the orbit center. */
  ring: number;
}

/**
 * Tiles of one square ring (Chebyshev radius r ≥ 1) around (cx, cy),
 * CLOCKWISE on screen (tile +x = screen down-right, +y = screen down-left),
 * starting at the screen-top edge midpoint. Exactly 8r tiles, no duplicates.
 * Screen-walk: top edge rightward → right edge downward → bottom edge
 * leftward → left edge upward — verified by tests (scene/rings).
 */
export function ringTiles(
  cx: number,
  cy: number,
  r: number
): Array<{ gx: number; gy: number }> {
  if (r < 1) return [{ gx: cx, gy: cy }];
  const tiles: Array<{ gx: number; gy: number }> = [];
  let x = cx;
  let y = cy - r;
  for (let i = 0; i < r; i++) tiles.push({ gx: x++, gy: y });
  for (let i = 0; i < 2 * r; i++) tiles.push({ gx: x, gy: y++ });
  for (let i = 0; i < 2 * r; i++) tiles.push({ gx: x--, gy: y });
  for (let i = 0; i < 2 * r; i++) tiles.push({ gx: x, gy: y-- });
  for (let i = 0; i < r; i++) tiles.push({ gx: x++, gy: y });
  return tiles;
}

/**
 * The full clockwise orbit: `ringTiles` from `fromRing` outward, mapped to
 * sector-local tiles, keeping only tiles that fall inside an UNLOCKED
 * sector's grid (macro gaps and locked pads drop out) and pass `allow`
 * (reserved/moat/occupied filters live with the caller). Pure and
 * deterministic: same inputs → same tile order.
 */
export function orbitOrder(
  center: Point,
  fromRing: number,
  sectorCount: number,
  gridSize: number = GRID_SIZE,
  allow?: (tile: RingTile) => boolean
): RingTile[] {
  const unlocked = Math.max(1, Math.min(SECTOR_MACRO.length, sectorCount));
  const stride = macroStride(gridSize);
  // Any valid tile lives inside the 3×3 macro grid; ring radii beyond its
  // span can only hit gaps/outside — a cheap hard stop for the walk.
  const maxRing = stride * 2;
  const out: RingTile[] = [];
  for (let r = Math.max(1, fromRing); r <= maxRing; r++) {
    for (const { gx, gy } of ringTiles(center.x, center.y, r)) {
      const sectorIndex = sectorOfGlobalTile(gx, gy, gridSize);
      if (sectorIndex === null || sectorIndex >= unlocked) continue;
      const macro = SECTOR_MACRO[sectorIndex];
      const tile: RingTile = {
        sector: `s${sectorIndex}`,
        sectorIndex,
        x: gx - macro.x * stride,
        y: gy - macro.y * stride,
        ring: r,
      };
      if (!allow || allow(tile)) out.push(tile);
    }
  }
  return out;
}

/**
 * The orbit with breathing room (see ORBIT_RING_STRIDE/ORBIT_TILE_STRIDE):
 * the SAME tiles as `orbitOrder`, reordered — every stride-eligible tile
 * first (airy layout), then the skipped tiles in walk order (infill, used
 * only when the city outgrows its airy capacity so buildings never share a
 * rim tile before every slot is taken). A tile is stride-eligible when its
 * ring is on the fromRing + k·RING_STRIDE ladder AND its global diagonal
 * parity matches the HQ's (the checkerboard).
 */
export function spacedOrbitOrder(
  center: Point,
  fromRing: number,
  sectorCount: number,
  gridSize: number = GRID_SIZE,
  allow?: (tile: RingTile) => boolean
): RingTile[] {
  const dense = orbitOrder(center, fromRing, sectorCount, gridSize, allow);
  const stride = macroStride(gridSize);
  const baseParity = (center.x + center.y) % 2;
  const isSpaced = (t: RingTile) => {
    if ((t.ring - fromRing) % ORBIT_RING_STRIDE !== 0) return false;
    const macro = SECTOR_MACRO[t.sectorIndex] ?? { x: 1, y: 1 };
    const gx = macro.x * stride + t.x;
    const gy = macro.y * stride + t.y;
    return (gx + gy) % 2 === baseParity;
  };
  const spaced = dense.filter(isSpaced);
  const infill = dense.filter((t) => !isSpaced(t));
  return [...spaced, ...infill];
}
