/**
 * map2d LAYOUT — the deterministic 2D shared-world geometry
 * (CITY_2D_WORLD_STUDY.md §3, style A "Blueprint", 2026-10-01).
 *
 * Pure functions only (no DOM, no React, no DB) so every viewer derives the
 * IDENTICAL map from the same /api/city/world payload, and the whole thing is
 * unit-testable in the node vitest suite.
 *
 * CITY rule (user, verbatim intent): HQ core in the middle, the 6 Founder
 * landmarks around the core, owned buildings around them from most valuable
 * to cheapest GOING CLOCKWISE. Implemented as square rings: ring r holds 8r
 * cells, walked clockwise from 12 o'clock; buildings fill rings 3+ in the
 * order given (value desc — the server sorts; this module preserves order).
 *
 * WORLD rule: the player with the most buildings sits at the center of the
 * whole map; the other cities are placed around it with the same clockwise
 * logic (by building count desc). City plots walk each square ring clockwise
 * with spacing that guarantees no plot overlap.
 */

import { GODDESS_USERNAMES } from "@/lib/goddesses";


/** Cells of square ring r (r ≥ 1), CLOCKWISE starting at 12 o'clock. 8r cells. */
export function ringCellsClockwise(r: number): { x: number; y: number }[] {
  if (r <= 0) return [{ x: 0, y: 0 }];
  const cells: { x: number; y: number }[] = [];
  for (let x = -r; x < r; x++) cells.push({ x, y: -r }); // top, left→right
  for (let y = -r; y < r; y++) cells.push({ x: r, y }); // right, top→bottom
  for (let x = r; x > -r; x--) cells.push({ x, y: r }); // bottom, right→left
  for (let y = r; y > -r; y--) cells.push({ x: -r, y }); // left, bottom→top
  return cells;
}

/** The six Founder-landmark slots: a hexagon on square ring 2. */
export const LANDMARK_SLOTS: readonly { x: number; y: number }[] = [
  { x: 0, y: -2 },
  { x: 2, y: -1 },
  { x: 2, y: 1 },
  { x: 0, y: 2 },
  { x: -2, y: 1 },
  { x: -2, y: -1 },
];

/** HQ occupies the 3×3 core (rings 0–1). */
export const HQ_CORE_RADIUS = 1;

/**
 * Completed-album PROP cells (blueprint albums §5E; user ruling 2026-10-02:
 * props TAKE THE PLACES OF BUILDINGS — never overlaid on top). Each prop key
 * claims ONE fixed cell on ring 3 (the innermost, highest-value building
 * ring) at a compass point, so a completed album visibly costs land and the
 * same prop always rises at the same spot on every city. Cells are reserved
 * BEFORE the building walk — buildings fill around them and the overflow
 * pushes outward, exactly as if a building stood there.
 */
export const PROP_CELLS: Readonly<Record<string, { x: number; y: number }>> = {
  park: { x: 0, y: -3 }, // north mid — Central Park at the head of the city
  marquee: { x: 3, y: 0 }, // east mid — the Neon Marquee on main street
  rotunda: { x: 0, y: 3 }, // south mid — the City Rotunda at the gates
  crane: { x: -3, y: 0 }, // west mid — Crane Row on the works flank
  goldvault: { x: 3, y: -3 }, // NE corner — the vault flanked by park + marquee
};

/** Building families: 6 trades + "no trade" (index 6) — palette order. */
export const FAMILY_COUNT = 7;
export const NO_TRADE_FAMILY = 6;

/**
 * Canonicalize an owned-Founder list to the fixed GODDESS_USERNAMES order —
 * landmark hex slots are stable across payload regens only if the array
 * order is stable (review F1).
 */
export function canonicalLandmarks(owned: string[]): string[] {
  const set = new Set(owned);
  return GODDESS_USERNAMES.filter((n) => set.has(n));
}

/** Canonical goddess index (GODDESS_USERNAMES order) for a laid-out landmark
 *  slot — LandmarkPanel/selection speak canonical indices. −1 if unknown. */
export function landmarkCanonicalIndex(
  city: Pick<WorldCity, "landmarks">,
  slotIndex: number
): number {
  const name = city.landmarks[slotIndex];
  return name ? GODDESS_USERNAMES.indexOf(name) : -1;
}

/** Inverse: the laid-out slot holding canonical goddess index i (or null). */
export function landmarkSlotForCanonical(
  layout: CityLayout,
  city: Pick<WorldCity, "landmarks">,
  canonicalIndex: number
): { x: number; y: number; i: number } | null {
  const name = GODDESS_USERNAMES[canonicalIndex];
  const slotIndex = name ? city.landmarks.indexOf(name) : -1;
  if (slotIndex < 0) return null;
  return layout.landmarkSlots.find((s) => s.i === slotIndex) ?? null;
}

export type Protection = "hardlock" | "firewall" | null;

export interface WorldBuilding {
  /** Card id (hit-testing / inspector). */
  id: number;
  /** Card username (avatar fetch + inspector links). */
  u: string;
  /** Family index 0..6. */
  f: number;
  /** Visual tier 1..14 (server-computed via projection.buildingTier). */
  t: number;
  /** Protection visual (server-computed). */
  p: Protection;
}

export interface WorldCity {
  username: string;
  profession: string | null;
  ownedCount: number;
  hqStage: number;
  /** Owned Founder usernames (raw goddess usernames), any order. */
  landmarks: string[];
  /** ALL owned buildings, VALUE DESC (server-sorted; order = layout order). */
  buildings: WorldBuilding[];
  /**
   * Completed-album prop keys (ALBUMS order, from the server's completedProps
   * projection). Each claims a fixed ring-3 cell — see PROP_CELLS.
   */
  props?: readonly string[];
}

export interface CityCell extends WorldBuilding {
  x: number;
  y: number;
}

export interface PropCell {
  x: number;
  y: number;
  prop: string;
}

export interface CityLayout {
  /** Outer ring radius in cells (≥ HQ core). */
  radius: number;
  /** Placed landmark slots, index-aligned with city.landmarks. */
  landmarkSlots: { x: number; y: number; i: number }[];
  /** Claimed prop cells (displace buildings — user ruling 2026-10-02). */
  propCells: PropCell[];
  cells: CityCell[];
}

/** Plot padding around the outer ring (cells). */
export const PLOT_PAD_CELLS = 1.6;
/** Minimum gap between city plots on a world ring (cells). */
export const WORLD_PLOT_GAP = 2;

/**
 * Lay out ONE city. `buildings` must already be value-desc — the layout is a
 * pure function of the given order, so all viewers agree (the route sorts).
 */
export function layoutCity(city: WorldCity): CityLayout {
  const used = new Set<string>();
  for (let dx = -HQ_CORE_RADIUS; dx <= HQ_CORE_RADIUS; dx++) {
    for (let dy = -HQ_CORE_RADIUS; dy <= HQ_CORE_RADIUS; dy++) {
      used.add(`${dx},${dy}`);
    }
  }
  const landmarkSlots = city.landmarks.slice(0, 6).map((_, i) => ({
    ...LANDMARK_SLOTS[i],
    i,
  }));
  for (const s of landmarkSlots) used.add(`${s.x},${s.y}`);

  // Props claim their fixed ring-3 cells FIRST — the building walk then
  // treats them as occupied, so buildings fill around them and overflow
  // pushes outward (a prop costs exactly one building's place).
  const propCells: PropCell[] = [];
  const seenProps = new Set<string>();
  for (const prop of city.props ?? []) {
    const cell = PROP_CELLS[prop];
    const key = `${cell?.x},${cell?.y}`;
    if (!cell || seenProps.has(prop) || used.has(key)) continue;
    seenProps.add(prop);
    used.add(key);
    propCells.push({ ...cell, prop });
  }

  const cells: CityCell[] = [];
  let r = HQ_CORE_RADIUS + 2; // first building ring is 3 (moat ring 2 kept airy)
  for (const b of city.buildings) {
    // Advance rings only when the current one is FULL — the mockup bug
    // (one building per ring) must never come back (see study gotcha).
    for (;;) {
      let placedThisScan = false;
      for (const cell of ringCellsClockwise(r)) {
        const key = `${cell.x},${cell.y}`;
        if (!used.has(key)) {
          used.add(key);
          cells.push({ ...b, x: cell.x, y: cell.y });
          placedThisScan = true;
          break;
        }
      }
      if (placedThisScan) break;
      r++;
    }
  }
  return { radius: Math.max(HQ_CORE_RADIUS + 2, r), landmarkSlots, propCells, cells };
}

/** Plot half-size (cells) for a laid-out city. */
export function plotHalf(layout: CityLayout): number {
  return layout.radius + PLOT_PAD_CELLS;
}

export interface WorldPlot {
  username: string;
  /** Plot center in world cells. */
  cx: number;
  cy: number;
  half: number;
  layout: CityLayout;
  city: WorldCity;
}

/**
 * Lay out ALL cities on the shared map: biggest at the center, the rest
 * walking square rings clockwise in building-count order. Deterministic:
 * ties broken by username ascending.
 */
export function layoutWorld(cities: WorldCity[]): WorldPlot[] {
  const sorted = [...cities].sort((a, b) => {
    const d = b.buildings.length - a.buildings.length;
    if (d !== 0) return d;
    return a.username < b.username ? -1 : a.username > b.username ? 1 : 0;
  });
  if (sorted.length === 0) return [];

  const layouts = new Map<string, CityLayout>();
  for (const c of sorted) layouts.set(c.username, layoutCity(c));
  const halfOf = (c: WorldCity) => plotHalf(layouts.get(c.username)!);

  const plots: WorldPlot[] = [];
  const push = (c: WorldCity, cx: number, cy: number) =>
    plots.push({ username: c.username, cx, cy, half: halfOf(c), layout: layouts.get(c.username)!, city: c });

  // Center = the biggest city.
  const center = sorted[0];
  push(center, 0, 0);

  let idx = 1;
  while (idx < sorted.length) {
    const candidates = sorted.slice(idx);
    const maxHalf = Math.max(...candidates.map(halfOf));
    const innerExtent = Math.max(
      ...plots.map((p) => Math.max(Math.abs(p.cx), Math.abs(p.cy)) + p.half)
    );
    // Ring distance: every plot already placed fits inside; this ring's
    // biggest plot fits outside it. Corner exclusion (below) needs more
    // room than that, so grow the ring until each side can hold ≥1 slot.
    let ringDist = innerExtent + maxHalf + WORLD_PLOT_GAP;
    const exclusion = 2 * maxHalf; // keeps adjacent-side corner plots apart
    const sideLen = () => 2 * ringDist - 2 * exclusion;
    if (sideLen() < 2 * maxHalf + WORLD_PLOT_GAP) {
      ringDist = innerExtent + 3 * maxHalf + WORLD_PLOT_GAP;
    }

    // Four sides, clockwise: top (L→R), right (T→B), bottom (R→L), left
    // (B→T). Each side is an independent 1D packing with corner exclusion,
    // which provably keeps axis-aligned plots from overlapping (same side:
    // 1D separation; adjacent sides: exclusion ≥ hA + hB; opposite sides
    // and adjacent rings: radial separation ≥ half sums + gap).
    const sides: { fx: (t: number) => number; fy: (t: number) => number }[] = [
      { fx: (t) => -ringDist + exclusion + t, fy: () => -ringDist }, // top
      { fx: () => ringDist, fy: (t) => -ringDist + exclusion + t }, // right
      { fx: (t) => ringDist - exclusion - t, fy: () => ringDist }, // bottom
      { fx: () => -ringDist, fy: (t) => ringDist - exclusion - t }, // left
    ];

    let placedTotal = 0;
    for (const side of sides) {
      let cursor = 0; // distance along this side inside the exclusion zone
      while (idx < sorted.length) {
        const half = halfOf(sorted[idx]);
        const centerAt = cursor + half;
        if (centerAt + half + WORLD_PLOT_GAP > 2 * ringDist - 2 * exclusion) {
          break; // side full — next side (or next ring)
        }
        push(sorted[idx], side.fx(centerAt), side.fy(centerAt));
        cursor = centerAt + half + WORLD_PLOT_GAP;
        placedTotal++;
        idx++;
      }
    }
    if (placedTotal === 0 && idx < sorted.length) {
      // Degenerate safety (shouldn't be reachable) — force one plot further
      // out so the loop always makes progress.
      const half = halfOf(sorted[idx]);
      const far = ringDist + 3 * half + WORLD_PLOT_GAP;
      push(sorted[idx], far, -far);
      idx++;
    }
  }
  return plots;
}

/**
 * Point at clockwise arc-distance `d` from the TOP-CENTER of the square whose
 * chebyshev half is `half`. Path: top-center → right corner → bottom-right →
 * bottom-left → left corner → back to top-center (perimeter 8·half).
 */
export function pointAtPerimeterDistance(
  d: number,
  half: number
): { x: number; y: number } {
  const h = half;
  const per = 8 * h;
  const v = ((d % per) + per) % per;
  if (v <= h) return { x: v, y: -h }; // top-center → top-right corner
  if (v <= 3 * h) return { x: h, y: -h + (v - h) }; // right side ↓
  if (v <= 5 * h) return { x: h - (v - 3 * h), y: h }; // bottom side ←
  if (v <= 7 * h) return { x: -h, y: h - (v - 5 * h) }; // left side ↑
  return { x: -h + (v - 7 * h), y: -h }; // top-left corner → top-center
}
