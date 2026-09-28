/**
 * Mainframe City — pure derivation of the city model from ownership state.
 *
 * INVARIANTS (AGENTS.md §"Mainframe City building layer"):
 * - Read-only: no economy values are computed here beyond VISUAL stage
 *   bucketing; card values, floors, and portfolio figures arrive from the
 *   server fetch and pass through untouched.
 * - Goddesses are landmarks, never ordinary buildings.
 * - Sector unlocks reuse the mission ladder (missions-data.ts) — no new
 *   milestone definitions.
 * - Detailed rendering is bounded: at most DETAILED_LIMIT buildings, the
 *   rest aggregate per family into density blocks.
 * - Deterministic for a fixed input (stable sort by value desc, id asc;
 *   `now` is a parameter, never Date.now() inside).
 */

import { GODDESS_USERNAMES } from "@/lib/goddesses";
import {
  FINAL_MISSION_INDEX,
  MISSIONS,
  finalGoddessThreshold,
} from "@/lib/missions-data";
import {
  type CityAggregates,
  type CityBuilding,
  type CityFamily,
  type CityLandmark,
  type CityNeighbor,
  type CityOwnedCard,
  type CityOwnerProfile,
  type CityProjection,
  type CitySectorInfo,
  type BuildingTier,
  type HeroStage,
  UNASSIGNED_FAMILY,
} from "./types";

/** Production default for the detailed-building budget (§D1 sizing fact). */
export const DEFAULT_DETAILED_LIMIT = 200;

/**
 * Resolve the detailed-building budget. The CITY_DETAILED_LIMIT override is
 * honored ONLY in development — it exists so QA can measure the §D1
 * 5,000-building contract question without code edits; production ignores
 * the env value entirely. Evaluated once at module load.
 */
export function resolveDetailedLimit(
  nodeEnv: string | undefined,
  rawOverride: string | undefined
): number {
  if (nodeEnv !== "development" || rawOverride === undefined) {
    return DEFAULT_DETAILED_LIMIT;
  }
  const parsed = Number(rawOverride);
  return Number.isInteger(parsed) && parsed >= 1
    ? parsed
    : DEFAULT_DETAILED_LIMIT;
}

/** Max buildings rendered in detail; the rest aggregate into density blocks. */
export const DETAILED_LIMIT = resolveDetailedLimit(
  process.env.NODE_ENV,
  process.env.CITY_DETAILED_LIMIT
);

/**
 * HERO-ART STAGES (2026-09-28 user ruling): the HQ core and the Six
 * monuments come in 3 value-driven forms; the FINAL form is reserved for
 * the neighborhood of the CURRENT MAX of the building's population — the
 * top of the value leaderboard for the HQ, the priciest goddess card for
 * each monument. Stage cutoffs are fractions of that population max:
 *   stage 1: value < 5% of max   (everyone)
 *   stage 2: 5% ≤ value < 50%    (climbing the board)
 *   stage 3: value ≥ 50% of max  (only players near the current game max)
 */
export const HERO_STAGE_FRACTIONS = [0.05, 0.5] as const;

/**
 * Hero stage 1..3 for a value against its population max (pure; degenerate
 * max or value → stage 1, so unknown data can never fabricate a final form).
 */
export function heroStageOf(value: number, populationMax: number): HeroStage {
  const max = Math.max(0, populationMax);
  if (max <= 0 || value <= 0) return 1;
  const ratio = value / max;
  if (ratio >= HERO_STAGE_FRACTIONS[1]) return 3;
  if (ratio >= HERO_STAGE_FRACTIONS[0]) return 2;
  return 1;
}

/**
 * Hero-stage inputs fetched by the route (all GLOBAL/owner-public — never
 * viewer-specific, so the CDN-safety of the city route is unaffected).
 */
export interface CityHeroInput {
  /** The city owner's OWN player_value (drives the HQ form). */
  ownerValue: number;
  /** Current max player_value across active players, goddesses excluded. */
  gameMaxValue: number;
  /** The six goddess cards' CURRENT player_value by raw username. */
  goddessValues: ReadonlyMap<string, number>;
}

/**
 * Visual tier 1–7 from the value/floor ratio (never reads economy state).
 * tier = 1 + floor(log2(max(1, ratio))) clamped to 1..7 → 1×=1 … 2×=2 …
 * 64×+=7. ONE implementation only (AGENTS.md / RTS plan §D2): the client
 * renders the server-sent tier and never recomputes it.
 */
export function buildingTier(
  playerValue: number,
  valueFloor: number
): BuildingTier {
  const floor = Math.max(1, valueFloor);
  const ratio = Math.max(1, playerValue / floor);
  const tier = 1 + Math.floor(Math.log2(ratio));
  return Math.max(1, Math.min(7, tier)) as BuildingTier;
}

/** Which protection visual applies (hard lock outranks firewall), if any. */
export function protectionState(
  card: Pick<CityOwnedCard, "blockSellUntil" | "permBlockUntil">,
  now: Date
): CityBuilding["protection"] {
  if (card.permBlockUntil && new Date(card.permBlockUntil).getTime() > now.getTime()) {
    return "hardlock";
  }
  if (card.blockSellUntil && new Date(card.blockSellUntil).getTime() > now.getTime()) {
    return "firewall";
  }
  return null;
}

/**
 * Sectors unlocked: the Boot Sector is always open; every completed mission
 * (mission_level) unlocks one more sector, capped by the ladder length.
 */
export function sectorsUnlocked(missionLevel: number, ladderLength: number): number {
  return 1 + Math.max(0, Math.min(missionLevel, ladderLength));
}

/**
 * Server-computed sector descriptors (§D3), emitted alongside
 * sectorsUnlocked. s0 "Boot" is always open (mission level 0); sector i
 * (s1..s8) opens at mission level i via ladder mission i-1, so its
 * threshold is `MISSIONS[i - 1].threshold` — EXCEPT the final sector, whose
 * threshold is the DYNAMIC final-mission value computed by the canonical
 * `finalGoddessThreshold(gameWinCount)` helper (5,000 + 1,000 × wins; the
 * caller threads the global game_win_count, defaulting to 0). Thresholds
 * only — never live progress counts or per-card data — so the public route
 * leaks nothing. Emitted length is exactly MISSIONS.length + 1 (s0..s8);
 * there is never an entry beyond the ladder.
 */
export function sectorInfo(
  missionLevel: number,
  gameWinCount = 0
): readonly CitySectorInfo[] {
  const unlocked = sectorsUnlocked(missionLevel, MISSIONS.length);
  const entries: CitySectorInfo[] = [
    {
      key: "s0",
      index: 0,
      unlocked: 0 < unlocked, // Boot: open even at (clamped) level 0
      missionTier: 0,
      unlockThreshold: null,
    },
  ];
  MISSIONS.forEach((mission, missionIndex) => {
    const index = missionIndex + 1;
    entries.push({
      key: `s${index}`,
      index,
      unlocked: index < unlocked,
      missionTier: index,
      unlockThreshold:
        missionIndex === FINAL_MISSION_INDEX
          ? finalGoddessThreshold(gameWinCount)
          : mission.threshold,
    });
  });
  return entries;
}

/**
 * Derive the full city model. Pure: same inputs + `now` → same output.
 *
 * `ownedCards` carries the cards rendered in detail (the route fetches at
 * most DETAILED_LIMIT rows). `aggregates` optionally supplies SQL-side
 * totals for portfolios larger than the detailed fetch, so nothing beyond
 * the limit is ever materialized. Without `aggregates`, totals derive from
 * the array itself (test/small-portfolio path). `gameWinCount` is the
 * GLOBAL win counter (game_settings.game_win_count) — it only feeds the
 * dynamic final-sector threshold in `sectorInfo` and defaults to 0.
 *
 * `goddessOwned` (H1, 2026-09-27): authoritative raw usernames of goddess
 * cards the owner holds, from a dedicated value-independent query. Goddess
 * values are PINNED (Wealth 100k, Knowledge 1M), so deriving landmark
 * ownership from the top-DETAILED_LIMIT detailed list breaks exactly for
 * all-six holders (mission 8 ≈ 5,000 cards) — monuments go dormant and
 * rootSequenceEligible flips false while the countdown runs. When omitted
 * (fixture/test paths), ownership derives from `ownedCards` as before.
 */
export function projectCity(
  profile: CityOwnerProfile,
  ownedCards: CityOwnedCard[],
  now: Date,
  aggregates?: CityAggregates,
  gameWinCount = 0,
  goddessOwned?: ReadonlySet<string>,
  neighbors?: readonly CityNeighbor[],
  hero?: CityHeroInput
): CityProjection {
  const goddessSet = new Set(GODDESS_USERNAMES);

  const ownedUsernames = goddessOwned ?? new Set(ownedCards.map((c) => c.username));
  // Monument stages: each goddess vs the priciest of the six (omitted hero
  // input → stage 1 everywhere; the route always supplies real values).
  let goddessMax = 0;
  if (hero) {
    for (const v of hero.goddessValues.values()) goddessMax = Math.max(goddessMax, v);
  }
  const landmarks: CityLandmark[] = GODDESS_USERNAMES.map((username) => ({
    username,
    owned: ownedUsernames.has(username),
    stage: hero
      ? heroStageOf(hero.goddessValues.get(username) ?? 0, goddessMax)
      : 1,
  }));

  // Goddesses render as landmarks, not buildings.
  const buildingCards = ownedCards.filter((c) => !goddessSet.has(c.username));

  const familyOf = (card: CityOwnedCard): string =>
    card.profession ?? UNASSIGNED_FAMILY;

  // Stable order: priciest first, id ascending as tie-break.
  const ordered = [...buildingCards].sort(
    (a, b) => b.playerValue - a.playerValue || a.cardId - b.cardId
  );

  const detailedCards = ordered.slice(0, DETAILED_LIMIT);

  const familyMap = new Map<string, CityFamily>();
  const emptyFamily = (key: string): CityFamily => ({
    profession: key,
    total: 0,
    buildings: [],
    aggregated: 0,
  });
  if (aggregates) {
    // SQL-side totals are authoritative for counts; the array contributes
    // only the detailed buildings. Keys use DB profession names or
    // UNASSIGNED_FAMILY for profession-less cards.
    for (const [key, total] of Object.entries(aggregates.familyTotals)) {
      const family = familyMap.get(key) ?? emptyFamily(key);
      family.total = total;
      familyMap.set(key, family);
    }
    for (const card of detailedCards) {
      const family = familyMap.get(familyOf(card)) ?? emptyFamily(familyOf(card));
      family.buildings.push({
        cardId: card.cardId,
        username: card.username,
        profession: card.profession,
        isNpc: card.isNpc,
        tier: buildingTier(card.playerValue, card.valueFloor),
        value: card.playerValue,
        protection: protectionState(card, now),
      });
      familyMap.set(familyOf(card), family);
    }
  } else {
    for (const card of buildingCards) {
      const key = familyOf(card);
      const family = familyMap.get(key) ?? emptyFamily(key);
      family.total += 1;
      familyMap.set(key, family);
    }
    for (const card of detailedCards) {
      const family = familyMap.get(familyOf(card)) ?? emptyFamily(familyOf(card));
      family.buildings.push({
        cardId: card.cardId,
        username: card.username,
        profession: card.profession,
        isNpc: card.isNpc,
        tier: buildingTier(card.playerValue, card.valueFloor),
        value: card.playerValue,
        protection: protectionState(card, now),
      });
      familyMap.set(familyOf(card), family);
    }
  }
  for (const family of familyMap.values()) {
    family.aggregated = family.total - family.buildings.length;
  }

  const families = [...familyMap.values()].sort(
    (a, b) => b.total - a.total || a.profession.localeCompare(b.profession)
  );

  return {
    owner: {
      username: profile.username,
      missionLevel: profile.missionLevel,
      portfolioValue: profile.portfolioValue,
      ownedCount: profile.ownedCount,
      sectorsUnlocked: sectorsUnlocked(profile.missionLevel, MISSIONS.length),
    },
    sectorInfo: sectorInfo(profile.missionLevel, gameWinCount),
    families,
    detailedCount: detailedCards.length,
    aggregatedCount: aggregates
      ? Math.max(0, aggregates.totalBuildings - detailedCards.length)
      : buildingCards.length - detailedCards.length,
    landmarks,
    hqStage: hero ? heroStageOf(hero.ownerValue, hero.gameMaxValue) : 1,
    // Satellite cities pass through untouched (shaped/bounded by the
    // assembler in neighbors.ts — pure data, never derived here).
    neighbors: neighbors ? [...neighbors] : [],
    rootSequenceEligible: landmarks.every((l) => l.owned),
  };
}
