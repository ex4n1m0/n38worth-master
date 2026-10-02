/**
 * map2d STREETS — "roads around every building" (user ruling, 2026-10-02
 * evening, CITY_ROADS_STUDY.md §3 NET-F + second reference image).
 *
 * Every occupied cell (building, album prop, Founder-landmark slot, and the
 * 3×3 HQ core as ONE superblock) is FRAMED by asphalt roads drawn on the
 * cell-boundary lattice: adjacent buildings SHARE a single road between them,
 * and each building's outer faces get a perimeter ring. Where neither side of
 * a boundary is built there is no road — "only where have buildings" holds by
 * construction, so empty moat arcs, empty outer rings, the field between
 * cities and zero-building cities derive no streets (the HQ block always
 * frames — it is the anchor building).
 *
 * Pure functions only (same contract as layout.ts): every viewer derives the
 * IDENTICAL street grid from the same /api/city/world payload, unit-testable
 * in the node vitest suite. The renderers (2D canvas + 3D merged slabs)
 * consume the same runs and must render them identically.
 */

import type { CityLayout } from "./layout";

/**
 * Road width in cell units = 1 − OBJECT_GAP_FACTOR (map2d/draw.ts): the frame
 * fills the existing visual alley between neighbor footprints EXACTLY, so no
 * footprint ever touches asphalt (the widest grand tier leaves 0.0875 of
 * half-gap vs a 0.075 road half-width). Changing OBJECT_GAP_FACTOR must
 * re-price this — keep them complementary.
 */
export const STREET_WIDTH = 0.15;

/**
 * Centerline markings (user asks 2026-10-03: "white line in the middle", then
 * "dashes too big — slim constant line", then "half the thickness"): ONE
 * solid slim white line along every run's centerline — shared constant so the
 * 2D strokes and the 3D paint strips render identically. Width is a fraction
 * of a CELL (1/12 of the street).
 */
export const STREET_MARK = { width: 0.0125 } as const;

/** One merged road run on a boundary line. `at` is the line coordinate in
 *  cell units (half-integers: the line between cells 3 and 4 sits at 3.5);
 *  `from`..`to` is the INCLUSIVE cell-index span the road covers along it. */
export interface StreetRun {
  at: number;
  from: number;
  to: number;
}

export interface StreetPlan {
  /** Vertical runs — road along a N-S boundary line at x = at. */
  v: StreetRun[];
  /** Horizontal runs — road along an E-W boundary line at y = at. */
  h: StreetRun[];
}

/**
 * Derive a city's street runs from its layout. Roads ride the boundary
 * between two cells iff AT LEAST ONE side is occupied — except the HQ core's
 * interior edges (the 3×3 core is one superblock, not nine framed cells).
 * Consecutive road cells on a line merge into maximal runs (a full boundary
 * between two built rings is 4 long rects, not 8r unit strips).
 */
export function planStreets(layout: CityLayout): StreetPlan {
  const occ = new Set<string>();
  for (const c of layout.cells) occ.add(`${c.x},${c.y}`);
  for (const p of layout.propCells) occ.add(`${p.x},${p.y}`);
  for (const s of layout.landmarkSlots) occ.add(`${s.x},${s.y}`);
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++) occ.add(`${x},${y}`);
  const isOcc = (x: number, y: number) => occ.has(`${x},${y}`);
  const inCore = (x: number, y: number) => Math.abs(x) <= 1 && Math.abs(y) <= 1;

  const R = layout.radius;
  const plan: StreetPlan = { v: [], h: [] };
  // Vertical boundary lines x = k + 0.5 for k in [-R-1, R]: ±(R+0.5) are the
  // outermost lines, so the perimeter ring of the outermost built ring lands.
  for (let k = -R - 1; k <= R; k++) {
    let run: StreetRun | null = null;
    for (let y = -R; y <= R; y++) {
      const road = (isOcc(k, y) || isOcc(k + 1, y)) && !(inCore(k, y) && inCore(k + 1, y));
      if (road) {
        if (!run) run = { at: k + 0.5, from: y, to: y };
        else run.to = y;
      } else if (run) {
        plan.v.push(run);
        run = null;
      }
    }
    if (run) plan.v.push(run);
  }
  for (let k = -R - 1; k <= R; k++) {
    let run: StreetRun | null = null;
    for (let x = -R; x <= R; x++) {
      const road = (isOcc(x, k) || isOcc(x, k + 1)) && !(inCore(x, k) && inCore(x, k + 1));
      if (road) {
        if (!run) run = { at: k + 0.5, from: x, to: x };
        else run.to = x;
      } else if (run) {
        plan.h.push(run);
        run = null;
      }
    }
    if (run) plan.h.push(run);
  }
  return plan;
}
