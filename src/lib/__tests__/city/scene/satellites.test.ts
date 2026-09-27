import { describe, expect, it } from "vitest";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import {
  macroCenter,
  macroHalfExtent,
  satelliteAnchor,
  satelliteClusterTiles,
  satelliteRingRadius,
  unionBounds,
  SATELLITE_CLUSTER_RADIUS,
  SATELLITE_MARGIN_TILES,
} from "@/lib/city/satellites";
import {
  TILE_H,
  TILE_W,
  macroStride,
  screenToTile,
  tileToScreen,
} from "@/lib/city/scene/iso";

/** All global tiles covered by the FULL 3×3 macro footprint (pads incl.). */
function* macroTiles(): Generator<{ gx: number; gy: number }> {
  const span = 2 * macroStride(GRID_SIZE) + GRID_SIZE;
  for (let gx = 0; gx < span; gx++) {
    for (let gy = 0; gy < span; gy++) {
      yield { gx, gy };
    }
  }
}

describe("satellite anchors", () => {
  it("clear the FULL macro footprint (all 9 sector pads, locked included)", () => {
    const half = macroHalfExtent();
    const c = macroCenter();
    for (let i = 0; i < 8; i++) {
      const a = satelliteAnchor(i);
      const cheb = Math.max(Math.abs(a.x - c.x), Math.abs(a.y - c.y));
      // Cluster tiles extend CLUSTER_RADIUS toward the city — the innermost
      // satellite tile must still be clear of the footprint edge.
      expect(cheb - SATELLITE_CLUSTER_RADIUS).toBeGreaterThan(half);
    }
  });

  it("keep pairwise separation ≥ two cluster diameters plus margin", () => {
    const anchors = Array.from({ length: 8 }, (_, i) => satelliteAnchor(i));
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
  });

  it("stay screen-visible from the city (bounded void distance)", () => {
    // The anchor ring sits one margin beyond the macro half-extent — far
    // enough never to overlap, close enough to reach by panning at world
    // LOD. Pin the exact radius so layout changes are deliberate.
    expect(satelliteRingRadius()).toBe(macroHalfExtent() + SATELLITE_MARGIN_TILES);
  });

  it("wraps slot indices and is deterministic", () => {
    expect(satelliteAnchor(8)).toEqual(satelliteAnchor(0));
    expect(satelliteAnchor(-1)).toEqual(satelliteAnchor(7));
    expect(satelliteAnchor(3)).toEqual(satelliteAnchor(3));
  });
});

describe("satelliteClusterTiles", () => {
  it("fills clockwise mini-rings, nearest the relay first", () => {
    const tiles = satelliteClusterTiles(satelliteAnchor(0), 12);
    expect(tiles).toHaveLength(12);
    // First 8 tiles are ring 1, next 4 continue on ring 2.
    expect(tiles.slice(0, 8).every((t) => t.ring === 1)).toBe(true);
    expect(tiles.slice(8).every((t) => t.ring === 2)).toBe(true);
    // No duplicates.
    const keys = new Set(tiles.map((t) => `${t.gx},${t.gy}`));
    expect(keys.size).toBe(12);
    // All within the cluster radius of the anchor.
    const a = satelliteAnchor(0);
    for (const t of tiles) {
      expect(Math.max(Math.abs(t.gx - a.x), Math.abs(t.gy - a.y))).toBeLessThanOrEqual(
        SATELLITE_CLUSTER_RADIUS
      );
    }
  });

  it("round-trips: every cluster tile picks back from its screen point", () => {
    const a = satelliteAnchor(2);
    for (const t of satelliteClusterTiles(a, 12)) {
      const p = tileToScreen(t.gx, t.gy);
      const back = screenToTile(p.x, p.y);
      expect(Math.floor(back.x)).toBe(t.gx);
      expect(Math.floor(back.y)).toBe(t.gy);
    }
  });

  it("never places a tile inside the macro footprint (overlap guard)", () => {
    const macro = new Set(
      Array.from(macroTiles(), (t) => `${t.gx},${t.gy}`)
    );
    for (let i = 0; i < 8; i++) {
      const anchor = satelliteAnchor(i);
      // Worst case: a full-capacity cluster.
      for (const t of satelliteClusterTiles(anchor, 49)) {
        expect(macro.has(`${t.gx},${t.gy}`)).toBe(false);
      }
    }
  });

  it("cluster screen tiles keep a building-art-height gap from the macro diamond", () => {
    // The macro footprint projects to an iso screen diamond. Tile-space
    // disjointness (test above) already proves no tile/platform overlap;
    // this pins the SCREEN margin from every cluster tile to the diamond
    // edges ≥ 150px — one building's art height — so the home city's edge
    // towers never visually collide with satellite platforms either.
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
      const anchor = satelliteAnchor(i);
      for (const t of satelliteClusterTiles(anchor, 49)) {
        const p = tileToScreen(t.gx, t.gy);
        const minDist = Math.min(
          ...edges.map(([a, b, c]) => Math.abs(a * p.x + b * p.y + c) / Math.sqrt(5))
        );
        expect(minDist).toBeGreaterThan(150);
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
