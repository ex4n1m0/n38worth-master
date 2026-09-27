/**
 * Mainframe City — LOD bands + render budgets (pure, node-safe).
 *
 * Zoom band (camera.ts clamps to [0.5, 2.5]) maps to three LODs:
 *   close    zoom > 1.2  — full building detail (windows, identity markers)
 *   district 0.7 – 1.2   — silhouettes + status rings, grid lines visible
 *   world    zoom < 0.7  — massing only; the DOM a11y bridge shrinks too
 *
 * The a11y DOM bridge (BuildingMirrorList) must stay ≤ MIRROR_NODE_CEILING
 * nodes at ANY LOD (RTS plan §D9 budget); per-LOD budgets keep it tighter
 * when zoomed out so a world-overview never materialises a huge list.
 */

export type Lod = "close" | "district" | "world";

export const LOD_CLOSE: Lod = "close";
export const LOD_DISTRICT: Lod = "district";
export const LOD_WORLD: Lod = "world";

/** Hard ceiling for DOM-bridge nodes at any LOD (QA budget, §D9). */
export const MIRROR_NODE_CEILING = 1500;

/** Per-LOD node budgets for the DOM bridge (all ≤ MIRROR_NODE_CEILING). */
export const MIRROR_NODE_BUDGET: Record<Lod, number> = {
  close: 1500,
  district: 800,
  world: 400,
};

/** Per-LOD cap on aggregate skyline blocks rendered per family. */
export const AGGREGATE_BLOCK_BUDGET: Record<Lod, number> = {
  close: 24,
  district: 12,
  world: 6,
};

export function lodFor(zoom: number): Lod {
  if (zoom > 1.2) return LOD_CLOSE;
  if (zoom >= 0.7) return LOD_DISTRICT;
  return LOD_WORLD;
}

export function mirrorNodeBudget(lod: Lod): number {
  return Math.min(MIRROR_NODE_CEILING, MIRROR_NODE_BUDGET[lod]);
}

export function aggregateBlockBudget(lod: Lod): number {
  return AGGREGATE_BLOCK_BUDGET[lod];
}
