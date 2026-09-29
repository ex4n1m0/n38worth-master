/**
 * Mainframe City 3D — WORLD LAYERS (three.js geometry builders).
 *
 * P2 retarget of the Pixi world layers onto merged vertex-color geometry:
 *   - streets3d: the derived road grid (lib/city/streets.ts) as flat asphalt
 *     diamonds + warm streetlamps, ONE merged mesh per sync
 *   - locked sector pads (dimmed diamonds over not-yet-unlocked macro slots)
 *   - aggregate rim slabs (the beyond-detail skyline continuing the orbit)
 *   - satellite mini-cities (foreign clusters on the anchor octants)
 *   - protection status rings (firewall cyan / hard-lock amber — server
 *     blockSellUntil/permBlockUntil authority, visuals only)
 *   - shared-universe markers (rank-orbit diamonds, stake-tinted)
 *
 * All data comes from the pure lib modules — nothing here recomputes
 * economy state; everything is bounded and deterministic per projection.
 */

import { Color } from "three";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import { globalTile, tileToScreen, type Point } from "@/lib/city/scene/iso";
import { TILE_STEP, tileToGround } from "@/lib/city/scene/camera3d";
import { deriveStreets, type StreetTile } from "@/lib/city/streets";
import {
  satelliteAnchor,
  satelliteClusterTiles,
} from "@/lib/city/satellites";
import {
  UNIVERSE_CITY_CAP,
  universeBaseRing,
  universeCityOffset,
  universeMarkerRadius,
  universeOffsetPx,
  universeViewerRank,
  type UniversePayload,
} from "@/lib/city/universe";
import { worldPxToGround } from "@/lib/city/scene/camera3d";
import type { CityFamily, CityNeighbor } from "@/lib/city/types";
import { familyMassHex } from "@/lib/city/district";
import { MeshBuilder, HALF_TILE, buildMiniBuildingGeometry } from "./building3d";
import { moatTileKeys, reservedTileKeys } from "./tiles";
import { hqGlobalTile, spacedOrbitOrder, type RingTile } from "@/lib/city/rings";
import { tileRefKey, type TileRef } from "@/lib/city/placement";

const ASPHALT_NIGHT = new Color("#262b33");
const ASPHALT_LAMP = new Color("#ffd9a0");
const LOCKED_PAD = new Color("#141a24");
const FIREWALL = new Color("#22d3ee");
const HARDLOCK = new Color("#f59e0b");
const UNIVERSE_BASE = new Color("#5b6a7d");
const UNIVERSE_STAKE = new Color("#a78bfa");

/** Flat tile diamond on the ground at (gx, gy), inset factor 0..1. */
function tileDiamond(
  b: MeshBuilder,
  gx: number,
  gy: number,
  factor: number,
  y: number,
  color: Color
): void {
  const g = tileToGround(gx, gy);
  const h = factor * HALF_TILE;
  b.quad(
    [
      [g.x, y, g.y - h],
      [g.x + h, y, g.y],
      [g.x, y, g.y + h],
      [g.x - h, y, g.y],
    ],
    color,
    color
  );
}

/** Ground height (world units) for flat layers — above terrain, below pads. */
const LAYER_Y = 0.3;

// ── streets ───────────────────────────────────────────────────────────────

export interface StreetsBuild {
  geometry: ReturnType<MeshBuilder["toGeometry"]>;
  tileCount: number;
}

/**
 * The derived street grid as one merged asphalt mesh: full-tile diamonds
 * (axis-tinted) + warm lamp dots at the deterministic lamp anchors.
 */
export function buildStreetsGeometry(tiles: readonly StreetTile[]): StreetsBuild {
  const b = new MeshBuilder();
  for (const t of tiles) {
    const shade =
      t.axis === "cross"
        ? 1.08
        : t.axis === "x"
          ? 1.0
          : t.axis === "y"
            ? 0.94
            : 0.88;
    tileDiamond(
      b,
      t.gx,
      t.gy,
      0.92,
      LAYER_Y,
      new Color(
        Math.min(1, ASPHALT_NIGHT.r * shade),
        Math.min(1, ASPHALT_NIGHT.g * shade),
        Math.min(1, ASPHALT_NIGHT.b * shade)
      )
    );
    if (t.lamp) {
      // Lamp dot: tiny warm diamond centered in the tile.
      tileDiamond(b, t.gx, t.gy, 0.06, LAYER_Y + 0.25, ASPHALT_LAMP);
    }
  }
  return { geometry: b.toGeometry(), tileCount: tiles.length };
}

/** Derive the home-city street grid from the placed building tiles. */
export function deriveHomeStreets(
  buildingTiles: ReadonlyArray<TileRef>
): StreetTile[] {
  const blocked = new Set<string>([...reservedTileKeys(), ...moatTileKeys()]);
  const globals = buildingTiles.map((t) => {
    const sectorIndex = Number(t.sector.replace(/^s/, "")) || 0;
    const g = globalTile(sectorIndex, t.x, t.y, GRID_SIZE);
    return { gx: g.x, gy: g.y };
  });
  const hq = hqGlobalTile();
  globals.push({ gx: hq.x, gy: hq.y }); // the plaza paves around the core
  return deriveStreets(globals, (gx, gy) => blocked.has(`${gx},${gy}`));
}

// ── locked sector pads ────────────────────────────────────────────────────

/** Dimmed diamond plates over macro slots that are not yet unlocked. */
export function buildLockedPadsGeometry(sectorCount: number): ReturnType<MeshBuilder["toGeometry"]> {
  const b = new MeshBuilder();
  for (let s = sectorCount; s < 9; s++) {
    const c = globalTile(s, GRID_SIZE >> 1, GRID_SIZE >> 1, GRID_SIZE);
    tileDiamond(b, c.x, c.y, GRID_SIZE / 2, LAYER_Y - 0.1, LOCKED_PAD);
  }
  return b.toGeometry();
}

// ── aggregate rim ─────────────────────────────────────────────────────────

/** Aggregate slab budget (bounded rendering; LOD-tunable later). */
export const AGGREGATE_BUDGET = 140;

/**
 * Beyond-detail skyline: the orbit walk continues past the outermost
 * detailed ring; each family's aggregated count renders as massed slabs
 * (one box per ~4 aggregated buildings, taller with density).
 */
export function buildAggregateGeometry(
  families: readonly CityFamily[],
  resumeRing: number,
  sectorCount: number,
  isOccupied: (key: string) => boolean
): { geometry: ReturnType<MeshBuilder["toGeometry"]>; slabCount: number } {
  const b = new MeshBuilder();
  const moat = moatTileKeys();
  const reserved = reservedTileKeys();
  const tiles = spacedOrbitOrder(
    hqGlobalTile(),
    Math.max(resumeRing + 1, 4),
    sectorCount,
    undefined,
    (t) => !isOccupied(tileRefKey(t)) && !moat.has(tileRefKey(t)) && !reserved.has(tileRefKey(t))
  );
  let slab = 0;
  let cursor = 0;
  for (const family of families) {
    const count = Math.max(0, family.aggregated);
    if (count === 0) continue;
    const slabs = Math.min(12, Math.ceil(count / 6));
    const mass = new Color(familyMassHex(family.profession));
    for (let i = 0; i < slabs && cursor < AGGREGATE_BUDGET; i++, slab++, cursor++) {
      const t: RingTile | undefined = tiles[cursor % tiles.length];
      if (!t) break;
      const g = tileToGround(t.x, t.y);
      const h = 10 + Math.min(26, count / 4) * (0.7 + ((cursor * 37) % 10) / 20);
      // Slab: platform + mass box with the family's palette.
      b.box(g.x, g.y, 0, HALF_TILE * 0.34, HALF_TILE * 0.34, 4, new Color("#232a33"));
      b.box(g.x, g.y, 4, HALF_TILE * 0.26, HALF_TILE * 0.26, h, mass);
    }
  }
  return { geometry: b.toGeometry(), slabCount: slab };
}

// ── satellite mini-cities ─────────────────────────────────────────────────

export interface SatelliteBuild {
  geometry: ReturnType<MeshBuilder["toGeometry"]>;
  /** World-px anchor point (for focus + the cluster pick pass). */
  anchorWorld: Point;
  /** Mini tiles in GLOBAL coords → mini building cardId at that tile. */
  tiles: ReadonlyArray<{ gx: number; gy: number; cardId: number }>;
}

/**
 * One foreign mini-city: relay HQ at the anchor + up to 24 mini buildings
 * on the SPACED cluster walk (same rules as the 2D system — the value-orbit
 * city in miniature). One merged mesh per satellite.
 */
export function buildSatelliteCluster(
  neighbor: CityNeighbor,
  slot: number,
  sectorCount: number
): SatelliteBuild {
  const b = new MeshBuilder();
  const anchor = satelliteAnchor(slot, GRID_SIZE, sectorCount);
  const anchorWorld = tileToScreen(anchor.x, anchor.y);
  const anchorGround = tileToGround(anchor.x, anchor.y);

  // Relay core: small dark tower + warm tip.
  b.box(anchorGround.x, anchorGround.y, 0, HALF_TILE * 0.3, HALF_TILE * 0.3, 5, new Color("#2a3140"));
  b.box(anchorGround.x, anchorGround.y, 5, HALF_TILE * 0.22, HALF_TILE * 0.22, 34, new Color("#3d4654"));
  b.box(anchorGround.x, anchorGround.y, 39, 3, 3, 4, new Color("#ffd9a0"));

  const buildings = neighbor.buildings.slice(0, 24);
  const cluster = satelliteClusterTiles(anchor, Math.max(buildings.length, 1));
  const tiles: Array<{ gx: number; gy: number; cardId: number }> = [];
  for (let i = 0; i < buildings.length && i < cluster.length; i++) {
    const t = cluster[i];
    const bg = tileToGround(t.gx, t.gy);
    const mini = buildMiniBuildingGeometry(
      buildings[i].profession,
      buildings[i].tier,
      buildings[i].cardId
    );
    // Merge the mini building's MASS group only (skip its window groups —
    // minis read by silhouette; budget stays bounded), scaled to 0.8.
    appendScaled(b, mini, bg.x, bg.y, 0.8);
    tiles.push({ gx: t.gx, gy: t.gy, cardId: buildings[i].cardId });
  }
  return { geometry: b.toGeometry(), anchorWorld, tiles };
}

/** Append another builder's geometry, scaled + offset (minis are windowless). */
function appendScaled(
  into: MeshBuilder,
  built: { geometry: ReturnType<MeshBuilder["toGeometry"]> },
  ox: number,
  oz: number,
  k: number
): void {
  const g = built.geometry;
  const pos = g.attributes.position;
  const col = g.attributes.color;
  const idx = g.index;
  if (!idx) return;
  const base = into as unknown as {
    positions: number[];
    colors: number[];
    indices: number[];
  };
  const vBase = base.positions.length / 3;
  for (let i = 0; i < pos.count; i++) {
    base.positions.push(pos.getX(i) * k + ox, pos.getY(i) * k, pos.getZ(i) * k + oz);
    base.colors.push(col.getX(i), col.getY(i), col.getZ(i));
  }
  for (let i = 0; i < idx.count; i++) {
    base.indices.push(idx.getX(i) + vBase);
  }
}

// ── protection status rings ───────────────────────────────────────────────

export interface ProtectedTile {
  gx: number;
  gy: number;
  protection: "hardlock" | "firewall";
}

/** Ground rings for protected buildings — server authority, visual only. */
export function buildProtectionRingsGeometry(
  tiles: readonly ProtectedTile[]
): ReturnType<MeshBuilder["toGeometry"]> {
  const b = new MeshBuilder();
  for (const t of tiles) {
    b.diamondRing(
      tileToGround(t.gx, t.gy).x,
      tileToGround(t.gx, t.gy).y,
      0.98,
      0.84,
      t.protection === "hardlock" ? HARDLOCK : FIREWALL
    );
  }
  return b.toGeometry();
}

// ── shared universe markers ───────────────────────────────────────────────

export interface UniverseMarker {
  username: string;
  gxWorld: number;
  gyWorld: number;
  radiusPx: number;
  stake: boolean;
}

/** Markers within the ground plate's reach (bounded; the HUD chip carries
 *  the true city count). Anchors are TILE offsets relative to the viewer. */
export const UNIVERSE_MARKER_TILE_REACH = 150;

export function deriveUniverseMarkers(
  payload: UniversePayload | null,
  viewerUsername: string,
  stakeUsernames: readonly string[],
  sectorCount = 9
): { markers: UniverseMarker[]; count: number; viewerRank: number } {
  if (!payload) return { markers: [], count: 0, viewerRank: 0 };
  const viewerRank = universeViewerRank(payload, viewerUsername);
  const base = universeBaseRing(sectorCount);
  const hq = hqGlobalTile();
  const markers: UniverseMarker[] = [];
  for (const city of payload.cities) {
    if (city.username === viewerUsername) continue;
    const delta = universeCityOffset(city.rank, viewerRank, base);
    if (
      Math.abs(delta.x) > UNIVERSE_MARKER_TILE_REACH ||
      Math.abs(delta.y) > UNIVERSE_MARKER_TILE_REACH
    ) {
      continue;
    }
    const px = universeOffsetPx(delta);
    const ground = worldPxToGround(px.x + tileToScreen(hq.x, hq.y).x, px.y + tileToScreen(hq.x, hq.y).y);
    markers.push({
      username: city.username,
      gxWorld: ground.x / TILE_STEP,
      gyWorld: ground.z / TILE_STEP,
      radiusPx: universeMarkerRadius(city.rank, UNIVERSE_CITY_CAP),
      stake: stakeUsernames.includes(city.username),
    });
  }
  return { markers, count: payload.cities.length, viewerRank };
}

export function buildUniverseMarkersGeometry(
  markers: readonly UniverseMarker[]
): ReturnType<MeshBuilder["toGeometry"]> {
  const b = new MeshBuilder();
  for (const m of markers) {
    const g = tileToGround(m.gxWorld, m.gyWorld);
    const h = Math.max(6, m.radiusPx) / 0.7071;
    b.quad(
      [
        [g.x, LAYER_Y, g.z - h],
        [g.x + h, LAYER_Y, g.z],
        [g.x, LAYER_Y, g.z + h],
        [g.x - h, LAYER_Y, g.z],
      ],
      m.stake ? UNIVERSE_STAKE : UNIVERSE_BASE,
      m.stake ? UNIVERSE_STAKE : UNIVERSE_BASE
    );
  }
  return b.toGeometry();
}

export { FIREWALL, HARDLOCK };
