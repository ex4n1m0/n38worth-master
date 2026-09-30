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
 * ROAD-GRID rhythm (2026-09-30 "no chessboard" ruling, superseding the
 * 2026-09-29 checkerboard): the orbit occupies every OTHER ring
 * (ORBIT_RING_STRIDE) — and every tile ON that ring, wall-to-wall. The
 * result is a planned grid: a SOLID block row of buildings, then the gap
 * ring as one continuous ring BOULEVARD (lib/city/streets.ts
 * deriveBoulevards), then the next block row — roads and buildings read as
 * aligned blocks instead of a checkerboard. The value story (priciest
 * innermost, clockwise fill) is unchanged; the gap rings are permanently
 * streets, so a dense city simply pushes its rim outward. Satellite mini
 * cities keep their own airy walk (satellites.ts).
 */
export const ORBIT_RING_STRIDE = 2;

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
 * The block-row orbit (2026-09-30 "no chessboard" ruling): every tile of
 * every ladder ring (fromRing + k·ORBIT_RING_STRIDE), in clockwise walk
 * order — SOLID rows of buildings with the gap rings left entirely to the
 * boulevard grid. Pure and deterministic: same inputs → same tile order.
 * Supersedes the 2026-09-29 checkerboard/airy-infill ordering.
 */
export function spacedOrbitOrder(
  center: Point,
  fromRing: number,
  sectorCount: number,
  gridSize: number = GRID_SIZE,
  allow?: (tile: RingTile) => boolean
): RingTile[] {
  return orbitOrder(center, fromRing, sectorCount, gridSize, (t) =>
    (t.ring - fromRing) % ORBIT_RING_STRIDE === 0 && (!allow || allow(t))
  );
}
