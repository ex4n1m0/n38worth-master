import { describe, expect, it } from "vitest";
import {
  UNIVERSE_BASE_RING,
  UNIVERSE_CITY_CAP,
  UNIVERSE_RING_STEP,
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
  it("rank 1 sits at the exact center of the universe", () => {
    expect(universeCityAnchor(1)).toEqual({ x: 0, y: 0 });
  });

  it("every rank up to the cap gets a UNIQUE anchor (no collisions)", () => {
    const seen = new Set<string>();
    for (let rank = 1; rank <= UNIVERSE_CITY_CAP; rank++) {
      const a = universeCityAnchor(rank);
      const key = `${a.x},${a.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(UNIVERSE_CITY_CAP);
  });

  it("is deterministic", () => {
    for (const rank of [1, 2, 43, 250, 500]) {
      expect(universeCityAnchor(rank)).toEqual(universeCityAnchor(rank));
    }
  });

  it("keeps the innermost ring clear of the satellite zone", () => {
    for (let rank = 2; rank <= UNIVERSE_CITY_CAP; rank++) {
      const a = universeCityAnchor(rank);
      const cheb = Math.max(Math.abs(a.x), Math.abs(a.y));
      expect(cheb).toBeGreaterThanOrEqual(UNIVERSE_BASE_RING - 1);
    }
  });

  it("neighbouring cities never overlap (slot spacing ≥ ~10 tiles)", () => {
    // Mini cities span ~7 internal tiles at 0.55 scale ≈ 3.9 visual tiles,
    // so ≥ 8 tiles between any two anchors guarantees a visible gap; the
    // walk stride keeps same-edge neighbours exactly RING_STEP apart.
    const anchors = Array.from({ length: 120 }, (_, i) => universeCityAnchor(i + 1));
    for (let i = 1; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        const dx = Math.abs(anchors[i].x - anchors[j].x);
        const dy = Math.abs(anchors[i].y - anchors[j].y);
        // Screen-space distance matters: iso x/y trade off 2:1.
        const screenDist = Math.hypot(
          (anchors[i].x - anchors[j].x) - (anchors[i].y - anchors[j].y),
          (anchors[i].x - anchors[j].x) + (anchors[i].y - anchors[j].y)
        ) / 2;
        expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(8);
        expect(screenDist).toBeGreaterThanOrEqual(8 * 0.9);
      }
    }
  });

  it("ring capacities are dense (inner rings host most cities)", () => {
    expect(universeRingRadius(1)).toBe(UNIVERSE_BASE_RING);
    expect(universeRingCapacity(1)).toBe(
      Math.floor((8 * UNIVERSE_BASE_RING) / UNIVERSE_RING_STEP)
    );
    // The mapped cap fits within a handful of rings (bounded world size).
    let m = 1;
    while (universeCumulativeCapacity(m) < UNIVERSE_CITY_CAP) m++;
    expect(m).toBeLessThanOrEqual(8);
    expect(universeRingRadius(m)).toBeLessThanOrEqual(200);
  });
});

describe("viewer translation (shared constellation)", () => {
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

  it("placement differences between viewers are a pure translation", () => {
    // The map every viewer sees must be the same constellation: for any two
    // viewers A and B, anchor(city, A) − anchor(city, B) is the SAME vector
    // for every city (nobody can observe who is "at the origin").
    const aRank = 5;
    const bRank = 30;
    let dx: number | null = null;
    let dy: number | null = null;
    for (const city of cities) {
      const a = universeCityOffset(city.rank, aRank);
      const b = universeCityOffset(city.rank, bRank);
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
      expect(universeCityOffset(rank, rank)).toEqual({ x: 0, y: 0 });
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

  it("marker radius falls off with rank (rank 1 reads biggest)", () => {
    let prev = Infinity;
    for (const rank of [1, 2, 5, 20, 100, 500]) {
      const r = universeMarkerRadius(rank);
      expect(r).toBeLessThanOrEqual(prev);
      expect(r).toBeGreaterThanOrEqual(3);
      prev = r;
    }
    expect(universeMarkerRadius(1)).toBeGreaterThan(universeMarkerRadius(50));
  });
});
