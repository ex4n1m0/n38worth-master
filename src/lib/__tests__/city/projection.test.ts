import { describe, it, expect } from "vitest";
import {
  CityHeroInput,
  DETAILED_LIMIT,
  DEFAULT_DETAILED_LIMIT,
  buildingTier,
  protectionState,
  resolveDetailedLimit,
  sectorInfo,
  sectorsUnlocked,
  projectCity,
  heroStageOf,
} from "@/lib/city/projection";
import { UNASSIGNED_FAMILY } from "@/lib/city/types";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { MISSIONS } from "@/lib/missions-data";

const NOW = new Date("2026-09-26T12:00:00.000Z");
const FUTURE = "2026-09-27T12:00:00.000Z";
const PAST = "2026-09-25T12:00:00.000Z";

const profile = {
  username: "testuser",
  missionLevel: 3,
  portfolioValue: 12_345,
  ownedCount: 3,
};

function card(overrides: Partial<Parameters<typeof projectCity>[1][number]>) {
  return {
    cardId: 1,
    username: "npc_1",
    profession: "Cryptographer",
    playerValue: 100,
    valueFloor: 100,
    isNpc: 1,
    blockSellUntil: null,
    permBlockUntil: null,
    ...overrides,
  };
}

describe("buildingTier", () => {
  it("maps value/floor ratios to tiers at powers of two (1–7)", () => {
    expect(buildingTier(100, 100)).toBe(1); // 1×
    expect(buildingTier(199, 100)).toBe(1);
    expect(buildingTier(200, 100)).toBe(2); // 2×
    expect(buildingTier(400, 100)).toBe(3); // 4×
    expect(buildingTier(800, 100)).toBe(4); // 8×
    expect(buildingTier(1600, 100)).toBe(5); // 16×
    expect(buildingTier(3200, 100)).toBe(6); // 32×
    expect(buildingTier(6400, 100)).toBe(7); // 64×
    expect(buildingTier(1e12, 100)).toBe(7); // capped
  });

  it("one overclock (×2) is exactly +1 tier in the normal range", () => {
    let value = 100;
    let prev = buildingTier(value, 100);
    for (let i = 0; i < 6; i++) {
      value *= 2;
      const next = buildingTier(value, 100);
      expect(next).toBe((prev + 1) as 2 | 3 | 4 | 5 | 6 | 7);
      prev = next;
    }
    // past the top clamp the tier pins at 7 despite further growth
    value *= 2;
    expect(buildingTier(value, 100)).toBe(7);
  });

  it("treats degenerate floors safely (never NaN / out of 1..7)", () => {
    expect(buildingTier(1, 0)).toBe(1); // floor clamps to 1 → ratio 1×
    expect(buildingTier(50, 0)).toBe(6); // 50× against clamped floor 1
    expect(buildingTier(0, 100)).toBe(1); // ratio clamps to 1
    expect(buildingTier(-5, 100)).toBe(1);
  });
});

describe("protectionState", () => {
  it("returns null when nothing active or timestamps expired", () => {
    expect(protectionState({ blockSellUntil: null, permBlockUntil: null }, NOW)).toBeNull();
    expect(protectionState({ blockSellUntil: PAST, permBlockUntil: PAST }, NOW)).toBeNull();
  });

  it("firewall for active block_sell_until", () => {
    expect(protectionState({ blockSellUntil: FUTURE, permBlockUntil: null }, NOW)).toBe(
      "firewall"
    );
  });

  it("hard lock wins when both are active", () => {
    expect(protectionState({ blockSellUntil: FUTURE, permBlockUntil: FUTURE }, NOW)).toBe(
      "hardlock"
    );
  });
});

describe("sectorsUnlocked", () => {
  it("Boot Sector always open, +1 per completed mission, capped by ladder", () => {
    expect(sectorsUnlocked(0, 8)).toBe(1);
    expect(sectorsUnlocked(3, 8)).toBe(4);
    expect(sectorsUnlocked(8, 8)).toBe(9);
    expect(sectorsUnlocked(99, 8)).toBe(9);
  });

  it("negative levels clamp to Boot Sector only", () => {
    expect(sectorsUnlocked(-2, 8)).toBe(1);
  });

  it("uses the real mission ladder length", () => {
    expect(MISSIONS.length).toBe(8);
  });
});

describe("sectorInfo", () => {
  it("level 0: Boot only — 9 entries, thresholds straight off the ladder", () => {
    const info = sectorInfo(0);

    expect(info).toHaveLength(MISSIONS.length + 1); // s0..s8
    expect(info.map((s) => s.key)).toEqual([
      "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8",
    ]);
    expect(info.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(info.map((s) => s.missionTier)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    // Boot descriptor exactly (pinned contract shape)
    expect(info[0]).toEqual({
      key: "s0",
      index: 0,
      unlocked: true,
      missionTier: 0,
      unlockThreshold: null,
    });
    // everything past Boot is locked
    for (const sector of info.slice(1)) {
      expect(sector.unlocked).toBe(false);
    }
    // ladder thresholds, final = base 5000 (winCount 0 default)
    expect(info.map((s) => s.unlockThreshold)).toEqual([
      null, 20, 50, 100, 250, 500, 1000, 2000, 5000,
    ]);
  });

  it("mid ladder: level 3 → 4 unlocked (s0..s3), thresholds unchanged", () => {
    const info = sectorInfo(3);
    expect(info.filter((s) => s.unlocked).map((s) => s.key)).toEqual([
      "s0", "s1", "s2", "s3",
    ]);
    expect(info[3]).toEqual({
      key: "s3",
      index: 3,
      unlocked: true,
      missionTier: 3,
      unlockThreshold: 100, // ladder mission index 2
    });
  });

  it("max ladder: all 9 unlocked; FINAL threshold is dynamic in winCount", () => {
    const info = sectorInfo(MISSIONS.length, 2);
    expect(info.every((s) => s.unlocked)).toBe(true);
    // 5,000 base + 1,000 per win — via finalGoddessThreshold, not forked
    expect(info[MISSIONS.length].unlockThreshold).toBe(7000);
    // non-final thresholds stay static regardless of wins
    expect(info[1].unlockThreshold).toBe(20);
    expect(info[MISSIONS.length - 1].unlockThreshold).toBe(2000);
  });

  it("length never exceeds the ladder (+Boot), for any missionLevel", () => {
    expect(sectorInfo(-5)).toHaveLength(MISSIONS.length + 1);
    expect(sectorInfo(99)).toHaveLength(MISSIONS.length + 1);
    // over-level players keep everything unlocked, nothing beyond s8 exists
    const over = sectorInfo(99);
    expect(over.every((s) => s.unlocked)).toBe(true);
    expect(over[over.length - 1].key).toBe(`s${MISSIONS.length}`);
  });

  it("projectCity emits sectorInfo consistent with owner.sectorsUnlocked", () => {
    const city = projectCity(profile, [], NOW, undefined, 1);
    expect(city.owner.sectorsUnlocked).toBe(4); // missionLevel 3
    expect(city.sectorInfo).toEqual(sectorInfo(3, 1));
    expect(city.sectorInfo.filter((s) => s.unlocked)).toHaveLength(4);
    // dynamic final threaded through projectCity (5,000 + 1,000 × 1)
    expect(city.sectorInfo[MISSIONS.length].unlockThreshold).toBe(6000);
  });

  it("carries no progress or per-card data (public-route safety)", () => {
    const city = projectCity(
      { ...profile, ownedCount: 123 },
      [card({ cardId: 1, username: "npc_a" })],
      NOW
    );
    const flat = JSON.stringify(city.sectorInfo);
    expect(flat).not.toContain("ownedCount");
    expect(flat).not.toContain("npc_a");
    expect(flat).not.toContain("username");
    for (const sector of city.sectorInfo) {
      expect(Object.keys(sector).sort()).toEqual([
        "index",
        "key",
        "missionTier",
        "unlockThreshold",
        "unlocked",
      ]);
    }
  });
});

describe("DETAILED_LIMIT override", () => {
  it("defaults to 200 outside development (production ignores the env)", () => {
    expect(DEFAULT_DETAILED_LIMIT).toBe(200);
    expect(resolveDetailedLimit("production", "5000")).toBe(200);
    expect(resolveDetailedLimit("test", "5000")).toBe(200);
    expect(resolveDetailedLimit(undefined, "5000")).toBe(200);
  });

  it("honors CITY_DETAILED_LIMIT only in development", () => {
    expect(resolveDetailedLimit("development", "5000")).toBe(5000);
    expect(resolveDetailedLimit("development", "1")).toBe(1);
    expect(resolveDetailedLimit("development", undefined)).toBe(200);
  });

  it("rejects non-integer / non-positive overrides", () => {
    expect(resolveDetailedLimit("development", "garbage")).toBe(200);
    expect(resolveDetailedLimit("development", "")).toBe(200);
    expect(resolveDetailedLimit("development", "0")).toBe(200);
    expect(resolveDetailedLimit("development", "-5")).toBe(200);
    expect(resolveDetailedLimit("development", "200.5")).toBe(200);
  });

  it("effective value under vitest (NODE_ENV=test) is the production default", () => {
    expect(DETAILED_LIMIT).toBe(200);
  });
});

describe("projectCity", () => {
  it("derives families, buildings, and landmarks from plain ownership", () => {
    const city = projectCity(
      profile,
      [
        card({ cardId: 1, username: "npc_a", profession: "Overclocker", playerValue: 500 }),
        card({ cardId: 2, username: "npc_b", profession: "Overclocker", playerValue: 100 }),
        card({ cardId: 3, username: "npc_c", profession: null, playerValue: 50, blockSellUntil: FUTURE }),
      ],
      NOW
    );

    expect(city.owner.username).toBe("testuser");
    expect(city.owner.sectorsUnlocked).toBe(4);
    expect(city.families).toHaveLength(2);
    expect(city.families[0]).toMatchObject({ profession: "Overclocker", total: 2 });
    expect(city.families[1]).toMatchObject({ profession: UNASSIGNED_FAMILY, total: 1 });
    expect(city.detailedCount).toBe(3);
    expect(city.aggregatedCount).toBe(0);

    const overclocker = city.families[0];
    expect(overclocker.buildings[0]).toMatchObject({
      cardId: 1,
      tier: 3, // 500/100 → 5× → 1 + floor(log2 5) = 3
      protection: null,
    });
    const unassigned = city.families[1];
    expect(unassigned.buildings[0].protection).toBe("firewall");
  });

  it("goddesses become landmarks, never buildings", () => {
    const cards = [
      card({ cardId: 10, username: GODDESS_USERNAMES[0], playerValue: 1e11 }),
      card({ cardId: 11, username: "npc_x" }),
    ];
    const city = projectCity(profile, cards, NOW);

    expect(city.landmarks).toHaveLength(6);
    expect(city.landmarks.filter((l) => l.owned)).toHaveLength(1);
    expect(city.landmarks[0]).toMatchObject({ username: GODDESS_USERNAMES[0], owned: true });
    expect(city.detailedCount).toBe(1); // the NPC only
    expect(city.families.flatMap((f) => f.buildings.map((b) => b.username))).not.toContain(
      GODDESS_USERNAMES[0]
    );
  });

  it("rootSequenceEligible only when all six goddesses are owned", () => {
    const four = GODDESS_USERNAMES.slice(0, 4).map((u, i) =>
      card({ cardId: 100 + i, username: u })
    );
    expect(projectCity(profile, four, NOW).rootSequenceEligible).toBe(false);
    const all = GODDESS_USERNAMES.map((u, i) => card({ cardId: 200 + i, username: u }));
    expect(projectCity(profile, all, NOW).rootSequenceEligible).toBe(true);
  });

  it("bounds detailed buildings at DETAILED_LIMIT and aggregates the rest per family", () => {
    const cards = Array.from({ length: DETAILED_LIMIT + 150 }, (_, i) =>
      card({
        cardId: i + 1,
        username: `npc_${i}`,
        profession: i % 2 === 0 ? "Zero-Day" : "Cache Keeper",
        playerValue: (i % 50) * 10 + 10, // mixed values, many ties → id tie-break
      })
    );
    const city = projectCity(profile, cards, NOW);

    expect(city.detailedCount).toBe(DETAILED_LIMIT);
    expect(city.aggregatedCount).toBe(150);
    // every building appears exactly once across families
    const perFamilyDetailed = city.families.reduce((sum, f) => sum + f.buildings.length, 0);
    expect(perFamilyDetailed).toBe(DETAILED_LIMIT);
    for (const family of city.families) {
      expect(family.aggregated).toBe(family.total - family.buildings.length);
      expect(family.total).toBe(family.buildings.length + family.aggregated);
    }
    // detailed are the PRICIEST: max detailed value >= min aggregated's family max? —
    // stronger: every detailed building's value >= every non-detailed one
    const detailedValues = city.families
      .flatMap((f) => f.buildings.map((b) => b.value))
      .sort((a, b) => b - a);
    const allValues = cards.map((c) => c.playerValue).sort((a, b) => b - a);
    expect(detailedValues).toEqual(allValues.slice(0, DETAILED_LIMIT));
  });

  it("is deterministic for identical inputs and independent of card order", () => {
    const cards = [
      card({ cardId: 1, playerValue: 300 }),
      card({ cardId: 2, playerValue: 700 }),
      card({ cardId: 3, playerValue: 100, profession: "Bot Herder" }),
    ];
    const a = projectCity(profile, cards, NOW);
    const b = projectCity(profile, [...cards].reverse(), NOW);
    expect(a).toEqual(b);
  });

  it("uses SQL-side aggregates for counts when provided (large-portfolio path)", () => {
    // Route fetched only the top 2 cards (by value), SQL counted 5 buildings
    // in Overclocker + 3 in Cache Keeper.
    const detailed = [
      card({ cardId: 1, profession: "Overclocker", playerValue: 900 }),
      card({ cardId: 2, profession: "Cache Keeper", playerValue: 800 }),
    ];
    const city = projectCity(
      { ...profile, ownedCount: 8 },
      detailed,
      NOW,
      { totalBuildings: 8, familyTotals: { Overclocker: 5, "Cache Keeper": 3 } }
    );

    expect(city.detailedCount).toBe(2);
    expect(city.aggregatedCount).toBe(6);
    expect(city.families).toHaveLength(2);
    expect(city.families[0]).toMatchObject({ profession: "Overclocker", total: 5, aggregated: 4 });
    expect(city.families[1]).toMatchObject({ profession: "Cache Keeper", total: 3, aggregated: 2 });
    // detailed buildings land in the right families
    expect(city.families[0].buildings[0].cardId).toBe(1);
    expect(city.families[1].buildings[0].cardId).toBe(2);
  });

  it("aggregates path matches array path when totals agree", () => {
    const cards = [
      card({ cardId: 1, profession: "Overclocker", playerValue: 900 }),
      card({ cardId: 2, profession: "Cache Keeper", playerValue: 800 }),
      card({ cardId: 3, profession: "Overclocker", playerValue: 100 }),
    ];
    const fromArray = projectCity(profile, cards, NOW);
    const fromAggregates = projectCity(profile, cards, NOW, {
      totalBuildings: 3,
      familyTotals: { Overclocker: 2, "Cache Keeper": 1 },
    });
    expect(fromAggregates.families).toEqual(fromArray.families);
    expect(fromAggregates.aggregatedCount).toEqual(fromArray.aggregatedCount);
  });
});

describe("projectCity goddessOwned (H1: landmark truth vs DETAILED_LIMIT)", () => {
  it("landmark ownership survives goddesses falling out of the top-200 detailed list", () => {
    // The all-six holder shape: 200 higher-value NPCs crowd the detailed
    // fetch; the goddesses' PINNED values rank below the cut, so the array
    // path alone would mark every monument dormant and flip eligible false.
    const npcs = Array.from({ length: DETAILED_LIMIT }, (_, i) =>
      card({ cardId: i + 1, username: `npc_${i}`, playerValue: 10_000 })
    );
    const withoutSet = projectCity(profile, npcs, NOW);
    expect(withoutSet.rootSequenceEligible).toBe(false);

    const owned = new Set(GODDESS_USERNAMES);
    const city = projectCity(profile, npcs, NOW, undefined, 0, owned);
    expect(city.landmarks).toHaveLength(6);
    expect(city.landmarks.every((l) => l.owned)).toBe(true);
    expect(city.rootSequenceEligible).toBe(true);
    // the detailed budget is untouched; goddesses never render as buildings
    expect(city.detailedCount).toBe(DETAILED_LIMIT);
    expect(
      city.families.flatMap((f) => f.buildings.map((b) => b.username))
    ).not.toContain(GODDESS_USERNAMES[0]);
  });

  it("a partial authoritative set marks exactly those goddesses owned", () => {
    const owned = new Set(GODDESS_USERNAMES.slice(0, 3));
    const city = projectCity(profile, [], NOW, undefined, 0, owned);
    expect(city.landmarks.filter((l) => l.owned)).toHaveLength(3);
    expect(city.rootSequenceEligible).toBe(false);
  });
});

describe("heroStageOf (HQ + monument value stages)", () => {
  it("stage 1 below 5% of the population max, 2 at 5–50%, 3 at ≥50%", () => {
    expect(heroStageOf(0, 1_000_000)).toBe(1);
    expect(heroStageOf(49_999, 1_000_000)).toBe(1); // < 5%
    expect(heroStageOf(50_000, 1_000_000)).toBe(2); // exactly 5%
    expect(heroStageOf(499_999, 1_000_000)).toBe(2);
    expect(heroStageOf(500_000, 1_000_000)).toBe(3); // exactly 50% — top form
    expect(heroStageOf(1_000_000, 1_000_000)).toBe(3); // the current max itself
    expect(heroStageOf(2_000_000, 1_000_000)).toBe(3); // a new max keeps 3
  });

  it("degenerate population max or value never fabricates the final form", () => {
    expect(heroStageOf(999_999, 0)).toBe(1);
    expect(heroStageOf(-5, 1_000_000)).toBe(1);
    expect(heroStageOf(0, 1_000_000)).toBe(1);
  });
});

describe("projectCity hero stages", () => {
  it("defaults every stage to 1 when hero input is omitted", () => {
    const city = projectCity(profile, [], NOW, undefined, 0, new Set(GODDESS_USERNAMES));
    expect(city.hqStage).toBe(1);
    expect(city.landmarks.every((l) => l.stage === 1)).toBe(true);
  });

  it("stages the HQ against the game max and monuments against the priciest goddess", () => {
    const hero: CityHeroInput = {
      ownerValue: 600_000,
      gameMaxValue: 1_000_000, // owner at 60% → final HQ form
      goddessValues: new Map([
        [GODDESS_USERNAMES[0], 900_000], // 90% of goddess max → 3
        [GODDESS_USERNAMES[1], 300_000], // 30% → 2
        [GODDESS_USERNAMES[2], 10_000], // 1% → 1
      ]),
    };
    const city = projectCity(profile, [], NOW, undefined, 0, undefined, [], hero);
    expect(city.hqStage).toBe(3);
    expect(city.landmarks[0].stage).toBe(3);
    expect(city.landmarks[1].stage).toBe(2);
    expect(city.landmarks[2].stage).toBe(1);
    // goddesses missing from the map default to stage 1
    expect(city.landmarks[3].stage).toBe(1);
  });
});
