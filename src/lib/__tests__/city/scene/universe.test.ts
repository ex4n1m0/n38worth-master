import { describe, expect, it } from "vitest";
import { SECTOR_MACRO } from "@/lib/city/scene/iso";
import { satelliteRingRadii } from "@/lib/city/satellites";
import {
  UNIVERSE_CITY_CAP,
  UNIVERSE_CLEARANCE_TILES,
  UNIVERSE_RING_STEP,
  universeBaseRing,
  universeCityAnchor,
  universeCityOffset,
  universeCumulativeCapacity,
  universeEpochOf,
  universeMarkerRadius,
  universeRingCapacity,
  universeRingRadius,
  universeViewerRank,
} from "@/lib/city/universe";

describe("universe ring math", () => {
  const bootBase = universeBaseRing(1);
  const fullBase = universeBaseRing(SECTOR_MACRO.length);

  it("rank 1 sits at the exact center of the universe", () => {
    expect(universeCityAnchor(1, bootBase)).toEqual({ x: 0, y: 0 });
  });

  it("every rank up to the cap gets a UNIQUE anchor (no collisions)", () => {
    const seen = new Set<string>();
    for (let rank = 1; rank <= UNIVERSE_CITY_CAP; rank++) {
      const a = universeCityAnchor(rank, bootBase);
      const key = `${a.x},${a.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(UNIVERSE_CITY_CAP);
  });

  it("is deterministic", () => {
    for (const rank of [1, 2, 43, 250, 500]) {
      expect(universeCityAnchor(rank, bootBase)).toEqual(
        universeCityAnchor(rank, bootBase)
      );
    }
  });

  it("dynamic distance: the base ring follows the viewer's city size", () => {
    // Boot-only viewers see the universe CLOSE; it recedes as sectors open.
    const radii1 = satelliteRingRadii(1);
    expect(bootBase).toBeGreaterThanOrEqual(
      Math.ceil(Math.max(radii1.rx, radii1.ry) + UNIVERSE_CLEARANCE_TILES)
    );
    expect(bootBase).toBeLessThan(40); // the old fixed value was 72
    let prev = bootBase;
    for (let sectors = 2; sectors <= SECTOR_MACRO.length; sectors++) {
      const base = universeBaseRing(sectors);
      expect(base).toBeGreaterThanOrEqual(prev);
      prev = base;
    }
    expect(fullBase).toBeGreaterThan(bootBase);
    // Snapped to a step multiple so ring corners land on slots.
    expect(bootBase % UNIVERSE_RING_STEP).toBe(0);
    expect(fullBase % UNIVERSE_RING_STEP).toBe(0);
  });

  it("keeps the innermost ring clear of the satellite zone", () => {
    for (let rank = 2; rank <= UNIVERSE_CITY_CAP; rank++) {
      const a = universeCityAnchor(rank, bootBase);
      const cheb = Math.max(Math.abs(a.x), Math.abs(a.y));
      expect(cheb).toBeGreaterThanOrEqual(bootBase - 1);
    }
  });

  it("neighbouring cities never overlap (packing as tight as the minis allow)", () => {
    // Mini cities span ~6 internal tiles × 0.55 ≈ 3.5 visual tiles each, so
    // anchors ≥ 7 Chebyshev tiles apart never crash; the step packs them
    // one stride (8) apart — "as close as possible" (2026-09-29 ruling).
    for (const base of [bootBase, fullBase]) {
      const anchors = Array.from({ length: 150 }, (_, i) =>
        universeCityAnchor(i + 1, base)
      );
      for (let i = 1; i < anchors.length; i++) {
        for (let j = i + 1; j < anchors.length; j++) {
          const dx = Math.abs(anchors[i].x - anchors[j].x);
          const dy = Math.abs(anchors[i].y - anchors[j].y);
          expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(7);
        }
      }
    }
  });

  it("ring capacities are dense (inner rings host most cities)", () => {
    expect(universeRingRadius(1, bootBase)).toBe(bootBase);
    expect(universeRingCapacity(1, bootBase)).toBe(
      Math.floor((8 * bootBase) / UNIVERSE_RING_STEP)
    );
    // The mapped cap fits within a bounded number of rings (world size).
    let m = 1;
    while (universeCumulativeCapacity(m, fullBase) < UNIVERSE_CITY_CAP) m++;
    expect(m).toBeLessThanOrEqual(12);
    expect(universeRingRadius(m, fullBase)).toBeLessThanOrEqual(200);
  });
});

describe("viewer translation (per-viewer scaled constellation)", () => {
  const base = universeBaseRing(3);
  const cities = Array.from({ length: 60 }, (_, i) => ({
    rank: i + 1,
    username: `city_${i + 1}`,
    profession: null,
  }));
  const payload = { cities };

  it("finds the viewer's exact rank; unmapped viewers sit just past the cap", () => {
    expect(universeViewerRank(payload, "city_7")).toBe(7);
    expect(universeViewerRank(payload, "city_60")).toBe(60);
    expect(universeViewerRank(payload, "stranger")).toBe(61);
  });

  it("placement differences between same-size viewers are a pure translation", () => {
    // Same base → the same constellation, only translated (nobody can
    // observe who is "at the origin"). Different bases scale the layout —
    // the 2026-09-29 dynamic-distance ruling deliberately trades the old
    // cross-size congruence for close early-game packing.
    const aRank = 5;
    const bRank = 30;
    let dx: number | null = null;
    let dy: number | null = null;
    for (const city of cities) {
      const a = universeCityOffset(city.rank, aRank, base);
      const b = universeCityOffset(city.rank, bRank, base);
      if (dx === null) {
        dx = a.x - b.x;
        dy = a.y - b.y;
      } else {
        expect(a.x - b.x).toBe(dx);
        expect(a.y - b.y).toBe(dy);
      }
    }
    expect(dx).not.toBeNull();
  });

  it("the viewer's own offset is zero (their city is their origin)", () => {
    for (const rank of [1, 17, 500]) {
      expect(universeCityOffset(rank, rank, base)).toEqual({ x: 0, y: 0 });
    }
  });
});

describe("epoch + marker sizing", () => {
  it("epoch is order-sensitive and stable for identical orderings", () => {
    const a = [{ username: "x" }, { username: "y" }, { username: "z" }];
    const b = [{ username: "x" }, { username: "y" }, { username: "z" }];
    const c = [{ username: "y" }, { username: "x" }, { username: "z" }];
    expect(universeEpochOf(a)).toBe(universeEpochOf(b));
    expect(universeEpochOf(a)).not.toBe(universeEpochOf(c));
  });

  it("marker radius falls off with rank and clamps to the cap", () => {
    expect(universeMarkerRadius(1)).toBeGreaterThan(universeMarkerRadius(100));
    expect(universeMarkerRadius(1)).toBeGreaterThan(universeMarkerRadius(2));
    expect(universeMarkerRadius(99999)).toBe(universeMarkerRadius(UNIVERSE_CITY_CAP));
  });
});
