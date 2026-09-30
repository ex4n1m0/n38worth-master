/**
 * Mainframe City — the shared UNIVERSE map (pure, node-safe, no Pixi).
 *
 * 2026-09-28 design (user ruling): every city in the game renders on ONE
 * map, not just the viewer's stake cities. Placement is the value-orbit
 * rule one level up: cities sit on CLOCKWISE square rings around the
 * universe center in PORTFOLIO-RANK order — the biggest city at the exact
 * center, the next ones on the innermost ring, smaller cities spiraling
 * outward. Nothing is persisted: the layout is a pure function of the
 * rank snapshot, so every viewer sees the same constellation (each viewer
 * simply keeps THEIR city at their own coordinate origin — a translation
 * nobody can observe).
 *
 * Rank source: user_rank_snapshots.portfolio_rank (humans with a completed
 * avatar — the same eligibility the leaderboard uses; NPC holdings stay in
 * the viewer's interactive satellite layer). The innermost ring starts far
 * enough out to clear the satellite anchor zone entirely.
 *
 * ONE SHARED UNIVERSE (2026-09-30 user ruling, CITY_SHARED_UNIVERSE_STUDY):
 * the base ring is FIXED (WORLD_BASE_RING — sized once from the LARGEST
 * city's satellite zone) and no longer scales with the viewer's own city,
 * so every viewer sees the SAME constellation: same scale, same shape,
 * each viewer merely keeping their own city at their coordinate origin (a
 * pure translation nobody can observe). This supersedes the 2026-09-29
 * dynamic-distance ruling — early-game viewers see the universe begin
 * ~64 tiles out instead of ~32; home framing compensates.
 *
 * FULL RENDERING (2026-09-30, same study): each city also ships a SKYLINE —
 * its top UNIVERSE_SKYLINE_LIMIT visible buildings by value as
 * [tier, familyIndex] tuples — the bounded "fully rendered" line the
 * 2026-09-29 satellite ruling already blessed (top-24 + "+N more").
 */

import { GRID_SIZE } from "./layout-schema";
import { ringTiles } from "./rings";
import { satelliteRingRadii } from "./satellites";
import { SECTOR_MACRO, tileToScreen, type Point } from "./scene/iso";
import { DISTRICT_PROFESSIONS } from "./district";
import { UNASSIGNED_FAMILY } from "./types";
import { buildingTier } from "./projection";

/**
 * Radius (tiles) of the innermost universe ring. Must clear the satellite
 * anchor zone around the LARGEST city: the biggest satellite ring sits at
 * full-grid extent + margin — sized from the REAL satellite radii, not a
 * worst-case guess.
 */

/**
 * Clear tiles between the outermost satellite cluster rim and the first
 * universe ring: a mini city spans ~(cluster radius + pad skirt) × 0.55
 * ≈ 3 visual tiles; +1 gap.
 */
export const UNIVERSE_CLEARANCE_TILES = 4;

/**
 * THE shared-universe base ring (2026-09-30 ruling): the satellite anchor
 * ring of the LARGEST possible city (full 3×3 grid) + clearance, snapped
 * up to a UNIVERSE_RING_STEP multiple — FIXED for every viewer, so the
 * constellation is identical for everyone (each renderer keeps the viewed
 * city at its own origin as an unobservable translation). Because it is
 * sized for the biggest city, any smaller viewer has strictly MORE
 * clearance: a universe city can never poke through a home grid.
 * (Defined below UNIVERSE_RING_STEP — see the TDZ note there.)
 */

/**
 * Slot stride AND ring-to-ring spacing (tiles). A rendered mini city spans
 * ~6 internal tiles at ×0.55 ≈ 3.5 visual tiles, so 8 packs neighbouring
 * cities as close as they can go without touching ("almost crashing" —
 * 2026-09-29 user ruling; was 12).
 */
export const UNIVERSE_RING_STEP = 8;

export const WORLD_BASE_RING: number = (() => {
  const { rx, ry } = satelliteRingRadii(SECTOR_MACRO.length, GRID_SIZE);
  const raw = Math.max(rx, ry) + UNIVERSE_CLEARANCE_TILES;
  // Snap UP to a multiple of the ring step: every ring radius is then a
  // slot multiple, so ring CORNERS land exactly on slots and consecutive
  // cities stay one full step apart everywhere (no corner straddling at
  // ~6 tiles, which would crash the minis together).
  return Math.ceil(raw / UNIVERSE_RING_STEP) * UNIVERSE_RING_STEP;
})();

/** Max cities on the map (payload + placement cap; render budget). */
export const UNIVERSE_CITY_CAP = 500;

/**
 * Max skyline buildings shipped + rendered per universe city — the
 * bounded "fully rendered" line (2026-09-30 shared-universe ruling;
 * mirrors the satellite layer's NEIGHBOR_BUILDING_LIMIT blessing:
 * top-24 by value + a "+N more" read beyond).
 */
export const UNIVERSE_SKYLINE_LIMIT = 24;

/**
 * Stable family order for the skyline tuples (DISTRICT_PROFESSIONS roster
 * + the unassigned sentinel last). Indices travel in the payload; the
 * renderer maps them back through universeFamilyOf.
 */
export const UNIVERSE_FAMILIES: readonly string[] = [
  ...DISTRICT_PROFESSIONS,
  UNASSIGNED_FAMILY,
];

/** Payload family index of a DB profession (unknown → unassigned). */
export function universeFamilyIndex(profession: string | null): number {
  const fam = profession ?? UNASSIGNED_FAMILY;
  const idx = UNIVERSE_FAMILIES.indexOf(fam);
  return idx >= 0 ? idx : UNIVERSE_FAMILIES.length - 1;
}

/** DB profession for a payload family index (out of range → unassigned). */
export function universeFamilyOf(index: number): string {
  return UNIVERSE_FAMILIES[
    Math.max(0, Math.min(UNIVERSE_FAMILIES.length - 1, Math.round(index)))
  ];
}

/** One city on the shared map (summary + bounded skyline tuples). */
export interface UniverseCity {
  /** 1-based portfolio rank (1 = the universe center). */
  rank: number;
  username: string;
  profession: string | null;
  /** Visible owned-building count (drives the "+N more" read; ≥ skyline). */
  count?: number;
  /**
   * Top UNIVERSE_SKYLINE_LIMIT visible buildings by value as
   * [tier, familyIndex] tuples (familyIndex indexes UNIVERSE_FAMILIES;
   * tiers via the ONE buildingTier implementation). Omitted when the city
   * has no visible buildings.
   */
  skyline?: ReadonlyArray<readonly [number, number]>;
}

export interface UniversePayload {
  /**
   * Identity of the rank ordering (hash of the usernames in rank order).
   * The client glides cities only when this CHANGES — snapshot refreshes
   * that re-write identical orderings must not animate.
   */
  epoch: string;
  /** Snapshot generation time (ISO) — debug/observability only. */
  generatedAt: string;
  /** Cities in rank order (rank field is implicitly index + 1). */
  cities: UniverseCity[];
}

/** Chebyshev radius of ring `m` (1-based) for a layout based at `base`. */
export function universeRingRadius(m: number, base: number): number {
  return base + UNIVERSE_RING_STEP * (m - 1);
}

/** How many city slots fit on ring `m` (one slot per RING_STEP walk tiles). */
export function universeRingCapacity(m: number, base: number): number {
  return Math.floor((8 * universeRingRadius(m, base)) / UNIVERSE_RING_STEP);
}

/** Cumulative slot count through ring `m`. */
export function universeCumulativeCapacity(m: number, base: number): number {
  let total = 0;
  for (let i = 1; i <= m; i++) total += universeRingCapacity(i, base);
  return total;
}

/**
 * Ring number (1-based) that hosts the city with ring index `k` (0-based,
 * i.e. rank − 2). Grows ~linearly in capacity per ring, so the mapping is
 * dense: no half-empty inner rings.
 */
export function universeRingOfIndex(k: number, base: number): number {
  let m = 1;
  while (universeCumulativeCapacity(m, base) <= k) m++;
  return m;
}

/**
 * 1-based universe ring hosting the city with `rank` (rank 1 = the exact
 * center, ring 0). Renderers chunk world geometry by this so re-rank churn
 * rebuilds only the rings whose membership actually changed.
 */
export function universeRingForRank(
  rank: number,
  base: number = WORLD_BASE_RING
): number {
  return rank <= 1 ? 0 : universeRingOfIndex(rank - 2, base);
}

/**
 * UNIVERSE anchor of the city with `rank` (1-based), in tiles around the
 * universe center. Rank 1 sits at the exact center; rank R ≥ 2 walks the
 * clockwise ring slots (screen-north start — the rings.ts rule). Pure and
 * deterministic: same (rank, base) → same tile, always.
 */
export function universeCityAnchor(rank: number, base: number): Point {
  if (rank <= 1) return { x: 0, y: 0 };
  const k = rank - 2;
  const m = universeRingOfIndex(k, base);
  const within = k - universeCumulativeCapacity(m - 1, base);
  const radius = universeRingRadius(m, base);
  const walk = ringTiles(0, 0, radius);
  const slot = walk[(within * UNIVERSE_RING_STEP) % walk.length];
  return { x: slot.gx, y: slot.gy };
}

/**
 * Tile offset of the city with `cityRank` relative to the VIEWER's city
 * (viewerRank), both on the layout based at the viewer's `base` ring. The
 * viewer's own city always renders at their world origin, so every other
 * city is placed at this delta.
 */
export function universeCityOffset(
  cityRank: number,
  viewerRank: number,
  base: number
): Point {
  const city = universeCityAnchor(cityRank, base);
  const viewer = universeCityAnchor(viewerRank, base);
  return { x: city.x - viewer.x, y: city.y - viewer.y };
}

/** World-px offset for a tile delta (linear projection through the origin). */
export function universeOffsetPx(delta: Point): Point {
  return tileToScreen(delta.x, delta.y);
}

/**
 * The viewer's rank within a payload: exact when mapped, one past the last
 * mapped city otherwise (deterministic self-placement beyond the cap — the
 * only viewer-specific value, so CDN sharing is unaffected).
 */
export function universeViewerRank(
  payload: Pick<UniversePayload, "cities">,
  username: string
): number {
  const hit = payload.cities.findIndex((c) => c.username === username);
  return hit >= 0 ? payload.cities[hit].rank : payload.cities.length + 1;
}

/** Marker radius (world px) — log falloff so rank 1 reads biggest. */
export function universeMarkerRadius(rank: number, cap: number = UNIVERSE_CITY_CAP): number {
  const r = Math.max(1, Math.min(cap, rank));
  const t = Math.log10(r) / Math.log10(Math.max(10, cap)); // 0..1
  return 13 - 9.5 * t;
}

/**
 * Epoch identity: hash of the usernames in rank order. Orders that didn't
 * change produce the same epoch even when the snapshot refreshes, so glides
 * fire only on real re-ranks.
 */
export function universeEpochOf(
  cities: ReadonlyArray<Pick<UniverseCity, "username">>
): string {
  let h1 = 0x811c9dc5;
  for (const city of cities) {
    for (let i = 0; i < city.username.length; i++) {
      h1 ^= city.username.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    h1 ^= 0x2f;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return `${cities.length.toString(36)}-${h1.toString(36)}`;
}

// ── skyline assembly (U2 — pure; the route fetches, this maps) ────────────

/**
 * One building row of the world query as fetched for a set of ranked
 * owners: already windowed to the top UNIVERSE_SKYLINE_LIMIT per owner in
 * VALUE order (playerValue DESC, id ASC — the same ordering the home city
 * and satellite clusters use) and carrying the owner's total visible count.
 */
export interface UniverseBuildingRow {
  ownerId: number;
  profession: string | null;
  playerValue: number;
  valueFloor: number;
  /** The owner's TOTAL visible owned-building count (COUNT(*) OVER). */
  visibleCount: number;
}

/**
 * Attach skylines + visible counts to the ranked city list (pure, used by
 * /api/city/universe). Cities carry their DB id from the rank query (the
 * id is NOT part of the wire payload — the route strips it). Rows for
 * owners not in the city list are ignored; cities without rows keep
 * count 0 and no skyline (they render as relay-only minis).
 */
export function attachUniverseSkylines(
  cities: ReadonlyArray<UniverseCity & { id: number }>,
  rows: ReadonlyArray<UniverseBuildingRow>
): UniverseCity[] {
  const byOwner = new Map<
    number,
    { count: number; tuples: Array<[number, number]> }
  >();
  for (const r of rows) {
    let slot = byOwner.get(r.ownerId);
    if (!slot) {
      slot = { count: Math.max(0, r.visibleCount), tuples: [] };
      byOwner.set(r.ownerId, slot);
    }
    // Defensive clamp: a windowed row can exceed the limit only if the
    // route's SQL filter drifted — the payload stays bounded regardless.
    if (slot.tuples.length >= UNIVERSE_SKYLINE_LIMIT) continue;
    slot.tuples.push([
      buildingTier(r.playerValue, r.valueFloor),
      universeFamilyIndex(r.profession),
    ]);
  }
  return cities.map(({ id, ...city }) => {
    const slot = byOwner.get(id);
    if (!slot) return { ...city, count: 0 };
    return {
      ...city,
      count: slot.count,
      skyline: slot.tuples.length > 0 ? slot.tuples : undefined,
    };
  });
}
