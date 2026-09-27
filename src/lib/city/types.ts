/**
 * Mainframe City — type contracts for the derived city projection.
 *
 * The city is a READ-ONLY visual projection of existing ownership state
 * (AGENTS.md §"Mainframe City building layer"). Nothing here is persisted;
 * `projectCity` derives the whole model from rows the API route fetches.
 *
 * Client-safe: plain data + types only. Raw usernames travel to the client;
 * display translation (cardDisplayName / professionName) happens at render.
 */

/** Building tier 1–7, derived from player_value vs value_floor (powers of two).
 * One successful overclock (value ×2) normally = exactly +1 tier. Two
 * documented exceptions (MAINFRAME_CITY_RTS_PLAN.md §D2): ratio ≥64× pins
 * at 7, and values near MAX_PLAYER_VALUE (1e12) can be capped mid-doubling. */
export type BuildingTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Persisted placement of a building (city_layout row, MAINFRAME_CITY_RTS_PLAN §D6). */
export interface CityPlacement {
  /** Sector key "s0".."s8" (whitelist derived from the mission ladder). */
  sector: string;
  x: number;
  y: number;
  /** 0..3 quarter turns. */
  rotation: number;
  /** 0..3 approved visual variant. */
  variant: number;
}

/** Owner profile fields the projection needs (fetched once per city). */
export interface CityOwnerProfile {
  username: string;
  /** Number of COMPLETED missions (users.mission_level) — drives sector unlocks. */
  missionLevel: number;
  /** Portfolio value per the canonical formula (excludes own player_value). */
  portfolioValue: number;
  /** Total visible owned cards (goddesses included). */
  ownedCount: number;
}

/** One owned card, as fetched per ownership row. Timestamps are ISO strings.
 * Avatar URLs are intentionally absent — avatars lazy-load per building via
 * the CDN-cached /api/avatar/[username] route (legacy `data:` URI rows make
 * inline avatar payloads unusably large). */
export interface CityOwnedCard {
  cardId: number;
  username: string;
  /** DB profession name, or null for profession-less cards. */
  profession: string | null;
  playerValue: number;
  valueFloor: number;
  isNpc: number;
  /** Own-row firewall expiry (ownership.block_sell_until), or null. */
  blockSellUntil: string | null;
  /** Own-row hard-lock expiry (ownership.perm_block_until), or null. */
  permBlockUntil: string | null;
}

/** A rendered building (non-goddess owned card only; goddesses are landmarks). */
export interface CityBuilding {
  cardId: number;
  username: string;
  profession: string | null;
  /** 1 = NPC card (profession assignable by the owner), 0 = human card. */
  isNpc: number;
  tier: BuildingTier;
  value: number;
  /** Hard lock outranks firewall when both are active. */
  protection: "hardlock" | "firewall" | null;
  /** Persisted tile placement, or null/absent when the building is unplaced
   * (in the placement queue). Set by the routes when layout data is joined
   * in; the pure projection leaves it unset. */
  placement?: CityPlacement | null;
}

/** A profession family (building block) with density aggregation. */
export interface CityFamily {
  /** DB profession name, or UNASSIGNED_FAMILY for profession-less cards. */
  profession: string;
  total: number;
  /** Detailed buildings (top N by value across ALL families). */
  buildings: CityBuilding[];
  /** total − buildings.length; rendered as aggregate density blocks. */
  aggregated: number;
}

/** Sentinel family key for owned cards with no profession. */
export const UNASSIGNED_FAMILY = "__unassigned__";

/**
 * SQL-side aggregates for portfolios larger than the detailed fetch. Keys of
 * `familyTotals` are DB profession names (or UNASSIGNED_FAMILY); values are
 * visible non-goddess owned-card counts per family. `totalBuildings` is the
 * grand total across families (goddesses excluded — they are landmarks).
 */
export interface CityAggregates {
  totalBuildings: number;
  familyTotals: Record<string, number>;
}

/** A goddess landmark slot (fixed roster order, owned flag from ownership). */
export interface CityLandmark {
  username: string;
  owned: boolean;
}

/**
 * A building inside a SATELLITE city (2026-09-27 "neighbor cities"): an
 * owned card of one of the owner's owned cards. Same visual contract as
 * CityBuilding (tier/protection derived server-side exactly like the home
 * orbit) plus the steal-relevant flags. The card may be co-owned by the
 * city owner — the steal action is then hidden (the purchase API would
 * reject it with "You already own this player").
 */
export interface CityNeighborBuilding extends CityBuilding {
  /** The CITY OWNER also holds this card — steal disabled. */
  ownedByCityOwner: boolean;
}

/**
 * One satellite city: an owned card that itself owns visible cards, plus the
 * (bounded) top of those cards by value. `visibleOwnedCount` is the SQL count
 * of the neighbor's visible owned cards — `buildings` is capped, so the gap
 * is surfaced as `truncated` for the "+N more" plate.
 */
export interface CityNeighbor {
  /** The neighbor card's OWN user id (a detailed building of the home city). */
  cardId: number;
  username: string;
  profession: string | null;
  isNpc: number;
  /** Visible owned count (goddesses included — they are filtered out of buildings). */
  visibleOwnedCount: number;
  /** Top buildings by value, bounded by NEIGHBOR_BUILDING_LIMIT. */
  buildings: CityNeighborBuilding[];
  /** visibleOwnedCount exceeded the building budget — show "+N more". */
  truncated: boolean;
  /**
   * Which of the six goddesses this neighbor owns, in GODDESS_USERNAMES
   * roster order (length 6). Drives the satellite's mini monument ring —
   * same shape as the home city, monuments lit per actual ownership.
   */
  goddessOwned: boolean[];
}

/**
 * Server-computed sector descriptor (§D3). Thresholds ONLY — ladder constants
 * plus the dynamic final-mission value — so the public route can never leak
 * live progress (hidden-card) state. The client maps sector identities to
 * labels via missionLabel/finalGoddessLabel itself; no strings travel here.
 * PINNED CONTRACT: the frontend codes against this exact shape.
 */
export interface CitySectorInfo {
  /** "s0".."s8" */
  key: string;
  /** 0..8 */
  index: number;
  /** index < sectorsUnlocked */
  unlocked: boolean;
  /** Mission level that unlocks this sector; 0 for Boot (always open). */
  missionTier: number | null;
  /** Owned-card count (missions ladder basis) that unlocks it; null for Boot. FINAL sector uses the DYNAMIC threshold. */
  unlockThreshold: number | null;
}

  /** The full derived city model returned by /api/city/[username]. */
export interface CityProjection {
  owner: {
    username: string;
    missionLevel: number;
    portfolioValue: number;
    ownedCount: number;
    sectorsUnlocked: number;
  };
  /** Server-computed sector descriptors s0..s(MISSIONS.length); the client
   * renders them and never recomputes unlock state (§D3). */
  sectorInfo: readonly CitySectorInfo[];
  families: CityFamily[];
  /** Number of buildings rendered in detail (bounded by DETAILED_LIMIT). */
  detailedCount: number;
  /** Number of buildings folded into aggregate density blocks. */
  aggregatedCount: number;
  landmarks: CityLandmark[];
  /**
   * Satellite cities (owned cards that own cards), value order, bounded by
   * NEIGHBOR_CITY_LIMIT. Their buildings are hireable (steal) by the city
   * OWNER via the ordinary /api/game/purchase flow; visitors see them
   * read-only like the rest of the public projection.
   */
  neighbors: CityNeighbor[];
  /** True when all six goddesses are owned (Root Sequence eligibility). */
  rootSequenceEligible: boolean;
  /** Owner's current layout epoch (city_layout_meta), when layout was joined. */
  layoutVersion?: number;
}

/** Owner-scoped placement-queue payload (GET /api/city/my-layout — authed,
 * no-store; the PUBLIC city route must never include the queue because it
 * would disclose hidden owned cards: MAINFRAME_CITY_RTS_PLAN §D5). */
export interface OwnerCityLayout {
  layoutVersion: number;
  /** Owned-but-unplaced buildings (queue items reuse the building shape). */
  queue: CityBuilding[];
}
