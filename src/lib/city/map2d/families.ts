import { PROFESSIONS } from "@/lib/professions";

/**
 * Building-family indexing for the 2D world payload (2026-10-01).
 *
 * Family index = position in PROFESSIONS order (0..5), 6 = "no trade" —
 * identical to the retired UNIVERSE_FAMILIES mapping, which itself mirrored
 * DISTRICT_PROFESSIONS = PROFESSIONS.map(p => p.name). Palette order in
 * map2d/palette.ts MUST stay in lockstep with this index.
 */
export const FAMILY_KEYS: readonly string[] = PROFESSIONS.map((p) => p.name);
export const UNASSIGNED_FAMILY_INDEX = FAMILY_KEYS.length; // 6

/** Payload family index of a DB profession (unknown/missing → unassigned). */
export function familyIndex(profession: string | null): number {
  if (!profession) return UNASSIGNED_FAMILY_INDEX;
  const idx = FAMILY_KEYS.indexOf(profession);
  return idx >= 0 ? idx : UNASSIGNED_FAMILY_INDEX;
}
