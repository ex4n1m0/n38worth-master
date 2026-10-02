/**
 * map3d METRICS — pure sizing/palette helpers for the 3D world renderer
 * (2026-10-02, "free camera rotations" ruling). No three.js, no DOM — so the
 * volumetric language (how tall/wide each tier is, per family) is unit-testable
 * and shared by nothing else: the 3D view interprets the CARD ART's massing
 * (building-art.ts PV_SPEC ladder) as real volumes in the family palettes.
 *
 * Cell units match map2d/layout coordinates: 1 cell = 1 world unit.
 */

import {
  FAMILY_MASS_HEX,
  FAMILY_NEON_HEX,
  UNASSIGNED_MASS_HEX,
  UNASSIGNED_NEON_HEX,
} from "@/lib/city/district";
import { FAMILY_KEYS } from "@/lib/city/map2d/families";
import { tierScale } from "@/lib/city/map2d/draw";

/**
 * Tower height in cells, tier 1..14. Calibrated to the card art's artH/w
 * ladder (civic baseH≈26..36 → grand 100..130 + 6 floors): t1 reads as a
 * low pavilion, t7 a mid tower, t8+ the grand league, t14 a megaform.
 */
export function tierHeightCells(tier: number): number {
  const t = Math.max(1, Math.min(14, tier));
  return 0.38 + 1.95 * Math.pow((t - 1) / 13, 1.15);
}

/** Footprint width in cells (mirrors the iso view's tower width ladder). */
export function tierWidthCells(tier: number): number {
  const t = Math.max(1, Math.min(14, tier));
  return Math.max(0.45, tierScale(t) * 1.2);
}

export interface FamilyPalette3D {
  mass: string;
  neon: string;
}

/** Family MASS/NEON pair by family index 0..6 (DB names via FAMILY_KEYS). */
export function familyPalette3D(f: number): FamilyPalette3D {
  const key = f >= 0 && f < FAMILY_KEYS.length ? FAMILY_KEYS[f] : null;
  if (key && FAMILY_MASS_HEX[key]) {
    return { mass: FAMILY_MASS_HEX[key], neon: FAMILY_NEON_HEX[key] ?? UNASSIGNED_NEON_HEX };
  }
  return { mass: UNASSIGNED_MASS_HEX, neon: UNASSIGNED_NEON_HEX };
}

/** Grand league starts at tier 8 (mirrors building-art.ts GRAND_MIN_TIER). */
export const GRAND_MIN_TIER_3D = 8;

/** Seeded lightness jitter (±4%) so same-family towers don't look cloned. */
export function familyJitter(seed: number): number {
  let s = seed | 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return 0.96 + r * 0.08;
}
