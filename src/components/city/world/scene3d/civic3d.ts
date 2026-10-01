/**
 * Mainframe City 3D — CIVIC LOT recipes (pure, node-safe).
 *
 * 2026-10-01 ("civic lots render in 3D"): the four civic landmarks
 * (Police/Fire/School/Hospital) were 2D-Pixi-only, leaving four HOLES in
 * the default Three.js renderer's first block row (their ring-4 diagonal
 * reservations block both buildings and streets). In 3D each civic lot now
 * renders a KENNEY kit building tinted in the kind's civic neon, scaled by
 * the civic tier (one tier for all four kinds — projection.civic.tier),
 * capped by an emissive civic beacon — same shape language as the Founder
 * monuments, one notch smaller. The 2D renderer keeps its own civic art.
 */

import { pickBuildingPrefab } from "./assets3d";
import { CIVIC_KINDS, type CivicKind } from "@/lib/city/types";

/** Civic accent colors — mirrors scene/civic.ts CIVIC_COLORS.neon. */
export const CIVIC_NEON: Record<CivicKind, string> = {
  police: "#60a5fa",
  fire: "#f97316",
  school: "#fbbf24",
  hospital: "#f87171",
};

/** Civic tint strength — stronger than monuments (0.55): the four civic
 *  buildings must read as COLORED landmarks at overview zoom, where the
 *  light kit colormap washes subtle tints to "salmon" (image-analyst QA,
 *  2026-10-01: 0.5/0.7 measured as one warm family; 0.85 + the gray
 *  premultiply in syncCivic separates the hues). */
export const CIVIC_TINT = 0.85;
/**
 * Deterministic kit prefab per kind (mid-league pool, fixed seed per kind
 * so the four civic buildings are always the same four models). Pinned by
 * tests: four DISTINCT prefabs from the shipped manifest.
 */
export function civicKitPrefab(kind: CivicKind): { kit: "commercial" | "industrial"; name: string } {
  const i = ((CIVIC_KINDS.indexOf(kind) % CIVIC_KINDS.length) + CIVIC_KINDS.length) % CIVIC_KINDS.length;
  const pick = pickBuildingPrefab(kind, 4, 911 + i * 17);
  return { kit: pick.kit === "industrial" ? "industrial" : "commercial", name: pick.name };
}

/** Civic tier → kit scale multiplier (monuments: 1.6/2.0/2.5). */
export function civicTierScale(tier: number): number {
  return tier >= 3 ? 2.0 : tier === 2 ? 1.7 : 1.45;
}
