/**
 * Mainframe City 3D — fixture tile geometry (pure, node-safe, no three).
 *
 * Mirrors the fixture rules the Pixi IsoWorld owns (HQ_TILE, LANDMARK_RING,
 * reserved/moat keys, worldPointOfTile) so the value-orbit placement
 * (rankArrangeTiles) reserves exactly the same tiles and the 3D fixtures
 * stand where the 2D ones do. Pure twin of IsoWorld's exports — kept in
 * scene3d so the three.js chunk never imports the pixi-coupled file.
 *
 * When the three renderer becomes the default, these (or IsoWorld's) two
 * copies should merge into src/lib/city (placement-adjacent); until the
 * parity gate passes, duplicating ~60 lines keeps the pixi renderer
 * untouched behind the flag.
 */

import { GRID_SIZE } from "@/lib/city/layout-schema";
import { globalTile, tileToScreen, TILE_W } from "@/lib/city/scene/iso";
import {
  civicTileKeys,
  civicTileRef,
  tileRefKey,
  type TileRef,
} from "@/lib/city/placement";

/** HQ tile: sector 0 center. */
export const HQ_TILE: TileRef = {
  sector: "s0",
  x: GRID_SIZE >> 1,
  y: GRID_SIZE >> 1,
};

/**
 * Fixed goddess landmark hexagon (roster order) hugging the HQ core at
 * Chebyshev radius ~3 — same table as IsoWorld.LANDMARK_RING.
 */
const LANDMARK_RING: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 3, dy: 0 },
  { dx: 2, dy: 2 },
  { dx: 0, dy: 3 },
  { dx: -3, dy: 0 },
  { dx: -2, dy: -2 },
  { dx: 0, dy: -3 },
];

export function landmarkTile(index: number): TileRef {
  const ring = LANDMARK_RING[index % LANDMARK_RING.length];
  return { sector: "s0", x: HQ_TILE.x + ring.dx, y: HQ_TILE.y + ring.dy };
}

/** Corner-to-corner SCREEN width of the landmark ring (home-camera fit). */
export const LANDMARK_RING_SPAN_PX =
  Math.max(...LANDMARK_RING.map((r) => Math.abs(r.dx - r.dy))) * TILE_W + 176;

/** All fixture tiles placement must treat as reserved (HQ + Six + civic). */
export function reservedTileKeys(): Set<string> {
  const keys = new Set<string>([tileRefKey(HQ_TILE)]);
  for (let i = 0; i < LANDMARK_RING.length; i++) {
    keys.add(tileRefKey(landmarkTile(i)));
  }
  for (const key of civicTileKeys()) keys.add(key);
  return keys;
}

/**
 * One-tile visual moat around each monument (8 neighbors, ring tiles and
 * HQ excluded) — the orbit walk skips these so buildings never crowd the
 * monuments into illegibility.
 */
export function moatTileKeys(): Set<string> {
  const reserved = reservedTileKeys();
  const keys = new Set<string>();
  for (let i = 0; i < LANDMARK_RING.length; i++) {
    const t = landmarkTile(i);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const key = tileRefKey({ sector: "s0", x: t.x + dx, y: t.y + dy });
        if (!reserved.has(key)) keys.add(key);
      }
    }
  }
  return keys;
}

/** World-pixel center of a tile (any sector) — iso.ts ground truth. */
export function worldPointOfTile(tile: TileRef): { x: number; y: number } {
  const sectorIndex = Number(tile.sector.replace(/^s/, "")) || 0;
  const g = globalTile(sectorIndex, tile.x, tile.y, GRID_SIZE);
  return tileToScreen(g.x, g.y);
}

export { civicTileRef };
