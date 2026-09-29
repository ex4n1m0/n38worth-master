/**
 * Mainframe City — satellite-city assembler (pure, node-safe).
 *
 * A "satellite city" is an owned card that itself owns visible cards: the
 * home-city orbit already renders that card as a building, and its own
 * holdings render as a small FOREIGN cluster far outside the macro grid
 * (scene geometry in satellites.ts). Buildings inside a satellite are
 * ordinary cards owned by the NEIGHBOR — the city owner can steal (hire)
 * them through the existing /api/game/purchase flow; every economy guard
 * (credits, slots, firewalls, mission locks) stays server-side.
 *
 * This module only shapes + bounds data fetched by the public city route:
 * caps, goddess exclusion (goddesses are landmarks, never buildings —
 * neither as satellite owners nor as satellite buildings), tier/protection
 * derivation (same helpers as the home orbit), and the co-ownership flag
 * that hides the steal action client-side.
 */

import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { buildingTier, heroStageOf, protectionState } from "./projection";
import type { CityNeighbor, CityNeighborBuilding } from "./types";

/** Max satellite cities per projection (octant anchor slots, satellites.ts). */
export const NEIGHBOR_CITY_LIMIT = 8;

/**
 * Max detailed buildings per satellite cluster (render budget). 24 since
 * the 2026-09-29 "their cities don't render all buildings" ruling — the
 * mini-city airy orbit (satelliteClusterTiles radius 7) holds 44
 * breathing-room slots, so the full budget still renders SPACED; beyond
 * it the cluster shows the "+N more" plate (bounded rendering stays).
 */
export const NEIGHBOR_BUILDING_LIMIT = 24;

/** A home-city detailed card eligible to become a satellite owner. */
export interface NeighborCandidate {
  cardId: number;
  username: string;
  profession: string | null;
  isNpc: number;
  /** The candidate's own player_value (drives its HQ relay's hero stage). */
  playerValue: number;
}

/** One ownership row of a candidate (the neighbor's owned card), SQL-shaped. */
export interface NeighborOwnedRow {
  ownerId: number;
  cardId: number;
  username: string;
  profession: string | null;
  playerValue: number;
  valueFloor: number;
  isNpc: number;
  blockSellUntil: Date | null;
  permBlockUntil: Date | null;
  /** SQL EXISTS: the CITY OWNER also holds this card (co-ownership). */
  ownedByCityOwner: boolean;
}

/** One goddess-ownership row of a candidate (username ∈ GODDESS_USERNAMES). */
export interface NeighborGoddessRow {
  ownerId: number;
  username: string;
}

/**
 * Assemble the bounded satellite list. `candidates` MUST arrive in the
 * projection's canonical order (value desc, cardId asc — the route passes
 * the detailed rows in fetch order); the first NEIGHBOR_CITY_LIMIT
 * goddess-free candidates with ≥1 visible owned card win. `rows` may arrive
 * in any order (defensive re-sort). The city owner's own card never renders
 * inside a satellite (it is the HQ of the home city already). `goddessRows`
 * (optional — empty means "owns none") lights the satellite's mini monument
 * ring: same six places as the home city, owned flags per neighbor.
 */
export function assembleCityNeighbors(
  candidates: readonly NeighborCandidate[],
  visibleOwnedCounts: ReadonlyMap<number, number>,
  rows: readonly NeighborOwnedRow[],
  cityOwnerUsername: string,
  now: Date,
  goddessRows: readonly NeighborGoddessRow[] = [],
  gameMaxValue = 0
): CityNeighbor[] {
  const goddessSet = new Set(GODDESS_USERNAMES);

  const goddessesByOwner = new Map<number, Set<string>>();
  for (const row of goddessRows) {
    if (!goddessSet.has(row.username)) continue;
    const set = goddessesByOwner.get(row.ownerId);
    if (set) set.add(row.username);
    else goddessesByOwner.set(row.ownerId, new Set([row.username]));
  }

  const chosen = candidates
    .filter(
      (c) => !goddessSet.has(c.username) && (visibleOwnedCounts.get(c.cardId) ?? 0) >= 1
    )
    .slice(0, NEIGHBOR_CITY_LIMIT);
  if (chosen.length === 0) return [];

  const rowsByOwner = new Map<number, NeighborOwnedRow[]>();
  for (const row of rows) {
    // Goddess buildings never render (landmark invariant); the city owner
    // never renders inside a satellite (they are the home HQ).
    if (goddessSet.has(row.username) || row.username === cityOwnerUsername) continue;
    const list = rowsByOwner.get(row.ownerId);
    if (list) list.push(row);
    else rowsByOwner.set(row.ownerId, [row]);
  }

  const neighbors: CityNeighbor[] = [];
  for (const candidate of chosen) {
    const owned = (rowsByOwner.get(candidate.cardId) ?? [])
      .slice()
      .sort((a, b) => b.playerValue - a.playerValue || a.cardId - b.cardId)
      .slice(0, NEIGHBOR_BUILDING_LIMIT);
    if (owned.length === 0) continue;

    const buildings: CityNeighborBuilding[] = owned.map((row) => ({
      cardId: row.cardId,
      username: row.username,
      profession: row.profession,
      isNpc: row.isNpc,
      tier: buildingTier(row.playerValue, row.valueFloor),
      value: row.playerValue,
      protection: protectionState(
        {
          blockSellUntil: row.blockSellUntil ? row.blockSellUntil.toISOString() : null,
          permBlockUntil: row.permBlockUntil ? row.permBlockUntil.toISOString() : null,
        },
        now
      ),
      ownedByCityOwner: row.ownedByCityOwner,
    }));

    const visibleOwnedCount = visibleOwnedCounts.get(candidate.cardId) ?? buildings.length;
    const ownedGods = goddessesByOwner.get(candidate.cardId);
    neighbors.push({
      cardId: candidate.cardId,
      username: candidate.username,
      profession: candidate.profession,
      isNpc: candidate.isNpc,
      visibleOwnedCount,
      buildings,
      truncated: visibleOwnedCount > buildings.length,
      goddessOwned: GODDESS_USERNAMES.map((name) => ownedGods?.has(name) === true),
      hqStage: heroStageOf(candidate.playerValue, gameMaxValue),
    });
  }
  return neighbors;
}
