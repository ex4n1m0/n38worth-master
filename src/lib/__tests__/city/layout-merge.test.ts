import { describe, it, expect } from "vitest";
import { projectCity } from "@/lib/city/projection";
import { mergePlacements, toQueueBuilding } from "@/lib/city/layout-merge";
import { UNASSIGNED_FAMILY, type CityOwnedCard, type CityPlacement } from "@/lib/city/types";

const NOW = new Date("2026-09-26T12:00:00.000Z");
const FUTURE = "2026-09-27T12:00:00.000Z";

const profile = {
  username: "testuser",
  missionLevel: 3,
  portfolioValue: 12_345,
  ownedCount: 5,
};

function card(overrides: Partial<CityOwnedCard>): CityOwnedCard {
  return {
    cardId: 1,
    username: "npc_1",
    profession: "Overclocker",
    playerValue: 100,
    valueFloor: 100,
    isNpc: 1,
    blockSellUntil: null,
    permBlockUntil: null,
    ...overrides,
  };
}

function place(overrides: Partial<CityPlacement>): CityPlacement {
  return { sector: "s0", x: 1, y: 1, rotation: 0, variant: 0, ...overrides };
}

function buildingsOf(city: ReturnType<typeof projectCity>) {
  return city.families.flatMap((f) => f.buildings);
}

describe("mergePlacements", () => {
  it("attaches placements to matching detailed buildings only", () => {
    const cards = [
      card({ cardId: 1, playerValue: 300 }),
      card({ cardId: 2, profession: null, playerValue: 200 }),
    ];
    const city = projectCity(profile, cards, NOW);
    const placements = new Map<number, CityPlacement>([
      [1, place({ sector: "s1", x: 4, y: 5, rotation: 2, variant: 3 })],
      [999, place({})], // no matching detailed building — ignored
    ]);

    const merged = mergePlacements(city, placements, 7);

    const byId = new Map(buildingsOf(merged).map((b) => [b.cardId, b]));
    expect(byId.get(1)?.placement).toEqual({
      sector: "s1",
      x: 4,
      y: 5,
      rotation: 2,
      variant: 3,
    });
    expect(byId.get(2)?.placement).toBeNull();
  });

  it("stamps layoutVersion and leaves the input projection untouched", () => {
    const city = projectCity(profile, [card({ cardId: 1 })], NOW);
    const merged = mergePlacements(city, new Map(), 12);

    expect(merged.layoutVersion).toBe(12);
    expect(city.layoutVersion).toBeUndefined();
    // families are rebuilt, not mutated in place
    expect(merged.families).not.toBe(city.families);
  });

  it("§D7 safety net: same-tile collision keeps the higher value, demotes the loser to null", () => {
    const cards = [
      card({ cardId: 1, playerValue: 500 }),
      card({ cardId: 2, playerValue: 900 }),
    ];
    const city = projectCity(profile, cards, NOW);
    const placements = new Map<number, CityPlacement>([
      [1, place({ x: 3, y: 3 })],
      [2, place({ x: 3, y: 3 })], // same tile
    ]);

    const merged = mergePlacements(city, placements, 1);
    const byId = new Map(buildingsOf(merged).map((b) => [b.cardId, b]));

    expect(byId.get(2)?.placement).toEqual(place({ x: 3, y: 3 })); // 900 wins
    expect(byId.get(1)?.placement).toBeNull(); // 500 demoted to queue
  });

  it("tie on value → lower cardId wins", () => {
    const cards = [
      card({ cardId: 7, playerValue: 500 }),
      card({ cardId: 3, playerValue: 500 }),
    ];
    const city = projectCity(profile, cards, NOW);
    const placements = new Map<number, CityPlacement>([
      [7, place({ x: 0, y: 0 })],
      [3, place({ x: 0, y: 0 })],
    ]);

    const merged = mergePlacements(city, placements, 1);
    const byId = new Map(buildingsOf(merged).map((b) => [b.cardId, b]));
    expect(byId.get(3)?.placement).toEqual(place({ x: 0, y: 0 }));
    expect(byId.get(7)?.placement).toBeNull();
  });

  it("same xy in DIFFERENT sectors do not collide", () => {
    const cards = [
      card({ cardId: 1, playerValue: 100 }),
      card({ cardId: 2, playerValue: 900 }),
    ];
    const city = projectCity(profile, cards, NOW);
    const placements = new Map<number, CityPlacement>([
      [1, place({ sector: "s0", x: 2, y: 2 })],
      [2, place({ sector: "s1", x: 2, y: 2 })],
    ]);

    const merged = mergePlacements(city, placements, 1);
    const byId = new Map(buildingsOf(merged).map((b) => [b.cardId, b]));
    expect(byId.get(1)?.placement).not.toBeNull();
    expect(byId.get(2)?.placement).not.toBeNull();
  });

  it("three-way collision keeps exactly one winner across families", () => {
    const cards = [
      card({ cardId: 1, profession: "Overclocker", playerValue: 100 }),
      card({ cardId: 2, profession: "Zero-Day", playerValue: 300 }),
      card({ cardId: 3, profession: null, playerValue: 200 }),
    ];
    const city = projectCity(profile, cards, NOW);
    const placements = new Map<number, CityPlacement>([
      [1, place({ x: 9, y: 9 })],
      [2, place({ x: 9, y: 9 })],
      [3, place({ x: 9, y: 9 })],
    ]);

    const merged = mergePlacements(city, placements, 4);
    const placed = buildingsOf(merged).filter((b) => b.placement);
    expect(placed.map((b) => b.cardId)).toEqual([2]); // 300 > 200 > 100
  });

  it("preserves untouched families, counts, and building fields", () => {
    const cards = [
      card({ cardId: 1, playerValue: 800, blockSellUntil: FUTURE }),
      card({ cardId: 2, profession: null, playerValue: 10 }),
    ];
    const city = projectCity(profile, cards, NOW);
    const placements = new Map<number, CityPlacement>([[1, place({})]]);

    const merged = mergePlacements(city, placements, 2);

    expect(merged.detailedCount).toBe(city.detailedCount);
    expect(merged.aggregatedCount).toBe(city.aggregatedCount);
    expect(merged.landmarks).toEqual(city.landmarks);
    expect(merged.rootSequenceEligible).toBe(city.rootSequenceEligible);
    expect(merged.owner).toEqual(city.owner);
    // family structure/order and non-placement building fields survive
    // (equal totals → localeCompare tie-break puts "__unassigned__" first)
    expect(merged.families.map((f) => f.profession)).toEqual([UNASSIGNED_FAMILY, "Overclocker"]);
    const unassigned = merged.families.find((f) => f.profession === UNASSIGNED_FAMILY)!;
    expect(unassigned.total).toBe(1);
    const firewallBuilding = merged.families
      .find((f) => f.profession === "Overclocker")!
      .buildings.find((b) => b.cardId === 1)!;
    expect(firewallBuilding.protection).toBe("firewall");
    expect(firewallBuilding.tier).toBe(4); // 800/100 → 8× → 1+3
    expect(firewallBuilding.value).toBe(800);
  });
});

describe("toQueueBuilding", () => {
  it("maps an ownership row to an unplaced CityBuilding via shared helpers", () => {
    const q = toQueueBuilding(
      card({ cardId: 5, playerValue: 400, valueFloor: 100, permBlockUntil: FUTURE }),
      NOW
    );
    expect(q).toEqual({
      cardId: 5,
      username: "npc_1",
      profession: "Overclocker",
      tier: 3, // 4× → 1 + 2
      value: 400,
      protection: "hardlock",
      placement: null,
    });
  });

  it("agrees with projectCity's own tier/protection derivation (no drift)", () => {
    const c = card({ cardId: 9, playerValue: 1600, valueFloor: 100, blockSellUntil: FUTURE });
    const city = projectCity(profile, [c], NOW);
    const fromProjection = buildingsOf(city)[0];
    expect(toQueueBuilding(c, NOW)).toMatchObject({
      tier: fromProjection.tier,
      protection: fromProjection.protection,
      value: fromProjection.value,
    });
  });
});
