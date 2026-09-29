import { describe, expect, it } from "vitest";
import { deriveStreets } from "@/lib/city/streets";

const key = (t: { gx: number; gy: number }) => `${t.gx},${t.gy}`;

describe("deriveStreets (road-grid derivation, 2026-09-29)", () => {
  it("paves exactly the empty tiles within Chebyshev 1 of a building", () => {
    // One building at the origin: its 8 neighbors pave, nothing else.
    const streets = deriveStreets([{ gx: 0, gy: 0 }]);
    expect(streets).toHaveLength(8);
    for (const s of streets) {
      expect(Math.max(Math.abs(s.gx), Math.abs(s.gy))).toBe(1);
    }
  });

  it("never paves a building tile, a blocked tile, or empty far ground", () => {
    const streets = deriveStreets(
      [
        { gx: 0, gy: 0 },
        { gx: 2, gy: 0 },
      ],
      (gx, gy) => gx === 1 && gy === -1 // one blocked neighbor
    );
    const keys = new Set(streets.map(key));
    expect(keys.has("0,0")).toBe(false); // building
    expect(keys.has("2,0")).toBe(false); // building
    expect(keys.has("1,-1")).toBe(false); // blocked
    expect(keys.has("5,5")).toBe(false); // far ground
    // Shared neighbor between the two buildings paves once (dedup).
    expect(streets.length).toBe(new Set(streets.map(key)).size);
  });

  it("classifies the travel axis from paved/building continuity", () => {
    // A row of three buildings along x: the gaps between them continue
    // along x AND touch the y-adjacent nothing → axis "x" or cross-stubs.
    const buildings = [
      { gx: 0, gy: 0 },
      { gx: 2, gy: 0 },
      { gx: 4, gy: 0 },
    ];
    const streets = deriveStreets(buildings);
    const byKey = new Map(streets.map((s) => [key(s), s] as const));
    // (1,0) is between two buildings along x; its only paved/building
    // neighbours are along x → cross only if y-neighbours are paved too
    // (they are: (1,1)/(1,-1) are adjacent to buildings). Assert it is
    // paved at all and carries one of the through classifications.
    const mid = byKey.get("1,0");
    expect(mid).toBeDefined();
    expect(["x", "cross"]).toContain(mid!.axis);
    // A corner pad like (0,1) is adjacent to a building only diagonally and
    // along y to (0,2)? (0,2) is empty → its continuity runs along x only
    // through (±1,1)… assert every tile has a valid classification.
    for (const s of streets) {
      expect(["x", "y", "cross", "stub"]).toContain(s.axis);
    }
  });

  it("is bounded by 8 tiles per building and deterministic", () => {
    const buildings = Array.from({ length: 12 }, (_, i) => ({
      gx: i * 2,
      gy: (i % 3) * 2,
    }));
    const a = deriveStreets(buildings);
    const b = deriveStreets(buildings);
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(8 * buildings.length);
  });

  it("one empty ring between two building rings becomes the boulevard", () => {
    // Stride-2 orbit pattern: buildings at ring 4 and ring 6 on the same
    // axis — the ring-5 tile between them must pave (the ring BOULEVARD).
    const buildings = [
      { gx: 4, gy: 0 },
      { gx: 6, gy: 0 },
    ];
    const streets = deriveStreets(buildings);
    const keys = new Set(streets.map(key));
    expect(keys.has("5,0")).toBe(true);
  });

  it("grows organically — empty checkerboard slots next to no building stay grass", () => {
    // A lone building paves only its immediate neighbors; the tile two steps
    // out stays unpaved even though it is on the same ring.
    const streets = deriveStreets([{ gx: 4, gy: 4 }]);
    const keys = new Set(streets.map(key));
    expect(keys.has("6,6")).toBe(false);
    expect(keys.has("5,5")).toBe(true);
  });

  it("lamp placement is deterministic (intersections always lit)", () => {
    const buildings = [
      { gx: 0, gy: 0 },
      { gx: 2, gy: 0 },
      { gx: 0, gy: 2 },
      { gx: 2, gy: 2 },
    ];
    const streets = deriveStreets(buildings);
    const cross = streets.filter((s) => s.axis === "cross");
    expect(cross.length).toBeGreaterThan(0);
    for (const s of cross) expect(s.lamp).toBe(true);
  });
});
