/**
 * Mainframe City — deterministic seeded fixtures (pure, node-safe).
 *
 * `makeCityFixture(n, seed)` synthesises an owner profile + owned cards +
 * SQL-style aggregates that match the CityOwnedCard / CityAggregates
 * contracts EXACTLY, for QA scale runs (20/100/500/1000/5000 cards) and the
 * vitest suite. No DB, no network, no economy writes; `now` is injected with
 * a fixed default so the same (n, seed) always produces the same city.
 *
 * Distribution guarantees (pinned by tests):
 * - professions cycle the REAL PROFESSIONS list (every 17th card is
 *   profession-less so the UNASSIGNED family appears too);
 * - values are log-distributed 1×–16384× the floor so ALL 14 tiers populate;
 * - ~15% of cards carry a FUTURE block/perm timestamp (~5% expired);
 * - 0–6 goddesses are included (they must project as landmarks, not
 *   buildings — projection.ts filters them).
 */

import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { PROFESSIONS } from "@/lib/professions";
import type {
  CityAggregates,
  CityNeighbor,
  CityOwnedCard,
  CityOwnerProfile,
} from "./types";
import { UNASSIGNED_FAMILY } from "./types";

/** Fixed clock for fixture determinism (protection windows are relative). */
export const FIXTURE_NOW = new Date("2026-01-01T00:00:00.000Z");

export interface CityFixture {
  profile: CityOwnerProfile;
  ownedCards: CityOwnedCard[];
  aggregates: CityAggregates;
}

/** mulberry32 — small, fast, fully deterministic seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ratio ∈ [2^lo, 2^hi) — log-uniform across the tier ladder. */
function logUniform(rand: () => number, lo: number, hi: number): number {
  return Math.pow(2, lo + rand() * (hi - lo));
}

const FLOORS = [500, 1_000, 2_500, 5_000, 10_000];

/**
 * Build a deterministic fixture city with `n` total owned cards.
 *
 * @param n total cards (goddesses included in the count)
 * @param seed PRNG seed — same seed ⇒ byte-identical fixture
 * @param now clock for protection timestamps (fixed default)
 * @param goddessCountOverride dev-only QA override for the goddess count
 *   (e.g. 6 = all landmarks owned — Root Sequence beam shots). The seeded
 *   draw still consumes its PRNG step so non-goddess cards stay identical
 *   to the unoverridden fixture.
 */
export function makeCityFixture(
  n: number,
  seed: number,
  now: Date = FIXTURE_NOW,
  goddessCountOverride?: number
): CityFixture {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError("makeCityFixture: n must be a positive integer");
  }
  const rand = mulberry32(seed);
  const nowMs = now.getTime();

  // 0–6 goddesses, deterministic from the seed (first g cards).
  const seededGoddessCount = Math.floor(rand() * (GODDESS_USERNAMES.length + 1));
  const goddessCount =
    goddessCountOverride === undefined
      ? seededGoddessCount
      : Math.max(0, Math.min(GODDESS_USERNAMES.length, goddessCountOverride));
  const goddessSet = new Set(GODDESS_USERNAMES);

  const cards: CityOwnedCard[] = [];
  const familyTotals: Record<string, number> = {};
  let totalBuildings = 0;
  let portfolioValue = 0;

  for (let i = 0; i < n; i++) {
    if (i < goddessCount) {
      // Goddess card: expensive floor, no profession, never a building.
      const valueFloor = 1_000_000;
      const playerValue = Math.round(valueFloor * logUniform(rand, 1, 4));
      cards.push({
        cardId: 100_000 + i,
        username: GODDESS_USERNAMES[i],
        profession: null,
        playerValue,
        valueFloor,
        isNpc: 0,
        blockSellUntil: null,
        permBlockUntil: null,
      });
      portfolioValue += playerValue;
      continue;
    }

    // Every 17th card is profession-less (UNASSIGNED family coverage).
    const profession =
      i % 17 === 16 ? null : PROFESSIONS[i % PROFESSIONS.length].name;
    const valueFloor = FLOORS[Math.floor(rand() * FLOORS.length)];
    // Tier ladder coverage: cycle the integer exponent 0..13 by index so all
    // 14 tiers are guaranteed present for n ≥ 14 (plus a fractional part).
    const exponent = (i % 14) + rand();
    const playerValue = Math.round(valueFloor * Math.pow(2, Math.min(exponent, 14)));
    if (profession) {
      familyTotals[profession] = (familyTotals[profession] ?? 0) + 1;
    } else {
      familyTotals[UNASSIGNED_FAMILY] = (familyTotals[UNASSIGNED_FAMILY] ?? 0) + 1;
    }
    totalBuildings += 1;

    // ~15% future protection (~10% firewall, ~5% hard lock) + ~5% expired.
    let blockSellUntil: string | null = null;
    let permBlockUntil: string | null = null;
    const protectionRoll = rand();
    if (protectionRoll < 0.1) {
      blockSellUntil = new Date(nowMs + (30 + rand() * 60) * 60_000).toISOString();
    } else if (protectionRoll < 0.15) {
      permBlockUntil = new Date(nowMs + (6 + rand() * 24) * 3_600_000).toISOString();
    } else if (protectionRoll < 0.2) {
      blockSellUntil = new Date(nowMs - (1 + rand() * 5) * 3_600_000).toISOString();
    }

    cards.push({
      cardId: 100_000 + i,
      username: `npc_${i}`,
      profession,
      playerValue,
      valueFloor,
      isNpc: 1,
      blockSellUntil,
      permBlockUntil,
    });
    portfolioValue += playerValue;
  }

  // Sector spread scales with portfolio size (mission ladder unlock feel).
  const missionLevel = Math.max(0, Math.min(8, Math.floor(n / 150)));

  const profile: CityOwnerProfile = {
    username: `fixture-${seed}`,
    missionLevel,
    portfolioValue,
    ownedCount: n,
  };

  const aggregates: CityAggregates = { totalBuildings, familyTotals };

  // Self-check: goddess usernames must never leak into building families.
  if (process.env.NODE_ENV !== "production") {
    for (const c of cards) {
      if (goddessSet.has(c.username) && c.profession !== null) {
        throw new Error("fixture invariant broken: goddess with profession");
      }
    }
  }

  return { profile, ownedCards: cards, aggregates };
}

/**
 * Deterministic fixture satellites (dev-only QA for the steal surface):
 * the first 3 non-goddess cards become neighbor owners, each with 5
 * synthesized buildings (values descending, professions cycling). Coverage
 * baked in: one FIREWALLED building (future blockSellUntil relative to
 * FIXTURE_NOW), one EXPIRED block, and one building flagged co-owned by the
 * city owner (steal hidden). Card ids live in a disjoint 900k range so they
 * can never collide with home-orbit ids (100k range).
 */
export function makeFixtureNeighbors(
  ownedCards: CityOwnedCard[]
): CityNeighbor[] {
  const owners = ownedCards
    .filter((c) => !GODDESS_USERNAMES.includes(c.username))
    .slice(0, 3);
  const neighbors: CityNeighbor[] = [];
  owners.forEach((owner, oi) => {
    const buildings = Array.from({ length: 5 }, (_, i) => {
      const valueFloor = 2_000;
      const playerValue = Math.round(valueFloor * Math.pow(2, 4 - i));
      return {
        cardId: 900_000 + oi * 10 + i,
        username: `sat_${oi}_${i}`,
        profession: i === 4 ? null : PROFESSIONS[(oi * 2 + i) % PROFESSIONS.length].name,
        isNpc: 1,
        tier: (1 + Math.max(0, 4 - i)) as CityNeighbor["buildings"][number]["tier"],
        value: playerValue,
        protection:
          oi === 0 && i === 1
            ? ("firewall" as const)
            : oi === 1 && i === 2
              ? ("hardlock" as const)
              : null,
        ownedByCityOwner: oi === 2 && i === 0,
      };
    });
    neighbors.push({
      cardId: owner.cardId,
      username: owner.username,
      profession: owner.profession,
      isNpc: owner.isNpc,
      visibleOwnedCount: 7,
      buildings,
      truncated: true,
      // Mini monument ring flags: first fixture neighbor holds two goddesses
      // (roster order), the others none — exercises lit + dormant monuments.
      goddessOwned: GODDESS_USERNAMES.map((_, gi) => oi === 0 && gi < 2),
      // Deterministic hero-stage spread for the relay QA: neighbor 0 final
      // form, neighbor 1 mid form, neighbor 2 base form.
      hqStage: (3 - Math.min(oi, 2)) as CityNeighbor["hqStage"],
    });
  });
  return neighbors;
}
