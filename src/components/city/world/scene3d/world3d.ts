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
import { tileToGround } from "@/lib/city/scene/camera3d";
import { deriveStreets, type StreetTile } from "@/lib/city/streets";
import {
  satelliteAnchor,
  satelliteClusterTiles,
} from "@/lib/city/satellites";
import {
  UNIVERSE_CITY_CAP,
  UNIVERSE_SKYLINE_LIMIT,
  WORLD_BASE_RING,
  universeCityOffset,
  universeFamilyOf,
  universeMarkerRadius,
  universeViewerRank,
  type UniversePayload,
} from "@/lib/city/universe";
import type { BuildingTier, CityFamily, CityNeighbor } from "@/lib/city/types";
import { familyMassHex, familyNeonHex } from "@/lib/city/district";
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
      [g.x, y, g.z - h],
      [g.x + h, y, g.z],
      [g.x, y, g.z + h],
      [g.x - h, y, g.z],
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
      b.box(g.x, g.z, 0, HALF_TILE * 0.34, HALF_TILE * 0.34, 4, new Color("#232a33"));
      b.box(g.x, g.z, 4, HALF_TILE * 0.26, HALF_TILE * 0.26, h, mass);
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
  b.box(anchorGround.x, anchorGround.z, 0, HALF_TILE * 0.3, HALF_TILE * 0.3, 5, new Color("#2a3140"));
  b.box(anchorGround.x, anchorGround.z, 5, HALF_TILE * 0.22, HALF_TILE * 0.22, 34, new Color("#3d4654"));
  b.box(anchorGround.x, anchorGround.z, 39, 3, 3, 4, new Color("#ffd9a0"));

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
    appendScaled(b, mini, bg.x, bg.z, 0.8);
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
      tileToGround(t.gx, t.gy).z,
      0.98,
      0.84,
      t.protection === "hardlock" ? HARDLOCK : FIREWALL
    );
  }
  return b.toGeometry();
}

// ── shared universe: FULL city skylines (2026-09-30 ruling) ───────────────

export interface UniverseMarker {
  username: string;
  profession: string | null;
  /** Anchor GLOBAL tile (viewer-relative translation already applied). */
  gxWorld: number;
  gyWorld: number;
  radiusPx: number;
  /** 1-based portfolio rank — drives the relay's height read. */
  rank: number;
  stake: boolean;
  /** Top-N skyline tuples [tier, familyIndex] (value-sorted; may be null). */
  skyline: ReadonlyArray<readonly [number, number]> | null;
  /** Visible non-goddess owned-building count (the "+N more" read). */
  count: number;
}

/** Markers within the ground plate's reach (bounded; the HUD chip carries
 *  the true city count). Anchors are GLOBAL tiles: hqGlobalTile() + the
 *  shared-universe delta — integers, no lossy px round-trip. */
export const UNIVERSE_MARKER_TILE_REACH = 150;

export function deriveUniverseMarkers(
  payload: UniversePayload | null,
  viewerUsername: string,
  stakeUsernames: readonly string[]
): { markers: UniverseMarker[]; count: number; viewerRank: number } {
  if (!payload) return { markers: [], count: 0, viewerRank: 0 };
  const viewerRank = universeViewerRank(payload, viewerUsername);
  const hq = hqGlobalTile();
  const markers: UniverseMarker[] = [];
  for (const city of payload.cities) {
    if (city.username === viewerUsername) continue;
    const delta = universeCityOffset(city.rank, viewerRank, WORLD_BASE_RING);
    if (
      Math.abs(delta.x) > UNIVERSE_MARKER_TILE_REACH ||
      Math.abs(delta.y) > UNIVERSE_MARKER_TILE_REACH
    ) {
      continue;
    }
    markers.push({
      username: city.username,
      profession: city.profession,
      gxWorld: hq.x + delta.x,
      gyWorld: hq.y + delta.y,
      radiusPx: universeMarkerRadius(city.rank, UNIVERSE_CITY_CAP),
      rank: city.rank,
      stake: stakeUsernames.includes(city.username),
      skyline: city.skyline ?? null,
      count: city.count ?? 0,
    });
  }
  return { markers, count: payload.cities.length, viewerRank };
}

/**
 * Device-tier skyline cap (bounded rendering on low-end hardware): logical
 * cores are the cheapest available proxy. Full 24 everywhere else.
 */
export function universeSkylineCapFor(cores: number): number {
  if (cores >= 6) return UNIVERSE_SKYLINE_LIMIT;
  if (cores >= 4) return 12;
  return 6;
}

/**
 * Mini scale for universe skylines: at step-8 ring packing, a 7-tile airy
 * cluster × 0.55 spans ~3.9 visual tiles of radius — neighbouring cities
 * (one stride apart) never touch ("almost crashing", 2026-09-29 packing).
 */
export const UNIVERSE_MINI_SCALE = 0.55;

/** Deterministic silhouette seed from the city + skyline slot (stable
 * across refreshes — the same city always draws the same skyline). */
function miniSeedOf(username: string, index: number): number {
  let h = 0x811c9df5;
  for (let i = 0; i < username.length; i++) {
    h ^= username.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
}

/**
 * Append ONE foreign city's full bounded skyline (2026-09-30 "all" ruling —
 * CITY_SHARED_UNIVERSE_STUDY §5): a rank-scaled RELAY tower at the anchor
 * (the map-dot + hierarchy read, and the tap body) plus its top
 * `perCityCap` buildings by value as windowless minis on the SAME SPACED
 * cluster walk the satellite cities use — the city's real composition in
 * miniature, family colors and tier heights included.
 */
export function appendUniverseCity(
  b: MeshBuilder,
  m: UniverseMarker,
  perCityCap: number
): number {
  const ax = Math.round(m.gxWorld);
  const ay = Math.round(m.gyWorld);
  const g = tileToGround(ax, ay);
  const t = Math.log10(Math.max(1, m.rank)) / Math.log10(UNIVERSE_CITY_CAP);
  const h = 28 + 74 * (1 - t);
  const mass = new Color(familyMassHex(m.profession ?? "__unassigned__"));
  const neon = new Color(familyNeonHex(m.profession ?? "__unassigned__"));
  const accent = m.stake ? UNIVERSE_STAKE : neon;
  // Relay: pad + rank-scaled shaft + beacon tip (the "value-orbit skyline
  // in one" tower from the one-building era, kept as the identity read).
  b.box(g.x, g.z, 0, HALF_TILE * 0.34, HALF_TILE * 0.34, 4, new Color("#232a33"));
  b.box(g.x, g.z, 4, HALF_TILE * 0.2, HALF_TILE * 0.2, h, mass);
  b.box(g.x, g.z, 4 + h, 2.6, 2.6, 4, accent);
  // Ground footprint diamond (keeps the map-dot read at world zoom).
  const d = Math.max(6, m.radiusPx) / 0.7071;
  b.quad(
    [
      [g.x, LAYER_Y, g.z - d],
      [g.x + d, LAYER_Y, g.z],
      [g.x, LAYER_Y, g.z + d],
      [g.x - d, LAYER_Y, g.z],
    ],
    m.stake ? UNIVERSE_STAKE : UNIVERSE_BASE,
    m.stake ? UNIVERSE_STAKE : UNIVERSE_BASE
  );
  // The skyline (bounded: top perCityCap tuples, value order).
  const skyline = m.skyline ?? [];
  const n = Math.max(0, Math.min(skyline.length, perCityCap, UNIVERSE_SKYLINE_LIMIT));
  if (n === 0) return 0;
  const cluster = satelliteClusterTiles({ x: ax, y: ay }, n);
  let built = 0;
  for (let i = 0; i < n && i < cluster.length; i++) {
    const [tier, famIdx] = skyline[i];
    const bt = tileToGround(cluster[i].gx, cluster[i].gy);
    const mini = buildMiniBuildingGeometry(
      universeFamilyOf(famIdx),
      Math.max(1, Math.min(14, Math.round(tier))) as BuildingTier,
      miniSeedOf(m.username, i)
    );
    // Windowless mass merge (minis read by silhouette — same rule as the
    // satellite clusters), scaled so step-8 neighbours never touch.
    appendScaled(b, mini, bt.x, bt.z, UNIVERSE_MINI_SCALE);
    built++;
  }
  return built;
}

/** One ring's merged skyline geometry (the time-sliced pump appends city by
 *  city via appendUniverseCity; this whole-ring form serves tests). */
export function buildUniverseRingGeometry(
  markers: readonly UniverseMarker[],
  perCityCap: number
): { geometry: ReturnType<MeshBuilder["toGeometry"]>; miniCount: number } {
  const b = new MeshBuilder();
  let miniCount = 0;
  for (const m of markers) miniCount += appendUniverseCity(b, m, perCityCap);
  return { geometry: b.toGeometry(), miniCount };
}

/**
 * Content signature of one ring chunk: membership (username), relay height
 * (rank), stake tint AND skyline tuples (up to the cap) — everything that
 * changes pixels. The scene rebuilds a ring only when this string changes,
 * so 10-minute re-ranks that shuffle other rings cost nothing here.
 */
export function universeRingSignature(
  markers: readonly UniverseMarker[],
  perCityCap: number
): string {
  let h = 0x811c9dc5;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x2f;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (const m of markers) {
    mix(`${m.username}@${m.rank}${m.stake ? "!" : ""}:`);
    const skyline = m.skyline ?? [];
    const n = Math.max(0, Math.min(skyline.length, perCityCap, UNIVERSE_SKYLINE_LIMIT));
    for (let i = 0; i < n; i++) mix(`${skyline[i][0]},${skyline[i][1]};`);
  }
  return h.toString(36);
}

export { FIREWALL, HARDLOCK };
