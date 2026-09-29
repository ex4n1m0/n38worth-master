/**
 * Mainframe City — STREET GRID derivation (pure, node-safe, no Pixi).
 *
 * 2026-09-29 evening user ruling ("redo the spacing so it is just enough to
 * design roads; make roads appear between buildings so the city looks like
 * an actual city"): with the stride-2 orbit (rings.ts) every building sits
 * exactly ONE tile from every neighbour, and this module paves exactly
 * those gap tiles. The result is a proper street grid:
 *   - the skipped ODD rings become concentric ring BOULEVARDS,
 *   - the checkerboard gaps along a ring become the cross-streets/alleys
 *     that connect boulevards between two same-ring buildings.
 *
 * ORGANIC GROWTH: a tile is paved only when a BUILDING (or civic
 * landmark) stands within Chebyshev 1 — streets never sprawl into empty
 * ground, they appear between actual buildings and link up as the city
 * fills its rings. Blocked tiles (HQ plaza, monument moat, reserved civic
 * lots before they unlock) are never paved.
 *
 * PURE DECORATION: streets carry no gameplay — no cost, no routing, no
 * placement effect (AGENTS.md "no roads economy"; visual-only allowance).
 * Deterministic: same building set → same street set.
 */

export interface StreetTile {
  gx: number;
  gy: number;
  /**
   * Travel read for the lane markings: "x" / "y" = the tile-space axis the
   * street continues on (screen diagonals), "cross" = intersection (both
   * axes — plain asphalt, no dash), "stub" = dead-end pad (building face).
   */
  axis: "x" | "y" | "cross" | "stub";
  /** Streetlamp anchor (deterministic subset + every intersection). */
  lamp: boolean;
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Derive the street tiles around a set of building/civic tiles (GLOBAL tile
 * coords for the home city, anchor-relative coords for the mini cities —
 * the math is translation-invariant). `isBlocked` excludes tiles the street
 * pass must never pave (HQ/landmark reservations, monument moat, locked
 * civic lots). Bounded: every output tile is within Chebyshev 1 of an input
 * building, so ≤ 8 × buildings tiles total.
 */
export function deriveStreets(
  buildingTiles: ReadonlyArray<{ gx: number; gy: number }>,
  isBlocked: (gx: number, gy: number) => boolean = () => false
): StreetTile[] {
  const occupied = new Set<string>();
  for (const b of buildingTiles) occupied.add(`${b.gx},${b.gy}`);

  const candidates = new Map<string, { gx: number; gy: number }>();
  for (const b of buildingTiles) {
    for (const [dx, dy] of NEIGHBORS) {
      const gx = b.gx + dx;
      const gy = b.gy + dy;
      const key = `${gx},${gy}`;
      if (occupied.has(key) || candidates.has(key)) continue;
      if (isBlocked(gx, gy)) continue;
      candidates.set(key, { gx, gy });
    }
  }

  const isPavedOrBuilding = (gx: number, gy: number) =>
    occupied.has(`${gx},${gy}`) || candidates.has(`${gx},${gy}`);

  const out: StreetTile[] = [];
  for (const { gx, gy } of candidates.values()) {
    const alongX =
      isPavedOrBuilding(gx + 1, gy) || isPavedOrBuilding(gx - 1, gy);
    const alongY =
      isPavedOrBuilding(gx, gy + 1) || isPavedOrBuilding(gx, gy - 1);
    const axis: StreetTile["axis"] =
      alongX && alongY ? "cross" : alongX ? "x" : alongY ? "y" : "stub";
    out.push({ gx, gy, axis, lamp: axis === "cross" || (gx + gy) % 3 === 0 });
  }
  // Deterministic order (candidates is insertion-ordered by building walk;
  // sort anyway so callers and tests can pin it).
  out.sort((a, b) => a.gy - b.gy || a.gx - b.gx);
  return out;
}
