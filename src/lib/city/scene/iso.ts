/**
 * Mainframe City — isometric tile↔screen math (pure, node-safe, no Pixi).
 *
 * The world is a classic 2:1 iso diamond: one tile is TILE_W × TILE_H with
 * tile (0,0) at the world origin, +x going screen-down-right and +y going
 * screen-down-left. All helpers are pure functions so the vitest suite can
 * verify the projection round-trip without a renderer.
 *
 * Sector macro-layout: sector containers live on a 3×3 macro grid with a
 * SECTOR_GAP_TILES margin between neighbours, so a "global tile" coordinate
 * (gx, gy) uniquely addresses any tile in any sector (RTS plan §D1/§D3).
 */

/** One tile's footprint in unscaled world pixels (2:1 iso). */
export const TILE_W = 128;
export const TILE_H = 64;

/** Empty margin (in tiles) between the 3×3 sector macro cells. */
export const SECTOR_GAP_TILES = 2;

/** The 3×3 macro grid — 9 sector slots max (mission ladder length 8 + Boot). */
export const SECTOR_MACRO_COLS = 3;
export const SECTOR_MACRO_ROWS = 3;

export interface Point {
  x: number;
  y: number;
}

/**
 * Sector macro positions, index = sector index (s0 = Boot at the CENTER,
 * then clockwise N/E/S/W, then the corners). Deterministic and stable —
 * the renderer, camera bounds, and picking all read this one table.
 */
export const SECTOR_MACRO: ReadonlyArray<Point> = [
  { x: 1, y: 1 }, // s0 Boot — center
  { x: 1, y: 0 }, // s1 N
  { x: 2, y: 1 }, // s2 E
  { x: 1, y: 2 }, // s3 S
  { x: 0, y: 1 }, // s4 W
  { x: 0, y: 0 }, // s5 NW
  { x: 2, y: 0 }, // s6 NE
  { x: 2, y: 2 }, // s7 SE
  { x: 0, y: 2 }, // s8 SW
];

/** Macro cell stride in tiles (sector size + gap). */
export function macroStride(gridSize: number): number {
  return gridSize + SECTOR_GAP_TILES;
}

/** Local tile (sector, x, y) → global tile coordinates. */
export function globalTile(
  sectorIndex: number,
  x: number,
  y: number,
  gridSize: number
): Point {
  const macro = SECTOR_MACRO[sectorIndex] ?? { x: 1, y: 1 };
  const stride = macroStride(gridSize);
  return { x: macro.x * stride + x, y: macro.y * stride + y };
}

/** Center pixel (unscaled world px) of a global tile. */
export function tileToScreen(gx: number, gy: number): Point {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

/**
 * Inverse of tileToScreen with FRACTIONAL tile coordinates — picking code
 * floors the result (see pickTile).
 */
export function screenToTile(sx: number, sy: number): Point {
  return {
    x: sy / TILE_H + sx / TILE_W,
    y: sy / TILE_H - sx / TILE_W,
  };
}

/** Flat tile index inside one sector grid, or null when out of bounds. */
export function tileIndex(
  x: number,
  y: number,
  gridSize: number
): number | null {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= gridSize ||
    y >= gridSize
  ) {
    return null;
  }
  return y * gridSize + x;
}

/**
 * Which sector a GLOBAL tile belongs to (macro cell lookup), or null when
 * the point falls into a gap / outside the macro grid.
 */
export function sectorOfGlobalTile(
  gx: number,
  gy: number,
  gridSize: number
): number | null {
  const stride = macroStride(gridSize);
  const col = Math.floor(gx / stride);
  const row = Math.floor(gy / stride);
  if (col < 0 || row < 0 || col >= SECTOR_MACRO_COLS || col >= SECTOR_MACRO_ROWS) {
    return null;
  }
  // Reject gap tiles: local coords must fall inside the sector grid.
  const localX = gx - col * stride;
  const localY = gy - row * stride;
  if (localX < 0 || localY < 0 || localX >= gridSize || localY >= gridSize) {
    return null;
  }
  const index = SECTOR_MACRO.findIndex((m) => m.x === col && m.y === row);
  return index >= 0 ? index : null;
}

/** Picking: fractional world point → integer local tile, or null off-grid. */
export function pickTile(
  wx: number,
  wy: number,
  gridSize: number
): { sector: number; x: number; y: number } | null {
  const t = screenToTile(wx, wy);
  const gx = Math.floor(t.x);
  const gy = Math.floor(t.y);
  const sector = sectorOfGlobalTile(gx, gy, gridSize);
  if (sector === null) return null;
  const stride = macroStride(gridSize);
  const x = gx - SECTOR_MACRO[sector].x * stride;
  const y = gy - SECTOR_MACRO[sector].y * stride;
  if (tileIndex(x, y, gridSize) === null) return null;
  return { sector, x, y };
}

/**
 * World-pixel bounding box (unscaled) of the first `sectorCount` sectors —
 * the camera's pan bounds source. Covers the iso diamonds of the corners.
 */
/** Content-framing padding: building bodies rise ABOVE their tile center. */
export const CONTENT_PAD_TOP = 150;
export const CONTENT_PAD_SIDE = TILE_W / 2 + 8;
export const CONTENT_PAD_BOTTOM = TILE_H / 2 + 16;

/**
 * World-pixel bounding box of the OCCUPIED global tiles (buildings + HQ +
 * landmark fixtures) — the framing source for the initial camera and Reset.
 * Fitting the whole mostly-empty sector grid instead parks the camera at
 * ZOOM_MIN in world LOD, where the city collapses to aggregate skylines in
 * one corner of the viewport.
 */
export function contentBoundsOfTiles(
  globalTiles: ReadonlyArray<Point>
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (globalTiles.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const g of globalTiles) {
    const p = tileToScreen(g.x, g.y);
    minX = Math.min(minX, p.x - CONTENT_PAD_SIDE);
    maxX = Math.max(maxX, p.x + CONTENT_PAD_SIDE);
    minY = Math.min(minY, p.y - CONTENT_PAD_TOP);
    maxY = Math.max(maxY, p.y + CONTENT_PAD_BOTTOM);
  }
  return { minX, minY, maxX, maxY };
}

export function sectorWorldBounds(
  sectorCount: number,
  gridSize: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const count = Math.max(1, Math.min(SECTOR_MACRO.length, sectorCount));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let s = 0; s < count; s++) {
    const macro = SECTOR_MACRO[s];
    const stride = macroStride(gridSize);
    const corners: Point[] = [
      globalTile(s, 0, 0, gridSize),
      globalTile(s, gridSize - 1, 0, gridSize),
      globalTile(s, 0, gridSize - 1, gridSize),
      globalTile(s, gridSize - 1, gridSize - 1, gridSize),
    ];
    // Include the tile footprints (± half a tile), not just centers.
    for (const c of corners) {
      const p = tileToScreen(c.x, c.y);
      minX = Math.min(minX, p.x - TILE_W / 2);
      maxX = Math.max(maxX, p.x + TILE_W / 2);
      minY = Math.min(minY, p.y - TILE_H / 2);
      maxY = Math.max(maxY, p.y + TILE_H / 2);
    }
    void macro;
    void stride;
  }
  return { minX, minY, maxX, maxY };
}
