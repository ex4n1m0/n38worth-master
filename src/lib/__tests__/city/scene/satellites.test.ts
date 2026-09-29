import { describe, expect, it } from "vitest";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import {
  macroCenter,
  macroHalfExtent,
  satelliteAnchor,
  satelliteClusterTiles,
  satelliteRingRadii,
  unlockedHalfExtents,
  unionBounds,
  SATELLITE_CLUSTER_RADIUS,
  SATELLITE_MARGIN_TILES,
  SATELLITE_MIN_RING_TILES,
  SATELLITE_ORBIT_START_RING,
} from "@/lib/city/satellites";
import {
  SECTOR_MACRO,
  TILE_H,
  TILE_W,
  macroStride,
  screenToTile,
  tileToScreen,
} from "@/lib/city/scene/iso";

/** Global tiles covered by the FIRST `sectorCount` sector grids (unlocked). */
function* unlockedTiles(sectorCount: number): Generator<{ gx: number; gy: number }> {
  const stride = macroStride(GRID_SIZE);
  for (let s = 0; s < sectorCount; s++) {
    const m = SECTOR_MACRO[s];
    for (let gx = m.x * stride; gx < m.x * stride + GRID_SIZE; gx++) {
      for (let gy = m.y * stride; gy < m.y * stride + GRID_SIZE; gy++) {
        yield { gx, gy };
      }
    }
  }
}

/** All global tiles covered by the FULL 3×3 macro footprint (pads incl.). */
function* macroTiles(): Generator<{ gx: number; gy: number }> {
  const span = 2 * macroStride(GRID_SIZE) + GRID_SIZE;
  for (let gx = 0; gx < span; gx++) {
    for (let gy = 0; gy < span; gy++) {
      yield { gx, gy };
    }
  }
}

describe("unlockedHalfExtents (dynamic distance source)", () => {
  it("Boot-only city occupies just sector 0's half-extent", () => {
    // s0 is the center macro cell: GRID_SIZE/2 tiles either way.
    expect(unlockedHalfExtents(1)).toEqual({ ex: GRID_SIZE / 2, ey: GRID_SIZE / 2 });
  });

  it("unlocking the North sector grows only the y extent (to the full span)", () => {
    expect(unlockedHalfExtents(2)).toEqual({ ex: GRID_SIZE / 2, ey: macroHalfExtent() });
  });

  it("cross layout (N+E+S+W) is symmetric; caps at the full macro extent", () => {
    expect(unlockedHalfExtents(5)).toEqual({ ex: macroHalfExtent(), ey: macroHalfExtent() });
    expect(unlockedHalfExtents(9)).toEqual({ ex: macroHalfExtent(), ey: macroHalfExtent() });
  });

  it("ring radii = extent + margin, floored at the separation minimum", () => {
    expect(satelliteRingRadii(1)).toEqual({
      rx: GRID_SIZE / 2 + SATELLITE_MARGIN_TILES,
      ry: GRID_SIZE / 2 + SATELLITE_MARGIN_TILES,
    });
    expect(satelliteRingRadii(2)).toEqual({
      rx: GRID_SIZE / 2 + SATELLITE_MARGIN_TILES,
      ry: macroHalfExtent() + SATELLITE_MARGIN_TILES,
    });
    // A degenerate tiny grid still keeps clusters apart.
    expect(satelliteRingRadii(1).rx).toBeGreaterThanOrEqual(SATELLITE_MIN_RING_TILES);
  });

  it("small cities sit their satellites closer than full cities", () => {
    const boot = satelliteRingRadii(1);
    const full = satelliteRingRadii(9);
    expect(boot.rx).toBeLessThan(full.rx);
    expect(boot.ry).toBeLessThan(full.ry);
    // And not absurdly far: a Boot ring is barely past the pad edge.
    expect(boot.ry).toBeLessThanOrEqual(macroHalfExtent());
  });
});

describe("satellite anchors (dynamic ring)", () => {
  it("clear every UNLOCKED sector grid at any city size (overlap guard)", () => {
    for (const sectorCount of [1, 2, 3, 5, 9]) {
      const unlocked = new Set(
        Array.from(unlockedTiles(sectorCount), (t) => `${t.gx},${t.gy}`)
      );
      for (let i = 0; i < 8; i++) {
        const anchor = satelliteAnchor(i, GRID_SIZE, sectorCount);
        // Worst case: a full-capacity cluster.
        for (const t of satelliteClusterTiles(anchor, 49)) {
          expect(unlocked.has(`${t.gx},${t.gy}`)).toBe(false);
        }
      }
    }
  });

  it("keep pairwise separation ≥ two cluster diameters plus margin", () => {
    for (const sectorCount of [1, 2, 5, 9]) {
      const anchors = Array.from({ length: 8 }, (_, i) =>
        satelliteAnchor(i, GRID_SIZE, sectorCount)
      );
      for (let i = 0; i < anchors.length; i++) {
        for (let j = i + 1; j < anchors.length; j++) {
          const cheb = Math.max(
            Math.abs(anchors[i].x - anchors[j].x),
            Math.abs(anchors[i].y - anchors[j].y)
          );
          expect(cheb).toBeGreaterThanOrEqual(
            2 * (SATELLITE_CLUSTER_RADIUS + 1) + 2
          );
        }
      }
    }
  });

  it("full 3×3 cities keep the legacy fixed ring (macro extent + margin)", () => {
    const c = macroCenter();
    const r = macroHalfExtent() + SATELLITE_MARGIN_TILES;
    for (let i = 0; i < 8; i++) {
      const a = satelliteAnchor(i, GRID_SIZE, 9);
      const cheb = Math.max(Math.abs(a.x - c.x), Math.abs(a.y - c.y));
      expect(cheb).toBeGreaterThanOrEqual(r - 1);
      expect(cheb).toBeLessThanOrEqual(r + 1);
    }
  });

  it("wraps slot indices and is deterministic", () => {
    expect(satelliteAnchor(8, GRID_SIZE, 1)).toEqual(satelliteAnchor(0, GRID_SIZE, 1));
    expect(satelliteAnchor(-1, GRID_SIZE, 5)).toEqual(satelliteAnchor(7, GRID_SIZE, 5));
    expect(satelliteAnchor(3, GRID_SIZE, 2)).toEqual(satelliteAnchor(3, GRID_SIZE, 2));
  });
});

describe("satelliteClusterTiles", () => {
  it("fills clockwise mini-rings from ORBIT_START_RING (goddess hexagon stays clear)", () => {
    const tiles = satelliteClusterTiles(satelliteAnchor(0, GRID_SIZE, 1), 12);
    expect(tiles).toHaveLength(12);
    // The mini goddess hexagon + moat occupy the inner rings — buildings
    // start at the SAME orbit ring the home city uses.
    expect(tiles.every((t) => t.ring === SATELLITE_ORBIT_START_RING)).toBe(true);
    // No duplicates.
    const keys = new Set(tiles.map((t) => `${t.gx},${t.gy}`));
    expect(keys.size).toBe(12);
    // All within the cluster radius of the anchor.
    const a = satelliteAnchor(0, GRID_SIZE, 1);
    for (const t of tiles) {
      expect(Math.max(Math.abs(t.gx - a.x), Math.abs(t.gy - a.y))).toBeLessThanOrEqual(
        SATELLITE_CLUSTER_RADIUS
      );
      // And none inside the mini monument hexagon or its moat.
      expect(Math.max(Math.abs(t.gx - a.x), Math.abs(t.gy - a.y))).toBeGreaterThanOrEqual(
        SATELLITE_ORBIT_START_RING
      );
    }
  });

  it("mini-city buildings keep breathing room (no two tiles adjacent)", () => {
    // 2026-09-29 user ruling "their buildings are on top of each other":
    // the airy segment places checkerboard — up to 16 budget buildings are
    // never Chebyshev-adjacent (the ≤12 budget always lands in the airy run).
    const a = satelliteAnchor(0, GRID_SIZE, 1);
    const tiles = satelliteClusterTiles(a, 12);
    expect(tiles).toHaveLength(12);
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const cheb = Math.max(
          Math.abs(tiles[i].gx - tiles[j].gx),
          Math.abs(tiles[i].gy - tiles[j].gy)
        );
        expect(cheb).toBeGreaterThan(1);
      }
    }
  });

  it("round-trips: every cluster tile picks back from its screen point", () => {
    const a = satelliteAnchor(2, GRID_SIZE, 1);
    for (const t of satelliteClusterTiles(a, 12)) {
      const p = tileToScreen(t.gx, t.gy);
      const back = screenToTile(p.x, p.y);
      expect(Math.floor(back.x)).toBe(t.gx);
      expect(Math.floor(back.y)).toBe(t.gy);
    }
  });

  it("full-grid clusters never place a tile inside the macro footprint", () => {
    const macro = new Set(
      Array.from(macroTiles(), (t) => `${t.gx},${t.gy}`)
    );
    for (let i = 0; i < 8; i++) {
      const anchor = satelliteAnchor(i, GRID_SIZE, 9);
      // Worst case: a full-capacity cluster (ring ORBIT_START..radius).
      for (const t of satelliteClusterTiles(anchor, 8 * SATELLITE_CLUSTER_RADIUS)) {
        expect(macro.has(`${t.gx},${t.gy}`)).toBe(false);
      }
    }
  });

  it("full-grid cluster tiles keep a screen skirt from the macro diamond", () => {
    // The macro footprint projects to an iso screen diamond. Tile-space
    // disjointness (test above) proves no tile/platform overlap; this pins
    // the SCREEN margin from every cluster tile to the diamond edges ≥ 50px.
    // The mini city renders at 0.55 scale (SatelliteLayer MINI_CITY_SCALE),
    // so a one-tile tile-space skirt reads as ample breathing room.
    const span = 2 * macroStride(GRID_SIZE) + GRID_SIZE;
    const s1 = (span - 1) * (TILE_W / 2);
    const h1 = (span - 1) * (TILE_H / 2);
    // Diamond edge lines: x−2y=0 (NE), x+2y−2s1=0 (SE), x−2y+4h1=0 (SW),
    // x+2y=0 (NW) — all scaled |dist| = |a·x + b·y + c| / √5.
    const edges: Array<[number, number, number]> = [
      [1, -2, 0],
      [1, 2, -2 * s1],
      [1, -2, 4 * h1],
      [1, 2, 0],
    ];
    for (let i = 0; i < 8; i++) {
      const anchor = satelliteAnchor(i, GRID_SIZE, 9);
      for (const t of satelliteClusterTiles(anchor, 8 * SATELLITE_CLUSTER_RADIUS)) {
        const p = tileToScreen(t.gx, t.gy);
        const minDist = Math.min(
          ...edges.map(([a, b, c]) => Math.abs(a * p.x + b * p.y + c) / Math.sqrt(5))
        );
        expect(minDist).toBeGreaterThan(50);
      }
    }
  });
});

describe("unionBounds", () => {
  it("merges and passes null through", () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: -5, minY: 5, maxX: 5, maxY: 20 };
    expect(unionBounds(a, b)).toEqual({ minX: -5, minY: 0, maxX: 10, maxY: 20 });
    expect(unionBounds(null, b)).toBe(b);
    expect(unionBounds(a, null)).toBe(a);
    expect(unionBounds(null, null)).toBeNull();
  });
});
