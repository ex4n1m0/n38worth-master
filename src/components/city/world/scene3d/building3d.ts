/**
 * Mainframe City 3D — procedural building geometry (three.js).
 *
 * P0 retarget of the 2D procedural art system (scene/art.ts): the same
 * family palettes (lib/city/district), the same height ladders (baseH /
 * floorH / grandBaseH / grandFloorH from CITY_ART_MANIFEST), the same
 * tier-feature ladder — expressed as extruded boxes / octagonal prisms
 * with per-face vertex-color shading instead of Pixi Graphics polygons.
 * drawIsoBox's authored face shading is baked per face:
 *   +x wall (screen-right) 0.95→0.55, +z wall (screen-left) 0.62→0.36,
 *   roof 1.2 — rendered by MeshBasicMaterial+vertexColors (no lights), so
 * the night look is the same shading math as the 2D renderer's.
 *
 * Materials render DoubleSide in P0 (winding not yet audited); switching
 * to FrontSide after the art pass halves the triangle load.
 *
 * Look-and-feel refinement (grand-league megaforms, window mosaics,
 * monument detail) is deliberately staged: P0 ships readable massing; the
 * user's art pass iterates on these builders WITHOUT touching scene wiring.
 */

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
} from "three";
import {
  UNASSIGNED_FAMILY,
  type BuildingTier,
  type HeroStage,
} from "@/lib/city/types";
import {
  familyMassHex,
  familyNeonHex,
} from "@/lib/city/district";
import { LANDMARK_COLORS } from "@/lib/city/landmark-colors";
import { PIXEL_RISE, TILE_STEP } from "@/lib/city/scene/camera3d";

/** First tier of the grand (spectacular) league — mirrors art.ts. */
export const GRAND_MIN_TIER = 8;

/** Half-extent of one tile's ground footprint (3D units). */
export const HALF_TILE = TILE_STEP / 2;
/** Building platform footprint factor (2D platform is 56/64 of the tile). */
export const PLATFORM_FACTOR = (128 / 2 - 8) / (128 / 2);

// ── family height ladder (values from CITY_ART_MANIFEST, art.ts) ──────────

interface FamilyLadder {
  baseH: number;
  floorH: number;
  grandBaseH: number;
  grandFloorH: number;
}

const FAMILY_LADDERS: Record<string, FamilyLadder> = {
  Cryptographer: { baseH: 30, floorH: 11, grandBaseH: 112, grandFloorH: 14 },
  "Zero-Day": { baseH: 36, floorH: 14, grandBaseH: 134, grandFloorH: 16 },
  Overclocker: { baseH: 42, floorH: 13, grandBaseH: 136, grandFloorH: 14 },
  "Cache Keeper": { baseH: 30, floorH: 13, grandBaseH: 124, grandFloorH: 14 },
  "Server Marshal": { baseH: 44, floorH: 15, grandBaseH: 150, grandFloorH: 14 },
  "Bot Herder": { baseH: 26, floorH: 12, grandBaseH: 116, grandFloorH: 13 },
  [UNASSIGNED_FAMILY]: { baseH: 28, floorH: 12, grandBaseH: 118, grandFloorH: 13 },
};

function ladderOf(profession: string | null): FamilyLadder {
  return (
    FAMILY_LADDERS[profession ?? UNASSIGNED_FAMILY] ??
    FAMILY_LADDERS[UNASSIGNED_FAMILY]
  );
}

function massColor(profession: string | null): Color {
  return new Color(familyMassHex(profession ?? UNASSIGNED_FAMILY));
}

function neonColor(profession: string | null): Color {
  return new Color(familyNeonHex(profession ?? UNASSIGNED_FAMILY));
}

/** Body-top height in screen px (same formula as art.ts familyTopHeight). */
export function familyTopHeightPx(
  profession: string | null,
  tier: BuildingTier
): number {
  const l = ladderOf(profession);
  if (tier >= GRAND_MIN_TIER) {
    return l.grandBaseH + (tier - GRAND_MIN_TIER) * l.grandFloorH;
  }
  return l.baseH + (tier - 1) * l.floorH;
}

/** Deterministic PRNG (same algorithm as art.ts mulberry32, local copy). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** drawIsoBox's authored face shading (screen-right/left/roof planes). */
const SHADE_RIGHT_TOP = 0.95;
const SHADE_RIGHT_BOT = 0.55;
const SHADE_LEFT_TOP = 0.62;
const SHADE_LEFT_BOT = 0.36;
const SHADE_ROOF = 1.2;
const SHADE_HIDDEN = 0.3;

function shadeColor(c: Color, k: number): Color {
  return new Color(
    Math.min(1, c.r * k),
    Math.min(1, c.g * k),
    Math.min(1, c.b * k)
  );
}

/**
 * Accumulates unshared-face vertices with a position + color attribute
 * (MeshBasicMaterial vertexColors — no normals, no lights). Heights are
 * authored in SCREEN PX (converted via PIXEL_RISE) so every number here
 * matches the 2D art budget 1:1.
 *
 * GROUPS: the builder marks material groups (mass=0, window channel A=1,
 * channel B=2) so ONE mesh per building renders through a material ARRAY —
 * the shared channel materials animate the whole city's window mosaic
 * (occupancy churn, day/night glow) with zero per-vertex updates.
 */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly groups: Array<{ start: number; count: number; material: number }> = [];
  private groupStart = 0;
  private currentMaterial = 0;

  /**
   * Switch the active material group: mass 0; window channels are
   * A0=1, A1=2, B0=3, B1=4 (channel x cardId parity) so the light clock
   * can desync the flicker across half the city (4 shared materials).
   */
  setMaterial(material: 0 | 1 | 2 | 3 | 4): void {
    if (material === this.currentMaterial) return;
    const count = this.indices.length - this.groupStart;
    if (count > 0) {
      this.groups.push({ start: this.groupStart, count, material: this.currentMaterial });
    }
    this.groupStart = this.indices.length;
    this.currentMaterial = material;
  }

  /**
   * Quad face from 4 corner positions ordered as a loop; colors get a
   * vertical gradient between `bot` and `top` shades (flat when equal).
   */
  quad(
    p: ReadonlyArray<readonly [number, number, number]>,
    top: Color,
    bot: Color
  ): void {
    const v = this.positions.length / 3;
    for (const [x, y, z] of p) this.positions.push(x, y, z);
    const ys = p.map((pt) => pt[1]);
    const yMin = Math.min(...ys);
    const span = Math.max(...ys) - yMin || 1;
    for (const pt of p) {
      const t = (pt[1] - yMin) / span;
      const r = bot.r + (top.r - bot.r) * t;
      const g = bot.g + (top.g - bot.g) * t;
      const b = bot.b + (top.b - bot.b) * t;
      this.colors.push(Math.min(1, r), Math.min(1, g), Math.min(1, b));
    }
    this.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }

  /**
   * Extruded box; base center (cx, cz) at height basePx (screen px above
   * ground), extents halfX/halfZ, height heightPx (screen px). Face
   * shading replicates art.ts drawIsoBox: +x wall bright (screen-down-
   * right), +z wall dim (screen-down-left), roof lightest, hidden faces
   * dark. DoubleSide materials make winding non-critical in P0.
   */
  box(
    cx: number,
    cz: number,
    basePx: number,
    halfX: number,
    halfZ: number,
    heightPx: number,
    color: Color
  ): void {
    const y0 = basePx * PIXEL_RISE;
    const y1 = (basePx + heightPx) * PIXEL_RISE;
    const x0 = cx - halfX;
    const x1 = cx + halfX;
    const z0 = cz - halfZ;
    const z1 = cz + halfZ;
    const v3 = (x: number, y: number, z: number) => [x, y, z] as const;
    // +x wall (screen right — bright).
    this.quad(
      [v3(x1, y0, z0), v3(x1, y0, z1), v3(x1, y1, z1), v3(x1, y1, z0)],
      shadeColor(color, SHADE_RIGHT_TOP),
      shadeColor(color, SHADE_RIGHT_BOT)
    );
    // −x wall (hidden).
    this.quad(
      [v3(x0, y0, z0), v3(x0, y0, z1), v3(x0, y1, z1), v3(x0, y1, z0)],
      shadeColor(color, SHADE_HIDDEN),
      shadeColor(color, SHADE_HIDDEN)
    );
    // +z wall (screen left — dim).
    this.quad(
      [v3(x0, y0, z1), v3(x1, y0, z1), v3(x1, y1, z1), v3(x0, y1, z1)],
      shadeColor(color, SHADE_LEFT_TOP),
      shadeColor(color, SHADE_LEFT_BOT)
    );
    // −z wall (hidden).
    this.quad(
      [v3(x0, y0, z0), v3(x1, y0, z0), v3(x1, y1, z0), v3(x0, y1, z0)],
      shadeColor(color, SHADE_HIDDEN),
      shadeColor(color, SHADE_HIDDEN)
    );
    // Roof (lightest) + bottom (hidden).
    const roof = shadeColor(color, SHADE_ROOF);
    this.quad(
      [v3(x0, y1, z0), v3(x1, y1, z0), v3(x1, y1, z1), v3(x0, y1, z1)],
      roof,
      roof
    );
    const bottom = shadeColor(color, SHADE_HIDDEN);
    this.quad(
      [v3(x0, y0, z0), v3(x1, y0, z0), v3(x1, y0, z1), v3(x0, y0, z1)],
      bottom,
      bottom
    );
  }

  /** Octagonal prism — cylinders read as clean low-poly at iso distance. */
  prism8(
    cx: number,
    cz: number,
    basePx: number,
    radius: number,
    heightPx: number,
    color: Color
  ): void {
    const segs = 8;
    const y0 = basePx * PIXEL_RISE;
    const y1 = (basePx + heightPx) * PIXEL_RISE;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2 + Math.PI / 8;
      const a1 = ((s + 1) / segs) * Math.PI * 2 + Math.PI / 8;
      const am = (a0 + a1) / 2;
      const x0 = cx + Math.cos(a0) * radius;
      const z0 = cz + Math.sin(a0) * radius;
      const x1 = cx + Math.cos(a1) * radius;
      const z1 = cz + Math.sin(a1) * radius;
      // Wall brightness by how much the wall normal faces the camera dir
      // (0.612, ·, 0.612) — right walls bright, left dim (drawCylinder read).
      const lit = Math.max(0, Math.cos(am) * 0.7071 + Math.sin(am) * 0.7071);
      const wallTop = shadeColor(color, 0.5 + 0.5 * lit);
      const wallBot = shadeColor(color, 0.3 + 0.3 * lit);
      this.quad(
        [
          [x0, y0, z0],
          [x1, y0, z1],
          [x1, y1, z1],
          [x0, y1, z0],
        ],
        wallTop,
        wallBot
      );
    }
    // Roof fan (flat, lightest).
    const roof = shadeColor(color, SHADE_ROOF);
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2 + Math.PI / 8;
      const a1 = ((s + 1) / segs) * Math.PI * 2 + Math.PI / 8;
      this.quad(
        [
          [cx, y1, cz],
          [cx + Math.cos(a0) * radius, y1, cz + Math.sin(a0) * radius],
          [cx + Math.cos(a1) * radius, y1, cz + Math.sin(a1) * radius],
          [cx, y1, cz],
        ],
        roof,
        roof
      );
    }
  }

  /** Flat diamond ring on the ground (selection / protection markers). */
  diamondRing(
    cx: number,
    cz: number,
    outerFactor: number,
    innerFactor: number,
    color: Color
  ): void {
    const o = outerFactor * HALF_TILE;
    const i = innerFactor * HALF_TILE;
    const y = 0.6 * PIXEL_RISE;
    // North half then south half — axis-aligned so the ring hugs the iso
    // tile silhouette exactly.
    this.quad(
      [
        [cx, y, cz - o],
        [cx + o, y, cz],
        [cx + i, y, cz],
        [cx, y, cz - i],
      ],
      color,
      color
    );
    this.quad(
      [
        [cx, y, cz + o],
        [cx - o, y, cz],
        [cx - i, y, cz],
        [cx, y, cz + i],
      ],
      color,
      color
    );
  }

  /**
   * One WINDOW pane: a flat quad on a facade, offset outward so it never
   * z-fights the wall. `face` picks the visible wall plane (+x screen-right
   * or +z screen-left); u positions the pane across the wall; the vertical
   * span is [basePx, basePx+hPx] in screen-px budget. Flat color (pane
   * brightness variance lives in the caller's vertex color).
   */
  windowPane(
    face: "px" | "pz",
    wallAt: number,
    uCenter: number,
    uHalf: number,
    basePx: number,
    hPx: number,
    color: Color
  ): void {
    const y0 = basePx * PIXEL_RISE;
    const y1 = (basePx + hPx) * PIXEL_RISE;
    const OUT = 0.5; // outward offset (ground units) from the wall plane
    const u0 = uCenter - uHalf;
    const u1 = uCenter + uHalf;
    if (face === "px") {
      const x = wallAt + OUT;
      this.quad(
        [
          [x, y0, u0],
          [x, y0, u1],
          [x, y1, u1],
          [x, y1, u0],
        ],
        color,
        color
      );
    } else {
      const z = wallAt + OUT;
      this.quad(
        [
          [u0, y0, z],
          [u1, y0, z],
          [u1, y1, z],
          [u0, y1, z],
        ],
        color,
        color
      );
    }
  }

  toGeometry(): BufferGeometry {
    // Force-close the trailing group (setMaterial(0) is a no-op when the
    // builder already ended on mass — the tier features would be orphaned).
    const count = this.indices.length - this.groupStart;
    if (count > 0) {
      this.groups.push({ start: this.groupStart, count, material: this.currentMaterial });
    }
    this.groupStart = this.indices.length;
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    for (const grp of this.groups) {
      g.addGroup(grp.start, grp.count, grp.material);
    }
    return g;
  }
}

// ── window mosaics (the night light identity — every LOD, every building) ──

/** Dark-glass inset color (unlit panes — constant day and night). */
const WINDOW_DARK = new Color("#3a4048");

/** How far a window's grid row/col spans in ground units and px. */
const WINDOW_W = 4.2;
const WINDOW_H_PX = 3.4;
const WINDOW_ROW_STEP_PX = 8.5;
const WINDOW_COL_STEP = 8.4;

/**
 * Seeded two-channel lit-window mosaic over a building's two VISIBLE
 * facades (+x screen-right, +z screen-left) — the 3D twin of
 * art.ts drawFacadeWindows: panes are either dark-glass insets or lit
 * panes (channel A/B, brightness variance); the ground floor row glows
 * brighter (entrance/lobby). Lit panes render through the shared channel
 * materials so the light clock can churn them city-wide.
 */
function addWindowMosaic(
  b: MeshBuilder,
  opts: {
    seed: number;
    /** cardId parity — picks the channel pair (A0/B0 vs A1/B1). */
    parity?: 0 | 1;
    /** Visible-face rectangles: {face, wallAt, uMin, uMax, basePx, heightPx}. */
    faces: ReadonlyArray<{
      face: "px" | "pz";
      wallAt: number;
      uMin: number;
      uMax: number;
      basePx: number;
      heightPx: number;
    }>;
    /** Optional accent tint (grand league mixes the family neon in). */
    tint?: Color | null;
  }
): void {
  const rng = mulberry32(opts.seed * 747796405 + 2891336453);
  const matA: 1 | 2 = opts.parity === 1 ? 2 : 1;
  const matB: 3 | 4 = opts.parity === 1 ? 4 : 3;
  // Subtle hue nudge for the grand league (neon-tinted glass): white
  // lerped slightly toward the family neon — the shared warm material
  // still owns the hue, this only biases it.
  const tintW = opts.tint
    ? new Color(1, 1, 1).lerp(opts.tint, 0.22)
    : new Color(1, 1, 1);
  let anyA = false;
  let anyB = false;
  // -1 = dark-glass inset (mass group, never animates).
  const panes: Array<{
    channel: 0 | 1 | -1;
    args: Parameters<MeshBuilder["windowPane"]>;
  }> = [];
  for (const f of opts.faces) {
    const span = f.uMax - f.uMin;
    // Minimum face: at least one column and one row (tiny tier-1 bodies
    // still get their ground-floor lit row — windows are the identity at
    // EVERY tier, not a close-LOD extra).
    if (span < WINDOW_W * 1.6 || f.heightPx < 12) continue;
    const cols = Math.max(1, Math.floor(span / WINDOW_COL_STEP));
    const colStep = span / cols;
    const rows = Math.max(1, Math.floor((f.heightPx - 8) / WINDOW_ROW_STEP_PX));
    const rowStep = Math.max(WINDOW_H_PX + 3, (f.heightPx - 8) / rows);
    for (let r = 0; r < rows; r++) {
      const y = f.basePx + 5 + r * rowStep;
      for (let c = 0; c < cols; c++) {
        const u = f.uMin + colStep * (c + 0.5);
        const roll = rng();
        const groundFloor = r === 0;
        if (roll < 0.26 && !groundFloor) {
          // Dark-glass inset (constant — architecture, not lighting).
          panes.push({
            channel: -1,
            args: [f.face, f.wallAt, u, WINDOW_W * 0.5, y, WINDOW_H_PX, WINDOW_DARK],
          });
          continue;
        }
        const channel: 0 | 1 = rng() < 0.55 ? 0 : 1;
        // Lit panes carry BRIGHTNESS VARIANCE in vertex colors (near-white
        // so the shared warm material defines the hue); baking the hue here
        // would square it against the material color (dark red shift).
        const bright = Math.min(1.25, 0.7 + rng() * 0.5) * (groundFloor ? 1.2 : 1);
        const color = new Color(
          tintW.r * bright,
          tintW.g * bright * 0.96,
          tintW.b * bright * 0.9
        );
        panes.push({
          channel,
          args: [f.face, f.wallAt, u, WINDOW_W * 0.5, y, WINDOW_H_PX, color],
        });
        if (channel === 0) anyA = true;
        else anyB = true;
      }
    }
  }
  // Dark insets belong to the MASS group (they never animate).
  b.setMaterial(0);
  for (const p of panes) {
    if (p.channel === -1) b.windowPane(...p.args);
  }
  if (anyA) {
    b.setMaterial(matA);
    for (const p of panes) {
      if (p.channel === 0) b.windowPane(...p.args);
    }
  }
  if (anyB) {
    b.setMaterial(matB);
    for (const p of panes) {
      if (p.channel === 1) b.windowPane(...p.args);
    }
  }
  b.setMaterial(0);
}

// ── building assembly ─────────────────────────────────────────────────────

export interface BuildingGeometry3D {
  geometry: BufferGeometry;
  /** Body-top height in screen px (label/selection anchors). */
  topPx: number;
}

/** Shared construction: platform slab under every building. */
function platform(b: MeshBuilder, factor = PLATFORM_FACTOR): void {
  b.box(0, 0, 0, factor * HALF_TILE, factor * HALF_TILE, 5, new Color("#232a33"));
}

/**
 * One owned-card building: family silhouette × tier ladder, all original
 * code-plotted geometry. Deterministic per (profession, tier, seed).
 */
export function buildBuildingGeometry(
  profession: string | null,
  tier: BuildingTier,
  seed: number
): BuildingGeometry3D {
  const b = new MeshBuilder();
  const rng = mulberry32(seed * 2654435761);
  const jitter = 0.96 + rng() * 0.08;
  if (tier >= GRAND_MIN_TIER) {
    buildGrand(b, profession, tier - GRAND_MIN_TIER, jitter, seed);
  } else {
    buildCivic(b, profession, tier, jitter, seed);
  }
  return {
    geometry: b.toGeometry(),
    topPx: familyTopHeightPx(profession, tier),
  };
}

/**
 * Silhouette-only variant for satellite/universe MINI cities: same family
 * massing and tier features, no window mosaic (minis render through the
 * single mass material — near-white pane verts would speckle).
 */
export function buildMiniBuildingGeometry(
  profession: string | null,
  tier: BuildingTier,
  seed: number
): BuildingGeometry3D {
  const b = new MeshBuilder();
  const rng = mulberry32(seed * 2654435761);
  const jitter = 0.96 + rng() * 0.08;
  if (tier >= GRAND_MIN_TIER) {
    buildGrand(b, profession, tier - GRAND_MIN_TIER, jitter, seed, false);
  } else {
    buildCivic(b, profession, tier, jitter, seed, false);
  }
  return {
    geometry: b.toGeometry(),
    topPx: familyTopHeightPx(profession, tier),
  };
}

function buildCivic(
  b: MeshBuilder,
  profession: string | null,
  tier: BuildingTier,
  jitter: number,
  seed: number,
  windows = true
): void {
  const mass = massColor(profession);
  const neon = neonColor(profession);
  const l = ladderOf(profession);
  const H = (l.baseH + (tier - 1) * l.floorH) * jitter;
  platform(b);
  const fam = profession ?? UNASSIGNED_FAMILY;
  const light = (k: number) => shadeColor(mass, k);
  type Face = Parameters<typeof addWindowMosaic>[1]["faces"][number];
  const faces: Face[] = [];

  // Family silhouette base — approximations of the 2D identity; refined in
  // the dedicated look-and-feel pass.
  switch (fam) {
    case "Server Marshal": {
      // Rack slab tower: uniform width, full height.
      const w = 0.34 * HALF_TILE;
      b.box(0, 0, 5, w, w * 0.72, H, mass);
      faces.push(
        { face: "px", wallAt: w, uMin: -w * 0.72, uMax: w * 0.72, basePx: 5, heightPx: H },
        { face: "pz", wallAt: w * 0.72, uMin: -w, uMax: w, basePx: 5, heightPx: H }
      );
      break;
    }
    case "Bot Herder": {
      // Wide hangar + two side bays.
      const main = 0.4 * HALF_TILE;
      b.box(0, 0, 5, main, main * 1.15, H, mass);
      const bay = 0.19 * HALF_TILE;
      const off = 0.56 * HALF_TILE;
      b.box(off, 0, 5, bay, bay, H * 0.72, light(0.85));
      b.box(-off, 0, 5, bay, bay, H * 0.72, light(0.85));
      faces.push(
        { face: "px", wallAt: main, uMin: -main * 1.15, uMax: main * 1.15, basePx: 5, heightPx: H },
        { face: "pz", wallAt: main * 1.15, uMin: -main, uMax: main, basePx: 5, heightPx: H },
        { face: "px", wallAt: off + bay, uMin: -bay, uMax: bay, basePx: 5, heightPx: H * 0.72 },
        { face: "px", wallAt: -off + bay, uMin: -bay, uMax: bay, basePx: 5, heightPx: H * 0.72 }
      );
      break;
    }
    case "Zero-Day": {
      // Twin towers + top bridge.
      const w = 0.26 * HALF_TILE;
      const off = 0.3 * HALF_TILE;
      b.box(off, 0, 5, w, w, H, mass);
      b.box(-off, 0, 5, w, w, H, mass);
      if (tier >= 2) {
        b.box(0, 0, 5 + H, off + w, w * 0.5, 8, light(1.5));
      }
      faces.push(
        { face: "px", wallAt: off + w, uMin: -w, uMax: w, basePx: 5, heightPx: H },
        { face: "px", wallAt: -off + w, uMin: -w, uMax: w, basePx: 5, heightPx: H },
        { face: "pz", wallAt: w, uMin: -off - w, uMax: off + w, basePx: 5, heightPx: H }
      );
      break;
    }
    case "Cryptographer": {
      // Octagon rotunda + stepped dome (windows on the inscribed box).
      const r = 0.42 * HALF_TILE * jitter;
      b.prism8(0, 0, 5, r, H * 0.8, mass);
      b.prism8(0, 0, 5 + H * 0.8, 0.3 * HALF_TILE, H * 0.14, light(1.3));
      b.prism8(0, 0, 5 + H * 0.94, 0.17 * HALF_TILE, H * 0.06, light(1.55));
      faces.push(
        { face: "px", wallAt: r * 0.78, uMin: -r * 0.78, uMax: r * 0.78, basePx: 5, heightPx: H * 0.8 },
        { face: "pz", wallAt: r * 0.78, uMin: -r * 0.78, uMax: r * 0.78, basePx: 5, heightPx: H * 0.8 }
      );
      break;
    }
    case "Overclocker": {
      // Reactor cylinder + neon coil rings (windows on the inscribed box).
      const r = 0.34 * HALF_TILE * jitter;
      b.prism8(0, 0, 5, r, H, mass);
      b.prism8(0, 0, 5 + H * 0.45, 0.44 * HALF_TILE, 2, neon);
      b.prism8(0, 0, 5 + H * 0.8, 0.4 * HALF_TILE, 2, neon);
      faces.push(
        { face: "px", wallAt: r * 0.78, uMin: -r * 0.78, uMax: r * 0.78, basePx: 5, heightPx: H },
        { face: "pz", wallAt: r * 0.78, uMin: -r * 0.78, uMax: r * 0.78, basePx: 5, heightPx: H }
      );
      break;
    }
    case "Cache Keeper": {
      // Stepped vault block.
      b.box(0, 0, 5, 0.46 * HALF_TILE, 0.42 * HALF_TILE, H * 0.55, mass);
      b.box(0, 0, 5 + H * 0.55, 0.3 * HALF_TILE, 0.28 * HALF_TILE, H * 0.45, light(1.6));
      faces.push(
        { face: "px", wallAt: 0.46 * HALF_TILE, uMin: -0.42 * HALF_TILE, uMax: 0.42 * HALF_TILE, basePx: 5, heightPx: H * 0.55 },
        { face: "pz", wallAt: 0.42 * HALF_TILE, uMin: -0.46 * HALF_TILE, uMax: 0.46 * HALF_TILE, basePx: 5, heightPx: H * 0.55 },
        { face: "px", wallAt: 0.3 * HALF_TILE, uMin: -0.28 * HALF_TILE, uMax: 0.28 * HALF_TILE, basePx: 5 + H * 0.55, heightPx: H * 0.45 }
      );
      break;
    }
    default: {
      // Unassigned / unknown: plain block.
      const w = 0.32 * HALF_TILE;
      b.box(0, 0, 5, w, w * 0.8, H, mass);
      faces.push(
        { face: "px", wallAt: w, uMin: -w * 0.8, uMax: w * 0.8, basePx: 5, heightPx: H },
        { face: "pz", wallAt: w * 0.8, uMin: -w, uMax: w, basePx: 5, heightPx: H }
      );
    }
  }

  // The night light identity — lit-window mosaic on every tier/LOD.
  // The night light identity — lit-window mosaic on every tier/LOD
  // (skipped for satellite minis: silhouette-only, single material).
  if (windows) addWindowMosaic(b, { seed, faces, parity: (seed % 2) as 0 | 1 });

  // Tier-feature ladder (mirrors art.ts drawTierFeatures ordering).
  const bodyTop = 5 + H;
  if (tier >= 3) b.box(0, 0, bodyTop, 1.6, 1.6, 16, light(1.4)); // antenna
  if (tier >= 4) {
    const p = 0.24 * HALF_TILE;
    b.box(p, p, bodyTop, 5, 5, 7, light(1.25)); // corner pods
    b.box(-p, -p, bodyTop, 5, 5, 7, light(1.25));
  }
  if (tier >= 5) b.box(0, 0, bodyTop + 2, 0.4 * HALF_TILE, 0.4 * HALF_TILE, 2, neon); // halo
  if (tier >= 6) b.box(0, 0, bodyTop + 5, 0.3 * HALF_TILE, 0.3 * HALF_TILE, 6, light(1.45)); // crown
  if (tier >= 7) b.box(0, 0, bodyTop + 11, 0.2 * HALF_TILE, 0.2 * HALF_TILE, 12, light(1.3));
  // Rooftop beacon tip (every tier — the family's night identity anchor).
  b.box(0, 0, bodyTop + (tier >= 3 ? 16 : 0), 2.2, 2.2, 3, neon);
}

/**
 * GRAND league (tiers 8–14): setback megaform + spire, chroma-glass crown,
 * edge-lit vertical neon strips, one more elaboration per step
 * (step = tier − 8) — parametric code-plotted architecture; bespoke look
 * refined in the user's art pass.
 */
function buildGrand(
  b: MeshBuilder,
  profession: string | null,
  step: number,
  jitter: number,
  seed: number,
  windows = true
): void {
  const mass = massColor(profession);
  const neon = neonColor(profession);
  const glass = mass.clone().lerp(neon, 0.25); // chroma glass (mixRGB ~25%)
  const l = ladderOf(profession);
  const H = (l.grandBaseH + step * l.grandFloorH) * jitter;
  platform(b, PLATFORM_FACTOR * 1.02);

  const podium = 0.66 * HALF_TILE;
  const midW = podium * 0.5;
  const midD = podium * 0.4;
  const crownW = podium * (step >= 3 ? 0.3 : 0.36);
  // Setback skyline: podium → mid → glass crown → spire (4 reads at a glance).
  b.box(0, 0, 5, podium, podium * 0.8, H * 0.2, mass);
  b.box(0, 0, 5 + H * 0.2, midW, midD, H * 0.44, mass);
  b.box(0, 0, 5 + H * 0.64, crownW, crownW * 0.85, H * 0.26, glass);
  b.box(0, 0, 5 + H * 0.9, 2.4, 2.4, H * 0.1, shadeColor(mass, 1.5)); // spire

  // Edge-lit architecture: neon strips up the podium's two front corners
  // (the 2D grand identity read — bright edges against dark mass).
  const stripH = H * 0.2;
  b.box(podium, podium * 0.8, 5, 1.1, 1.1, stripH, neon);
  b.box(-podium, -podium * 0.8, 5, 1.1, 1.1, stripH, neon);
  b.box(podium * 0.55, 0, 5 + H * 0.26, 1.4, midD + 1.4, H * 0.32, neon);
  b.box(-podium * 0.55, 0, 5 + H * 0.26, 1.4, midD + 1.4, H * 0.32, neon);

  // Elaboration ladder: each step adds one band / fin / crown light.
  if (step >= 1) b.box(0, 0, 5 + H * 0.2, podium * 1.02, podium * 0.82, 2, neon);
  if (step >= 2) {
    b.box(podium * 0.53, 0, 5 + H * 0.26, 3, 3, H * 0.3, glass);
    b.box(-podium * 0.53, 0, 5 + H * 0.26, 3, 3, H * 0.3, glass);
  }
  if (step >= 3) b.box(0, 0, 5 + H * 0.44, midW + 1.6, midD + 1.6, 3, neon);
  if (step >= 4) b.box(0, 0, 5 + H * 0.9, 0.3 * HALF_TILE, 0.3 * HALF_TILE, 2, neon);
  if (step >= 5) b.box(0, 0, 5 + H * 0.62, crownW + 1.6, crownW * 0.85 + 1.6, 2, neon);
  if (step >= 6) {
    b.box(podium * 0.72, podium * 0.72, 5, 4, 4, H * 0.16, mass);
    b.box(-podium * 0.72, -podium * 0.72, 5, 4, 4, H * 0.16, mass);
  }
  b.box(0, 0, 5 + H, 2.6, 2.6, 4, neon); // crown beacon

  // Grand window mosaic — neon-tinted lit panes on the two upper sections.
  if (windows) {
    addWindowMosaic(b, {
      seed,
      parity: (seed % 2) as 0 | 1,
      tint: neon,
      faces: [
        { face: "px", wallAt: midW, uMin: -midD, uMax: midD, basePx: 5 + H * 0.2, heightPx: H * 0.44 },
        { face: "pz", wallAt: midD, uMin: -midW, uMax: midW, basePx: 5 + H * 0.2, heightPx: H * 0.44 },
        { face: "px", wallAt: crownW, uMin: -crownW * 0.85, uMax: crownW * 0.85, basePx: 5 + H * 0.64, heightPx: H * 0.26 },
        { face: "pz", wallAt: crownW * 0.85, uMin: -crownW, uMax: crownW, basePx: 5 + H * 0.64, heightPx: H * 0.26 },
      ],
    });
  }
}

// ── hero fixtures (HQ core, the Six monuments) ────────────────────────────

/** HQ core: civic tower by value stage (heights authored per stage). */
export function buildHqGeometry(stage: HeroStage): BuildingGeometry3D {
  const b = new MeshBuilder();
  const mass = new Color("#3d4654");
  const warm = new Color("#ffd9a0");
  const H = stage >= 3 ? 240 : stage === 2 ? 175 : 128;
  b.box(0, 0, 0, 0.62 * HALF_TILE, 0.62 * HALF_TILE, 6, new Color("#2a3140"));
  b.box(0, 0, 6, 0.5 * HALF_TILE, 0.5 * HALF_TILE, H * 0.18, mass);
  b.box(0, 0, 6 + H * 0.18, 0.34 * HALF_TILE, 0.34 * HALF_TILE, H * 0.62, mass);
  b.box(0, 0, 6 + H * 0.8, 0.42 * HALF_TILE, 0.42 * HALF_TILE, H * 0.06, shadeColor(mass, 1.35));
  b.box(0, 0, 6 + H * 0.86, 0.26 * HALF_TILE, 0.26 * HALF_TILE, H * 0.08, shadeColor(mass, 1.5));
  b.box(0, 0, 6 + H * 0.94, 2.6, 2.6, H * 0.06, shadeColor(mass, 1.6));
  // HQ window mosaic (warm civic glass, full shaft).
  addWindowMosaic(b, {
    seed: 424242,
    faces: [
      { face: "px", wallAt: 0.34 * HALF_TILE, uMin: -0.34 * HALF_TILE, uMax: 0.34 * HALF_TILE, basePx: 6 + H * 0.18, heightPx: H * 0.62 },
      { face: "pz", wallAt: 0.34 * HALF_TILE, uMin: -0.34 * HALF_TILE, uMax: 0.34 * HALF_TILE, basePx: 6 + H * 0.18, heightPx: H * 0.62 },
    ],
  });
  // Warm window bands (the de-neon'd civic palette) — light slabs at the
  // setback shoulders, distinct from the pane mosaic.
  for (let i = 1; i <= 3; i++) {
    b.box(0, 0, 6 + H * (0.18 + 0.14 * i), 0.35 * HALF_TILE, 0.35 * HALF_TILE, 2, warm);
  }
  b.box(0, 0, 6 + H, 3, 3, 4, warm);
  return { geometry: b.toGeometry(), topPx: H + 10 };
}

/**
 * One of the Six monuments: distinct massing per roster index with the
 * landmark accent color; unowned monuments render dimmed (same form).
 */
export function buildMonumentGeometry(
  index: number,
  stage: HeroStage,
  owned: boolean
): BuildingGeometry3D {
  const b = new MeshBuilder();
  const accent = new Color(LANDMARK_COLORS[index % LANDMARK_COLORS.length]);
  const mass = new Color("#39414f");
  const dim = owned ? 1 : 0.55;
  const body = new Color(mass.r * dim, mass.g * dim, mass.b * dim);
  const acc = new Color(accent.r * dim, accent.g * dim, accent.b * dim);
  const H = stage >= 3 ? 150 : stage === 2 ? 120 : 96;
  b.box(0, 0, 0, 0.56 * HALF_TILE, 0.56 * HALF_TILE, 5, new Color("#242b38"));
  switch (index % 6) {
    case 0: // sky spire
      b.prism8(0, 0, 5, 0.26 * HALF_TILE, H, body);
      b.box(0, 0, 5 + H, 2.4, 2.4, 14, acc);
      break;
    case 1: // amber gate
      b.box(0.2 * HALF_TILE, 0, 5, 0.16 * HALF_TILE, 0.3 * HALF_TILE, H, body);
      b.box(-0.2 * HALF_TILE, 0, 5, 0.16 * HALF_TILE, 0.3 * HALF_TILE, H, body);
      b.box(0, 0, 5 + H, 0.3 * HALF_TILE, 0.34 * HALF_TILE, 8, acc);
      break;
    case 2: // violet ziggurat
      b.box(0, 0, 5, 0.4 * HALF_TILE, 0.4 * HALF_TILE, H * 0.4, body);
      b.box(0, 0, 5 + H * 0.4, 0.28 * HALF_TILE, 0.28 * HALF_TILE, H * 0.3, body);
      b.box(0, 0, 5 + H * 0.7, 0.16 * HALF_TILE, 0.16 * HALF_TILE, H * 0.3, acc);
      break;
    case 3: // teal reactor
      b.prism8(0, 0, 5, 0.3 * HALF_TILE, H * 0.75, body);
      b.prism8(0, 0, 5 + H * 0.75, 0.36 * HALF_TILE, 3, acc);
      b.box(0, 0, 5 + H * 0.78, 2, 2, H * 0.22, acc);
      break;
    case 4: // crimson bastion
      b.box(0, 0, 5, 0.42 * HALF_TILE, 0.42 * HALF_TILE, H * 0.55, body);
      b.box(0.24 * HALF_TILE, 0.24 * HALF_TILE, 5 + H * 0.55, 0.1 * HALF_TILE, 0.1 * HALF_TILE, H * 0.45, body);
      b.box(-0.24 * HALF_TILE, -0.24 * HALF_TILE, 5 + H * 0.55, 0.1 * HALF_TILE, 0.1 * HALF_TILE, H * 0.45, acc);
      break;
    default: // gold rotunda
      b.prism8(0, 0, 5, 0.34 * HALF_TILE, H * 0.6, body);
      b.prism8(0, 0, 5 + H * 0.6, 0.24 * HALF_TILE, H * 0.12, shadeColor(body, 1.3));
      b.prism8(0, 0, 5 + H * 0.72, 0.13 * HALF_TILE, H * 0.08, acc);
      break;
  }
  // Monument accent slits — a few lit panes in the landmark's own color.
  addWindowMosaic(b, {
    seed: 1000 + index,
    tint: accent,
    faces: [
      { face: "px", wallAt: 0.3 * HALF_TILE, uMin: -0.22 * HALF_TILE, uMax: 0.22 * HALF_TILE, basePx: 5 + H * 0.12, heightPx: H * 0.55 },
      { face: "pz", wallAt: 0.3 * HALF_TILE, uMin: -0.22 * HALF_TILE, uMax: 0.22 * HALF_TILE, basePx: 5 + H * 0.12, heightPx: H * 0.55 },
    ],
  });
  return { geometry: b.toGeometry(), topPx: H + 6 };
}

/** Ground selection ring for a tile occupant. */
export function buildSelectionRingGeometry(color: number): BufferGeometry {
  const b = new MeshBuilder();
  b.diamondRing(0, 0, 1.02, 0.86, new Color(color));
  return b.toGeometry();
}

/** Shared ground plate half-extent (covers the 3×3 macro grid + rim). */
export function groundPlateHalfExtent(): number {
  const stride = 32 + 2;
  return 4.5 * stride * TILE_STEP;
}
