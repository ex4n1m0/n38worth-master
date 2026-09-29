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
 */
class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];

  /**
   * Quad face from 4 corner positions ordered as a loop; colors get a
   * vertical gradient between `bot` and `top` shades (flat when equal).
   */
  private quad(
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

  toGeometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    return g;
  }
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
    buildGrand(b, profession, tier - GRAND_MIN_TIER, jitter);
  } else {
    buildCivic(b, profession, tier, jitter);
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
  jitter: number
): void {
  const mass = massColor(profession);
  const neon = neonColor(profession);
  const l = ladderOf(profession);
  const H = (l.baseH + (tier - 1) * l.floorH) * jitter;
  platform(b);
  const fam = profession ?? UNASSIGNED_FAMILY;
  const light = (k: number) => shadeColor(mass, k);

  // Family silhouette base — approximations of the 2D identity; refined in
  // the dedicated look-and-feel pass.
  switch (fam) {
    case "Server Marshal": {
      // Rack slab tower: uniform width, full height.
      const w = 0.34 * HALF_TILE;
      b.box(0, 0, 5, w, w * 0.72, H, mass);
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
      break;
    }
    case "Cryptographer": {
      // Octagon rotunda + stepped dome.
      b.prism8(0, 0, 5, 0.42 * HALF_TILE * jitter, H * 0.8, mass);
      b.prism8(0, 0, 5 + H * 0.8, 0.3 * HALF_TILE, H * 0.14, light(1.3));
      b.prism8(0, 0, 5 + H * 0.94, 0.17 * HALF_TILE, H * 0.06, light(1.55));
      break;
    }
    case "Overclocker": {
      // Reactor cylinder + neon coil rings.
      b.prism8(0, 0, 5, 0.34 * HALF_TILE * jitter, H, mass);
      b.prism8(0, 0, 5 + H * 0.45, 0.44 * HALF_TILE, 2, neon);
      b.prism8(0, 0, 5 + H * 0.8, 0.4 * HALF_TILE, 2, neon);
      break;
    }
    case "Cache Keeper": {
      // Stepped vault block.
      b.box(0, 0, 5, 0.46 * HALF_TILE, 0.42 * HALF_TILE, H * 0.55, mass);
      b.box(0, 0, 5 + H * 0.55, 0.3 * HALF_TILE, 0.28 * HALF_TILE, H * 0.45, light(1.6));
      break;
    }
    default: {
      // Unassigned / unknown: plain block.
      const w = 0.32 * HALF_TILE;
      b.box(0, 0, 5, w, w * 0.8, H, mass);
    }
  }

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
 * one more elaboration per step (step = tier − 8) — parametric code-plotted
 * architecture; bespoke look refined in the user's art pass.
 */
function buildGrand(
  b: MeshBuilder,
  profession: string | null,
  step: number,
  jitter: number
): void {
  const mass = massColor(profession);
  const neon = neonColor(profession);
  const glass = mass.clone().lerp(neon, 0.25); // chroma glass (mixRGB ~25%)
  const l = ladderOf(profession);
  const H = (l.grandBaseH + step * l.grandFloorH) * jitter;
  platform(b, PLATFORM_FACTOR * 1.02);

  const podium = 0.66 * HALF_TILE;
  b.box(0, 0, 5, podium, podium * 0.8, H * 0.2, mass);
  b.box(0, 0, 5 + H * 0.2, podium * 0.5, podium * 0.4, H * 0.44, mass);
  b.box(0, 0, 5 + H * 0.64, podium * 0.36, podium * 0.31, H * 0.26, glass);
  b.box(0, 0, 5 + H * 0.9, 2.4, 2.4, H * 0.1, shadeColor(mass, 1.5)); // spire

  // Elaboration ladder: each step adds one band / fin.
  if (step >= 1) b.box(0, 0, 5 + H * 0.2, podium * 1.02, podium * 0.82, 2, neon);
  if (step >= 2) {
    b.box(podium * 0.53, 0, 5 + H * 0.26, 3, 3, H * 0.3, glass);
    b.box(-podium * 0.53, 0, 5 + H * 0.26, 3, 3, H * 0.3, glass);
  }
  if (step >= 3) b.box(0, 0, 5 + H * 0.44, podium * 0.52, podium * 0.42, 3, neon);
  if (step >= 4) b.box(0, 0, 5 + H * 0.9, 0.3 * HALF_TILE, 0.3 * HALF_TILE, 2, neon);
  if (step >= 5) b.box(0, 0, 5 + H * 0.62, podium * 0.47, podium * 0.4, 2, neon);
  if (step >= 6) {
    b.box(podium * 0.72, podium * 0.72, 5, 4, 4, H * 0.16, mass);
    b.box(-podium * 0.72, -podium * 0.72, 5, 4, 4, H * 0.16, mass);
  }
  b.box(0, 0, 5 + H, 2.6, 2.6, 4, neon); // crown beacon
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
  // Warm window bands (the de-neon'd civic palette).
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
