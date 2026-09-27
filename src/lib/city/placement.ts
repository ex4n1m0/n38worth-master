/**
 * Mainframe City — client-side PLACEMENT PREVIEW helpers (pure, node-safe).
 *
 * ⚠ PREVIEW-ONLY: everything here is a UX affordance for the ghost tile and
 * the build HUD. The SERVER re-validates every placement in POST
 * /api/city/layout (shape → ownership → sector unlock → collision → CAS
 * version, §D5) — nothing here is authoritative and no economy state is
 * touched. Bounds come from the shared layout schema (GRID_SIZE /
 * SECTOR_KEYS owned by layout-schema.ts); the sector-unlock count arrives
 * from the payload (owner.sectorsUnlocked), never recomputed.
 *
 * Also hosts the deterministic VISUAL auto-arrangement: unplaced buildings
 * (no city_layout row — D7 "hire → no row") get stable tiles per family so
 * the world looks populated before the owner arranges anything. This is a
 * display concern only; it never writes anywhere.
 */

import { GRID_SIZE, SECTOR_KEYS } from "@/lib/city/layout-schema";
import { PROFESSIONS } from "@/lib/professions";
import { UNASSIGNED_FAMILY } from "./types";

/** A tile address in the city (sector key + local x/y). */
export interface TileRef {
  sector: string;
  x: number;
  y: number;
}

/** Why a preview placement is invalid (mirrors the server's 4xx reasons). */
export type PlacementIssue = "occupied" | "sector-locked" | "out-of-bounds" | "reserved";

const orderCache = new Map<number, Array<{ x: number; y: number }>>();

/**
 * Deterministic fill order inside one sector: tiles sorted by distance from
 * the sector center (ties: row-major), so auto-placed buildings cluster
 * around the middle instead of hugging one corner. Cached per grid size.
 */
export function tileFillOrder(gridSize: number): ReadonlyArray<{ x: number; y: number }> {
  let order = orderCache.get(gridSize);
  if (!order) {
    const mid = (gridSize - 1) / 2;
    order = [];
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        order.push({ x, y });
      }
    }
    order.sort(
      (a, b) =>
        // Squared distance from center, row-major tie-break — stable.
        (a.x - mid) ** 2 + (a.y - mid) ** 2 - ((b.x - mid) ** 2 + (b.y - mid) ** 2) ||
        a.y - b.y ||
        a.x - b.x
    );
    orderCache.set(gridSize, order);
  }
  return order;
}

/** String identity of a tile (same format as layout-schema.tileKey). */
export function tileRefKey(tile: TileRef): string {
  return `${tile.sector}:${tile.x}:${tile.y}`;
}

/** Sector key for a sector index ("s3"), or null outside the whitelist. */
export function sectorKeyFor(index: number): string | null {
  return index >= 0 && index < SECTOR_KEYS.length ? SECTOR_KEYS[index] : null;
}

/**
 * Visual district for a profession family: profession ordinal (PROFESSIONS
 * order) mod unlocked-sector count; profession-less cards stay in Boot (s0).
 * Display-only mapping — sector UNLOCK authority is the mission ladder.
 */
export function familySector(
  profession: string | null,
  sectorCount: number
): number {
  const count = Math.max(1, Math.min(SECTOR_KEYS.length, sectorCount));
  if (!profession || profession === UNASSIGNED_FAMILY) return 0;
  const index = PROFESSIONS.findIndex((p) => p.name === profession);
  if (index === -1) return 0; // Unknown profession → Boot Sector.
  return index % count;
}

export interface PlacementPreviewInput {
  tile: TileRef;
  /** sectorsUnlocked from the city payload (server-computed). */
  sectorCount: number;
  /** Tile keys already taken by persisted placements. */
  occupied: ReadonlySet<string>;
  /** Tile keys reserved for fixtures (HQ core, goddess landmark ring). */
  reserved?: ReadonlySet<string>;
}

export interface PlacementPreview {
  valid: boolean;
  issue: PlacementIssue | null;
}

/**
 * PREVIEW-ONLY validity predicate for the ghost tile. Order matches the
 * server's rejection order (bounds → sector → collisions) so the HUD shows
 * the same reason the POST would report.
 */
export function previewPlacement(input: PlacementPreviewInput): PlacementPreview {
  const { tile, sectorCount, occupied, reserved } = input;
  if (
    !Number.isInteger(tile.x) ||
    !Number.isInteger(tile.y) ||
    tile.x < 0 ||
    tile.y < 0 ||
    tile.x >= GRID_SIZE ||
    tile.y >= GRID_SIZE
  ) {
    return { valid: false, issue: "out-of-bounds" };
  }
  const sectorIndex = SECTOR_KEYS.indexOf(tile.sector);
  if (sectorIndex === -1 || sectorIndex >= Math.max(1, sectorCount)) {
    return { valid: false, issue: "sector-locked" };
  }
  const key = tileRefKey(tile);
  if (occupied.has(key)) return { valid: false, issue: "occupied" };
  if (reserved?.has(key)) return { valid: false, issue: "reserved" };
  return { valid: true, issue: null };
}

/**
 * Arrow-key ghost stepping: clamps inside the sector grid (no wrap, no
 * sector hopping — sector choice comes from the family, not the keyboard).
 */
export function stepGhostTile(
  tile: TileRef,
  dx: number,
  dy: number
): TileRef {
  return {
    sector: tile.sector,
    x: Math.max(0, Math.min(GRID_SIZE - 1, tile.x + dx)),
    y: Math.max(0, Math.min(GRID_SIZE - 1, tile.y + dy)),
  };
}

/** A sensible ghost start: the first free tile near a family's district. */
export function ghostStartTile(
  profession: string | null,
  sectorCount: number,
  isFree: (tile: TileRef) => boolean
): TileRef {
  const sector = sectorKeyFor(familySector(profession, sectorCount)) ?? SECTOR_KEYS[0];
  for (const { x, y } of tileFillOrder(GRID_SIZE)) {
    const tile = { sector, x, y };
    if (isFree(tile)) return tile;
  }
  // Grid full (1024 fixtures) — park at the sector origin; server will 409.
  return { sector, x: 0, y: 0 };
}
