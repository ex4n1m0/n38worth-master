import { describe, expect, it } from "vitest";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import { tileRefKey, rankArrangeTiles } from "@/lib/city/placement";
import {
  ORBIT_START_RING,
  hqGlobalTile,
  orbitOrder,
  ringTiles,
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
    const orbit = orbitOrder(hqGlobalTile(), ORBIT_START_RING, 1);
    const blockedFirst = new Set([tileRefKey(orbit[0])]);
    const { entries } = rankArrangeTiles(
      [b(1, 100)],
      1,
      (key) => blockedFirst.has(key)
    );
    expect(entries[0].tile).not.toEqual({ sector: orbit[0].sector, x: orbit[0].x, y: orbit[0].y });
    expect(entries[0].tile).toEqual({ sector: orbit[1].sector, x: orbit[1].x, y: orbit[1].y });
  });

  it("reports the ring aggregates should resume at", () => {
    const empty = rankArrangeTiles([], 1, noneBlocked);
    expect(empty.entries).toHaveLength(0);
    expect(empty.resumeRing).toBe(ORBIT_START_RING);

    // Ring 7 holds 56 tiles → 57 buildings spill into ring 8.
    const { entries, resumeRing } = rankArrangeTiles(
      Array.from({ length: 57 }, (_, i) => b(i + 1, 1000 - i)),
      9,
      noneBlocked
    );
    expect(entries).toHaveLength(57);
    expect(entries[55].ring).toBe(ORBIT_START_RING);
    expect(entries[56].ring).toBe(ORBIT_START_RING + 1);
    expect(resumeRing).toBe(ORBIT_START_RING + 1);
  });

  it("is deterministic for a fixed input", () => {
    const input = Array.from({ length: 40 }, (_, i) => b(i + 1, (i * 37) % 991));
    expect(rankArrangeTiles(input, 5, noneBlocked)).toEqual(
      rankArrangeTiles(input, 5, noneBlocked)
    );
  });
});
