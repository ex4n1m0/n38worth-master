/**
 * Mainframe City — profession-district derivation (pure, node-safe).
 *
 * DISTRICT COMPLETION IS DERIVED, NEVER FORKED: "families present" is exactly
 * "professions owned" from the city projection (src/lib/city/projection.ts),
 * and "all six present = district complete" mirrors the existing six-
 * profession combo state — the combo ELIGIBILITY/SALE/PAYOUT logic itself
 * stays entirely in the existing combo module (ComboDock +
 * useProfessionComboSelection, server-authoritative). This file only answers
 * "which profession families does this projection contain?" so the renderer
 * can draw links and the DOM panel can list presence.
 */

import { PROFESSIONS } from "@/lib/professions";
import { UNASSIGNED_FAMILY } from "./types";

/**
 * Family accent palette as CSS hex strings — the single source shared by the
 * DOM district panel AND the Pixi art module (art.ts converts to 0xRRGGBB),
 * so the shell never imports pixi.js just for colors.
 *
 * HUE SPREAD (visual-gate fix): roster-NEIGHBOUR families must differ strongly
 * in hue — the old violet/salmon/fuchsia lead (Cryptographer, Zero-Day,
 * Overclocker) read as one purple-pink cluster at distance. Current hues, in
 * roster order: violet 258° → red 2° → lime 90° → emerald 152° → sky 199° →
 * amber 43° — every roster-adjacent gap ≥ 47°, and the former purple cluster
 * is now violet/red/lime. Shape stays the PRIMARY differentiator (families
 * must be told apart in grayscale); hue only reinforces it. Deliberately
 * avoids the protection-ring colors (firewall cyan #22d3ee, hard-lock amber
 * is closest to Bot Herder but amber never carries a protection ring).
 */
export const FAMILY_HEX: Readonly<Record<string, string>> = Object.freeze({
  Cryptographer: "#a78bfa",
  "Zero-Day": "#ef4444",
  Overclocker: "#a3e635",
  "Cache Keeper": "#34d399",
  "Server Marshal": "#38bdf8",
  "Bot Herder": "#fbbf24",
});

/** Neutral accent for profession-less (unassigned) buildings. */
export const UNASSIGNED_HEX = "#9ca3af";

export function familyHex(profession: string | null): string {
  if (!profession || profession === UNASSIGNED_FAMILY) return UNASSIGNED_HEX;
  return FAMILY_HEX[profession] ?? UNASSIGNED_HEX;
}

/** Roster order (PROFESSIONS) as the stable district display order. */
export const DISTRICT_PROFESSIONS: readonly string[] = PROFESSIONS.map(
  (p) => p.name
);

/** Minimal family shape districtsFromFamilies needs (CityFamily satisfies it). */
export interface DistrictFamilyInput {
  /** DB profession name, or UNASSIGNED_FAMILY. */
  profession: string;
  /** Total owned cards in the family (visible basis, server-computed). */
  total: number;
}

export interface DistrictPresence {
  /** Owned professions, roster order (never includes unassigned). */
  present: string[];
  /** Roster professions with zero owned cards, roster order. */
  missing: string[];
  /** True when all six professions are owned (= combo-eligible district). */
  complete: boolean;
}

/**
 * Families -> present professions -> complete flag. A family counts as
 * present only when it has at least one owned card (total > 0); unknown
 * profession strings and UNASSIGNED_FAMILY never count toward completion.
 */
export function districtsFromFamilies(
  families: readonly DistrictFamilyInput[]
): DistrictPresence {
  const owned = new Set(
    families.filter((f) => f.total > 0).map((f) => f.profession)
  );
  const present: string[] = [];
  const missing: string[] = [];
  for (const name of DISTRICT_PROFESSIONS) {
    if (owned.has(name)) present.push(name);
    else missing.push(name);
  }
  return { present, missing, complete: missing.length === 0 };
}

/** Minimal building shape the representative picker needs. */
export interface DistrictBuildingInput {
  cardId: number;
  value: number;
}

export interface DistrictRepresentative {
  profession: string;
  cardId: number;
}

/** Minimal family shape districtRepresentatives needs (CityFamily satisfies it). */
export interface DistrictRepFamilyInput {
  profession: string;
  buildings: readonly DistrictBuildingInput[];
}

/**
 * One representative building per owned profession — the link endpoints for
 * the district visualization. The representative is the family's HIGHEST-
 * VALUE detailed building (value desc, cardId asc — the projection's own
 * stable order), so links always anchor on the family's flagship. Only
 * families with at least one DETAILED building contribute (aggregated-only
 * families have no tile to anchor on; their presence still shows in the
 * panel via districtsFromFamilies).
 */
export function districtRepresentatives(
  families: readonly DistrictRepFamilyInput[]
): DistrictRepresentative[] {
  const out: DistrictRepresentative[] = [];
  for (const name of DISTRICT_PROFESSIONS) {
    const family = families.find((f) => f.profession === name);
    if (!family || family.buildings.length === 0) continue;
    let best = family.buildings[0];
    for (const b of family.buildings) {
      if (b.value > best.value || (b.value === best.value && b.cardId < best.cardId)) {
        best = b;
      }
    }
    out.push({ profession: name, cardId: best.cardId });
  }
  return out;
}
