/**
 * Mainframe City 3D — PROCEDURAL SURFACE TEXTURES (client-only canvas).
 *
 * The AAA graphics pass (2026-09-30, user ruling "full-on max quality"):
 * per-pixel facade/ground/road detail generated at runtime from seeded
 * deterministic code — no image assets, no offline pipeline, no network.
 * Every texture tiles seamlessly by construction (noise is a modular hash,
 * patterns are drawn with wrap-around coordinates).
 *
 * ONE facade texture = ONE window cell (the geometry's UV grid maps wall
 * spans to cols × rows of cells using the SAME metrics as the lit-window
 * mosaic in building3d.ts — WINDOW_COL_STEP / WINDOW_ROW_STEP_PX — so the
 * lit panes at night sit exactly inside the texture's window recesses).
 *
 * Normal maps are derived from a painted heightfield via a Sobel filter:
 * window glass is recessed, mullion frames + sills are raised, wall material
 * carries mid-frequency bump. This is what gives the facades SC4-grade
 * per-pixel relief under the directional sun.
 *
 * Determinism: every canvas is painted from fixed hash seeds — the same
 * textures every session (no layout shimmer between reloads).
 */

import {
  CanvasTexture,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  NoColorSpace,
} from "three";

/** Facade skin keys — families map onto these (familySkinOf below). */
export type FacadeSkin =
  | "stone"
  | "concrete"
  | "brick"
  | "adobe"
  | "steel"
  | "hangar"
  | "glass";

/** Family → facade skin (the architectural material vocabulary). */
export const FAMILY_SKIN: Readonly<Record<string, FacadeSkin>> = {
  Cryptographer: "stone",
  "Zero-Day": "concrete",
  Overclocker: "brick",
  "Cache Keeper": "adobe",
  "Server Marshal": "steel",
  "Bot Herder": "hangar",
  __unassigned__: "concrete",
};

export function familySkinOf(profession: string | null): FacadeSkin {
  const key = profession ?? "__unassigned__";
  return FAMILY_SKIN[key] ?? FAMILY_SKIN.__unassigned__;
}

// ── deterministic hash noise (seamless: all coords are modular) ────────────

function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise on a modular grid (tiles seamlessly at `mod`). */
function valueNoise(
  x: number,
  y: number,
  mod: number,
  seed: number
): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const wrap = (v: number) => ((v % mod) + mod) % mod;
  const n00 = hash2(wrap(xi), wrap(yi), seed);
  const n10 = hash2(wrap(xi + 1), wrap(yi), seed);
  const n01 = hash2(wrap(xi), wrap(yi + 1), seed);
  const n11 = hash2(wrap(xi + 1), wrap(yi + 1), seed);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
}

/** Fractal noise (2 octaves of valueNoise, both seamless at `mod`). */
function fbm2(
  x: number,
  y: number,
  mod: number,
  seed: number
): number {
  return (
    valueNoise(x, y, mod, seed) * 0.65 +
    valueNoise(x * 2, y * 2, mod * 2, seed ^ 0x5f356495) * 0.35
  );
}

// ── canvas helpers ─────────────────────────────────────────────────────────

const CELL = 256;

interface Painter {
  ctx: CanvasRenderingContext2D;
  /** Painted heightfield for the normal-map derivation (same size). */
  height: Float32Array;
}

function makePainter(): Painter | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = CELL;
  canvas.height = CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return { ctx, height: new Float32Array(CELL * CELL) };
}

/**
 * Paint into the RGBA image + heightfield through a per-pixel callback
 * (row-major, y grows DOWN the canvas — callers treat it as texture space).
 */
function paint(
  p: Painter,
  fn: (x: number, y: number) => { r: number; g: number; b: number; h: number }
): void {
  const img = p.ctx.createImageData(CELL, CELL);
  const data = img.data;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const { r, g, b, h } = fn(x, y);
      const i = (y * CELL + x) * 4;
      data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
      data[i + 3] = 255;
      p.height[y * CELL + x] = h;
    }
  }
  p.ctx.putImageData(img, 0, 0);
}

/** Sobel the heightfield into a tangent-space normal map canvas. */
function normalCanvasFrom(height: Float32Array): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = CELL;
  canvas.height = CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(CELL, CELL);
  const at = (x: number, y: number) =>
    height[(((y % CELL) + CELL) % CELL) * CELL + (((x % CELL) + CELL) % CELL)];
  const STRENGTH = 2.2;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const gx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      // Tangent space: dx → +x, dy (canvas down) → −g in green so bumps
      // read as lit from the upper-left under three's default convention.
      let nx = -gx * STRENGTH;
      let ny = gy * STRENGTH;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const i = (y * CELL + x) * 4;
      img.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function canvasTexture(
  canvas: HTMLCanvasElement,
  srgb: boolean,
  anisotropy: number
): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ── facade painters (one window cell per texture, all seamless) ───────────

/** Window cell geometry in texture space (u,v ∈ 0..1, v up = canvas −y). */
const WIN_U0 = 0.26;
const WIN_U1 = 0.74;
const WIN_V0 = 0.30; // sill-to-glass bottom
const WIN_V1 = 0.72; // glass top (spandrel above)

/** Vertical distance in px on the canvas for a v coordinate (v up). */
const vy = (v: number) => (1 - v) * CELL;
const smooth = (edge0: number, x: number, edge1: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

interface SkinPainters {
  /** Base wall albedo + height at a canvas pixel (no window yet). */
  wall: (x: number, y: number) => { r: number; g: number; b: number; h: number };
  /** Wall normal-bump contrast multiplier (skin-dependent grit). */
  bump: number;
}

const SKIN_PAINTERS: Record<FacadeSkin, SkinPainters> = {
  stone: {
    wall: (x, y) => {
      // Coursed ashlar: 3 block rows per cell, alternating half-offset
      // verticals; warm-gray stone with per-block tint jitter.
      const rows = 3;
      const rowH = CELL / rows;
      const row = Math.floor(y / rowH);
      const offset = row % 2 === 0 ? 0 : rowH;
      const col = Math.floor((((x + offset) % CELL) + CELL) % CELL / rowH);
      const jitter = hash2(col, row, 0x51ab) * 0.16 - 0.08;
      const mortar =
        Math.min(
          y % rowH,
          rowH - (y % rowH),
          (((x + offset) % CELL) + CELL) % CELL % rowH,
          rowH - ((((x + offset) % CELL) + CELL) % CELL % rowH)
        ) < 1.6
          ? -0.16
          : 0;
      const grain = fbm2(x / 5, y / 5, 52, 0x7139) * 0.14 - 0.07;
      const base = 0.68 + jitter + mortar + grain;
      return {
        r: base * 1.04,
        g: base * 0.99,
        b: base * 0.9,
        h: mortar < 0 ? 0.3 : 0.55,
      };
    },
    bump: 1,
  },
  concrete: {
    wall: (x, y) => {
      // Board-formed concrete: horizontal form lines every 21px + tie holes,
      // cool gray with clouding.
      const formLine = y % 21 < 1.1 ? -0.11 : 0;
      const tie =
        Math.hypot(((x + 64) % 128) - 64, ((y + 43) % 85) - 42) < 2.2 ? -0.2 : 0;
      const cloud = fbm2(x / 18, y / 18, 15, 0x22c3) * 0.12 - 0.05;
      const speck = hash2(x, y, 0x9d1f) * 0.05;
      const base = 0.70 + formLine + tie + cloud + speck;
      return { r: base, g: base * 1.005, b: base * 1.03, h: formLine < 0 ? 0.35 : 0.5 };
    },
    bump: 0.9,
  },
  brick: {
    wall: (x, y) => {
      // Running-bond brick: 8 courses, mortar 1.4px, per-brick warm jitter.
      const courses = 8;
      const ch = CELL / courses;
      const course = Math.floor(y / ch);
      const bw = ch * 2.15;
      const off = course % 2 === 0 ? 0 : bw / 2;
      const bx = (((x + off) % CELL) + CELL) % CELL % bw;
      const brickIdx = Math.floor(((((x + off) % CELL) + CELL) % CELL) / bw);
      const inMortar =
        y % ch < 0.8 || y % ch > ch - 0.8 || bx < 0.8 || bx > bw - 0.8;
      const jitter = hash2(brickIdx, course, 0x3f71) * 0.22 - 0.11;
      const grain = fbm2(x / 3, y / 3, 85, 0x118a) * 0.1 - 0.05;
      if (inMortar) return { r: 0.52, g: 0.51, b: 0.5, h: 0.32 };
      const base = 0.64 + jitter + grain;
      return { r: base * 1.12, g: base * 0.82, b: base * 0.72, h: 0.6 };
    },
    bump: 1.1,
  },
  adobe: {
    wall: (x, y) => {
      // Warm stucco: soft clouding + faint horizontal swirl banding.
      const cloud = fbm2(x / 11, y / 11, 24, 0x77e1) * 0.2 - 0.1;
      const band = Math.sin((y / CELL) * Math.PI * 6) * 0.02;
      const grit = hash2(x, y, 0x4d2b) * 0.06;
      const base = 0.72 + cloud + band + grit;
      return { r: base * 1.06, g: base * 0.96, b: base * 0.8, h: 0.5 };
    },
    bump: 0.8,
  },
  steel: {
    wall: (x, y) => {
      // Brushed metal panels: vertical panel seams every 64px, horizontal
      // floor joint, directional brushed grain, cool blue-gray.
      const seamX = x % 64 < 1.2 || x % 64 > 62.8 ? -0.14 : 0;
      const joint = y % CELL < 1.6 ? -0.1 : 0;
      const brush = fbm2(x / 1.5, y / 24, 170, 0x31ee) * 0.1 - 0.05;
      const base = 0.70 + seamX + joint + brush;
      return { r: base * 0.96, g: base, b: base * 1.07, h: seamX < 0 ? 0.34 : 0.52 };
    },
    bump: 0.85,
  },
  hangar: {
    wall: (x, y) => {
      // Corrugated industrial siding: tight vertical ridges + panel break.
      const ridge = Math.sin((x / CELL) * Math.PI * 32) * 0.5 + 0.5;
      const panel = y % 128 < 1.4 ? -0.12 : 0;
      const grime = fbm2(x / 9, y / 30, 29, 0x66a2) * 0.1 - 0.05;
      const base = 0.66 + ridge * 0.09 - 0.045 + panel + grime;
      return { r: base * 0.97, g: base * 0.99, b: base * 1.02, h: 0.45 + ridge * 0.25 };
    },
    bump: 1.25,
  },
  glass: {
    wall: (x, y) => {
      // Curtain wall: the whole cell is glazing + a strong mullion grid —
      // the grand league's chroma skin (vertex tint mixes family neon).
      const mull =
        x < 6 || x > CELL - 6 || y < 5 || y > CELL - 5
          ? 0.22
          : Math.abs(x - CELL / 2) < 2.4 || Math.abs(y - CELL / 2) < 2.4
            ? 0.1
            : 0;
      const sheen = smooth(CELL, y, 0) * 0.14; // brighter toward top
      const streak = fbm2(x / 6, y / 60, 43, 0x29b7) * 0.08 - 0.04;
      const base = 0.46 + sheen + streak;
      return {
        r: base * 0.94 + mull,
        g: base * 0.98 + mull,
        b: base * 1.1 + mull,
        h: mull > 0.15 ? 0.66 : 0.4,
      };
    },
    bump: 1,
  },
};

/** Paint one facade skin: wall material + the shared window cell on top. */
function paintFacade(p: Painter, skin: FacadeSkin): void {
  const painters = SKIN_PAINTERS[skin];
  paint(p, (x, y) => {
    const w = painters.wall(x, y);
    // Window cell in canvas coords (v up → canvas y down).
    const cx0 = WIN_U0 * CELL;
    const cx1 = WIN_U1 * CELL;
    const cy0 = vy(WIN_V1);
    const cy1 = vy(WIN_V0);
    const inX = x >= cx0 && x <= cx1;
    const inY = y >= cy0 && y <= cy1;
    // Ledge (sill) just below the glass: raised, lighter.
    const sillY = y > cy1 && y <= cy1 + 4 && x >= cx0 - 3 && x <= cx1 + 3;
    // Mullion frame ring around the glass: 3px proud frame.
    const frame =
      !inY && y >= cy0 - 3 && y <= cy1 + 3 && x >= cx0 - 3 && x <= cx1 + 3
        ? 1
        : 0;
    if (inX && inY) {
      // Glass: dark blue-green with vertical light falloff + center mullion.
      const t = (y - cy0) / (cy1 - cy0); // 0 top .. 1 bottom
      const glassBase = 0.26 - t * 0.06;
      const centerMullX = Math.abs(x - (cx0 + cx1) / 2) < 1.6;
      const centerMullY = Math.abs(y - (cy0 + cy1) / 2) < 1.6;
      if (centerMullX || centerMullY) {
        return { r: w.r * 1.12, g: w.g * 1.12, b: w.b * 1.12, h: 0.62 };
      }
      const glint = hash2(x, Math.floor(y / 3), 0x1c97) * 0.03;
      return {
        r: glassBase * 0.9 + glint,
        g: glassBase * 1.0 + glint,
        b: glassBase * 1.35 + glint,
        h: 0.22,
      };
    }
    if (sillY) {
      const k = 1.14;
      return { r: w.r * k, g: w.g * k, b: w.b * k, h: 0.78 };
    }
    if (frame) {
      return { r: w.r * 1.08, g: w.g * 1.08, b: w.b * 1.08, h: 0.7 };
    }
    // Grime streak under the sill (weathering — subtle, family-neutral).
    const streak =
      x >= cx0 + 2 &&
      x <= cx1 - 2 &&
      y > cy1 + 4 &&
      y < cy1 + 22
        ? (1 - (y - cy1 - 4) / 18) * 0.08
        : 0;
    return {
      r: w.r * (1 - streak),
      g: w.g * (1 - streak),
      b: w.b * (1 - streak),
      h: w.h,
    };
  });
}

// ── ground / road painters ─────────────────────────────────────────────────

function paintRoof(p: Painter): void {
  paint(p, (x, y) => {
    // Tar + gravel: dark speckle field with seams every 64px + stains.
    const gravel = hash2(x, y, 0xe21b) * 0.16;
    const cloud = fbm2(x / 14, y / 14, 19, 0x5c48) * 0.12;
    const seam = x % 64 < 1.4 || y % 64 < 1.4 ? -0.08 : 0;
    const stain = fbm2(x / 40 + 9, y / 40 + 3, 7, 0x8f04) > 0.72 ? -0.1 : 0;
    const base = 0.42 + gravel + cloud + seam + stain;
    return { r: base * 1.02, g: base, b: base * 0.98, h: 0.45 + gravel };
  });
}

function paintConcrete(p: Painter): void {
  paint(p, (x, y) => {
    // Sidewalk pavers: 64px joint grid, light warm gray, walked-on wear.
    const joint = x % 64 < 1.6 || y % 64 < 1.6 ? -0.13 : 0;
    const wear = fbm2(x / 22, y / 22, 12, 0x4477) * 0.14 - 0.06;
    const speck = hash2(x, y, 0x2e9a) * 0.05;
    const base = 0.72 + joint + wear + speck;
    return { r: base * 1.01, g: base, b: base * 0.97, h: joint < 0 ? 0.3 : 0.5 };
  });
}

function paintAsphalt(p: Painter): void {
  paint(p, (x, y) => {
    // Asphalt: near-black aggregate noise + faint repair seams + cracks.
    const aggregate = hash2(x, y, 0x77c1) * 0.12;
    const patch = fbm2(x / 30, y / 30, 9, 0x13d6) > 0.74 ? 0.05 : 0;
    const crack = fbm2(x / 3.5, y / 3.5, 73, 0x6a09) > 0.87 ? 0.06 : 0;
    const base = 0.54 + aggregate + patch + crack;
    return { r: base, g: base * 1.01, b: base * 1.05, h: 0.4 + aggregate };
  });
}

function paintGrass(p: Painter): void {
  paint(p, (x, y) => {
    // Meadow: green-dominant fractal + blade specks + faint mow drift.
    const clumps = fbm2(x / 16, y / 16, 16, 0x39f2);
    const blades = hash2(x, y, 0x5b8d) * 0.14;
    const mow = Math.sin((x + y) / 22) * 0.02;
    const v = 0.56 + clumps * 0.3 + blades + mow - 0.12;
    return { r: v * 0.72, g: v * 1.06, b: v * 0.55, h: 0.45 + blades * 0.4 };
  });
}

// ── the kit ────────────────────────────────────────────────────────────────

export interface SkinTextures {
  map: CanvasTexture;
  normalMap: CanvasTexture;
}

export interface CityTextureKit {
  facades: Map<FacadeSkin, SkinTextures>;
  roof: SkinTextures;
  concrete: SkinTextures;
  asphalt: SkinTextures;
  grass: SkinTextures;
  /** Radial warm pool decal (streetlamp light at night; additive). */
  lampPool: CanvasTexture;
}

let kit: CityTextureKit | null = null;

function buildSkin(
  skin: FacadeSkin,
  anisotropy: number
): { map: CanvasTexture; normalMap: CanvasTexture } | null {
  const p = makePainter();
  if (!p) return null;
  paintFacade(p, skin);
  const normalCanvas = normalCanvasFrom(p.height);
  if (!normalCanvas) return null;
  return {
    map: canvasTexture(p.ctx.canvas, true, anisotropy),
    normalMap: canvasTexture(normalCanvas, false, anisotropy),
  };
}

function buildSurface(
  paintFn: (p: Painter) => void,
  anisotropy: number,
  withNormal = true
): { map: CanvasTexture; normalMap: CanvasTexture } | null {
  const p = makePainter();
  if (!p) return null;
  paintFn(p);
  const map = canvasTexture(p.ctx.canvas, true, anisotropy);
  if (!withNormal) return { map, normalMap: map };
  const normalCanvas = normalCanvasFrom(p.height);
  if (!normalCanvas) return { map, normalMap: map };
  return { map, normalMap: canvasTexture(normalCanvas, false, anisotropy) };
}

function buildLampPool(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const S = 128;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  grad.addColorStop(0, "rgba(255,214,150,0.95)");
  grad.addColorStop(0.35, "rgba(255,196,120,0.42)");
  grad.addColorStop(0.75, "rgba(255,180,100,0.10)");
  grad.addColorStop(1, "rgba(255,180,100,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(canvas, true, 1);
}

/**
 * Build (or return the cached) city texture kit. Returns null outside a
 * browser (SSR / node tests) — callers fall back to untextured materials.
 * `anisotropy` comes from the renderer's capability cap.
 */
export function getCityTextures(anisotropy = 4): CityTextureKit | null {
  if (typeof document === "undefined") return null;
  if (kit) return kit;
  const facades = new Map<FacadeSkin, SkinTextures>();
  for (const skin of Object.keys(SKIN_PAINTERS) as FacadeSkin[]) {
    const t = buildSkin(skin, anisotropy);
    if (t) facades.set(skin, t);
  }
  const roof = buildSurface(paintRoof, anisotropy);
  const concrete = buildSurface(paintConcrete, anisotropy);
  const asphalt = buildSurface(paintAsphalt, anisotropy);
  const grass = buildSurface(paintGrass, anisotropy);
  const lampPool = buildLampPool();
  if (!roof || !concrete || !asphalt || !grass || !lampPool) return null;
  kit = { facades, roof, concrete, asphalt, grass, lampPool };
  return kit;
}

/** Dispose the kit (scene teardown). Safe to call repeatedly. */
export function disposeCityTextures(): void {
  if (!kit) return;
  const all: Texture[] = [kit.lampPool];
  for (const s of kit.facades.values()) all.push(s.map, s.normalMap);
  all.push(kit.roof.map, kit.roof.normalMap);
  all.push(kit.concrete.map, kit.concrete.normalMap);
  all.push(kit.asphalt.map, kit.asphalt.normalMap);
  all.push(kit.grass.map, kit.grass.normalMap);
  for (const t of all) t.dispose();
  kit = null;
}

/** Exposed for tests/QA: the texel resolution of every generated canvas. */
export const TEXTURE_CELL = CELL;
