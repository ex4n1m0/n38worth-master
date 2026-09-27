import { describe, expect, it } from "vitest";
import {
  SECTOR_MACRO,
  TILE_H,
  TILE_W,
  contentBoundsOfTiles,
  globalTile,
  macroStride,
  pickTile,
  screenToTile,
  sectorOfGlobalTile,
  sectorWorldBounds,
  tileIndex,
  tileToScreen,
} from "@/lib/city/scene/iso";

const GRID = 32;

describe("iso tile↔screen", () => {
  it("maps the origin tile to the world origin", () => {
    expect(tileToScreen(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("uses the 2:1 diamond stepping", () => {
    expect(tileToScreen(1, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    expect(tileToScreen(0, 1)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
    expect(tileToScreen(1, 1)).toEqual({ x: 0, y: TILE_H });
  });

  it("round-trips through screenToTile (fractional)", () => {
    for (const [gx, gy] of [
      [0, 0],
      [5, 9],
      [31, 31],
      [70, 3],
      [-4, 12],
    ]) {
      const p = tileToScreen(gx, gy);
      const back = screenToTile(p.x, p.y);
      expect(back.x).toBeCloseTo(gx, 10);
      expect(back.y).toBeCloseTo(gy, 10);
    }
  });
});

describe("iso tile indexing", () => {
  it("indexes in-bounds tiles and rejects everything else", () => {
    expect(tileIndex(0, 0, GRID)).toBe(0);
    expect(tileIndex(31, 31, GRID)).toBe(31 * GRID + 31);
    expect(tileIndex(32, 0, GRID)).toBeNull();
    expect(tileIndex(0, 32, GRID)).toBeNull();
    expect(tileIndex(-1, 0, GRID)).toBeNull();
    expect(tileIndex(1.5, 0, GRID)).toBeNull();
  });
});

describe("iso sector macro grid", () => {
  it("places Boot (s0) at the macro center", () => {
    expect(SECTOR_MACRO[0]).toEqual({ x: 1, y: 1 });
    expect(SECTOR_MACRO).toHaveLength(9);
  });

  it("maps local tiles to unique global coordinates", () => {
    const stride = macroStride(GRID);
    expect(globalTile(0, 0, 0, GRID)).toEqual({ x: stride, y: stride });
    // s1 is the N macro cell (1,0): y starts at 0, x at the stride.
    expect(globalTile(1, 3, 4, GRID)).toEqual({ x: stride + 3, y: 4 });
    const seen = new Set<string>();
    for (let s = 0; s < 9; s++) {
      for (const [x, y] of [
        [0, 0],
        [31, 0],
        [0, 31],
        [31, 31],
      ]) {
        const g = globalTile(s, x, y, GRID);
        seen.add(`${g.x},${g.y}`);
      }
    }
    expect(seen.size).toBe(36); // no collisions across sectors
  });

  it("resolves the sector of a global tile (inverse of globalTile)", () => {
    for (let s = 0; s < 9; s++) {
      const g = globalTile(s, 12, 7, GRID);
      expect(sectorOfGlobalTile(g.x, g.y, GRID)).toBe(s);
    }
    const stride = macroStride(GRID);
    expect(sectorOfGlobalTile(stride - 1, stride, GRID)).toBeNull(); // gap tile
  });
});

describe("iso picking", () => {
  it("picks the tile under a world point", () => {
    const g = globalTile(2, 10, 20, GRID);
    const p = tileToScreen(g.x, g.y);
    expect(pickTile(p.x, p.y, GRID)).toEqual({ sector: 2, x: 10, y: 20 });
  });

  it("returns null for gap/out-of-grid points", () => {
    expect(pickTile(-10_000, -10_000, GRID)).toBeNull();
    const stride = macroStride(GRID);
    const gap = tileToScreen(stride - 1, stride);
    expect(pickTile(gap.x, gap.y, GRID)).toBeNull();
  });
});

describe("iso world bounds", () => {
  it("bounds exactly the unlocked sectors and grows with the count", () => {
    const one = sectorWorldBounds(1, GRID);
    expect(one.minX).toBeLessThan(one.maxX);
    expect(one.minY).toBeLessThan(one.maxY);
    const all = sectorWorldBounds(9, GRID);
    expect(all.maxX - all.minX).toBeGreaterThan(one.maxX - one.minX);
    expect(all.maxY - all.minY).toBeGreaterThan(one.maxY - one.minY);
  });

  it("contains every unlocked sector's corners", () => {
    const b = sectorWorldBounds(4, GRID);
    for (let s = 0; s < 4; s++) {
      for (const [x, y] of [
        [0, 0],
        [31, 31],
      ]) {
        const g = globalTile(s, x, y, GRID);
        const p = tileToScreen(g.x, g.y);
        expect(p.x).toBeGreaterThanOrEqual(b.minX);
        expect(p.x).toBeLessThanOrEqual(b.maxX);
        expect(p.y).toBeGreaterThanOrEqual(b.minY);
        expect(p.y).toBeLessThanOrEqual(b.maxY);
      }
    }
  });
});

describe("iso content bounds (content-fit framing)", () => {
  it("returns null for no tiles", () => {
    expect(contentBoundsOfTiles([])).toBeNull();
  });

  it("pads a single tile: body height above, footprint below/sides", () => {
    const b = contentBoundsOfTiles([{ x: 34, y: 34 }])!;
    const p = tileToScreen(34, 34);
    expect(b.maxX - p.x).toBeCloseTo(TILE_W / 2 + 8, 8);
    expect(p.x - b.minX).toBeCloseTo(TILE_W / 2 + 8, 8);
    expect(p.y - b.minY).toBeCloseTo(150, 8); // tall tier-7 body + chip
    expect(b.maxY - p.y).toBeCloseTo(TILE_H / 2 + 16, 8);
  });

  it("spans tiles across sectors and contains every tile's screen point", () => {
    const globals = [
      globalTile(0, 16, 16, GRID),
      globalTile(1, 3, 4, GRID),
      globalTile(2, 30, 1, GRID),
    ];
    const b = contentBoundsOfTiles(globals)!;
    for (const g of globals) {
      const p = tileToScreen(g.x, g.y);
      expect(p.x).toBeGreaterThanOrEqual(b.minX);
      expect(p.x).toBeLessThanOrEqual(b.maxX);
      expect(p.y).toBeGreaterThanOrEqual(b.minY);
      expect(p.y).toBeLessThanOrEqual(b.maxY);
    }
  });
});
