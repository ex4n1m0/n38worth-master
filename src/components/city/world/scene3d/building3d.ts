/**
 * Mainframe City 3D — procedural building geometry (three.js).
 *
 * AAA GRAPHICS PASS (2026-09-30, user ruling "full-on max quality"): the
 * builders now emit lit-pipeline geometry — outward-consistent winding
 * (FrontSide), authored normals per face, and UV grids that map wall spans
 * onto WINDOW cells with EXACTLY the metrics of the lit-window mosaic
 * (WINDOW_COL_STEP × WINDOW_ROW_STEP_PX), so at night the glowing panes sit
 * inside the facade texture's recessed windows. Massing is SC4-flavored:
 * podium + shaft + setbacks with cornice bands, pilaster columns, parapets,
 * rooftop mechanicals (penthouse / AC units / vents / water towers / masts
 * with red LED tips), entrance canopies with warm light, and per-family
 * neon accents.
 *
 * MATERIAL GROUPS (the mesh renders through a shared material ARRAY):
 *   0 family facade skin (textured, lit)
 *   1..4 window channels A0/A1/B0/B1 (unlit, light-clock animated)
 *   5 emissive accents (unlit: neon strips, LED tips, canopy light)
 *   6 roof/trim (tar+gravel skin — mechanicals, parapets, cornices)
 *   7 concrete (platforms, plinths)
 *
 * The 2D renderer's height ladders and family identities carry over
 * unchanged (familyTopHeightPx is pinned by tests to the art manifest).
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

/** Material group indices (see the module header). */
export const GROUP_FACADE = 0;
export const GROUP_EMISSIVE = 5;
export const GROUP_ROOF = 6;
export const GROUP_CONCRETE = 7;

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
  // 3D-only albedo lift: the shared lib palette is tuned for the unlit 2D
  // renderer; the lit pipeline wants ~16% lighter masses so sunlit facades
  // read sun-washed instead of muddy.
  return new Color(familyMassHex(profession ?? UNASSIGNED_FAMILY)).lerp(
    new Color(1, 1, 1),
    0.16
  );
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

/**
 * Accumulates vertices with position + color + NORMAL + UV attributes and
 * material groups. Heights are authored in SCREEN PX (converted via
 * PIXEL_RISE) so every number matches the 2D art budget 1:1. Winding is
 * OUTWARD-CONSISTENT (CCW seen from outside) so materials can use FrontSide;
 * the quad normal is derived from the winding itself.
 *
 * GROUPS: the builder marks material groups (facade=0, window channels
 * A0=1, A1=2, B0=3, B1=4, emissive=5, roof=6, concrete=7) so ONE mesh per
 * building renders through a material ARRAY — the shared channel materials
 * animate the whole city's window mosaic with zero per-vertex updates.
 */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];
  private readonly groups: Array<{ start: number; count: number; material: number }> = [];
  private groupStart = 0;
  private currentMaterial = 0;

  /** Switch the active material group (see the module header for indices). */
  setMaterial(material: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7): void {
    if (material === this.currentMaterial) return;
    const count = this.indices.length - this.groupStart;
    if (count > 0) {
      this.groups.push({ start: this.groupStart, count, material: this.currentMaterial });
    }
    this.groupStart = this.indices.length;
    this.currentMaterial = material;
  }

  /**
   * Quad face from 4 corner positions ordered CCW seen from OUTSIDE; the
   * geometric normal is computed from the winding. Colors get a vertical
   * gradient between `bot` and `top` (flat when equal). `uvs` are the 4
   * matching texture coordinates (same order as the points; omit for 0..1).
   */
  quad(
    p: ReadonlyArray<readonly [number, number, number]>,
    top: Color,
    bot: Color,
    uvs?: ReadonlyArray<readonly [number, number]>
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
    // Outward normal from the fixed CCW winding.
    const ax = p[1][0] - p[0][0];
    const ay = p[1][1] - p[0][1];
    const az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0];
    const by = p[2][1] - p[0][1];
    const bz = p[2][2] - p[0][2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    for (let i = 0; i < 4; i++) {
      this.normals.push(nx, ny, nz);
      const uv = uvs?.[i] ?? [i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : 1];
      this.uvs.push(uv[0], uv[1]);
    }
    this.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }

  /**
   * Append another builder's geometry, uniformly scaled + offset (used to
   * merge windowless minis into the world-layer meshes). Copies every
   * attribute, re-bases indices, and re-bases the other's CLOSED material
   * groups onto this builder's index buffer (appended groups always sort
   * after everything already emitted).
   */
  append(other: MeshBuilder, ox: number, oz: number, k: number): void {
    const vBase = this.positions.length / 3;
    const iBase = this.indices.length;
    for (let i = 0; i < other.positions.length; i += 3) {
      this.positions.push(
        other.positions[i] * k + ox,
        other.positions[i + 1] * k,
        other.positions[i + 2] * k + oz
      );
    }
    for (const c of other.colors) this.colors.push(c);
    for (const n of other.normals) this.normals.push(n);
    for (const u of other.uvs) this.uvs.push(u);
    for (const idx of other.indices) this.indices.push(idx + vBase);
    // Close this builder's open run, then splice in the other's groups with
    // starts shifted past everything we had (keeps groups index-ordered).
    this.closeOpenGroup();
    for (const g of other.closedGroups()) {
      this.groups.push({ start: iBase + g.start, count: g.count, material: g.material });
    }
    this.groupStart = this.indices.length;
    this.currentMaterial = 0;
  }

  /** Close the open material run (if any) — append/toGeometry helper. */
  private closeOpenGroup(): void {
    const count = this.indices.length - this.groupStart;
    if (count > 0) {
      this.groups.push({
        start: this.groupStart,
        count,
        material: this.currentMaterial,
      });
    }
  }

  /** This builder's groups with the open run closed — append helper. */
  private closedGroups(): Array<{ start: number; count: number; material: number }> {
    this.closeOpenGroup();
    return this.groups;
  }

  /**
   * Append a BUILT geometry (position/color/normal/uv + index), scaled +
   * offset — used by the world layers to merge windowless minis into their
   * single-material distant meshes (the source's groups are ignored).
   */
  appendGeometry(g: BufferGeometry, ox: number, oz: number, k: number): void {
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    const nrm = g.getAttribute("normal");
    const uv = g.getAttribute("uv");
    const idx = g.getIndex();
    if (!pos || !col || !nrm || !uv || !idx) return;
    this.closeOpenGroup();
    const vBase = this.positions.length / 3;
    for (let i = 0; i < pos.count; i++) {
      this.positions.push(
        pos.getX(i) * k + ox,
        pos.getY(i) * k,
        pos.getZ(i) * k + oz
      );
      this.colors.push(col.getX(i), col.getY(i), col.getZ(i));
      this.normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      this.uvs.push(uv.getX(i), uv.getY(i));
    }
    for (let i = 0; i < idx.count; i++) {
      this.indices.push(idx.getX(i) + vBase);
    }
    this.groupStart = this.indices.length;
    this.currentMaterial = 0;
  }

  /** Wall-grid metrics shared with the window mosaic (texture alignment). */
  static readonly WINDOW_COL_STEP = 8.4;
  static readonly WINDOW_ROW_STEP_PX = 8.5;

  /**
   * Column/row count for a wall span, matching addWindowMosaic exactly —
   * the facade texture's window cells and the lit panes share one grid.
   */
  static gridCols(width: number): number {
    return Math.max(1, Math.floor(width / MeshBuilder.WINDOW_COL_STEP));
  }

  static gridRows(heightPx: number): number {
    return Math.max(1, Math.floor((heightPx - 6) / MeshBuilder.WINDOW_ROW_STEP_PX));
  }

  /**
   * Extruded box; base center (cx, cz) at height basePx (screen px above
   * ground), extents halfX/halfZ, height heightPx (screen px). `uv` picks
   * the texture mapping:
   *   "grid"     — window-cell grid aligned to the lit-pane mosaic (facades)
   *   "roof"     — world-scaled tiling (tar/gravel, concrete)
   *   "concrete" — paver grid, world-scaled
   *   "plain"    — 0..1 per face
   * Vertical vertex gradient (top→bot) bakes a soft ground-in AO.
   */
  box(
    cx: number,
    cz: number,
    basePx: number,
    halfX: number,
    halfZ: number,
    heightPx: number,
    color: Color,
    uv: "grid" | "roof" | "concrete" | "plain" = "plain",
    opts?: { noBottom?: boolean; noTop?: boolean }
  ): void {
    const y0 = basePx * PIXEL_RISE;
    const y1 = (basePx + heightPx) * PIXEL_RISE;
    const x0 = cx - halfX;
    const x1 = cx + halfX;
    const z0 = cz - halfZ;
    const z1 = cz + halfZ;
    const v3 = (x: number, y: number, z: number) => [x, y, z] as const;
    const wallBot = shadeColor(color, 0.85);
    const wallTop = color;

    // UV helpers per face: (widthUnits, heightPx) → the 4 corner UVs in the
    // loop order [bl, br, tr, tl] of each face below.
    const faceUV = (
      w: number,
      h: number,
      quadCoords: ReadonlyArray<readonly [number, number]>
    ): Array<readonly [number, number]> => {
      if (uv === "grid") {
        const cols = MeshBuilder.gridCols(w);
        const rows = MeshBuilder.gridRows(h);
        return quadCoords.map(([u, v]) => [u * cols, v * rows] as const);
      }
      if (uv === "roof" || uv === "concrete") {
        const tile = uv === "roof" ? 22 : 30;
        return quadCoords.map(([u, v]) => [u * (w / tile), v * (h / tile)] as const);
      }
      return quadCoords.map(([u, v]) => [u, v] as const);
    };
    const qBLBRTRTL: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];

    // +x wall (screen right — the sunlit read). CCW from outside.
    this.quad(
      [v3(x1, y0, z1), v3(x1, y0, z0), v3(x1, y1, z0), v3(x1, y1, z1)],
      wallTop,
      wallBot,
      faceUV(halfZ * 2, heightPx, qBLBRTRTL)
    );
    // −x wall (hidden).
    this.quad(
      [v3(x0, y0, z0), v3(x0, y0, z1), v3(x0, y1, z1), v3(x0, y1, z0)],
      wallTop,
      wallBot,
      faceUV(halfZ * 2, heightPx, qBLBRTRTL)
    );
    // +z wall (screen left). CCW from outside.
    this.quad(
      [v3(x0, y0, z1), v3(x1, y0, z1), v3(x1, y1, z1), v3(x0, y1, z1)],
      wallTop,
      wallBot,
      faceUV(halfX * 2, heightPx, qBLBRTRTL)
    );
    // −z wall (hidden).
    this.quad(
      [v3(x1, y0, z0), v3(x0, y0, z0), v3(x0, y1, z0), v3(x1, y1, z0)],
      wallTop,
      wallBot,
      faceUV(halfX * 2, heightPx, qBLBRTRTL)
    );
    // Roof (top face up).
    this.quad(
      [v3(x0, y1, z1), v3(x1, y1, z1), v3(x1, y1, z0), v3(x0, y1, z0)],
      color,
      color,
      faceUV(halfX * 2, halfZ * 2, qBLBRTRTL)
    );
    if (!opts?.noBottom) {
      this.quad(
        [v3(x0, y0, z0), v3(x1, y0, z0), v3(x1, y0, z1), v3(x0, y0, z1)],
        shadeColor(color, 0.5),
        shadeColor(color, 0.5),
        faceUV(halfX * 2, halfZ * 2, qBLBRTRTL)
      );
    }
  }

  /** Octagonal prism — cylinders read as clean low-poly at iso distance. */
  prism8(
    cx: number,
    cz: number,
    basePx: number,
    radius: number,
    heightPx: number,
    color: Color,
    uv: "grid" | "roof" | "plain" = "plain"
  ): void {
    const segs = 8;
    const y0 = basePx * PIXEL_RISE;
    const y1 = (basePx + heightPx) * PIXEL_RISE;
    const wallBot = shadeColor(color, 0.8);
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2 + Math.PI / 8;
      const a1 = ((s + 1) / segs) * Math.PI * 2 + Math.PI / 8;
      const x0 = cx + Math.cos(a0) * radius;
      const z0 = cz + Math.sin(a0) * radius;
      const x1 = cx + Math.cos(a1) * radius;
      const z1 = cz + Math.sin(a1) * radius;
      // CCW from outside (angle-decreasing loop order).
      const arc = Math.abs(a1 - a0) * radius;
      let uvq: Array<readonly [number, number]> | undefined;
      if (uv === "grid") {
        const cols = Math.max(1, Math.round(arc / MeshBuilder.WINDOW_COL_STEP));
        const rows = MeshBuilder.gridRows(heightPx);
        uvq = [
          [0, 0],
          [cols, 0],
          [cols, rows],
          [0, rows],
        ];
      } else if (uv === "roof") {
        uvq = [
          [0, 0],
          [arc / 22, 0],
          [arc / 22, heightPx / 22],
          [0, heightPx / 22],
        ];
      }
      this.quad(
        [
          [x1, y0, z1],
          [x0, y0, z0],
          [x0, y1, z0],
          [x1, y1, z1],
        ],
        color,
        wallBot,
        uvq
      );
    }
    // Roof fan (flat, up-facing).
    const roof = shadeColor(color, 1.05);
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2 + Math.PI / 8;
      const a1 = ((s + 1) / segs) * Math.PI * 2 + Math.PI / 8;
      this.quad(
        [
          [cx, y1, cz],
          [cx + Math.cos(a1) * radius, y1, cz + Math.sin(a1) * radius],
          [cx + Math.cos(a0) * radius, y1, cz + Math.sin(a0) * radius],
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
    // Up-facing halves, CCW from above.
    this.quad(
      [
        [cx, y, cz - o],
        [cx - o, y, cz],
        [cx, y, cz + o],
        [cx - i, y, cz],
      ],
      color,
      color
    );
    this.quad(
      [
        [cx, y, cz - o],
        [cx + i, y, cz],
        [cx, y, cz + o],
        [cx + o, y, cz],
      ],
      color,
      color
    );
  }

  /**
   * One WINDOW pane: a flat quad on a facade, offset outward so it never
   * z-fights the wall. `face` picks the visible wall plane (+x screen-right
   * or +z screen-left); u positions the pane across the wall; the vertical
   * span is [basePx, basePx+hPx] in screen-px budget.
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
          [x, y0, u1],
          [x, y0, u0],
          [x, y1, u0],
          [x, y1, u1],
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
    // builder already ended on the same material — the run would be orphaned).
    this.closeOpenGroup();
    this.groupStart = this.indices.length;
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.colors, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.normals, 3));
    g.setAttribute("uv", new Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.indices);
    for (const grp of this.groups) {
      g.addGroup(grp.start, grp.count, grp.material);
    }
    return g;
  }
}

function shadeColor(c: Color, k: number): Color {
  return new Color(
    Math.min(1, c.r * k),
    Math.min(1, c.g * k),
    Math.min(1, c.b * k)
  );
}

// ── window mosaics (the night light identity — every LOD, every building) ──

/** How far a window's grid row/col spans in ground units and px. */
const WINDOW_W = 4.2;
const WINDOW_H_PX = 3.4;

/**
 * Seeded two-channel lit-window mosaic over a building's two VISIBLE
 * facades (+x screen-right, +z screen-left). Panes render through the
 * shared channel materials so the light clock can churn them city-wide.
 * Pane centers sit EXACTLY on the facade texture's window-cell centers
 * (MeshBuilder.gridCols/gridRows is the shared grid), so the lit glass at
 * night glows from inside the texture's recessed windows.
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
    /** Lit probability (grand glass towers glow denser). */
    density?: number;
  }
): void {
  const rng = mulberry32(opts.seed * 747796405 + 2891336453);
  const matA: 1 | 2 = opts.parity === 1 ? 2 : 1;
  const matB: 3 | 4 = opts.parity === 1 ? 4 : 3;
  const tintW = opts.tint
    ? new Color(1, 1, 1).lerp(opts.tint, 0.22)
    : new Color(1, 1, 1);
  const density = opts.density ?? 0.74;
  let anyA = false;
  let anyB = false;
  const panes: Array<{
    channel: 0 | 1;
    args: Parameters<MeshBuilder["windowPane"]>;
  }> = [];
  for (const f of opts.faces) {
    const span = f.uMax - f.uMin;
    if (span < WINDOW_W * 1.6 || f.heightPx < 12) continue;
    const cols = MeshBuilder.gridCols(span);
    const colStep = span / cols;
    const rows = MeshBuilder.gridRows(f.heightPx);
    const rowStep = f.heightPx / rows;
    for (let r = 0; r < rows; r++) {
      const groundFloor = r === 0;
      // Cell-center v (the texture window sits at 0.51 of the cell).
      const y = f.basePx + (r + 0.51) * rowStep;
      for (let c = 0; c < cols; c++) {
        const u = f.uMin + colStep * (c + 0.5);
        if (rng() >= (groundFloor ? 0.92 : density)) continue; // dark pane
        const channel: 0 | 1 = rng() < 0.55 ? 0 : 1;
        // Lit panes carry BRIGHTNESS VARIANCE in vertex colors (near-white
        // so the shared warm material defines the hue).
        const bright = Math.min(1.25, 0.7 + rng() * 0.5) * (groundFloor ? 1.2 : 1);
        const color = new Color(
          tintW.r * bright,
          tintW.g * bright * 0.96,
          tintW.b * bright * 0.9
        );
        panes.push({
          channel,
          args: [f.face, f.wallAt, u, WINDOW_W * 0.5, y - WINDOW_H_PX / 2, WINDOW_H_PX, color],
        });
        if (channel === 0) anyA = true;
        else anyB = true;
      }
    }
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
  b.setMaterial(GROUP_FACADE);
}

// ── shared architectural vocabulary (SC4-flavored, all procedural) ─────────

interface RooftopOpts {
  tier: BuildingTier;
  seed: number;
  rng: () => number;
  mass: Color;
  neon: Color;
  halfX: number;
  halfZ: number;
  basePx: number;
  /** Cap the prop set (minis render silhouette-only). */
  detail: boolean;
}

/**
 * Rooftop kit: parapet ring, mechanical penthouse, AC array, vents, an
 * optional water tower, antenna mast with a red LED tip, and the tier
 * feature ladder (halo disc / crown / spire tip).
 */
function addRooftop(b: MeshBuilder, o: RooftopOpts): void {
  const { halfX: hx, halfZ: hz, basePx: top } = o;
  if (!o.detail) return;
  // Parapet ring (4 thin roof-textured lips).
  const p = 1.6;
  b.setMaterial(GROUP_ROOF);
  b.box(0, 0, top, hx + p, p, 2, shadeColor(o.mass, 0.55), "roof", { noBottom: true });
  b.box(0, 0, top, p, hz + p, 2, shadeColor(o.mass, 0.55), "roof", { noBottom: true });
  // Mechanical penthouse + AC array + vents (seeded layout).
  const phw = hx * 0.42;
  const phz = hz * 0.4;
  b.box(
    -hx * 0.35, hz * 0.3, top + 2,
    phw, phz, 5 + o.tier * 0.5,
    shadeColor(o.mass, 0.72), "roof", { noBottom: true }
  );
  const acN = 3 + Math.min(4, Math.floor(o.tier / 2));
  for (let i = 0; i < acN; i++) {
    const ax = (o.rng() - 0.5) * hx * 1.1;
    const az = (o.rng() - 0.5) * hz * 1.1;
    if (Math.abs(ax + hx * 0.35) < phw + 2 && Math.abs(az - hz * 0.3) < phz + 2) continue;
    b.box(ax, az, top + 2, 3.4, 2.4, 2.2, shadeColor(o.mass, 0.62), "roof", { noBottom: true });
  }
  const vents = 1 + (o.seed % 2);
  for (let i = 0; i < vents; i++) {
    b.prism8(hx * (0.2 + i * 0.35), -hz * 0.4, top + 2, 1.1, 3.5, shadeColor(o.mass, 0.5), "roof");
  }
  // Water tower (tier 4+, masonry families, ~45% by seed).
  const masonry = o.seed % 3 !== 0;
  if (o.tier >= 4 && masonry && o.rng() < 0.45) {
    const wx = hx * 0.45;
    const wz = -hz * 0.45;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      b.box(wx + dx * 2.6, wz + dz * 2.6, top + 2, 0.7, 0.7, 5, shadeColor(o.mass, 0.45), "roof");
    }
    b.prism8(wx, wz, top + 7, 3.6, 6, shadeColor(o.mass, 0.78), "roof");
    b.prism8(wx, wz, top + 13, 3.2, 2, shadeColor(o.mass, 0.6), "roof");
  }
  b.setMaterial(GROUP_FACADE);

  // Antenna mast (tier 3+) + red LED tip (emissive, blooms at night).
  const mastH = o.tier >= 3 ? 14 + o.tier * 2 : 0;
  if (mastH > 0) {
    b.setMaterial(GROUP_ROOF);
    b.box(hx * 0.2, -hz * 0.15, top, 0.8, 0.8, mastH, shadeColor(o.mass, 0.6), "roof");
    b.setMaterial(GROUP_EMISSIVE);
    b.box(hx * 0.2, -hz * 0.15, top + mastH, 1.1, 1.1, 1.6, new Color("#ff2a2a"));
    b.setMaterial(GROUP_FACADE);
  }

  // Tier feature ladder (the family's crown identity, mirrors art.ts).
  if (o.tier >= 5) {
    b.setMaterial(GROUP_EMISSIVE);
    b.box(0, 0, top + 2.5, o.halfX * 0.55, o.halfZ * 0.55, 1.2, o.neon);
    b.setMaterial(GROUP_FACADE);
  }
  if (o.tier >= 6) {
    b.setMaterial(GROUP_ROOF);
    b.box(0, 0, top + 5, o.halfX * 0.4, o.halfZ * 0.4, 6, shadeColor(o.mass, 1.1), "roof");
    b.setMaterial(GROUP_FACADE);
  }
  if (o.tier >= 7) {
    b.setMaterial(GROUP_ROOF);
    b.box(0, 0, top + 11, o.halfX * 0.24, o.halfZ * 0.24, 12, shadeColor(o.mass, 1.05), "roof");
    b.setMaterial(GROUP_EMISSIVE);
    b.box(0, 0, top + 23, 1.8, 1.8, 2.4, o.neon);
    b.setMaterial(GROUP_FACADE);
  } else {
    b.setMaterial(GROUP_EMISSIVE);
    b.box(0, 0, top + (o.tier >= 6 ? 12 : 2), 1.6, 1.6, 2.2, o.neon);
    b.setMaterial(GROUP_FACADE);
  }
}

/** Entrance: canopy slab + warm light quad at the +x (sunlit) face base. */
function addEntrance(
  b: MeshBuilder,
  hx: number,
  mass: Color,
  basePx: number,
  detail: boolean
): void {
  if (!detail) return;
  b.setMaterial(GROUP_ROOF);
  b.box(hx + 1.5, 0, basePx + 8, 3.2, hx * 0.5, 1.4, shadeColor(mass, 0.6), "roof", { noBottom: true });
  b.setMaterial(GROUP_EMISSIVE);
  const warm = new Color("#ffc98a");
  b.box(hx + 0.6, 0, basePx, 0.4, hx * 0.42, 7, warm);
  b.setMaterial(GROUP_FACADE);
}

// ── building assembly ─────────────────────────────────────────────────────

export interface BuildingGeometry3D {
  geometry: BufferGeometry;
  /** Body-top height in screen px (label/selection anchors). */
  topPx: number;
}

/** Shared construction: concrete plinth slab under every building. */
function platform(b: MeshBuilder, factor = PLATFORM_FACTOR): void {
  b.setMaterial(GROUP_CONCRETE);
  b.box(0, 0, 0, factor * HALF_TILE, factor * HALF_TILE, 4.5, new Color("#8d8d86"), "concrete");
  // Curb lip (a slightly larger, darker step at the grass line).
  b.box(0, 0, 0, factor * HALF_TILE + 1.6, factor * HALF_TILE + 1.6, 1.4, new Color("#6f6f68"), "concrete");
  b.setMaterial(GROUP_FACADE);
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
 * massing, no windows and no rooftop/entrance detail (minis render through
 * the single distant material).
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

/**
 * Civic league (tiers 1–7): family silhouette in SC4-flavored massing —
 * storefront base, facade-grid shaft with corner pilasters and cornice
 * bands, rooftop mechanicals, family neon accent, entrance canopy.
 */
function buildCivic(
  b: MeshBuilder,
  profession: string | null,
  tier: BuildingTier,
  jitter: number,
  seed: number,
  detail = true
): void {
  const mass = massColor(profession);
  const neon = neonColor(profession);
  const l = ladderOf(profession);
  const H = (l.baseH + (tier - 1) * l.floorH) * jitter;
  const rng = mulberry32(seed * 2654435761 + 11);
  platform(b, detail ? PLATFORM_FACTOR : PLATFORM_FACTOR * 0.92);
  const fam = profession ?? UNASSIGNED_FAMILY;
  const light = (k: number) => shadeColor(mass, k);
  const dark = (k: number) => shadeColor(mass, k * 0.82);
  type Face = Parameters<typeof addWindowMosaic>[1]["faces"][number];
  const faces: Face[] = [];

  // Storefront base: a slightly proud, darker first section on every family.
  const baseH = Math.min(11, H * 0.24);
  const cornice = (cx: number, cz: number, atPx: number, hx: number, hz: number, k = 0.55) => {
    b.setMaterial(GROUP_ROOF);
    b.box(cx, cz, atPx, hx + 1.1, hz + 1.1, 1.6, shadeColor(mass, k), "roof", { noBottom: true });
    b.setMaterial(GROUP_FACADE);
  };

  switch (fam) {
    case "Server Marshal": {
      // Rack slab tower: uniform width, full height, vertical LED edges.
      const w = 0.34 * HALF_TILE;
      const d = w * 0.72;
      b.setMaterial(GROUP_FACADE);
      b.box(0, 0, 4.5, w, d, baseH, dark(0.9), "grid", { noBottom: true });
      cornice(0, 0, 4.5 + baseH, w, d);
      b.box(0, 0, 4.5 + baseH, w, d, H - baseH, mass, "grid", { noBottom: true });
      cornice(0, 0, 4.5 + H, w, d, 0.7);
      if (detail) {
        b.setMaterial(GROUP_EMISSIVE);
        b.box(w, d, 4.5 + baseH + 2, 0.5, 0.5, H - baseH - 6, neon);
        b.box(-w, -d, 4.5 + baseH + 2, 0.5, 0.5, H - baseH - 6, neon);
        b.setMaterial(GROUP_FACADE);
      }
      faces.push(
        { face: "px", wallAt: w, uMin: -d, uMax: d, basePx: 4.5, heightPx: H },
        { face: "pz", wallAt: d, uMin: -w, uMax: w, basePx: 4.5, heightPx: H }
      );
      addEntrance(b, w, mass, 4.5, detail);
      addRooftop(b, { tier, seed, rng, mass, neon, halfX: w, halfZ: d, basePx: 4.5 + H, detail });
      break;
    }
    case "Bot Herder": {
      // Wide hangar + two side bays, glowing bay doors.
      const main = 0.4 * HALF_TILE;
      const depth = main * 1.15;
      b.setMaterial(GROUP_FACADE);
      b.box(0, 0, 4.5, main, depth, baseH, dark(0.9), "grid", { noBottom: true });
      cornice(0, 0, 4.5 + baseH, main, depth);
      b.box(0, 0, 4.5 + baseH, main, depth, H - baseH, mass, "grid", { noBottom: true });
      cornice(0, 0, 4.5 + H, main, depth, 0.7);
      const bay = 0.19 * HALF_TILE;
      const off = 0.56 * HALF_TILE;
      for (const s of [-1, 1]) {
        b.box(s * off, 0, 4.5, bay, bay, H * 0.72, light(0.92), "grid", { noBottom: true });
        cornice(s * off, 0, 4.5 + H * 0.72, bay, bay);
      }
      if (detail) {
        b.setMaterial(GROUP_EMISSIVE);
        b.box(main, 0, 4.5 + 4, 0.4, bay * 1.2, 6, shadeColor(neon, 0.9));
        b.setMaterial(GROUP_FACADE);
      }
      faces.push(
        { face: "px", wallAt: main, uMin: -depth, uMax: depth, basePx: 4.5, heightPx: H },
        { face: "pz", wallAt: depth, uMin: -main, uMax: main, basePx: 4.5, heightPx: H },
        { face: "px", wallAt: off + bay, uMin: -bay, uMax: bay, basePx: 4.5, heightPx: H * 0.72 },
        { face: "px", wallAt: -off + bay, uMin: -bay, uMax: bay, basePx: 4.5, heightPx: H * 0.72 }
      );
      addEntrance(b, main, mass, 4.5, detail);
      addRooftop(b, { tier, seed, rng, mass, neon, halfX: main, halfZ: depth, basePx: 4.5 + H, detail });
      break;
    }
    case "Zero-Day": {
      // Twin towers + top bridge, twin masts.
      const w = 0.26 * HALF_TILE;
      const off = 0.3 * HALF_TILE;
      for (const s of [-1, 1]) {
        b.setMaterial(GROUP_FACADE);
        b.box(s * off, 0, 4.5, w, w, baseH, dark(0.9), "grid", { noBottom: true });
        cornice(s * off, 0, 4.5 + baseH, w, w);
        b.box(s * off, 0, 4.5 + baseH, w, w, H - baseH, mass, "grid", { noBottom: true });
        cornice(s * off, 0, 4.5 + H, w, w, 0.7);
      }
      if (tier >= 2) {
        b.setMaterial(GROUP_FACADE);
        b.box(0, 0, 4.5 + H, off + w, w * 0.5, 7, light(1.25), "grid", { noBottom: true });
        if (detail) {
          b.setMaterial(GROUP_EMISSIVE);
          b.box(0, w * 0.5, 4.5 + H + 2, off + w, 0.5, 1.6, neon);
          b.setMaterial(GROUP_FACADE);
        }
      }
      faces.push(
        { face: "px", wallAt: off + w, uMin: -w, uMax: w, basePx: 4.5, heightPx: H },
        { face: "px", wallAt: -off + w, uMin: -w, uMax: w, basePx: 4.5, heightPx: H },
        { face: "pz", wallAt: w, uMin: -off - w, uMax: off + w, basePx: 4.5, heightPx: H }
      );
      addEntrance(b, off + w, mass, 4.5, detail);
      addRooftop(b, { tier, seed, rng, mass, neon, halfX: off + w, halfZ: w, basePx: 4.5 + H, detail });
      break;
    }
    case "Cryptographer": {
      // Octagon rotunda + stepped dome + lantern (windows on inscribed box).
      const r = 0.42 * HALF_TILE * jitter;
      b.setMaterial(GROUP_FACADE);
      b.prism8(0, 0, 4.5, r, baseH, dark(0.9), "grid");
      b.prism8(0, 0, 4.5 + baseH, r, H * 0.8 - baseH, mass, "grid");
      cornice(0, 0, 4.5 + H * 0.8, r * 0.8, r * 0.8);
      b.prism8(0, 0, 4.5 + H * 0.8, 0.3 * HALF_TILE, H * 0.14, light(1.2), "grid");
      b.prism8(0, 0, 4.5 + H * 0.94, 0.17 * HALF_TILE, H * 0.06, light(1.4), "grid");
      if (detail) {
        b.setMaterial(GROUP_EMISSIVE);
        b.box(0, 0, 4.5 + H, 2.4, 2.4, 3, neon);
        b.setMaterial(GROUP_FACADE);
      }
      faces.push(
        { face: "px", wallAt: r * 0.78, uMin: -r * 0.78, uMax: r * 0.78, basePx: 4.5, heightPx: H * 0.8 },
        { face: "pz", wallAt: r * 0.78, uMin: -r * 0.78, uMax: r * 0.78, basePx: 4.5, heightPx: H * 0.8 }
      );
      addEntrance(b, r * 0.78, mass, 4.5, detail);
      addRooftop(b, { tier, seed, rng, mass, neon, halfX: 0.3 * HALF_TILE, halfZ: 0.3 * HALF_TILE, basePx: 4.5 + H, detail });
      break;
    }
    case "Overclocker": {
      // Reactor cylinder + neon coil rings (windows on the inscribed box).
      const r = 0.34 * HALF_TILE * jitter;
      b.setMaterial(GROUP_FACADE);
      b.prism8(0, 0, 4.5, r, baseH, dark(0.9), "grid");
      b.prism8(0, 0, 4.5 + baseH, r, H - baseH, mass, "grid");
      b.setMaterial(GROUP_ROOF);
      b.prism8(0, 0, 4.5 + H, r * 0.95, 2.5, shadeColor(mass, 0.7), "roof");
      b.setMaterial(GROUP_FACADE);
      if (detail) {
        b.setMaterial(GROUP_EMISSIVE);
        b.prism8(0, 0, 4.5 + H * 0.45, 0.44 * HALF_TILE, 1.6, neon);
        b.prism8(0, 0, 4.5 + H * 0.8, 0.4 * HALF_TILE, 1.6, neon);
        b.setMaterial(GROUP_FACADE);
      }
      faces.push(
        { face: "px", wallAt: r * 0.78, uMin: -r * 0.78, uMax: r * 0.78, basePx: 4.5, heightPx: H },
        { face: "pz", wallAt: r * 0.78, uMin: -r * 0.78, uMax: r * 0.78, basePx: 4.5, heightPx: H }
      );
      addEntrance(b, r * 0.78, mass, 4.5, detail);
      addRooftop(b, { tier, seed, rng, mass, neon, halfX: r * 0.8, halfZ: r * 0.8, basePx: 4.5 + H + 2.5, detail });
      break;
    }
    case "Cache Keeper": {
      // Stepped vault block with skylight crown.
      const w1 = 0.46 * HALF_TILE;
      const d1 = 0.42 * HALF_TILE;
      b.setMaterial(GROUP_FACADE);
      b.box(0, 0, 4.5, w1, d1, baseH, dark(0.9), "grid", { noBottom: true });
      cornice(0, 0, 4.5 + baseH, w1, d1);
      b.box(0, 0, 4.5 + baseH, w1, d1, H * 0.55 - baseH, mass, "grid", { noBottom: true });
      cornice(0, 0, 4.5 + H * 0.55, w1, d1, 0.7);
      const w2 = 0.3 * HALF_TILE;
      b.box(0, 0, 4.5 + H * 0.55, w2, 0.28 * HALF_TILE, H * 0.45, light(1.25), "grid", { noBottom: true });
      cornice(0, 0, 4.5 + H, w2, 0.28 * HALF_TILE);
      if (detail) {
        b.setMaterial(GROUP_EMISSIVE);
        b.box(0, 0, 4.5 + H + 1.6, 3.4, 3, 1.4, shadeColor(neon, 0.95));
        b.setMaterial(GROUP_FACADE);
      }
      faces.push(
        { face: "px", wallAt: w1, uMin: -d1, uMax: d1, basePx: 4.5, heightPx: H * 0.55 },
        { face: "pz", wallAt: d1, uMin: -w1, uMax: w1, basePx: 4.5, heightPx: H * 0.55 },
        { face: "px", wallAt: w2, uMin: -0.28 * HALF_TILE, uMax: 0.28 * HALF_TILE, basePx: 4.5 + H * 0.55, heightPx: H * 0.45 }
      );
      addEntrance(b, w1, mass, 4.5, detail);
      addRooftop(b, { tier, seed, rng, mass, neon, halfX: w2, halfZ: 0.28 * HALF_TILE, basePx: 4.5 + H, detail });
      break;
    }
    default: {
      // Unassigned / unknown: plain block with standard trim.
      const w = 0.32 * HALF_TILE;
      const d = w * 0.8;
      b.setMaterial(GROUP_FACADE);
      b.box(0, 0, 4.5, w, d, baseH, dark(0.9), "grid", { noBottom: true });
      cornice(0, 0, 4.5 + baseH, w, d);
      b.box(0, 0, 4.5 + baseH, w, d, H - baseH, mass, "grid", { noBottom: true });
      cornice(0, 0, 4.5 + H, w, d, 0.7);
      faces.push(
        { face: "px", wallAt: w, uMin: -d, uMax: d, basePx: 4.5, heightPx: H },
        { face: "pz", wallAt: d, uMin: -w, uMax: w, basePx: 4.5, heightPx: H }
      );
      addEntrance(b, w, mass, 4.5, detail);
      addRooftop(b, { tier, seed, rng, mass, neon, halfX: w, halfZ: d, basePx: 4.5 + H, detail });
    }
  }

  // The night light identity — lit-window mosaic on every tier/LOD
  // (skipped for satellite minis: silhouette-only, single material).
  if (detail) addWindowMosaic(b, { seed, faces, parity: (seed % 2) as 0 | 1 });
}

/**
 * GRAND league (tiers 8–14): setback megaform — arcaded podium, glass
 * curtain-wall shaft with pilaster fins, chroma-glass crown, spire with
 * beacon, neon edge strips, sky-lobby glow bands; one more elaboration per
 * step (step = tier − 8). Parametric code-plotted architecture.
 */
function buildGrand(
  b: MeshBuilder,
  profession: string | null,
  step: number,
  jitter: number,
  seed: number,
  detail = true
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
  const cornice = (atPx: number, hx: number, hz: number, k = 0.6) => {
    b.setMaterial(GROUP_ROOF);
    b.box(0, 0, atPx, hx + 1.2, hz + 1.2, 2, shadeColor(mass, k), "roof", { noBottom: true });
    b.setMaterial(GROUP_FACADE);
  };

  // Podium (arcade base + storefront band).
  b.setMaterial(GROUP_FACADE);
  b.box(0, 0, 4.5, podium, podium * 0.8, H * 0.06, shadeColor(mass, 0.82), "grid", { noBottom: true });
  b.box(0, 0, 4.5 + H * 0.06, podium, podium * 0.8, H * 0.14, shadeColor(mass, 0.95), "grid", { noBottom: true });
  cornice(4.5 + H * 0.2, podium, podium * 0.8, 0.7);

  // Mid shaft (the family facade skin) + corner pilaster fins.
  b.box(0, 0, 4.5 + H * 0.2, midW, midD, H * 0.44, mass, "grid", { noBottom: true });
  if (detail) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        b.box(sx * midW, sz * midD, 4.5 + H * 0.2, 1.2, 1.2, H * 0.44, shadeColor(mass, 0.9), "grid");
      }
    }
  }
  cornice(4.5 + H * 0.64, midW, midD, 0.65);

  // Chroma-glass crown + setback shoulders.
  b.box(0, 0, 4.5 + H * 0.64, crownW, crownW * 0.85, H * 0.26, glass, "grid", { noBottom: true });
  cornice(4.5 + H * 0.9, crownW, crownW * 0.85, 0.55);

  // Spire + beacon.
  b.setMaterial(GROUP_ROOF);
  b.box(0, 0, 4.5 + H * 0.9, 2.4, 2.4, H * 0.1, shadeColor(mass, 1.3), "roof");
  b.setMaterial(GROUP_EMISSIVE);
  b.box(0, 0, 4.5 + H, 2.6, 2.6, 4, neon);
  b.setMaterial(GROUP_FACADE);

  // Edge-lit architecture: neon strips up the podium's two front corners.
  if (detail) {
    b.setMaterial(GROUP_EMISSIVE);
    const stripH = H * 0.2;
    b.box(podium, podium * 0.8, 4.5, 1.1, 1.1, stripH, neon);
    b.box(-podium, -podium * 0.8, 4.5, 1.1, 1.1, stripH, neon);
    b.box(podium * 0.55, 0, 4.5 + H * 0.26, 1.4, midD + 1.4, H * 0.32, shadeColor(neon, 0.9));
    b.box(-podium * 0.55, 0, 4.5 + H * 0.26, 1.4, midD + 1.4, H * 0.32, shadeColor(neon, 0.9));
    // Sky-lobby glow band around the shaft.
    b.box(0, 0, 4.5 + H * 0.44, midW + 1.2, midD + 1.2, 1.6, shadeColor(neon, 0.75));
    b.setMaterial(GROUP_FACADE);
  }

  // Elaboration ladder: each step adds one band / fin / crown light.
  if (step >= 1) {
    b.setMaterial(GROUP_EMISSIVE);
    b.box(0, 0, 4.5 + H * 0.2, podium * 1.02, podium * 0.82, 1.6, neon);
    b.setMaterial(GROUP_FACADE);
  }
  if (step >= 2) {
    b.setMaterial(GROUP_FACADE);
    b.box(podium * 0.53, 0, 4.5 + H * 0.26, 3, 3, H * 0.3, glass, "grid");
    b.box(-podium * 0.53, 0, 4.5 + H * 0.26, 3, 3, H * 0.3, glass, "grid");
  }
  if (step >= 3) {
    b.setMaterial(GROUP_EMISSIVE);
    b.box(0, 0, 4.5 + H * 0.44, midW + 1.6, midD + 1.6, 1.8, shadeColor(neon, 0.85));
    b.setMaterial(GROUP_FACADE);
  }
  if (step >= 4) {
    b.setMaterial(GROUP_EMISSIVE);
    b.box(0, 0, 4.5 + H * 0.9, 0.3 * HALF_TILE, 0.3 * HALF_TILE, 1.6, neon);
    b.setMaterial(GROUP_FACADE);
  }
  if (step >= 5) {
    b.setMaterial(GROUP_EMISSIVE);
    b.box(0, 0, 4.5 + H * 0.62, crownW + 1.6, crownW * 0.85 + 1.6, 1.6, shadeColor(neon, 0.9));
    b.setMaterial(GROUP_FACADE);
  }
  if (step >= 6) {
    b.setMaterial(GROUP_FACADE);
    b.box(podium * 0.72, podium * 0.72, 4.5, 4, 4, H * 0.16, mass, "grid", { noBottom: true });
    b.box(-podium * 0.72, -podium * 0.72, 4.5, 4, 4, H * 0.16, mass, "grid", { noBottom: true });
  }

  // Grand window mosaic — neon-tinted lit panes, denser on the glass crown.
  if (detail) {
    addWindowMosaic(b, {
      seed,
      parity: (seed % 2) as 0 | 1,
      tint: neon,
      density: 0.78,
      faces: [
        { face: "px", wallAt: midW, uMin: -midD, uMax: midD, basePx: 4.5 + H * 0.2, heightPx: H * 0.44 },
        { face: "pz", wallAt: midD, uMin: -midW, uMax: midW, basePx: 4.5 + H * 0.2, heightPx: H * 0.44 },
        { face: "px", wallAt: crownW, uMin: -crownW * 0.85, uMax: crownW * 0.85, basePx: 4.5 + H * 0.64, heightPx: H * 0.26 },
        { face: "pz", wallAt: crownW * 0.85, uMin: -crownW, uMax: crownW, basePx: 4.5 + H * 0.64, heightPx: H * 0.26 },
        { face: "px", wallAt: podium, uMin: -podium * 0.8, uMax: podium * 0.8, basePx: 4.5, heightPx: H * 0.2 },
        { face: "pz", wallAt: podium * 0.8, uMin: -podium, uMax: podium, basePx: 4.5, heightPx: H * 0.2 },
      ],
    });
  }

  addEntrance(b, podium, mass, 4.5, detail);
  // Podium rooftop mechanicals (the tower's crown handles identity).
  if (detail) {
    b.setMaterial(GROUP_ROOF);
    const pr = podium * 0.8;
    for (let i = 0; i < 3; i++) {
      const ax = podium * 0.55 * (i === 0 ? -1 : 1);
      const az = pr * (i === 2 ? -0.5 : 0.45);
      b.box(ax, az, 4.5 + H * 0.2, 2.6, 2.2, 2, shadeColor(mass, 0.6), "roof", { noBottom: true });
    }
    b.setMaterial(GROUP_FACADE);
  }
}

// ── hero fixtures (HQ core, the Six monuments) ────────────────────────────

/** HQ core: civic tower by value stage (heights authored per stage). */
export function buildHqGeometry(stage: HeroStage): BuildingGeometry3D {
  const b = new MeshBuilder();
  const mass = new Color("#3d4654");
  const warm = new Color("#ffd9a0");
  const stone = new Color("#6b5f49");
  const H = stage >= 3 ? 240 : stage === 2 ? 175 : 128;
  b.setMaterial(GROUP_CONCRETE);
  b.box(0, 0, 0, 0.62 * HALF_TILE, 0.62 * HALF_TILE, 6, new Color("#8d8d86"), "concrete");
  b.setMaterial(GROUP_FACADE);
  b.box(0, 0, 6, 0.5 * HALF_TILE, 0.5 * HALF_TILE, H * 0.18, shadeColor(stone, 0.92), "grid", { noBottom: true });
  b.box(0, 0, 6 + H * 0.18, 0.34 * HALF_TILE, 0.34 * HALF_TILE, H * 0.62, stone, "grid", { noBottom: true });
  b.setMaterial(GROUP_ROOF);
  b.box(0, 0, 6 + H * 0.8, 0.42 * HALF_TILE, 0.42 * HALF_TILE, H * 0.06, shadeColor(mass, 1.2), "roof", { noBottom: true });
  b.box(0, 0, 6 + H * 0.86, 0.26 * HALF_TILE, 0.26 * HALF_TILE, H * 0.08, shadeColor(mass, 1.35), "roof", { noBottom: true });
  b.box(0, 0, 6 + H * 0.94, 2.6, 2.6, H * 0.06, shadeColor(mass, 1.5), "roof");
  b.setMaterial(GROUP_EMISSIVE);
  b.box(0, 0, 6 + H, 3, 3, 4, warm);
  b.setMaterial(GROUP_FACADE);
  // HQ window mosaic (warm civic glass, full shaft).
  addWindowMosaic(b, {
    seed: 424242,
    faces: [
      { face: "px", wallAt: 0.34 * HALF_TILE, uMin: -0.34 * HALF_TILE, uMax: 0.34 * HALF_TILE, basePx: 6 + H * 0.18, heightPx: H * 0.62 },
      { face: "pz", wallAt: 0.34 * HALF_TILE, uMin: -0.34 * HALF_TILE, uMax: 0.34 * HALF_TILE, basePx: 6 + H * 0.18, heightPx: H * 0.62 },
      { face: "px", wallAt: 0.5 * HALF_TILE, uMin: -0.5 * HALF_TILE, uMax: 0.5 * HALF_TILE, basePx: 6, heightPx: H * 0.18 },
    ],
  });
  // Warm window bands (the setback shoulders).
  b.setMaterial(GROUP_EMISSIVE);
  for (let i = 1; i <= 3; i++) {
    b.box(0, 0, 6 + H * (0.18 + 0.14 * i), 0.35 * HALF_TILE, 0.35 * HALF_TILE, 2, warm);
  }
  b.setMaterial(GROUP_FACADE);
  addEntrance(b, 0.5 * HALF_TILE, stone, 6, true);
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
  b.setMaterial(GROUP_CONCRETE);
  b.box(0, 0, 0, 0.56 * HALF_TILE, 0.56 * HALF_TILE, 5, new Color("#8d8d86"), "concrete");
  b.setMaterial(GROUP_FACADE);
  switch (index % 6) {
    case 0: { // sky spire
      b.prism8(0, 0, 5, 0.26 * HALF_TILE, H, body, "grid");
      b.setMaterial(GROUP_ROOF);
      b.box(0, 0, 5 + H, 2.4, 2.4, 14, shadeColor(body, 1.1), "roof");
      b.setMaterial(GROUP_EMISSIVE);
      b.box(0, 0, 5 + H + 14, 1.8, 1.8, 2.4, acc);
      b.setMaterial(GROUP_FACADE);
      break;
    }
    case 1: { // amber gate
      b.box(0.2 * HALF_TILE, 0, 5, 0.16 * HALF_TILE, 0.3 * HALF_TILE, H, body, "grid", { noBottom: true });
      b.box(-0.2 * HALF_TILE, 0, 5, 0.16 * HALF_TILE, 0.3 * HALF_TILE, H, body, "grid", { noBottom: true });
      b.box(0, 0, 5 + H, 0.3 * HALF_TILE, 0.34 * HALF_TILE, 8, body, "grid", { noBottom: true });
      b.setMaterial(GROUP_EMISSIVE);
      b.box(0, 0.34 * HALF_TILE, 5 + H * 0.45, 0.28 * HALF_TILE, 0.5, 1.8, acc);
      b.setMaterial(GROUP_FACADE);
      break;
    }
    case 2: { // violet ziggurat
      b.box(0, 0, 5, 0.4 * HALF_TILE, 0.4 * HALF_TILE, H * 0.4, body, "grid", { noBottom: true });
      b.box(0, 0, 5 + H * 0.4, 0.28 * HALF_TILE, 0.28 * HALF_TILE, H * 0.3, body, "grid", { noBottom: true });
      b.box(0, 0, 5 + H * 0.7, 0.16 * HALF_TILE, 0.16 * HALF_TILE, H * 0.3, body, "grid", { noBottom: true });
      b.setMaterial(GROUP_EMISSIVE);
      b.box(0, 0, 5 + H, 1.8, 1.8, 2.4, acc);
      b.setMaterial(GROUP_FACADE);
      break;
    }
    case 3: { // teal reactor
      b.prism8(0, 0, 5, 0.3 * HALF_TILE, H * 0.75, body, "grid");
      b.prism8(0, 0, 5 + H * 0.75, 0.36 * HALF_TILE, 3, shadeColor(body, 1.15), "roof");
      b.setMaterial(GROUP_EMISSIVE);
      b.box(0, 0, 5 + H * 0.78, 2, 2, H * 0.22, acc);
      b.setMaterial(GROUP_FACADE);
      break;
    }
    case 4: { // crimson bastion
      b.box(0, 0, 5, 0.42 * HALF_TILE, 0.42 * HALF_TILE, H * 0.55, body, "grid", { noBottom: true });
      b.box(0.24 * HALF_TILE, 0.24 * HALF_TILE, 5 + H * 0.55, 0.1 * HALF_TILE, 0.1 * HALF_TILE, H * 0.45, body, "grid", { noBottom: true });
      b.setMaterial(GROUP_EMISSIVE);
      b.box(-0.24 * HALF_TILE, -0.24 * HALF_TILE, 5 + H * 0.55, 0.1 * HALF_TILE, 0.1 * HALF_TILE, H * 0.45, acc);
      b.setMaterial(GROUP_FACADE);
      break;
    }
    default: { // gold rotunda
      b.prism8(0, 0, 5, 0.34 * HALF_TILE, H * 0.6, body, "grid");
      b.prism8(0, 0, 5 + H * 0.6, 0.24 * HALF_TILE, H * 0.12, shadeColor(body, 1.25), "grid");
      b.prism8(0, 0, 5 + H * 0.72, 0.13 * HALF_TILE, H * 0.08, shadeColor(body, 1.4), "roof");
      b.setMaterial(GROUP_EMISSIVE);
      b.box(0, 0, 5 + H * 0.8, 2, 2, 2.6, acc);
      b.setMaterial(GROUP_FACADE);
    }
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
