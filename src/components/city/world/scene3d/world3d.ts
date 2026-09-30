/**
 * Mainframe City 3D — WORLD LAYERS (three.js geometry builders).
 *
 * AAA GRAPHICS PASS (2026-09-30): the derived street grid now renders as
 * real road micro-geometry — asphalt bed with texture, sidewalk frames with
 * curb faces, lane dashes along the travel axis, zebra crosswalks at every
 * intersection, and streetlamp anchor spots consumed by the instanced
 * streetlight kit in ThreeScene (poles + emissive heads + night light
 * pools). Country connector roads tie the home grid to the satellite
 * anchors. Aggregate rim, satellite mini-cities, protection rings and the
 * shared-universe skylines carry over (distant meshes render through the
 * single distant material, so their groups are informational only).
 *
 * All data comes from the pure lib modules — nothing here recomputes
 * economy state; everything is bounded and deterministic per projection.
 */

import { Color } from "three";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import { globalTile, tileToScreen, type Point } from "@/lib/city/scene/iso";
import { tileToGround, TILE_STEP } from "@/lib/city/scene/camera3d";
import { deriveStreets, type StreetTile } from "@/lib/city/streets";
import {
  macroCenter,
  satelliteAnchor,
  satelliteClusterTiles,
  unlockedHalfExtents,
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
import {
  GROUP_CONCRETE,
  GROUP_EMISSIVE,
  GROUP_FACADE,
  GROUP_ROOF,
  MeshBuilder,
  HALF_TILE,
  buildMiniBuildingGeometry,
} from "./building3d";
import { moatTileKeys, reservedTileKeys } from "./tiles";
import { hqGlobalTile, spacedOrbitOrder, type RingTile } from "@/lib/city/rings";
import { tileRefKey, type TileRef } from "@/lib/city/placement";

const ASPHALT_BASE = new Color("#2e3440");
/** Country-corridor verge green — the Kenney road tiles' grass tone. */
const COUNTRY_VERGE = new Color("#54763f");
const SIDEWALK_BASE = new Color("#a5a196");
const CURB_BASE = new Color("#7c7870");
const PAINT_BASE = new Color("#f4f0e0");
const LOCKED_PAD = new Color("#141a24");
const FIREWALL = new Color("#22d3ee");
const HARDLOCK = new Color("#f59e0b");
const UNIVERSE_BASE = new Color("#5b6a7d");
const UNIVERSE_STAKE = new Color("#a78bfa");

/** Street vertical profile (world units): bed, sidewalk slab, paint. */
const Y_ASPHALT = 0.9;
const Y_SIDEWALK = 1.7;
const Y_PAINT = 1.05;
/** Street tile profile: asphalt square + curb strip, full-tile footprint. */
const ASPHALT_FACTOR = 0.94;
const CURB_FACTOR = 1.0;

/** Up-facing SQUARE quad covering the tile footprint (world-space tile). */
function tileSquare(
  b: MeshBuilder,
  gx: number,
  gy: number,
  factor: number,
  y: number,
  color: Color,
  uvScale = 0
): void {
  const g = tileToGround(gx, gy);
  const h = factor * HALF_TILE;
  const s = uvScale > 0 ? h / uvScale : 0;
  b.quad(
    [
      [g.x - h, y, g.z + h],
      [g.x + h, y, g.z + h],
      [g.x + h, y, g.z - h],
      [g.x - h, y, g.z - h],
    ],
    color,
    color,
    uvScale > 0
      ? [
          [0.5 - s, 0.5 - s],
          [0.5 + s, 0.5 - s],
          [0.5 + s, 0.5 + s],
          [0.5 - s, 0.5 + s],
        ]
      : undefined
  );
}

/**
 * Sidewalk + curb for one SQUARE street tile: a perimeter band (inner
 * ASPHALT_FACTOR → outer CURB_FACTOR) on all four sides with small curb
 * faces dropping to the terrain. Consecutive tiles share FULL edges, so
 * the bands chain into continuous curbed boulevards — the fix for the
 * "pads with grass on all sides" checkerboard (2026-09-30 ruling).
 */
function sidewalkFrame(b: MeshBuilder, cx: number, cz: number): void {
  const inner = ASPHALT_FACTOR * HALF_TILE;
  const outer = CURB_FACTOR * HALF_TILE;
  const y = Y_SIDEWALK;
  // Four perimeter edges (N/S/E/W sides of the square), as walk segments
  // [start corner, end corner] in unit fractions of the tile half-extent.
  const sides: ReadonlyArray<
    readonly [readonly [number, number], readonly [number, number]]
  > = [
    [
      [-1, -1],
      [1, -1],
    ], // north (−z)
    [
      [1, -1],
      [1, 1],
    ], // east (+x)
    [
      [1, 1],
      [-1, 1],
    ], // south (+z)
    [
      [-1, 1],
      [-1, -1],
    ], // west (−x)
  ];
  for (const [A, B] of sides) {
    // Strip quad (up-facing): outer edge A→B, inner edge A'→B'.
    const ax = cx + A[0] * outer;
    const az = cz + A[1] * outer;
    const bx = cx + B[0] * outer;
    const bz = cz + B[1] * outer;
    const ax2 = cx + A[0] * inner;
    const az2 = cz + A[1] * inner;
    const bx2 = cx + B[0] * inner;
    const bz2 = cz + B[1] * inner;
    b.quad(
      [
        [ax, y, az],
        [bx, y, bz],
        [bx2, y, bz2],
        [ax2, y, az2],
      ],
      SIDEWALK_BASE,
      SIDEWALK_BASE
    );
    // Curb face: vertical quad from the sidewalk top down to terrain.
    b.quad(
      [
        [cx + A[0] * outer, Y_SIDEWALK, cz + A[1] * outer],
        [cx + B[0] * outer, Y_SIDEWALK, cz + B[1] * outer],
        [cx + B[0] * outer, 0, cz + B[1] * outer],
        [cx + A[0] * outer, 0, cz + A[1] * outer],
      ],
      CURB_BASE,
      CURB_BASE
    );
  }
}

/** Paint quad helper: flat parallelogram at paint height. */
function paintQuad(
  b: MeshBuilder,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
  ux: number,
  uz: number,
  color: Color
): void {
  b.quad(
    [
      [cx - dx - ux, Y_PAINT, cz - dz - uz],
      [cx + dx - ux, Y_PAINT, cz + dz - uz],
      [cx + dx + ux, Y_PAINT, cz + dz + uz],
      [cx - dx + ux, Y_PAINT, cz - dz + uz],
    ],
    color,
    color
  );
}

/** Deterministic per-tile shade jitter (asphalt/sidewalk wear variety). */
function tileShade(gx: number, gy: number): number {
  const h = Math.imul(gx * 73856093 ^ gy * 19349663, 0x9e3779b1) >>> 0;
  return 0.92 + (h % 17) / 100; // 0.92..1.08
}

/** Ground height (world units) for flat layers — above terrain, below pads. */
const LAYER_Y = 0.3;

// ── streets ───────────────────────────────────────────────────────────────

export interface StreetsBuild {
  geometry: ReturnType<MeshBuilder["toGeometry"]>;
  tileCount: number;
}

/**
 * The derived street grid as ONE merged mesh with three material groups:
 * asphalt beds (GROUP_FACADE slot 0), sidewalk frames + curbs
 * (GROUP_CONCRETE slot 7), and lane paint (GROUP_EMISSIVE slot 5 — the
 * street material array maps these to asphalt/concrete/paint materials).
 * Lane dashes follow the tile's travel axis; intersections get zebra
 * crosswalks; dead-ends get an end-cap line.
 */
export function buildStreetsGeometry(tiles: readonly StreetTile[]): StreetsBuild {
  const b = new MeshBuilder();
  for (const t of tiles) {
    const g = tileToGround(t.gx, t.gy);
    const cx = g.x;
    const cz = g.z;
    const k = tileShade(t.gx, t.gy);

    // Asphalt bed (group 0) — full-tile SQUARE: consecutive tiles share
    // whole edges, chaining into continuous boulevard bands.
    b.setMaterial(GROUP_FACADE);
    tileSquare(b, t.gx, t.gy, ASPHALT_FACTOR, Y_ASPHALT, shade(ASPHALT_BASE, k), 30);

    // Sidewalk frame + curbs (group 7 = concrete).
    b.setMaterial(GROUP_CONCRETE);
    sidewalkFrame(b, cx, cz);

    // Lane paint (group 5 → paint material in the street array).
    b.setMaterial(GROUP_EMISSIVE);
    const h = HALF_TILE;
    if (t.axis === "x") {
      // Dashes along the world-x line (W→E through the center).
      for (const off of [-0.5, 0, 0.5]) {
        paintQuad(b, cx + off * h, cz, 0.17 * h, 1.1, 0, 0, PAINT_BASE);
      }
    } else if (t.axis === "y") {
      for (const off of [-0.5, 0, 0.5]) {
        paintQuad(b, cx, cz + off * h, 1.1, 0.17 * h, 0, 0, PAINT_BASE);
      }
    } else if (t.axis === "cross") {
      // Zebra crosswalks at all four entries (two crisp stripes per arm —
      // three reads as noise at iso distance).
      const stripe = 0.1;
      for (const s of [0.74, 0.88]) {
        for (const dir of [-1, 1]) {
          paintQuad(b, cx + dir * s * h, cz, stripe * h, 0.3 * h, 0, 0, PAINT_BASE);
          paintQuad(b, cx, cz + dir * s * h, 0.3 * h, stripe * h, 0, 0, PAINT_BASE);
        }
      }
      // Ring boulevards (the checkerboard gaps classify as cross): a
      // dashed centerline along one diagonal, split by tile parity so the
      // boulevard reads as twin one-ways instead of an empty pad.
      const alongX = ((t.gx + t.gy) & 1) === 0;
      for (const off of [-0.34, 0.34]) {
        if (alongX) paintQuad(b, cx + off * h, cz, 0.16 * h, 0.7, 0, 0, PAINT_BASE);
        else paintQuad(b, cx, cz + off * h, 0.7, 0.16 * h, 0, 0, PAINT_BASE);
      }
    } else {
      // Stub: a stop line across the dead-end (perpendicular to whichever
      // axis the pad faces — default the x line).
      paintQuad(b, cx, cz, 0.1 * h, 0.42 * h, 0, 0, PAINT_BASE);
    }
  }
  b.setMaterial(GROUP_FACADE);
  return { geometry: b.toGeometry(), tileCount: tiles.length };
}

function shade(c: Color, k: number): Color {
  return new Color(
    Math.min(1, c.r * k),
    Math.min(1, c.g * k),
    Math.min(1, c.b * k)
  );
}

/**
 * Streetlamp anchor spots (world ground x/z) for the instanced streetlight
 * kit — one per `lamp` tile, offset to the tile's north sidewalk corner so
 * the pole stands on the walk, not the roadway.
 */
export function streetLampSpots(
  tiles: readonly StreetTile[]
): Array<{ x: number; z: number; seed: number }> {
  const out: Array<{ x: number; z: number; seed: number }> = [];
  for (const t of tiles) {
    if (!t.lamp) continue;
    const g = tileToGround(t.gx, t.gy);
    out.push({
      x: g.x + HALF_TILE * 0.55,
      z: g.z - HALF_TILE * 0.55,
      seed: (t.gx * 31 + t.gy * 17) >>> 0,
    });
  }
  return out;
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

// ── country connector roads (home grid → satellite anchors) ───────────────

export interface CountryRoadBuild {
  geometry: ReturnType<MeshBuilder["toGeometry"]>;
  segments: number;
}

/**
 * Countryside asphalt connectors from the macro grid's edge toward each
 * satellite anchor (the 3D twin of the 2D RoadsLayer corridors): a straight
 * textured band + dashed centerline, segmented so long runs stay bounded.
 */
export function buildCountryRoadsGeometry(
  anchors: ReadonlyArray<Point>,
  sectorCount: number
): CountryRoadBuild {
  const b = new MeshBuilder();
  const centerTile = macroCenter(GRID_SIZE);
  const center = tileToGround(centerTile.x, centerTile.y);
  const { ex, ey } = unlockedHalfExtents(sectorCount, GRID_SIZE);
  // City clearance (tiles): the paved area the corridor must leave first.
  const cityRadiusTiles = Math.max(ex, ey) + 2;
  let segments = 0;
  for (const anchor of anchors) {
    const a = tileToGround(anchor.x, anchor.y);
    const dx = a.x - center.x;
    const dz = a.z - center.z;
    const d = Math.hypot(dx, dz);
    if (d < HALF_TILE * 4) continue;
    const ux = dx / d;
    const uz = dz / d;
    const px = -uz; // perpendicular
    const pz = ux;
    // Ray/box exit: steps needed so BOTH |t·ux| and |t·uz| clear the
    // Chebyshev city radius (in world units).
    const R = cityRadiusTiles * TILE_STEP;
    const tExit = R / Math.max(Math.abs(ux), Math.abs(uz), 1e-6);
    const t0 = Math.min(tExit, d * 0.75);
    const t1 = Math.max(t0 + 1, d - HALF_TILE * 1.5); // stop short of the cluster
    const run = t1 - t0;
    const n = Math.min(24, Math.max(1, Math.ceil(run / 90)));
    for (let i = 0; i < n; i++) {
      const s0 = t0 + (run * i) / n;
      const s1 = t0 + (run * (i + 1)) / n;
      const x0 = center.x + ux * s0;
      const z0 = center.z + uz * s0;
      const x1 = center.x + ux * s1;
      const z1 = center.z + uz * s1;
      const W = 5.5; // half width (world units)
      // Grass verges flanking the corridor (2026-10-01 restyle — matches
      // the Kenney road tiles' green cross-section so the country roads
      // read as the same road system, not bare asphalt arcs).
      b.setMaterial(GROUP_FACADE);
      const VERGE = 7.5;
      for (const s of [-1, 1]) {
        b.quad(
          [
            [x0 + px * W * s, LAYER_Y - 0.05, z0 + pz * W * s],
            [x1 + px * W * s, LAYER_Y - 0.05, z1 + pz * W * s],
            [x1 + px * (W + VERGE) * s, LAYER_Y - 0.05, z1 + pz * (W + VERGE) * s],
            [x0 + px * (W + VERGE) * s, LAYER_Y - 0.05, z0 + pz * (W + VERGE) * s],
          ],
          COUNTRY_VERGE,
          COUNTRY_VERGE
        );
      }
      // Asphalt band (group 0 → asphalt material in the street array).
      b.setMaterial(GROUP_FACADE);
      b.quad(
        [
          [x0 - px * W, LAYER_Y, z0 - pz * W],
          [x1 - px * W, LAYER_Y, z1 - pz * W],
          [x1 + px * W, LAYER_Y, z1 + pz * W],
          [x0 + px * W, LAYER_Y, z0 + pz * W],
        ],
        ASPHALT_BASE,
        ASPHALT_BASE,
        [
          [s0 / 30, 0],
          [s1 / 30, 0],
          [s1 / 30, (W * 2) / 30],
          [s0 / 30, (W * 2) / 30],
        ]
      );
      // Shoulder lines (group 5 → paint material).
      b.setMaterial(GROUP_EMISSIVE);
      for (const s of [-1, 1]) {
        b.quad(
          [
            [x0 + px * W * 0.86 * s, LAYER_Y + 0.1, z0 + pz * W * 0.86 * s],
            [x1 + px * W * 0.86 * s, LAYER_Y + 0.1, z1 + pz * W * 0.86 * s],
            [x1 + px * W * 0.9 * s, LAYER_Y + 0.1, z1 + pz * W * 0.9 * s],
            [x0 + px * W * 0.9 * s, LAYER_Y + 0.1, z0 + pz * W * 0.9 * s],
          ],
          PAINT_BASE,
          PAINT_BASE
        );
      }
      // Centerline dash (every other segment).
      if (i % 2 === 0) {
        b.quad(
          [
            [x0 + ux * 4, LAYER_Y + 0.12, z0 + uz * 4],
            [x1 - ux * 4, LAYER_Y + 0.12, z1 - uz * 4],
            [x1 - ux * 4 + px * 0.7, LAYER_Y + 0.12, z1 - uz * 4 + pz * 0.7],
            [x0 + ux * 4 + px * 0.7, LAYER_Y + 0.12, z0 + uz * 4 + pz * 0.7],
          ],
          shade(PAINT_BASE, 0.92),
          shade(PAINT_BASE, 0.92)
        );
      }
      segments++;
    }
  }
  b.setMaterial(GROUP_FACADE);
  return { geometry: b.toGeometry(), segments };
}

// ── locked sector pads ────────────────────────────────────────────────────

/** Flat diamond quad (iso footprint) — used by the locked-pad survey plats. */
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
      [g.x - h, y, g.z],
      [g.x, y, g.z + h],
      [g.x + h, y, g.z],
    ],
    color,
    color
  );
}

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
 * (one box per ~4 aggregated buildings, taller with density) with a
 * concrete base + roof cap so the rim reads as distant blocks, not cards.
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
      // Slab: concrete base + mass box + dark roof cap.
      b.setMaterial(GROUP_CONCRETE);
      b.box(g.x, g.z, 0, HALF_TILE * 0.34, HALF_TILE * 0.34, 4, new Color("#8d8d86"), "concrete");
      b.setMaterial(GROUP_FACADE);
      b.box(g.x, g.z, 4, HALF_TILE * 0.26, HALF_TILE * 0.26, h, mass, "grid", { noBottom: true });
      b.setMaterial(GROUP_ROOF);
      b.box(g.x, g.z, 4 + h, HALF_TILE * 0.26 + 0.6, HALF_TILE * 0.26 + 0.6, 1.2, shade(mass, 0.55), "roof", { noBottom: true });
    }
  }
  b.setMaterial(GROUP_FACADE);
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
 * on the SOLID cluster walk (the home block rows in miniature). One merged
 * mesh per satellite. `{ minis: false }` builds the relay ONLY — the kit
 * path instances the mini buildings as real Kenney models instead
 * (ThreeScene.syncSatellites + planSatelliteKitMinis).
 */
export function buildSatelliteCluster(
  neighbor: CityNeighbor,
  slot: number,
  sectorCount: number,
  opts: { minis?: boolean } = {}
): SatelliteBuild {
  const b = new MeshBuilder();
  const anchor = satelliteAnchor(slot, GRID_SIZE, sectorCount);
  const anchorWorld = tileToScreen(anchor.x, anchor.y);
  const anchorGround = tileToGround(anchor.x, anchor.y);

  // Relay core: concrete pad + dark tower + warm tip.
  b.setMaterial(GROUP_CONCRETE);
  b.box(anchorGround.x, anchorGround.z, 0, HALF_TILE * 0.34, HALF_TILE * 0.34, 4, new Color("#8d8d86"), "concrete");
  b.setMaterial(GROUP_FACADE);
  b.box(anchorGround.x, anchorGround.z, 4, HALF_TILE * 0.22, HALF_TILE * 0.22, 34, new Color("#3d4654"), "grid", { noBottom: true });
  b.setMaterial(GROUP_ROOF);
  b.box(anchorGround.x, anchorGround.z, 38, 3, 3, 4, new Color("#3a3f4a"), "roof");

  const buildings = neighbor.buildings.slice(0, 24);
  const cluster = satelliteClusterTiles(anchor, Math.max(buildings.length, 1));
  const tiles: Array<{ gx: number; gy: number; cardId: number }> = [];
  for (let i = 0; i < buildings.length && i < cluster.length; i++) {
    const t = cluster[i];
    const bg = tileToGround(t.gx, t.gy);
    if (opts.minis !== false) {
      const mini = buildMiniBuildingGeometry(
        buildings[i].profession,
        buildings[i].tier,
        buildings[i].cardId
      );
      // Merge the mini's geometry (groups are informational for distant
      // single-material meshes), scaled to 0.8.
      appendGeometry(b, mini.geometry, bg.x, bg.z, 0.8);
    }
    tiles.push({ gx: t.gx, gy: t.gy, cardId: buildings[i].cardId });
  }
  b.setMaterial(GROUP_FACADE);
  return { geometry: b.toGeometry(), anchorWorld, tiles };
}

/**
 * Kit-path mini placements for one satellite (the SAME solid walk the
 * merged build uses): per mini the tile, the card id (rotation + picking)
 * and the tier/profession for the seeded prefab pick + family tint.
 * Bounded by NEIGHBOR_BUILDING_LIMIT (24) — instanced by ThreeScene.
 */
export function planSatelliteKitMinis(
  neighbor: CityNeighbor,
  slot: number,
  sectorCount: number
): ReadonlyArray<{
  gx: number;
  gy: number;
  cardId: number;
  tier: number;
  profession: string | null;
}> {
  const anchor = satelliteAnchor(slot, GRID_SIZE, sectorCount);
  const buildings = neighbor.buildings.slice(0, 24);
  const cluster = satelliteClusterTiles(anchor, Math.max(buildings.length, 1));
  const out: Array<{
    gx: number;
    gy: number;
    cardId: number;
    tier: number;
    profession: string | null;
  }> = [];
  for (let i = 0; i < buildings.length && i < cluster.length; i++) {
    out.push({
      gx: cluster[i].gx,
      gy: cluster[i].gy,
      cardId: buildings[i].cardId,
      tier: buildings[i].tier,
      profession: buildings[i].profession,
    });
  }
  return out;
}

/** Append a built geometry (position/color/normal/uv + index), scaled + offset. */
function appendGeometry(
  into: MeshBuilder,
  g: ReturnType<MeshBuilder["toGeometry"]>,
  ox: number,
  oz: number,
  k: number
): void {
  into.appendGeometry(g, ox, oz, k);
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
 *  across refreshes — the same city always draws the same skyline). */
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
  // Relay: concrete pad + rank-scaled shaft + roof cap + beacon tip.
  b.setMaterial(GROUP_CONCRETE);
  b.box(g.x, g.z, 0, HALF_TILE * 0.34, HALF_TILE * 0.34, 4, new Color("#8d8d86"), "concrete");
  b.setMaterial(GROUP_FACADE);
  b.box(g.x, g.z, 4, HALF_TILE * 0.2, HALF_TILE * 0.2, h, mass, "grid", { noBottom: true });
  b.setMaterial(GROUP_ROOF);
  b.box(g.x, g.z, 4 + h, HALF_TILE * 0.2 + 0.5, HALF_TILE * 0.2 + 0.5, 1.4, shade(mass, 0.5), "roof", { noBottom: true });
  b.setMaterial(GROUP_EMISSIVE);
  b.box(g.x, g.z, 4 + h + 1.4, 2.6, 2.6, 4, accent);
  b.setMaterial(GROUP_FACADE);
  // Ground footprint diamond (keeps the map-dot read at world zoom).
  const d = Math.max(6, m.radiusPx) / 0.7071;
  b.quad(
    [
      [g.x, LAYER_Y, g.z - d],
      [g.x - d, LAYER_Y, g.z],
      [g.x, LAYER_Y, g.z + d],
      [g.x + d, LAYER_Y, g.z],
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
    appendGeometry(b, mini.geometry, bt.x, bt.z, UNIVERSE_MINI_SCALE);
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
