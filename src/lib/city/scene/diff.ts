/**
 * Mainframe City — projection diff (pure, node-safe).
 *
 * Compares the previous and next sets of detailed buildings (by cardId) and
 * emits the scene events the FX layer consumes:
 *   - entered  → construct FX (a hire landed via Pusher invalidation)
 *   - exited   → loss FX (poach / discard / combo sale removed the card)
 *   - tierUp   → tier-up pulse (e.g. the owner overclocked the card)
 *   - moved    → placement changed → depth sort + occupancy refresh
 *   - protectionChanged → swap the status ring
 *
 * The FIRST sync (prev = null) reports everything as `entered` with
 * `seeded: true` so the scene can skip boot animations (same policy as
 * CityGrid's construct-ref seeding).
 */

import type { CityBuilding, BuildingTier } from "../types";

export interface TierChange {
  cardId: number;
  fromTier: BuildingTier;
  toTier: BuildingTier;
  building: CityBuilding;
}

export interface CitySceneDiff {
  /** First-ever sync (no boot animations). */
  seeded: boolean;
  entered: CityBuilding[];
  exited: CityBuilding[];
  tierUp: TierChange[];
  moved: CityBuilding[];
  protectionChanged: CityBuilding[];
}

function sameTile(
  a: CityBuilding["placement"],
  b: CityBuilding["placement"]
): boolean {
  if ((a == null) !== (b == null)) return false;
  if (a == null || b == null) return true;
  return a.sector === b.sector && a.x === b.x && a.y === b.y;
}

export function diffBuildings(
  prev: readonly CityBuilding[] | null,
  next: readonly CityBuilding[]
): CitySceneDiff {
  const nextMap = new Map<number, CityBuilding>();
  for (const b of next) nextMap.set(b.cardId, b);

  if (prev === null) {
    return {
      seeded: true,
      entered: [...next],
      exited: [],
      tierUp: [],
      moved: [],
      protectionChanged: [],
    };
  }

  const prevMap = new Map<number, CityBuilding>();
  for (const b of prev) prevMap.set(b.cardId, b);

  const entered: CityBuilding[] = [];
  const tierUp: TierChange[] = [];
  const moved: CityBuilding[] = [];
  const protectionChanged: CityBuilding[] = [];

  for (const b of next) {
    const before = prevMap.get(b.cardId);
    if (!before) {
      entered.push(b);
      continue;
    }
    if (b.tier > before.tier) {
      tierUp.push({ cardId: b.cardId, fromTier: before.tier, toTier: b.tier, building: b });
    }
    if (!sameTile(before.placement ?? null, b.placement ?? null)) {
      moved.push(b);
    }
    if (before.protection !== b.protection) {
      protectionChanged.push(b);
    }
  }

  const exited: CityBuilding[] = [];
  for (const b of prev) {
    if (!nextMap.has(b.cardId)) exited.push(b);
  }

  return { seeded: false, entered, exited, tierUp, moved, protectionChanged };
}
