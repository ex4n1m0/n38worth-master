import { describe, expect, it } from "vitest";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import {
  tileRefKey,
  rankArrangeTiles,
  civicTileRef,
  CIVIC_RING_OFFSETS,
} from "@/lib/city/placement";
import {
  ORBIT_START_RING,
  ORBIT_RING_STRIDE,
  hqGlobalTile,
  orbitOrder,
  ringTiles,
  spacedOrbitOrder,
} from "@/lib/city/rings";
import { macroStride, tileToScreen } from "@/lib/city/scene/iso";
import type { CityBuilding } from "@/lib/city/types";

/** Minimal CityBuilding factory (tier/protection irrelevant to placement). */
function b(cardId: number, value: number): CityBuilding {
  return {
    cardId,
    username: `npc_${cardId}`,
    profession: null,
    isNpc: 1,
    tier: 1,
    value,
    protection: null,
  };
}

describe("ringTiles (clockwise square rings)", () => {
  const cx = 50;
  const cy = 50;

  it("visits exactly 8r tiles with no duplicates", () => {
    for (const r of [1, 2, 7, 16]) {
      const tiles = ringTiles(cx, cy, r);
      expect(tiles).toHaveLength(8 * r);
      expect(new Set(tiles.map((t) => `${t.gx},${t.gy}`)).size).toBe(8 * r);
    }
  });

  it("stays on the Chebyshev ring (max |dx|,|dy| == r, at least one == r)", () => {
    for (const { gx, gy } of ringTiles(cx, cy, 5)) {
      const dx = Math.abs(gx - cx);
      const dy = Math.abs(gy - cy);
      expect(Math.max(dx, dy)).toBe(5);
    }
  });

  it("starts at the tile-top edge midpoint and walks clockwise on screen", () => {
    const r = 4;
    const tiles = ringTiles(cx, cy, r);
    // Start tile: (cx, cy - r) — the midpoint of the tile-space top edge.
    // In the 2:1 iso projection the tile square maps to a screen DIAMOND, so
    // this lands on the upper-right flank (screen y above center, screen x
    // right of center).
    expect(tiles[0]).toEqual({ gx: cx, gy: cy - r });
    const center = tileToScreen(cx, cy);
    const start = tileToScreen(tiles[0].gx, tiles[0].gy);
    expect(start.y).toBeLessThan(center.y);
    expect(start.x).toBeGreaterThan(center.x);
    // Clockwise on screen: from the upper-right flank the walk descends the
    // right side (tile +x = screen down-right).
    const second = tileToScreen(tiles[1].gx, tiles[1].gy);
    expect(second.x).toBeGreaterThan(start.x);
    expect(second.y).toBeGreaterThan(start.y);
    // Corners land where the legs say: indices r, 3r, 5r, 7r sit on the four
    // tile-space corners of the ring (the screen diamond's E, S, W, N
    // vertices respectively — each leg pushes its own starting corner).
    expect(tiles[r]).toEqual({ gx: cx + r, gy: cy - r }); // NE corner
    expect(tiles[3 * r]).toEqual({ gx: cx + r, gy: cy + r }); // SE
    expect(tiles[5 * r]).toEqual({ gx: cx - r, gy: cy + r }); // SW
    expect(tiles[7 * r]).toEqual({ gx: cx - r, gy: cy - r }); // NW
  });
});

describe("orbitOrder (global orbit across unlocked sectors)", () => {
  it("equals exactly the unlocked-sector tiles at Chebyshev ≥ fromRing", () => {
    const center = hqGlobalTile();
    const stride = macroStride(GRID_SIZE);
    const order = orbitOrder(center, ORBIT_START_RING, 1); // Boot only
    expect(order.length).toBeGreaterThan(0);
    const expected = new Set<string>();
    for (let gx = stride; gx < stride + GRID_SIZE; gx++) {
      for (let gy = stride; gy < stride + GRID_SIZE; gy++) {
        const ring = Math.max(Math.abs(gx - center.x), Math.abs(gy - center.y));
        if (ring >= ORBIT_START_RING) expected.add(`${gx},${gy}`);
      }
    }
    const got = new Set(
      order.map((t) => {
        expect(t.sector).toBe("s0");
        expect(t.ring).toBe(
          Math.max(
            Math.abs(t.x + stride - center.x),
            Math.abs(t.y + stride - center.y)
          )
        );
        return `${t.x + stride},${t.y + stride}`;
      })
    );
    expect(got.size).toBe(order.length); // no duplicates
    expect(got).toEqual(expected);
  });

  it("never leaves a locked sector, opens up when one unlocks", () => {
    const center = hqGlobalTile();
    const one = orbitOrder(center, ORBIT_START_RING, 1);
    const two = orbitOrder(center, ORBIT_START_RING, 2);
    expect(one.every((t) => t.sectorIndex === 0)).toBe(true);
    expect(two.some((t) => t.sectorIndex === 1)).toBe(true);
    expect(two.length).toBeGreaterThan(one.length);
  });

  it("is ordered by ring (value rank = distance from the core)", () => {
    const order = orbitOrder(hqGlobalTile(), ORBIT_START_RING, 3);
    for (let i = 1; i < order.length; i++) {
      expect(order[i].ring).toBeGreaterThanOrEqual(order[i - 1].ring);
    }
  });

  it("respects the allow filter (reserved/moat tiles drop out)", () => {
    const order = orbitOrder(
      hqGlobalTile(),
      ORBIT_START_RING,
      1,
      GRID_SIZE,
      (t) => !(t.x === 23 && t.y === 16) // one arbitrary Boot tile
    );
    expect(order.some((t) => t.sector === "s0" && t.x === 23 && t.y === 16)).toBe(
      false
    );
  });

  it("is deterministic", () => {
    expect(orbitOrder(hqGlobalTile(), ORBIT_START_RING, 4)).toEqual(
      orbitOrder(hqGlobalTile(), ORBIT_START_RING, 4)
    );
  });
});

describe("rankArrangeTiles (derived value-orbit placement)", () => {
  const noneBlocked = () => false;

  it("orders buildings by value desc (cardId asc tie-break), innermost first", () => {
    const { entries } = rankArrangeTiles(
      [b(1, 300), b(2, 100), b(3, 200), b(4, 200)],
      1,
      noneBlocked
    );
    expect(entries.map((e) => e.building.cardId)).toEqual([1, 3, 4, 2]);
    // Rank 1 gets the first orbit tile; ranks never go backward.
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].ring).toBeGreaterThanOrEqual(entries[i - 1].ring);
    }
  });

  it("priciest building sits nearer the core than the cheapest", () => {
    const { entries } = rankArrangeTiles(
      Array.from({ length: 80 }, (_, i) => b(i + 1, (i + 1) * 10)),
      9,
      noneBlocked
    );
    const top = entries[0];
    const bottom = entries[entries.length - 1];
    expect(top.ring).toBe(ORBIT_START_RING);
    expect(bottom.ring).toBeGreaterThan(top.ring);
  });

  it("a value gain re-ranks the orbit — the riser takes the inner tile", () => {
    const buildings = [b(1, 300), b(2, 100), b(3, 200)];
    const first = rankArrangeTiles(buildings, 1, noneBlocked);
    const tileOf = (cardId: number) =>
      first.entries.find((e) => e.building.cardId === cardId)!.tile;

    // Building 2 (100) overvalues everyone → it becomes rank 1 and takes
    // the tile building 1 held; the former leader is pushed one ring-slot out.
    const boosted = [b(1, 300), b(2, 900), b(3, 200)];
    const second = rankArrangeTiles(boosted, 1, noneBlocked);
    const newTileOf = (cardId: number) =>
      second.entries.find((e) => e.building.cardId === cardId)!.tile;
    expect(second.entries[0].building.cardId).toBe(2);
    expect(newTileOf(2)).toEqual(tileOf(1));
    expect(newTileOf(1)).not.toEqual(tileOf(1));
  });

  it("skips blocked tiles (HQ/landmark reservations + monument moat)", () => {
    const spaced = spacedOrbitOrder(hqGlobalTile(), ORBIT_START_RING, 1);
    const blockedFirst = new Set([tileRefKey(spaced[0])]);
    const { entries } = rankArrangeTiles(
      [b(1, 100)],
      1,
      (key) => blockedFirst.has(key)
    );
    expect(entries[0].tile).not.toEqual({ sector: spaced[0].sector, x: spaced[0].x, y: spaced[0].y });
    expect(entries[0].tile).toEqual({ sector: spaced[1].sector, x: spaced[1].x, y: spaced[1].y });
  });

  it("reports the ring aggregates should resume at", () => {
    const empty = rankArrangeTiles([], 1, noneBlocked);
    expect(empty.entries).toHaveLength(0);
    expect(empty.resumeRing).toBe(ORBIT_START_RING);

    // SOLID BLOCK ROWS (2026-09-30 "no chessboard" ruling): the start
    // ring holds ALL 8r tiles wall-to-wall (fully inside sector 0 for a
    // 9-sector city); the overflow spills to the next ladder ring.
    const rowCapacity = 8 * ORBIT_START_RING;
    const { entries, resumeRing } = rankArrangeTiles(
      Array.from({ length: rowCapacity + 1 }, (_, i) => b(i + 1, 1000 - i)),
      9,
      noneBlocked
    );
    expect(entries).toHaveLength(rowCapacity + 1);
    expect(entries[rowCapacity - 1].ring).toBe(ORBIT_START_RING);
    expect(entries[rowCapacity].ring).toBe(ORBIT_START_RING + ORBIT_RING_STRIDE);
    expect(resumeRing).toBe(ORBIT_START_RING + ORBIT_RING_STRIDE);
  });

  it("is deterministic for a fixed input", () => {
    const input = Array.from({ length: 40 }, (_, i) => b(i + 1, (i * 37) % 991));
    expect(rankArrangeTiles(input, 5, noneBlocked)).toEqual(
      rankArrangeTiles(input, 5, noneBlocked)
    );
  });
});

describe("spacedOrbitOrder (solid block rows, 2026-09-30)", () => {
  const center = hqGlobalTile();

  it("covers EXACTLY the ladder rings — gap rings stay pure street", () => {
    const spaced = spacedOrbitOrder(center, ORBIT_START_RING, 9);
    expect(spaced.length).toBeGreaterThan(0);
    for (const t of spaced) {
      expect((t.ring - ORBIT_START_RING) % ORBIT_RING_STRIDE).toBe(0);
    }
    // No checkerboard: EVERY tile of the start ring is present (the ring
    // lies fully inside sector 0 for a 9-sector city).
    const ring4 = spaced.filter((t) => t.ring === ORBIT_START_RING);
    expect(ring4).toHaveLength(8 * ORBIT_START_RING);
  });

  it("fills each ring wall-to-wall before the next (block-row order)", () => {
    const spaced = spacedOrbitOrder(center, ORBIT_START_RING, 1);
    // Single sector: ring 4 (32 tiles, all inside s0) then ring 6.
    expect(spaced[8 * ORBIT_START_RING - 1].ring).toBe(ORBIT_START_RING);
    expect(spaced[8 * ORBIT_START_RING].ring).toBe(
      ORBIT_START_RING + ORBIT_RING_STRIDE
    );
    // SOLID: consecutive same-ring tiles ARE Chebyshev-adjacent neighbors —
    // the opposite of the old airy rule (this is the anti-chessboard check).
    const g = (t: (typeof spaced)[number]) => {
      const stride = macroStride(GRID_SIZE);
      const macro = { x: Math.floor(t.sectorIndex % 3), y: Math.floor(t.sectorIndex / 3) };
      return { gx: macro.x * stride + t.x, gy: macro.y * stride + t.y };
    };
    const a = g(spaced[0]);
    const b2 = g(spaced[1]);
    expect(Math.max(Math.abs(a.gx - b2.gx), Math.abs(a.gy - b2.gy))).toBe(1);
  });

  it("rankArrangeTiles lays a full sector's worth as solid rows", () => {
    // 40 buildings, single sector: ring 4 fills completely (32), then the
    // first 8 of ring 6 — no parity skips anywhere.
    const { entries } = rankArrangeTiles(
      Array.from({ length: 40 }, (_, i) => b(i + 1, 1000 - i)),
      1,
      () => false
    );
    expect(entries[31].ring).toBe(4);
    expect(entries[32].ring).toBe(6);
    const ring6 = entries.filter((e) => e.ring === 6);
    expect(ring6).toHaveLength(8);
  });

  it("start ring hugs the landmark moat (just enough core plaza)", () => {
    // Farthest monument at Chebyshev 3, moat reaches 4 → the first block
    // row IS ring 4: no empty ring between the moat and the first buildings.
    expect(ORBIT_START_RING).toBe(4);
    const spaced = spacedOrbitOrder(center, ORBIT_START_RING, 1);
    expect(spaced[0].ring).toBe(ORBIT_START_RING);
  });
});

describe("civic lots (2026-09-29 ring-4 diagonals)", () => {
  it("places the four kinds on the ring-4 diagonals, on the road-grid parity", () => {
    const center = hqGlobalTile();
    for (let i = 0; i < 4; i++) {
      const t = civicTileRef(i);
      // s0-local → global for the geometry checks.
      const stride = macroStride(GRID_SIZE);
      const gx = stride + t.x;
      const gy = stride + t.y;
      const dx = gx - center.x;
      const dy = gy - center.y;
      expect(Math.max(Math.abs(dx), Math.abs(dy))).toBe(4); // ring 4
      expect(Math.abs(dx)).toBe(4);
      expect(Math.abs(dy)).toBe(4); // the diagonals
      expect((gx + gy) % 2).toBe((center.x + center.y) % 2); // on-ring diagonal
    }
    // Four DISTINCT lots.
    const keys = new Set(
      Array.from({ length: 4 }, (_, i) => tileRefKey(civicTileRef(i)))
    );
    expect(keys.size).toBe(4);
  });

  it("civic lots clear the monument moat (plaza stays legible)", () => {
    // Monument ring (IsoWorld LANDMARK_RING): (±3,0),(±2,±2),(0,±3); its moat
    // is the 8 neighbors. Assert no civic lot is a monument neighbor.
    const monuments = [
      [3, 0], [2, 2], [0, 3], [-3, 0], [-2, -2], [0, -3],
    ];
    for (const off of CIVIC_RING_OFFSETS) {
      for (const [mx, my] of monuments) {
        const cheb = Math.max(Math.abs(off.dx - mx), Math.abs(off.dy - my));
        expect(cheb).toBeGreaterThan(1);
      }
    }
  });
});
