/**
 * Mainframe City — satellite-city geometry (pure, node-safe, no Pixi).
 *
 * Satellite cities (owned cards that own cards) render OUTSIDE the 3×3
 * sector macro grid, far enough that they can never overlap the home city
 * (all 9 sector pads — including locked ones — always draw, so the anchor
 * ring clears the FULL macro footprint, not just the unlocked part) and
 * never overlap each other. Anchors sit on the octants of a Chebyshev ring
 * around the macro center — 8 slots, one per satellite (the assembler caps
 * neighbors at exactly that count).
 *
 * Each cluster is a compact diamond: a mini relay HQ at the anchor tile
 * plus buildings on clockwise mini-rings (ringTiles) out to
 * SATELLITE_CLUSTER_RADIUS — the value-orbit rule in miniature (priciest
 * nearest the relay).
 */

import { GRID_SIZE } from "./layout-schema";
import { ringTiles } from "./rings";
import {
  TILE_H,
  TILE_W,
  macroStride,
  tileToScreen,
  type Point,
} from "./scene/iso";

/**
 * Clear tiles between the macro footprint edge and the anchor ring. 6 keeps
 * a visible screen gap (≥ ~3 building tiles) while staying reachable at
 * world LOD; pinned by tests (scene/satellites).
 */
export const SATELLITE_MARGIN_TILES = 6;

/** Chebyshev radius of one cluster around its anchor (mini-orbit extent). */
export const SATELLITE_CLUSTER_RADIUS = 3;

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

/** Anchor ring radius (macro half-extent + clear margin), in tiles. */
export function satelliteRingRadius(gridSize: number = GRID_SIZE): number {
  return macroHalfExtent(gridSize) + SATELLITE_MARGIN_TILES;
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

/** Global-tile anchor of satellite slot `index` (0..7, wraps). */
export function satelliteAnchor(index: number, gridSize: number = GRID_SIZE): Point {
  const c = macroCenter(gridSize);
  const r = satelliteRingRadius(gridSize);
  const [dx, dy] = OCTANTS[((index % OCTANTS.length) + OCTANTS.length) % OCTANTS.length];
  return { x: Math.round(c.x + dx * r), y: Math.round(c.y + dy * r) };
}

export interface SatelliteTile {
  gx: number;
  gy: number;
  /** Chebyshev mini-ring radius from the anchor (1 = nearest the relay). */
  ring: number;
}

/**
 * The first `count` cluster tiles: clockwise mini-rings around the anchor
 * (ring 1 first — priciest building nearest the relay, matching the home
 * value-orbit rule). Exactly `count` tiles (capacity 49 ≥ the 12-building
 * budget), no duplicates, all within SATELLITE_CLUSTER_RADIUS.
 */
export function satelliteClusterTiles(
  anchor: Point,
  count: number,
  radius: number = SATELLITE_CLUSTER_RADIUS
): SatelliteTile[] {
  const out: SatelliteTile[] = [];
  for (let r = 1; r <= radius && out.length < count; r++) {
    for (const { gx, gy } of ringTiles(anchor.x, anchor.y, r)) {
      out.push({ gx, gy, ring: r });
      if (out.length >= count) break;
    }
  }
  return out;
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
