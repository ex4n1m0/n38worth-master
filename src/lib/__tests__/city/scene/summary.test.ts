import { describe, expect, it } from "vitest";
import { UNASSIGNED_FAMILY } from "@/lib/city/types";
import {
  WORLD_SUMMARY_FAMILY_CAP,
  summaryBuildingTotal,
  worldSummaryRows,
  type SummaryFamilyInput,
} from "@/lib/city/scene/summary";

describe("worldSummaryRows", () => {
  it("keeps non-empty families, sorted by count descending", () => {
    const families: SummaryFamilyInput[] = [
      { profession: "Overclocker", total: 3 },
      { profession: "Cryptographer", total: 10 },
      { profession: UNASSIGNED_FAMILY, total: 7 },
      { profession: "Zero-Day", total: 0 },
    ];
    expect(worldSummaryRows(families)).toEqual([
      { profession: "Cryptographer", count: 10 },
      { profession: UNASSIGNED_FAMILY, count: 7 },
      { profession: "Overclocker", count: 3 },
    ]);
  });

  it("drops empty families entirely", () => {
    expect(
      worldSummaryRows([
        { profession: "Zero-Day", total: 0 },
        { profession: "Bot Herder", total: 0 },
      ])
    ).toEqual([]);
  });

  it("caps the row count at the family budget", () => {
    const families: SummaryFamilyInput[] = Array.from({ length: 12 }, (_, i) => ({
      profession: `f${i}`,
      total: 12 - i,
    }));
    const rows = worldSummaryRows(families);
    expect(rows).toHaveLength(WORLD_SUMMARY_FAMILY_CAP);
    expect(rows[0]).toEqual({ profession: "f0", count: 12 });
    expect(rows[rows.length - 1]).toEqual({
      profession: `f${WORLD_SUMMARY_FAMILY_CAP - 1}`,
      count: 12 - (WORLD_SUMMARY_FAMILY_CAP - 1),
    });
  });

  it("breaks count ties by name for determinism", () => {
    const rows = worldSummaryRows([
      { profession: "Bot Herder", total: 5 },
      { profession: "Cache Keeper", total: 5 },
      { profession: "Overclocker", total: 5 },
    ]);
    expect(rows.map((r) => r.profession)).toEqual([
      "Bot Herder",
      "Cache Keeper",
      "Overclocker",
    ]);
  });

  it("fits the full roster plus unassigned within the cap", () => {
    const families: SummaryFamilyInput[] = [
      "Cryptographer",
      "Zero-Day",
      "Overclocker",
      "Cache Keeper",
      "Server Marshal",
      "Bot Herder",
      UNASSIGNED_FAMILY,
    ].map((profession) => ({ profession, total: 1 }));
    expect(worldSummaryRows(families)).toHaveLength(7);
  });
});

describe("summaryBuildingTotal", () => {
  it("adds the two server-computed counts", () => {
    expect(
      summaryBuildingTotal({ detailedCount: 200, aggregatedCount: 1400 })
    ).toBe(1600);
    expect(summaryBuildingTotal({ detailedCount: 12, aggregatedCount: 0 })).toBe(
      12
    );
  });
});
