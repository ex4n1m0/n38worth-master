import { describe, expect, it } from "vitest";
import { diffBuildings } from "@/lib/city/scene/diff";
import type { CityBuilding } from "@/lib/city/types";

function b(
  cardId: number,
  tier: CityBuilding["tier"],
  extra: Partial<CityBuilding> = {}
): CityBuilding {
  return {
    cardId,
    username: `u${cardId}`,
    profession: "Overclocker",
    isNpc: 1,
    tier,
    value: 1000 * cardId,
    protection: null,
    ...extra,
  };
}

describe("diffBuildings", () => {
  it("seeds on the first sync without exit/tier events", () => {
    const next = [b(1, 1), b(2, 3)];
    const d = diffBuildings(null, next);
    expect(d.seeded).toBe(true);
    expect(d.entered.map((x) => x.cardId)).toEqual([1, 2]);
    expect(d.exited).toEqual([]);
    expect(d.tierUp).toEqual([]);
  });

  it("reports entered and exited cards (construct / loss FX)", () => {
    const prev = [b(1, 1), b(2, 2), b(3, 1)];
    const next = [b(1, 1), b(3, 1), b(4, 2)];
    const d = diffBuildings(prev, next);
    expect(d.entered.map((x) => x.cardId)).toEqual([4]);
    expect(d.exited.map((x) => x.cardId)).toEqual([2]);
    expect(d.seeded).toBe(false);
  });

  it("reports tier-ups only when the tier strictly increases", () => {
    const prev = [b(1, 2), b(2, 4)];
    const next = [b(1, 3), b(2, 4), b(3, 5)];
    const d = diffBuildings(prev, next);
    expect(d.tierUp.map((t) => t.cardId)).toEqual([1]);
    expect(d.tierUp[0]).toMatchObject({ fromTier: 2, toTier: 3 });
  });

  it("reports moved buildings when the placement tile changes", () => {
    const prev = [b(1, 1, { placement: { sector: "s0", x: 1, y: 1, rotation: 0, variant: 0 } })];
    const same = [b(1, 1, { placement: { sector: "s0", x: 1, y: 1, rotation: 0, variant: 0 } })];
    expect(diffBuildings(prev, same).moved).toEqual([]);

    const moved = [b(1, 1, { placement: { sector: "s0", x: 2, y: 1, rotation: 0, variant: 0 } })];
    expect(diffBuildings(prev, moved).moved.map((x) => x.cardId)).toEqual([1]);

    const queued = [b(1, 1, { placement: null })];
    expect(diffBuildings(prev, queued).moved.map((x) => x.cardId)).toEqual([1]);
  });

  it("reports protection changes", () => {
    const prev = [b(1, 1), b(2, 1, { protection: "firewall" })];
    const next = [b(1, 1, { protection: "hardlock" }), b(2, 1, { protection: "firewall" })];
    const d = diffBuildings(prev, next);
    expect(d.protectionChanged.map((x) => x.cardId)).toEqual([1]);
  });
});
