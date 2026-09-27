/**
 * Mainframe City — layout patch validation (MAINFRAME_CITY_RTS_PLAN §D5/§D8).
 *
 * Pure, node-safe constants + zod schema for POST /api/city/layout. No DB
 * imports: the route does the DB work, this file only guarantees that whatever
 * reaches the DB is shape-safe (TH-04 adversarial-payload boundary).
 *
 * Sector whitelist derives from the mission ladder (MISSIONS.length missions
 * → s0 "Boot" + one sector per mission = s0..s8 today). Unlock authority
 * stays in projection.sectorsUnlocked — never forked here.
 */

import { z } from "zod";
import { MISSIONS } from "@/lib/missions-data";
import type { CityPlacement } from "./types";

/** City grid is GRID_SIZE × GRID_SIZE tiles; legal coords are 0..GRID_SIZE-1. */
export const GRID_SIZE = 32;
export const MAX_COORD = GRID_SIZE - 1;

/** Sector keys "s0".."sN" where N = MISSIONS.length (Boot + one per mission). */
export const SECTOR_KEYS: [string, ...string[]] = Array.from(
  { length: MISSIONS.length + 1 },
  (_, i) => `s${i}`
) as [string, ...string[]];

/** Max placements per batched POST (resolved-conflicts ruling #2: 32). */
export const MAX_BATCH = 32;

/** Legal quarter-turn rotations. */
export const ROTATIONS = [0, 1, 2, 3] as const;
/** Legal visual variants. */
export const VARIANTS = [0, 1, 2, 3] as const;

/** Postgres INTEGER bound — cardId/baseVersion feed INTEGER columns/params. */
const MAX_INT = 2_147_483_647;

const placementSchema = z
  .strictObject({
    cardId: z.number().int().min(1).max(MAX_INT),
    sector: z.enum(SECTOR_KEYS),
    x: z.number().int().min(0).max(MAX_COORD),
    y: z.number().int().min(0).max(MAX_COORD),
    rotation: z.number().int().min(0).max(3).default(0),
    variant: z.number().int().min(0).max(3).default(0),
  })
  .describe("one building placement");

/**
 * POST /api/city/layout body. `placements` and `removedCardIds` must be
 * disjoint, with no duplicate cardIds and no duplicate (sector,x,y) tiles —
 * enforced in superRefine so adversarial payloads get ONE 400, not a partial
 * write.
 */
export const layoutPatchSchema = z
  .strictObject({
    baseVersion: z.number().int().min(0).max(MAX_INT),
    placements: z.array(placementSchema).min(1).max(MAX_BATCH),
    removedCardIds: z.array(z.number().int().min(1).max(MAX_INT)).max(MAX_BATCH).optional(),
  })
  .superRefine((value, ctx) => {
    const placedCards = new Set<number>();
    const tiles = new Set<string>();
    for (const p of value.placements) {
      if (placedCards.has(p.cardId)) {
        ctx.addIssue({
          code: "custom",
          path: ["placements"],
          message: "Duplicate cardId in placements",
        });
      }
      placedCards.add(p.cardId);
      const tile = `${p.sector}:${p.x}:${p.y}`;
      if (tiles.has(tile)) {
        ctx.addIssue({
          code: "custom",
          path: ["placements"],
          message: "Duplicate tile in placements",
        });
      }
      tiles.add(tile);
    }
    const removed = value.removedCardIds ?? [];
    const seenRemoved = new Set<number>();
    for (const id of removed) {
      if (seenRemoved.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["removedCardIds"],
          message: "Duplicate cardId in removedCardIds",
        });
      }
      seenRemoved.add(id);
      if (placedCards.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["removedCardIds"],
          message: "cardId appears in both placements and removedCardIds",
        });
      }
    }
  });

/** Validated POST body (rotation/variant defaulted to 0). */
export type LayoutPatch = z.infer<typeof layoutPatchSchema>;

/**
 * Re-validation helper (defense in depth + tests): returns an English reason
 * when the placement is invalid for the given unlocked-sector count, or null
 * when it is safe to persist. Post-zod only the "Sector not unlocked" branch
 * can fire (shape is already guaranteed); the route still runs every branch.
 */
export function invalidReason(
  placement: {
    sector: unknown;
    x: unknown;
    y: unknown;
    rotation?: unknown;
    variant?: unknown;
  },
  sectorsUnlockedCount: number
): string | null {
  const { sector, x, y } = placement;
  if (typeof sector !== "string") return "Invalid sector";
  const index = SECTOR_KEYS.indexOf(sector);
  if (index === -1) return "Unknown sector";
  if (index >= sectorsUnlockedCount) return "Sector not unlocked";
  for (const [name, v, max] of [
    ["x", x, MAX_COORD],
    ["y", y, MAX_COORD],
  ] as const) {
    if (typeof v !== "number" || !Number.isInteger(v)) return `Invalid ${name}`;
    if (v < 0 || v > max) return `${name} out of range`;
  }
  const rotation = placement.rotation ?? 0;
  if (typeof rotation !== "number" || !(ROTATIONS as readonly number[]).includes(rotation)) {
    return "Invalid rotation";
  }
  const variant = placement.variant ?? 0;
  if (typeof variant !== "number" || !(VARIANTS as readonly number[]).includes(variant)) {
    return "Invalid variant";
  }
  return null;
}

/** Tile identity used by the merge safety net (§D7 collision demotion). */
export function tileKey(placement: CityPlacement): string {
  return `${placement.sector}:${placement.x}:${placement.y}`;
}
