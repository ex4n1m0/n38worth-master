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
 * enough out to clear the satellite anchor ring entirely.
 */

import { ringTiles } from "./rings";
import { tileToScreen, type Point } from "./scene/iso";

/**
 * Radius (tiles) of the innermost universe ring. Must clear the satellite
 * anchor zone around the viewer's city: the largest satellite ring sits at
 * unlocked-extent + margin (≤ macro half-extent 50 + 6) plus a cluster's
 * outer rim (~5 tiles, 0.55-scaled) ≈ 61 tiles — 72 leaves a real void,
 * then the universe.
 */
export const UNIVERSE_BASE_RING = 72;

/**
 * Slot stride AND ring-to-ring spacing (tiles). A rendered mini city spans
 * ~7 tiles at internal scale ×0.55 ≈ 3.9 visual tiles, so 12 keeps a clear
 * gap between neighbouring cities while keeping the universe dense.
 */
export const UNIVERSE_RING_STEP = 12;

/** Max cities on the map (payload + placement cap; render budget). */
export const UNIVERSE_CITY_CAP = 500;

/** One city on the shared map (tiny summary — building lists never travel). */
export interface UniverseCity {
  /** 1-based portfolio rank (1 = the universe center). */
  rank: number;
  username: string;
  profession: string | null;
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

/** Chebyshev radius of ring `m` (1-based). */
export function universeRingRadius(m: number): number {
  return UNIVERSE_BASE_RING + UNIVERSE_RING_STEP * (m - 1);
}

/** How many city slots fit on ring `m` (one slot per RING_STEP walk tiles). */
export function universeRingCapacity(m: number): number {
  return Math.floor((8 * universeRingRadius(m)) / UNIVERSE_RING_STEP);
}

/** Cumulative slot count through ring `m`. */
export function universeCumulativeCapacity(m: number): number {
  let total = 0;
  for (let i = 1; i <= m; i++) total += universeRingCapacity(i);
  return total;
}

/**
 * Ring number (1-based) that hosts the city with ring index `k` (0-based,
 * i.e. rank − 2). Grows ~linearly in capacity per ring, so the mapping is
 * dense: no half-empty inner rings.
 */
export function universeRingOfIndex(k: number): number {
  let m = 1;
  while (universeCumulativeCapacity(m) <= k) m++;
  return m;
}

/**
 * UNIVERSE anchor of the city with `rank` (1-based), in tiles around the
 * universe center. Rank 1 sits at the exact center; rank R ≥ 2 walks the
 * clockwise ring slots (screen-north start — the rings.ts rule). Pure and
 * deterministic: same rank → same tile, always.
 */
export function universeCityAnchor(rank: number): Point {
  if (rank <= 1) return { x: 0, y: 0 };
  const k = rank - 2;
  const m = universeRingOfIndex(k);
  const within = k - universeCumulativeCapacity(m - 1);
  const radius = universeRingRadius(m);
  const walk = ringTiles(0, 0, radius);
  const slot = walk[(within * UNIVERSE_RING_STEP) % walk.length];
  return { x: slot.gx, y: slot.gy };
}

/**
 * Tile offset of the city with `cityRank` relative to the VIEWER's city
 * (viewerRank). The viewer's own city always renders at their world origin,
 * so every other city is placed at this delta — the constellation is
 * identical for everyone, only translated.
 */
export function universeCityOffset(cityRank: number, viewerRank: number): Point {
  const city = universeCityAnchor(cityRank);
  const viewer = universeCityAnchor(viewerRank);
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
