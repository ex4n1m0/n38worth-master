/**
 * Mainframe City — satellite-city geometry (pure, node-safe, no Pixi).
 *
 * Satellite cities (owned cards that own cards) render OUTSIDE the city's
 * UNLOCKED sector pads on the octants of a Chebyshev ring around the macro
 * center — 8 slots, one per satellite (the assembler caps neighbors at
 * exactly that count).
 *
 * DYNAMIC DISTANCE (2026-09-28 user ruling): the anchor ring is sized per
 * AXIS from what the city actually occupies — unlocked-sector half-extent +
 * a small margin — floored at the pairwise-separation minimum. A Boot-only
 * city pulls its satellites in close (no vast void); unlocking far sectors
 * pushes only the affected axis out. Locked pads are near-invisible chrome,
 * so clusters may hover over them — overlap with LIVE pads stays impossible.
 *
 * Each cluster is a compact diamond: a mini relay HQ at the anchor tile
 * plus buildings on clockwise mini-rings (ringTiles) out to
 * SATELLITE_CLUSTER_RADIUS — the value-orbit rule in miniature (priciest
 * nearest the relay), mirroring the home city's core-middle layout.
 */

import { GRID_SIZE } from "./layout-schema";
import { ORBIT_RING_STRIDE, ORBIT_START_RING, ringTiles } from "./rings";
import {
  SECTOR_MACRO,
  TILE_H,
  TILE_W,
  macroStride,
  tileToScreen,
  type Point,
} from "./scene/iso";

/**
 * Clear tiles between the unlocked pad edge and the anchor ring, per axis.
 * Must cover the cluster radius + a skirt so a full-capacity cluster never
 * touches the city's own ground; pinned by tests (scene/satellites).
 */
export const SATELLITE_MARGIN_TILES = 10;

/**
 * Per-axis floor for the anchor ring: adjacent octant anchors sit `r` tiles
 * apart on each axis, and two full clusters (radius 7 + skirt each) must
 * never touch — 18 tiles = 2·(radius+1)+2 is the minimum separation.
 */
export const SATELLITE_MIN_RING_TILES = 18;

/**
 * Chebyshev radius of one cluster around its anchor. The cluster MIRRORS
 * the home city shape (relay core, six mini monuments on the landmark
 * hexagon, buildings on the SPACED orbit rings 4, 7, … — the rings.ts
 * stride), so the radius must reach the second airy ring: radius 7 gives
 * 16 airy tiles on ring 4 + 28 on ring 7 = 44 breathing-room slots ≥ the
 * NEIGHBOR_BUILDING_LIMIT render budget (2026-09-29 "render all their
 * buildings" ruling).
 */
export const SATELLITE_CLUSTER_RADIUS = 7;

/**
 * First mini-ring satellite buildings may occupy — the same ORBIT_START_RING
 * the home orbit uses, keeping the mini goddess hexagon + moat clear.
 */
export const SATELLITE_ORBIT_START_RING = ORBIT_START_RING;

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Center of the full 3×3 macro footprint in global tiles (may be .5). */
export function macroCenter(gridSize: number = GRID_SIZE): Point {
  const span = 2 * macroStride(gridSize) + gridSize;
  return { x: span / 2, y: span / 2 };
}

/** Chebyshev half-extent of the full macro footprint in tiles. */
export function macroHalfExtent(gridSize: number = GRID_SIZE): number {
  return (2 * macroStride(gridSize) + gridSize) / 2;
}

/**
 * Per-axis Chebyshev half-extents (tiles, from the macro center) of the
 * union of the FIRST `sectorCount` sector grids — the ground the city
 * actually occupies (live pads; locked pads don't push satellites away).
 */
export function unlockedHalfExtents(
  sectorCount: number,
  gridSize: number = GRID_SIZE
): { ex: number; ey: number } {
  const count = Math.max(1, Math.min(SECTOR_MACRO.length, sectorCount));
  const stride = macroStride(gridSize);
  const c = macroCenter(gridSize);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let s = 0; s < count; s++) {
    const m = SECTOR_MACRO[s];
    minX = Math.min(minX, m.x * stride);
    maxX = Math.max(maxX, m.x * stride + gridSize);
    minY = Math.min(minY, m.y * stride);
    maxY = Math.max(maxY, m.y * stride + gridSize);
  }
  return {
    ex: Math.max(Math.abs(minX - c.x), Math.abs(maxX - c.x)),
    ey: Math.max(Math.abs(minY - c.y), Math.abs(maxY - c.y)),
  };
}

/**
 * Anchor ring radii per axis (tiles): unlocked extent + margin, floored at
 * the pairwise-separation minimum. Full 3×3 cities match the old fixed ring.
 */
export function satelliteRingRadii(
  sectorCount: number,
  gridSize: number = GRID_SIZE
): { rx: number; ry: number } {
  const { ex, ey } = unlockedHalfExtents(sectorCount, gridSize);
  return {
    rx: Math.max(SATELLITE_MIN_RING_TILES, ex + SATELLITE_MARGIN_TILES),
    ry: Math.max(SATELLITE_MIN_RING_TILES, ey + SATELLITE_MARGIN_TILES),
  };
}

/** Octant walk, CLOCKWISE on screen starting screen-north (rings.ts rule). */
const OCTANTS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N (screen up)
  [1, -1], // NE (screen right-up)
  [1, 0], // E (screen down-right)
  [1, 1], // SE
  [0, 1], // S
  [-1, 1], // SW
  [-1, 0], // W
  [-1, -1], // NW
];

/**
 * Global-tile anchor of satellite slot `index` (0..7, wraps) for a city with
 * `sectorCount` unlocked sectors (default 9 = the full macro grid).
 */
export function satelliteAnchor(
  index: number,
  gridSize: number = GRID_SIZE,
  sectorCount: number = SECTOR_MACRO.length
): Point {
  const c = macroCenter(gridSize);
  const { rx, ry } = satelliteRingRadii(sectorCount, gridSize);
  const [dx, dy] = OCTANTS[((index % OCTANTS.length) + OCTANTS.length) % OCTANTS.length];
  return { x: Math.round(c.x + dx * rx), y: Math.round(c.y + dy * ry) };
}

export interface SatelliteTile {
  gx: number;
  gy: number;
  /** Chebyshev mini-ring radius from the anchor (1 = nearest the relay). */
  ring: number;
}

/**
 * The first `count` cluster tiles — the home city's SPACED orbit in
 * miniature (2026-09-29 user rulings "their buildings are on top of each
 * other" + "more space"): airy tiles first (checkerboard parity + the
 * rings.ts ring-stride ladder), infill only when a mini outgrows its airy
 * capacity, so satellite/universe mini buildings never stack at
 * adjacent-tile screen offsets. Exactly `count` tiles, no duplicates, all
 * within `radius`.
 */
export function satelliteClusterTiles(
  anchor: Point,
  count: number,
  radius: number = SATELLITE_CLUSTER_RADIUS,
  fromRing: number = SATELLITE_ORBIT_START_RING
): SatelliteTile[] {
  const candidates: SatelliteTile[] = [];
  for (let r = Math.max(1, fromRing); r <= radius; r++) {
    for (const { gx, gy } of ringTiles(anchor.x, anchor.y, r)) {
      candidates.push({ gx, gy, ring: r });
    }
  }
  const parityOf = (v: number) => ((v % 2) + 2) % 2;
  const base = parityOf(anchor.x + anchor.y);
  const isSpaced = (t: SatelliteTile) =>
    (t.ring - fromRing) % ORBIT_RING_STRIDE === 0 &&
    parityOf(t.gx + t.gy) === base;
  const airy = candidates.filter(isSpaced);
  const infill = candidates.filter((t) => !isSpaced(t));
  return [...airy, ...infill].slice(0, count);
}

/** Union of two world-px bounds (null operands pass through). */
export function unionBounds(
  a: WorldBounds | null,
  b: WorldBounds | null
): WorldBounds | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * World-px bounds of one cluster's GROUND footprint (the pad diamond the
 * relay sits on, cluster radius + pad skirt). Building/plate art rises
 * above the pad; callers that need the full ink extent add the content
 * pads (the scene merges this with contentBoundsOfTiles-style margins).
 */
export function satelliteClusterBounds(
  anchor: Point,
  radius: number = SATELLITE_CLUSTER_RADIUS
): WorldBounds {
  const center = tileToScreen(anchor.x, anchor.y);
  const halfW = (radius + 1.5) * (TILE_W / 2);
  const halfH = (radius + 1.5) * (TILE_H / 2);
  return {
    minX: center.x - halfW,
    maxX: center.x + halfW,
    minY: center.y - halfH,
    maxY: center.y + halfH + TILE_H,
  };
}
