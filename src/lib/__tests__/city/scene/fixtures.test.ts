import { describe, expect, it } from "vitest";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { PROFESSIONS } from "@/lib/professions";
import { DETAILED_LIMIT, buildingTier, projectCity } from "@/lib/city/projection";
import { UNASSIGNED_FAMILY, type BuildingTier } from "@/lib/city/types";
import {
  FIXTURE_NOW,
  makeCityFixture,
  mulberry32,
} from "@/lib/city/fixtures";

const SIZES = [20, 100, 500, 1000, 5000] as const;

describe("fixture determinism", () => {
  it("reproduces the exact same city for the same (n, seed)", () => {
    for (const n of SIZES) {
      const a = makeCityFixture(n, 1234);
      const b = makeCityFixture(n, 1234);
      expect(a).toEqual(b);
    }
  });

  it("varies with the seed", () => {
    const a = makeCityFixture(100, 1);
    const b = makeCityFixture(100, 2);
    expect(a.ownedCards).not.toEqual(b.ownedCards);
  });

  it("mulberry32 is a stable seeded PRNG", () => {
    const r1 = mulberry32(7);
    const r2 = mulberry32(7);
    const seq1 = Array.from({ length: 8 }, () => r1());
    const seq2 = Array.from({ length: 8 }, () => r2());
    expect(seq1).toEqual(seq2);
    expect(new Set(seq1).size).toBeGreaterThan(1);
    for (const v of seq1) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("fixture shape (contract match)", () => {
  it("matches CityOwnerProfile / CityOwnedCard / CityAggregates exactly", () => {
    const { profile, ownedCards, aggregates } = makeCityFixture(100, 5);
    expect(profile).toMatchObject({
      username: "fixture-5",
      missionLevel: expect.any(Number),
      portfolioValue: expect.any(Number),
      ownedCount: 100,
    });
    expect(ownedCards).toHaveLength(100);
    for (const c of ownedCards) {
      expect(typeof c.cardId).toBe("number");
      expect(typeof c.username).toBe("string");
      expect(c.profession === null || typeof c.profession === "string").toBe(true);
      expect(typeof c.playerValue).toBe("number");
      expect(typeof c.valueFloor).toBe("number");
      expect(typeof c.isNpc).toBe("number");
      expect(c.blockSellUntil === null || typeof c.blockSellUntil === "string").toBe(true);
      expect(c.permBlockUntil === null || typeof c.permBlockUntil === "string").toBe(true);
    }
    expect(Object.keys(aggregates)).toEqual(["totalBuildings", "familyTotals"]);
  });

  it("cycles real professions and includes the unassigned family", () => {
    const { ownedCards, aggregates } = makeCityFixture(1000, 11);
    const names = new Set(ownedCards.map((c) => c.profession));
    for (const p of PROFESSIONS) expect(names.has(p.name)).toBe(true);
    expect(names.has(null)).toBe(true);
    expect(aggregates.familyTotals[UNASSIGNED_FAMILY]).toBeGreaterThan(0);
    const expectedTotals: Record<string, number> = {};
    for (const c of ownedCards) {
      if (GODDESS_USERNAMES.includes(c.username)) continue;
      const key = c.profession ?? UNASSIGNED_FAMILY;
      expectedTotals[key] = (expectedTotals[key] ?? 0) + 1;
    }
    expect(aggregates.familyTotals).toEqual(expectedTotals);
    expect(aggregates.totalBuildings).toBe(1000 - countGoddesses(ownedCards));
  });

  it("includes 0–6 goddesses from the real roster only", () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const { ownedCards } = makeCityFixture(50, seed);
      const goddesses = ownedCards.filter((c) => GODDESS_USERNAMES.includes(c.username));
      expect(goddesses.length).toBeGreaterThanOrEqual(0);
      expect(goddesses.length).toBeLessThanOrEqual(6);
      expect(new Set(goddesses.map((g) => g.username)).size).toBe(goddesses.length);
    }
  });

  it("distributes ~15% future protection plus ~5% expired", () => {
    const { ownedCards } = makeCityFixture(5000, 99);
    const now = FIXTURE_NOW.getTime();
    let future = 0;
    let expired = 0;
    for (const c of ownedCards) {
      const ts = c.permBlockUntil ?? c.blockSellUntil;
      if (!ts) continue;
      if (new Date(ts).getTime() > now) future += 1;
      else expired += 1;
    }
    expect(future / ownedCards.length).toBeGreaterThanOrEqual(0.1);
    expect(future / ownedCards.length).toBeLessThanOrEqual(0.2);
    expect(expired).toBeGreaterThan(0);
  });

  it("keeps values within the 1×–16384× fixture band (tiers 1–14 only)", () => {
    const { ownedCards } = makeCityFixture(1000, 42);
    for (const c of ownedCards) {
      const ratio = c.playerValue / Math.max(1, c.valueFloor);
      expect(ratio).toBeGreaterThanOrEqual(1);
      expect(ratio).toBeLessThanOrEqual(16384);
      expect(buildingTier(c.playerValue, c.valueFloor)).toBeLessThanOrEqual(14);
    }
  });
});

describe("tier coverage", () => {
  it("populates ALL 14 tiers for every QA size ≥ 100", () => {
    for (const n of SIZES.filter((s) => s >= 100)) {
      const { ownedCards } = makeCityFixture(n, 77);
      const tiers = new Set<BuildingTier>();
      for (const c of ownedCards) {
        if (GODDESS_USERNAMES.includes(c.username)) continue;
        tiers.add(buildingTier(c.playerValue, c.valueFloor));
      }
      expect([...tiers].sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
      ]);
    }
  });
});

describe("projection integration (aggregates at scale)", () => {
  it("bounds detailed buildings and aggregates the rest at 5k", () => {
    const { profile, ownedCards, aggregates } = makeCityFixture(5000, 2026);
    const projection = projectCity(profile, ownedCards, FIXTURE_NOW, aggregates);
    expect(projection.detailedCount).toBe(DETAILED_LIMIT);
    expect(projection.aggregatedCount).toBe(
      aggregates.totalBuildings - DETAILED_LIMIT
    );
    // Families carry the SQL-side totals with bounded building arrays.
    for (const family of projection.families) {
      expect(family.buildings.length).toBeLessThanOrEqual(DETAILED_LIMIT);
      expect(family.aggregated).toBe(family.total - family.buildings.length);
    }
    const sumTotals = projection.families.reduce((acc, f) => acc + f.total, 0);
    expect(sumTotals).toBe(aggregates.totalBuildings);
  });

  it("projects goddesses as landmarks, never as buildings", () => {
    const { profile, ownedCards, aggregates } = makeCityFixture(500, 8);
    const projection = projectCity(profile, ownedCards, FIXTURE_NOW, aggregates);
    const goddesses = ownedCards.filter((c) => GODDESS_USERNAMES.includes(c.username));
    expect(projection.landmarks).toHaveLength(6);
    expect(projection.landmarks.filter((l) => l.owned)).toHaveLength(goddesses.length);
    for (const family of projection.families) {
      for (const b of family.buildings) {
        expect(GODDESS_USERNAMES).not.toContain(b.username);
      }
    }
  });

  it("runs the 5k projection well under the 25ms compute budget", () => {
    const { profile, ownedCards, aggregates } = makeCityFixture(5000, 3);
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) {
      projectCity(profile, ownedCards, FIXTURE_NOW, aggregates);
    }
    const perRun = (performance.now() - t0) / 5;
    expect(perRun).toBeLessThan(25);
  });
});

function countGoddesses(cards: { username: string }[]): number {
  return cards.filter((c) => GODDESS_USERNAMES.includes(c.username)).length;
}
