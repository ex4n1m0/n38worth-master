import { describe, expect, it } from "vitest";
import {
  DISTRICT_PROFESSIONS,
  FAMILY_HEX,
  UNASSIGNED_HEX,
  districtRepresentatives,
  districtsFromFamilies,
  familyHex,
} from "@/lib/city/district";
import { UNASSIGNED_FAMILY } from "@/lib/city/types";

const SIX = DISTRICT_PROFESSIONS;

function familiesOf(professions: string[]) {
  return professions.map((profession) => ({ profession, total: 1 }));
}

describe("districtsFromFamilies", () => {
  it("reports all six missing for an empty city", () => {
    const d = districtsFromFamilies([]);
    expect(d.present).toEqual([]);
    expect(d.missing).toEqual([...SIX]);
    expect(d.complete).toBe(false);
  });

  it("marks present families in roster order regardless of input order", () => {
    const d = districtsFromFamilies(familiesOf(["Bot Herder", "Cryptographer"]));
    expect(d.present).toEqual(["Cryptographer", "Bot Herder"]);
    expect(d.missing).toHaveLength(4);
    expect(d.complete).toBe(false);
  });

  it("completes only when all six professions are owned", () => {
    const five = districtsFromFamilies(familiesOf(SIX.slice(0, 5)));
    expect(five.complete).toBe(false);
    expect(five.missing).toEqual([SIX[5]]);

    const all = districtsFromFamilies(familiesOf([...SIX].reverse()));
    expect(all.present).toEqual([...SIX]);
    expect(all.missing).toEqual([]);
    expect(all.complete).toBe(true);
  });

  it("ignores unassigned and unknown professions", () => {
    const d = districtsFromFamilies([
      { profession: UNASSIGNED_FAMILY, total: 40 },
      { profession: "Not A Profession", total: 7 },
      { profession: "Overclocker", total: 2 },
    ]);
    expect(d.present).toEqual(["Overclocker"]);
    expect(d.complete).toBe(false);
  });

  it("treats a zero-total family as absent (SQL aggregate edge)", () => {
    const d = districtsFromFamilies([{ profession: "Cache Keeper", total: 0 }]);
    expect(d.present).toEqual([]);
    expect(d.missing).toContain("Cache Keeper");
  });

  it("duplicates collapse into one presence entry", () => {
    const d = districtsFromFamilies([
      { profession: "Zero-Day", total: 3 },
      { profession: "Zero-Day", total: 1 },
    ]);
    expect(d.present).toEqual(["Zero-Day"]);
  });
});

describe("districtRepresentatives", () => {
  it("picks the highest-value detailed building per owned profession", () => {
    const reps = districtRepresentatives([
      {
        profession: "Overclocker",
        buildings: [
          { cardId: 11, value: 500 },
          { cardId: 12, value: 5_000 },
          { cardId: 13, value: 900 },
        ],
      },
      { profession: "Bot Herder", buildings: [{ cardId: 21, value: 10 }] },
    ]);
    expect(reps).toEqual([
      { profession: "Overclocker", cardId: 12 },
      { profession: "Bot Herder", cardId: 21 },
    ]);
  });

  it("breaks value ties by ascending cardId (projection's stable order)", () => {
    const reps = districtRepresentatives([
      {
        profession: "Cache Keeper",
        buildings: [
          { cardId: 30, value: 100 },
          { cardId: 25, value: 100 },
        ],
      },
    ]);
    expect(reps).toEqual([{ profession: "Cache Keeper", cardId: 25 }]);
  });

  it("skips aggregated-only and unassigned families, returns roster order", () => {
    const reps = districtRepresentatives([
      { profession: "Server Marshal", buildings: [] },
      { profession: UNASSIGNED_FAMILY, buildings: [{ cardId: 1, value: 9_999 }] }],
    );
    expect(reps).toEqual([]);
  });

  it("returns all six in roster order when every family has buildings", () => {
    const families = SIX.map((profession, i) => ({
      profession,
      buildings: [{ cardId: 100 + i, value: 1_000 * (i + 1) }],
    }));
    const reps = districtRepresentatives(families);
    expect(reps.map((r) => r.profession)).toEqual([...SIX]);
    expect(reps.map((r) => r.cardId)).toEqual([100, 101, 102, 103, 104, 105]);
  });
});

describe("familyHex", () => {
  it("maps every roster profession to its palette entry", () => {
    for (const name of SIX) {
      expect(FAMILY_HEX[name]).toMatch(/^#[0-9a-f]{6}$/);
      expect(familyHex(name)).toBe(FAMILY_HEX[name]);
    }
  });

  it("falls back to neutral for null / unassigned / unknown", () => {
    expect(familyHex(null)).toBe(UNASSIGNED_HEX);
    expect(familyHex(UNASSIGNED_FAMILY)).toBe(UNASSIGNED_HEX);
    expect(familyHex("Nobody")).toBe(UNASSIGNED_HEX);
  });
});
