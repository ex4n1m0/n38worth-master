import { describe, expect, it } from "vitest";
import { SECTOR_MACRO } from "@/lib/city/scene/iso";
import { satelliteRingRadii } from "@/lib/city/satellites";
import {
  UNIVERSE_CITY_CAP,
  UNIVERSE_CLEARANCE_TILES,
  UNIVERSE_FAMILIES,
  UNIVERSE_RING_STEP,
  UNIVERSE_SKYLINE_LIMIT,
  WORLD_BASE_RING,
  attachUniverseSkylines,
  universeCityAnchor,
  universeCityOffset,
  universeCumulativeCapacity,
  universeEpochOf,
  universeFamilyIndex,
  universeFamilyOf,
  universeMarkerRadius,
  universeRingCapacity,
  universeRingForRank,
  universeRingRadius,
  universeViewerRank,
} from "@/lib/city/universe";

describe("universe ring math", () => {
  const base = WORLD_BASE_RING;

  it("rank 1 sits at the exact center of the universe", () => {
    expect(universeCityAnchor(1, base)).toEqual({ x: 0, y: 0 });
  });

  it("every rank up to the cap gets a UNIQUE anchor (no collisions)", () => {
    const seen = new Set<string>();
    for (let rank = 1; rank <= UNIVERSE_CITY_CAP; rank++) {
      const a = universeCityAnchor(rank, base);
      const key = `${a.x},${a.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(UNIVERSE_CITY_CAP);
  });

  it("is deterministic", () => {
    for (const rank of [1, 2, 43, 250, 500]) {
      expect(universeCityAnchor(rank, base)).toEqual(
        universeCityAnchor(rank, base)
      );
    }
  });

  it("FIXED world base ring (2026-09-30 shared-universe ruling)", () => {
    // The base ring is sized ONCE from the largest possible city's satellite
    // zone and shared by every viewer — no per-viewer scaling anymore.
    const full = satelliteRingRadii(SECTOR_MACRO.length);
    expect(base).toBeGreaterThanOrEqual(
      Math.ceil(Math.max(full.rx, full.ry) + UNIVERSE_CLEARANCE_TILES)
    );
    expect(base % UNIVERSE_RING_STEP).toBe(0); // corners land on slots
    // Smaller viewers have strictly MORE clearance (a universe city can
    // never poke through any home grid or satellite zone).
    for (const sectors of [1, 2, 3, 5, 9]) {
      const radii = satelliteRingRadii(sectors);
      expect(base).toBeGreaterThan(Math.max(radii.rx, radii.ry));
    }
  });

  it("keeps the innermost ring clear of the satellite zone", () => {
    for (let rank = 2; rank <= UNIVERSE_CITY_CAP; rank++) {
      const a = universeCityAnchor(rank, base);
      const cheb = Math.max(Math.abs(a.x), Math.abs(a.y));
      expect(cheb).toBeGreaterThanOrEqual(base - 1);
    }
  });

  it("neighbouring cities never overlap (packing as tight as the minis allow)", () => {
    // Mini cities span ~7 internal tiles × 0.55 ≈ 3.9 visual tiles each,
    // so anchors ≥ 7 Chebyshev tiles apart never crash; the step packs them
    // one stride (8) apart — "as close as possible" (2026-09-29 ruling).
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
  });

  it("ring capacities are dense; the cap fits a bounded world", () => {
    expect(universeRingRadius(1, base)).toBe(base);
    expect(universeRingCapacity(1, base)).toBe(
      Math.floor((8 * base) / UNIVERSE_RING_STEP)
    );
    let m = 1;
    while (universeCumulativeCapacity(m, base) < UNIVERSE_CITY_CAP) m++;
    expect(m).toBeLessThanOrEqual(12);
    expect(universeRingRadius(m, base)).toBeLessThanOrEqual(200);
    // The whole mapped world fits inside the renderer's ground reach.
    expect(universeRingRadius(m, base) + 8).toBeLessThanOrEqual(150);
  });

  it("universeRingForRank chunks the world (rank 1 = ring 0 center)", () => {
    expect(universeRingForRank(1)).toBe(0);
    expect(universeRingForRank(2)).toBe(1);
    let maxRing = 0;
    for (let rank = 1; rank <= UNIVERSE_CITY_CAP; rank++) {
      maxRing = Math.max(maxRing, universeRingForRank(rank));
    }
    expect(maxRing).toBeLessThanOrEqual(12);
  });
});

describe("ONE shared universe (2026-09-30 congruence ruling)", () => {
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

  it("ANY two viewers see the same constellation, purely translated", () => {
    // The base ring no longer depends on the viewer, so cross-SIZE viewers
    // are congruent too — the delta between their views is one constant
    // translation for every city (restores the 2026-09-28 nicety the
    // 2026-09-29 dynamic-distance ruling had suspended).
    const aRank = 5;
    const bRank = 30;
    let dx: number | null = null;
    let dy: number | null = null;
    for (const city of cities) {
      const a = universeCityOffset(city.rank, aRank, WORLD_BASE_RING);
      const b = universeCityOffset(city.rank, bRank, WORLD_BASE_RING);
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
      expect(universeCityOffset(rank, rank, WORLD_BASE_RING)).toEqual({
        x: 0,
        y: 0,
      });
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

describe("skyline payload (U2 — families + assembly)", () => {
  it("family indices round-trip; unknown professions map to unassigned", () => {
    for (const fam of UNIVERSE_FAMILIES) {
      expect(universeFamilyOf(universeFamilyIndex(fam))).toBe(fam);
    }
    expect(universeFamilyOf(universeFamilyIndex("NotAProfession"))).toBe(
      UNIVERSE_FAMILIES[UNIVERSE_FAMILIES.length - 1]
    );
    expect(universeFamilyOf(99)).toBe(UNIVERSE_FAMILIES[UNIVERSE_FAMILIES.length - 1]);
  });

  it("attaches skylines by owner, value-ordered, capped, id-stripped", () => {
    const cities = [
      { id: 101, rank: 1, username: "alpha", profession: "Zero-Day" },
      { id: 202, rank: 2, username: "beta", profession: null },
      { id: 303, rank: 3, username: "gamma", profession: "Bot Herder" },
    ];
    const rows = [
      // alpha: 2 buildings, 5 visible total.
      { ownerId: 101, profession: "Zero-Day", playerValue: 800, valueFloor: 100, visibleCount: 5 },
      { ownerId: 101, profession: "Server Marshal", playerValue: 300, valueFloor: 100, visibleCount: 5 },
      // gamma: 1 building, 1 visible.
      { ownerId: 303, profession: "Bot Herder", playerValue: 50, valueFloor: 10, visibleCount: 1 },
      // Owner not in the city list — ignored.
      { ownerId: 999, profession: "Zero-Day", playerValue: 1, valueFloor: 1, visibleCount: 1 },
    ];
    const out = attachUniverseSkylines(cities, rows);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      rank: 1,
      username: "alpha",
      profession: "Zero-Day",
      count: 5,
      skyline: [
        [4, 1], // 800/100 → ratio 8 → tier 4, Zero-Day family
        [2, 4], // 300/100 → ratio 3 → tier 2, Server Marshal
      ],
    });
    // beta: no rows → count 0, no skyline key (relay-only mini).
    expect(out[1]).toEqual({ rank: 2, username: "beta", profession: null, count: 0 });
    expect(out[2].count).toBe(1);
    expect(out[2].skyline).toEqual([[3, 5]]); // 50/10 → tier 3, Bot Herder
    // The internal DB id never travels on the wire payload.
    for (const c of out) expect("id" in c).toBe(false);
  });

  it("clamps skylines to UNIVERSE_SKYLINE_LIMIT even if the SQL filter drifted", () => {
    const cities = [{ id: 1, rank: 1, username: "a", profession: null }];
    const rows = Array.from({ length: 60 }, (_, i) => ({
      ownerId: 1,
      profession: "Zero-Day",
      playerValue: 1000 - i,
      valueFloor: 100,
      visibleCount: 60,
    }));
    const out = attachUniverseSkylines(cities, rows);
    expect(out[0].skyline).toHaveLength(UNIVERSE_SKYLINE_LIMIT);
    expect(out[0].count).toBe(60);
  });
});
