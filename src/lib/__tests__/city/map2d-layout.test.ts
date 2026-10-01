import { describe, it, expect } from "vitest";
import {
  ringCellsClockwise,
  LANDMARK_SLOTS,
  layoutCity,
  layoutWorld,
  pointAtPerimeterDistance,
  plotHalf,
  canonicalLandmarks,
  landmarkCanonicalIndex,
  landmarkSlotForCanonical,
  type WorldCity,
  type WorldBuilding,
} from "@/lib/city/map2d/layout";
import { GODDESS_USERNAMES } from "@/lib/goddesses";

function b(id: number, tier = 5, fam = 0): WorldBuilding {
  return { id, u: `card_${id}`, f: fam, t: tier, p: null };
}
function city(username: string, count: number, landmarks = 0): WorldCity {
  return {
    username,
    profession: null,
    ownedCount: count,
    hqStage: 1,
    landmarks: Array.from({ length: landmarks }, (_, i) => `goddess_${i}`),
    buildings: Array.from({ length: count }, (_, i) => b(i, Math.max(1, 14 - Math.floor(i / 3)))),
  };
}

describe("ringCellsClockwise", () => {
  it("holds 8r cells per ring, all at chebyshev radius r, all unique", () => {
    for (const r of [1, 2, 3, 7]) {
      const cells = ringCellsClockwise(r);
      expect(cells.length).toBe(8 * r);
      expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(8 * r);
      for (const c of cells) expect(Math.max(Math.abs(c.x), Math.abs(c.y))).toBe(r);
    }
  });

  it("walks clockwise from 12 o'clock (top-left → top-right first)", () => {
    expect(ringCellsClockwise(1).slice(0, 3)).toEqual([
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
    ]);
    // after the top row comes the right side going DOWN
    const r1 = ringCellsClockwise(1);
    expect(r1[3]).toEqual({ x: 1, y: 0 });
    expect(r1[4]).toEqual({ x: 1, y: 1 });
    // then the bottom row going LEFT
    expect(r1[5]).toEqual({ x: 0, y: 1 });
    // and the left side going UP, closing at the top-left
    expect(r1[7]).toEqual({ x: -1, y: 0 });
  });
});

describe("layoutCity", () => {
  it("keeps the HQ 3×3 core and landmark hexagon slots free", () => {
    const L = layoutCity(city("alpha", 120, 6));
    const occupied = new Set(L.cells.map((c) => `${c.x},${c.y}`));
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) expect(occupied.has(`${dx},${dy}`)).toBe(false);
    for (const s of LANDMARK_SLOTS) expect(occupied.has(`${s.x},${s.y}`)).toBe(false);
    expect(L.landmarkSlots.length).toBe(6);
  });

  it("places every building on a unique cell (no ring runaway — the mockup bug)", () => {
    const L = layoutCity(city("beta", 420, 4));
    expect(L.cells.length).toBe(420);
    expect(new Set(L.cells.map((c) => `${c.x},${c.y}`)).size).toBe(420);
    // Dense fill: 420 buildings must fit within ~11 rings, NOT 420 rings.
    expect(L.radius).toBeLessThanOrEqual(13);
  });

  it("fills rings innermost-first in the GIVEN order (value desc = clockwise)", () => {
    const L = layoutCity(city("gamma", 30, 0));
    // First 24 buildings fill ring 3; the 25th starts ring 4.
    const ringOf = (c: { x: number; y: number }) => Math.max(Math.abs(c.x), Math.abs(c.y));
    expect(L.cells.slice(0, 24).every((c) => ringOf(c) === 3)).toBe(true);
    expect(ringOf(L.cells[24])).toBe(4);
    // First cell of ring 3 is its clockwise start (top-left corner).
    expect(L.cells[0]).toMatchObject({ x: -3, y: -3 });
  });

  it("handles zero-building cities (HQ + landmarks only)", () => {
    const L = layoutCity(city("empty", 0, 2));
    expect(L.cells.length).toBe(0);
    expect(L.landmarkSlots.length).toBe(2);
  });
});

describe("landmark canonicalization (review F1)", () => {
  it("canonicalLandmarks emits GODDESS_USERNAMES order regardless of input order", () => {
    const shuffled = [...GODDESS_USERNAMES].reverse();
    expect(canonicalLandmarks(shuffled)).toEqual(GODDESS_USERNAMES);
    expect(canonicalLandmarks([GODDESS_USERNAMES[3], GODDESS_USERNAMES[0]])).toEqual([
      GODDESS_USERNAMES[0],
      GODDESS_USERNAMES[3],
    ]);
    expect(canonicalLandmarks(["NotAGoddess"])).toEqual([]);
  });

  it("slot ↔ canonical index mapping round-trips for scattered owned sets", () => {
    // Owner holds goddesses 4 and 1 (scattered, not a prefix).
    const owned = [GODDESS_USERNAMES[4], GODDESS_USERNAMES[1]];
    const cityObj: WorldCity = {
      ...city("holder", 10, 0),
      landmarks: canonicalLandmarks(owned),
    };
    const layout = layoutCity(cityObj);
    expect(layout.landmarkSlots.length).toBe(2);
    // slot 0 holds the first canonical owned goddess (index 1), slot 1 → 4.
    expect(landmarkCanonicalIndex(cityObj, 0)).toBe(1);
    expect(landmarkCanonicalIndex(cityObj, 1)).toBe(4);
    for (const canonical of [1, 4]) {
      const slot = landmarkSlotForCanonical(layout, cityObj, canonical);
      expect(slot).not.toBeNull();
      expect(landmarkCanonicalIndex(cityObj, slot!.i)).toBe(canonical);
    }
    expect(landmarkSlotForCanonical(layout, cityObj, 0)).toBeNull();
  });
});

describe("pointAtPerimeterDistance", () => {
  it("starts at top-center and walks the corners clockwise", () => {
    const h = 10;
    expect(pointAtPerimeterDistance(0, h)).toEqual({ x: 0, y: -h });
    expect(pointAtPerimeterDistance(h, h)).toEqual({ x: h, y: -h }); // top-right corner
    expect(pointAtPerimeterDistance(2 * h, h)).toEqual({ x: h, y: 0 }); // right-center
    expect(pointAtPerimeterDistance(3 * h, h)).toEqual({ x: h, y: h }); // bottom-right
    expect(pointAtPerimeterDistance(5 * h, h)).toEqual({ x: -h, y: h }); // bottom-left
    expect(pointAtPerimeterDistance(7 * h, h)).toEqual({ x: -h, y: -h }); // top-left
    expect(pointAtPerimeterDistance(8 * h, h)).toEqual({ x: 0, y: -h }); // wraps
  });
});

describe("layoutWorld", () => {
  it("puts the biggest city at the center", () => {
    const plots = layoutWorld([city("small", 5), city("BIG", 500), city("mid", 80)]);
    expect(plots[0].username).toBe("BIG");
    expect(plots[0].cx).toBe(0);
    expect(plots[0].cy).toBe(0);
  });

  it("is deterministic, including count ties (username asc)", () => {
    const world = [city("zeta", 10), city("alpha", 10), city("beta", 20)];
    const a = layoutWorld(world);
    const b = layoutWorld([...world].reverse());
    expect(a.map((p) => p.username)).toEqual(b.map((p) => p.username));
    expect(a.map((p) => [p.username, p.cx, p.cy])).toEqual([
      ["beta", 0, 0],
      ...a.slice(1).map((p) => [p.username, p.cx, p.cy]),
    ]);
    // tie between zeta/alpha at 10 → alpha first (ring order after beta)
    expect(a[1].username).toBe("alpha");
    expect(a[2].username).toBe("zeta");
  });

  it("never overlaps plots (axis-aligned squares)", () => {
    for (const sizes of [
      [500, 214, 186, 96, 61, 38, 21, 14, 9],
      [40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
      [1000, 3, 3],
      [12],
    ]) {
      const plots = layoutWorld(sizes.map((n, i) => city(`c${i}_${n}`, n)));
      for (let i = 0; i < plots.length; i++) {
        for (let j = i + 1; j < plots.length; j++) {
          const a = plots[i];
          const b = plots[j];
          const sepX = Math.abs(a.cx - b.cx);
          const sepY = Math.abs(a.cy - b.cy);
          const ok = sepX >= a.half + b.half - 1e-9 || sepY >= a.half + b.half - 1e-9;
          expect(ok).toBe(true);
        }
      }
    }
  });

  it("plot half-size grows with building count", () => {
    const plots = layoutWorld([city("a", 5), city("b", 400)]);
    const small = plots.find((p) => p.username === "a")!;
    const big = plots.find((p) => p.username === "b")!;
    expect(big.half).toBeGreaterThan(small.half);
    expect(plotHalf(big.layout)).toBe(big.layout.radius + 1.6);
  });
});
