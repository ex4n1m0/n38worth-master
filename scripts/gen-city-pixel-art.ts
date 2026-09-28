/**
 * Original pixel-art building generator — NORMAL CITY edition (2026-09-28
 * v2, user art-direction ruling: "make a normal city first, like SimCity
 * 2000/3000 default cities").
 *
 * Deterministic, dependency-free art: every sprite is PLOTTED PIXEL BY PIXEL
 * into an RGBA buffer (scanline polygon fills, Bresenham edges — no
 * anti-aliasing, integer coordinates only) and written as PNG via sharp.
 * 100% original work drawn by code, inspired only by the broad qualities of
 * classic 1990s isometric city builders.
 *
 * Art direction (v2 — cyberpunk elements REMOVED):
 * - Day frames are TRUE COLOR (no pre-compensation: the scene no longer
 *   applies a global day matrix to buildings; each element owns its
 *   day/night pair).
 * - Families are normal architecture: stone civic w/ copper dome, concrete
 *   twin towers + bridge, brick industrial silo, stepped beige offices,
 *   glass corporate slab, metal warehouse w/ brown roof, small house.
 * - NO neon rings, coils, halos, shards, beacons, LED strips. The lights
 *   layer is just lit windows (warm), door lamps and tiny red antenna
 *   beacons on tall buildings.
 *
 * Output per (family × tier): public/city/pixel/<Family>-t<N>.png — 3
 * DETERMINISTIC VARIANTS (rows) × 3 frames (columns): day | night | lights.
 * Plus city-pixel-art.generated.ts (URL + frame geometry + anchor + height).
 *
 * Run: npm run gen:city-pixel-art   (deterministic — safe to re-run)
 */
import * as path from "path";
import * as fs from "fs";
import sharp from "sharp";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public", "city", "pixel");
const MANIFEST_TS = path.join(
  ROOT,
  "src",
  "components",
  "city",
  "world",
  "scene",
  "city-pixel-art.generated.ts"
);
/** QA contact sheet (dev artifact — not shipped; gitignored). */
const PREVIEW_PNG = path.join(ROOT, "scripts", "city-pixel-preview.png");

const FAMILIES = [
  "Cryptographer",
  "Zero-Day",
  "Overclocker",
  "Cache Keeper",
  "Server Marshal",
  "Bot Herder",
  "Unassigned",
] as const;
type Family = (typeof FAMILIES)[number];

const TIERS = [1, 2, 3, 4, 5, 6, 7] as const;
type Tier = (typeof TIERS)[number];
const VARIANTS = 3;

// ── deterministic RNG (same algorithm as art.ts mulberry32) ───────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(family: Family, tier: Tier, variant: number): number {
  let a = 0x9e3779b9;
  for (const ch of `${family}:${tier}:${variant}`) a = (a * 33 + ch.charCodeAt(0)) | 0;
  return a;
}

// ── color helpers ─────────────────────────────────────────────────────────

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function shade(c: RGB, k: number): RGB {
  return [
    Math.min(255, Math.round(c[0] * k)),
    Math.min(255, Math.round(c[1] * k)),
    Math.min(255, Math.round(c[2] * k)),
  ];
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
/** Night mass: darken toward the shared night blue-gray, keep a hue whisper. */
function nightOf(c: RGB): RGB {
  return mix(shade(c, 0.3), [24, 30, 44], 0.45);
}

// ── pixel canvas ──────────────────────────────────────────────────────────

const OPAQUE = 255;

class PixCanvas {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly W: number,
    readonly H: number
  ) {
    this.data = new Uint8ClampedArray(W * H * 4);
  }

  px(x: number, y: number, c: RGB, a = OPAQUE): void {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = (y * this.W + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a = OPAQUE): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  fillPoly(pts: ReadonlyArray<[number, number]>, c: RGB, a = OPAQUE): void {
    if (pts.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const y0 = Math.max(0, Math.ceil(minY));
    const y1 = Math.min(this.H - 1, Math.floor(maxY));
    for (let y = y0; y <= y1; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [xa, ya] = pts[i];
        const [xb, yb] = pts[(i + 1) % pts.length];
        if (ya === yb) continue;
        const lo = Math.min(ya, yb);
        const hi = Math.max(ya, yb);
        if (y + 0.5 < lo || y + 0.5 >= hi) continue;
        xs.push(xa + ((y + 0.5 - ya) / (yb - ya)) * (xb - xa));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const from = Math.max(0, Math.round(xs[i]));
        const to = Math.min(this.W - 1, Math.round(xs[i + 1]) - 1);
        for (let x = from; x <= to; x++) this.px(x, y, c, a);
      }
    }
  }

  strokePoly(pts: ReadonlyArray<[number, number]>, c: RGB, a = OPAQUE): void {
    for (let i = 0; i < pts.length; i++) {
      const [xa, ya] = pts[i];
      const [xb, yb] = pts[(i + 1) % pts.length];
      this.line(xa, ya, xb, yb, c, a);
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = OPAQUE): void {
    for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
      const dy = y + 0.5 - cy;
      const t = 1 - (dy * dy) / (ry * ry);
      if (t <= 0) continue;
      const w = rx * Math.sqrt(t);
      const from = Math.max(0, Math.round(cx - w + 0.5));
      const to = Math.min(this.W - 1, Math.round(cx + w - 0.5));
      for (let x = from; x <= to; x++) this.px(x, y, c, a);
    }
  }

  strokeEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = OPAQUE): void {
    const steps = Math.max(16, Math.round((rx + ry) * 3));
    let px0 = 0;
    let py0 = 0;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(t) * rx);
      const y = Math.round(cy + Math.sin(t) * ry);
      if (i > 0) this.line(px0, py0, x, y, c, a);
      px0 = x;
      py0 = y;
    }
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB, a = OPAQUE): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c, a);
    }
  }
}

// ── shared palette (normal city) ──────────────────────────────────────────

const OUTLINE_DAY: RGB = hexToRgb("#3a3a34");
const OUTLINE_NIGHT: RGB = hexToRgb("#0b0e16");
const GLASS_DAY: RGB = hexToRgb("#3b5068");
const GLASS_DAY_HI: RGB = hexToRgb("#9db8d2");
const GLASS_NIGHT: RGB = hexToRgb("#121826");
const WINDOW_WARM: RGB = hexToRgb("#ffd27a");
const WINDOW_PALE: RGB = hexToRgb("#fff3c9");
const WINDOW_COOL: RGB = hexToRgb("#cfe0ff");
const DOOR_LAMP: RGB = hexToRgb("#ffdf9e");
const BEACON_RED: RGB = [226, 88, 74];

/** Per-family day materials (walls/roof) — night derives via nightOf(). */
interface FamilyPalette {
  left: RGB; // wall, away from light
  right: RGB; // wall, key light
  roof: RGB;
  trim: RGB; // roof edge / details
}

const FAMILY_PALETTE: Record<Family, FamilyPalette> = {
  // Stone civic building with a copper-green dome.
  Cryptographer: {
    left: shade(hexToRgb("#b39a70"), 0.88),
    right: hexToRgb("#c9b28a"),
    roof: hexToRgb("#8fa08c"),
    trim: hexToRgb("#6d7d6a"),
  },
  // Pale concrete twin towers + bridge.
  "Zero-Day": {
    left: shade(hexToRgb("#aab0b8"), 0.9),
    right: hexToRgb("#bcc2ca"),
    roof: hexToRgb("#9aa0a8"),
    trim: hexToRgb("#7d838c"),
  },
  // Brick industrial silo block.
  Overclocker: {
    left: shade(hexToRgb("#9c5a48"), 0.9),
    right: hexToRgb("#b06a55"),
    roof: hexToRgb("#8b9199"),
    trim: hexToRgb("#6f747c"),
  },
  // Beige stepped offices, brown roof trims.
  "Cache Keeper": {
    left: shade(hexToRgb("#c2b490"), 0.9),
    right: hexToRgb("#d4c6a2"),
    roof: hexToRgb("#8a6f52"),
    trim: hexToRgb("#6f5942"),
  },
  // Blue-glass corporate tower.
  "Server Marshal": {
    left: shade(hexToRgb("#8fa2b6"), 0.92),
    right: hexToRgb("#a4b6c8"),
    roof: hexToRgb("#c8ccd2"),
    trim: hexToRgb("#8d949c"),
  },
  // Metal warehouse, brown-red roof.
  "Bot Herder": {
    left: shade(hexToRgb("#98a0a8"), 0.88),
    right: hexToRgb("#aab2ba"),
    roof: hexToRgb("#96604c"),
    trim: hexToRgb("#77493a"),
  },
  // Small warm house.
  Unassigned: {
    left: shade(hexToRgb("#cdbb95"), 0.9),
    right: hexToRgb("#dccaa4"),
    roof: hexToRgb("#8a5f42"),
    trim: hexToRgb("#6c4a34"),
  },
};

function nightPalette(p: FamilyPalette): FamilyPalette {
  return { left: nightOf(p.left), right: nightOf(p.right), roof: nightOf(p.roof), trim: nightOf(p.trim) };
}

// ── iso geometry ──────────────────────────────────────────────────────────

/** One extruded iso box; footprint diamond center at (cx, baseY). */
function isoBox(
  cv: PixCanvas,
  cx: number,
  baseY: number,
  hw: number,
  hh: number,
  h: number,
  left: RGB,
  right: RGB,
  roof: RGB,
  outline: RGB
): void {
  const top = baseY - h;
  cv.fillPoly(
    [
      [cx - hw, top],
      [cx, top + hh],
      [cx, baseY + hh],
      [cx - hw, baseY],
    ],
    left
  );
  cv.fillPoly(
    [
      [cx + hw, top],
      [cx, top + hh],
      [cx, baseY + hh],
      [cx + hw, baseY],
    ],
    right
  );
  cv.fillPoly(
    [
      [cx, top - hh],
      [cx + hw, top],
      [cx, top + hh],
      [cx - hw, top],
    ],
    roof
  );
  cv.line(cx, top + hh, cx, baseY + hh, outline);
  cv.strokePoly(
    [
      [cx, top - hh],
      [cx + hw, top],
      [cx, top + hh],
      [cx - hw, top],
    ],
    outline
  );
  cv.line(cx - hw, baseY, cx, baseY + hh, outline);
  cv.line(cx, baseY + hh, cx + hw, baseY, outline);
}

/** Iso cylinder (silo): body + shading + top disc. */
function isoCylinder(
  cv: PixCanvas,
  cx: number,
  baseY: number,
  r: number,
  h: number,
  left: RGB,
  right: RGB,
  top: RGB,
  outline: RGB
): void {
  const topY = baseY - h;
  cv.fillRect(Math.round(cx - r), Math.round(topY), Math.round(2 * r), Math.round(h), right);
  cv.fillRect(Math.round(cx - r), Math.round(topY), Math.round(r), Math.round(h), left);
  cv.fillEllipse(cx, topY, r, r / 2, top);
  cv.line(Math.round(cx - r), topY, Math.round(cx - r), baseY, outline);
  cv.line(Math.round(cx + r), topY, Math.round(cx + r), baseY, outline);
  cv.strokeEllipse(cx, topY, r, r / 2, outline);
  cv.fillEllipse(cx, baseY, r, r / 2, shade(left, 0.75));
}

/**
 * Window grid on ONE face of an iso box, in FACE SPACE (u across, v up).
 * Day: dark glass + sky highlight. Night: dark inset. Lights: seeded lit
 * windows (mostly warm — a normal city at night).
 */
function faceWindows(
  day: PixCanvas,
  night: PixCanvas,
  lights: PixCanvas,
  cx: number,
  baseY: number,
  hw: number,
  hh: number,
  h: number,
  side: -1 | 1,
  cols: number,
  rows: number,
  rng: () => number,
  litRatio = 0.42
): void {
  const ox = cx + side * hw;
  const ax = -side * hw;
  const ay = hh;
  const wU = 4.5 / hw;
  const wV = 4.5 / h;
  const point = (u: number, v: number): [number, number] => [
    ox + ax * u,
    baseY + ay * u - h * v,
  ];
  for (let row = 0; row < rows; row++) {
    const v0 = 0.12 + (row + 0.5) * (0.72 / rows) - wV / 2;
    for (let col = 0; col < cols; col++) {
      const u0 = 0.12 + (col + 0.5) * (0.76 / cols) - wU / 2;
      const quad: Array<[number, number]> = [
        point(u0, v0),
        point(u0 + wU, v0),
        point(u0 + wU, v0 + wV),
        point(u0, v0 + wV),
      ];
      day.fillPoly(quad, GLASS_DAY);
      day.line(quad[0][0], quad[0][1], quad[1][0], quad[1][1], GLASS_DAY_HI);
      night.fillPoly(quad, GLASS_NIGHT);
      const r = rng();
      if (r < litRatio) {
        const r2 = rng();
        const lit = r2 < 0.7 ? WINDOW_WARM : r2 < 0.88 ? WINDOW_PALE : WINDOW_COOL;
        lights.fillPoly(quad, lit);
      }
    }
  }
}

// ── family specs ──────────────────────────────────────────────────────────

interface FamilySpec {
  baseH: number;
  floorH: number;
  hw: number; // tier-1 footprint half-width (px)
  cols: number; // window columns per face
}

const FAMILY_SPEC: Record<Family, FamilySpec> = {
  Cryptographer: { baseH: 26, floorH: 8, hw: 54, cols: 5 },
  "Zero-Day": { baseH: 34, floorH: 12, hw: 48, cols: 2 },
  Overclocker: { baseH: 38, floorH: 11, hw: 40, cols: 3 },
  "Cache Keeper": { baseH: 26, floorH: 10, hw: 44, cols: 3 },
  "Server Marshal": { baseH: 40, floorH: 13, hw: 34, cols: 4 },
  "Bot Herder": { baseH: 22, floorH: 9, hw: 52, cols: 3 },
  Unassigned: { baseH: 20, floorH: 9, hw: 34, cols: 2 },
};

function artHeightOf(family: Family, tier: Tier): number {
  const s = FAMILY_SPEC[family];
  return s.baseH + (tier - 1) * s.floorH;
}

// ── per-frame builder ─────────────────────────────────────────────────────

interface FrameCtx {
  day: PixCanvas;
  night: PixCanvas;
  lights: PixCanvas;
  cx: number;
  baseY: number;
  rng: () => number;
  variant: number;
  tier: Tier;
  family: Family;
}

function drawBuilding(ctx: FrameCtx): void {
  const { family, tier, rng, cx, baseY, variant } = ctx;
  const spec = FAMILY_SPEC[family];
  const pal = FAMILY_PALETTE[family];
  const palN = nightPalette(pal);
  const h = artHeightOf(family, tier);
  const hw = Math.min(58, spec.hw + Math.floor((tier - 1) * 1.5));
  const hh = Math.round(hw / 2);

  /** isoBox into day + night frames (+ windows into all three). */
  const box = (
    bx: number,
    by: number,
    bhw: number,
    bh: number,
    tint = 1,
    windows = true,
    litRatio = 0.42
  ) => {
    const bhh = Math.round(bhw / 2);
    isoBox(ctx.day, bx, by, bhw, bhh, bh, shade(pal.left, tint), shade(pal.right, tint), shade(pal.roof, tint), OUTLINE_DAY);
    isoBox(ctx.night, bx, by, bhw, bhh, bh, shade(palN.left, tint), shade(palN.right, tint), shade(palN.roof, tint), OUTLINE_NIGHT);
    if (windows && bh >= 12) {
      const rows = Math.max(1, Math.min(6, Math.floor((bh - 6) / 11)));
      const cols = Math.max(1, Math.min(spec.cols, Math.floor(bhw / 9)));
      faceWindows(ctx.day, ctx.night, ctx.lights, bx, by, bhw, bhh, bh, -1, cols, rows, rng, litRatio);
      faceWindows(ctx.day, ctx.night, ctx.lights, bx, by, bhw, bhh, bh, 1, cols, rows, rng, litRatio);
    }
  };

  /** Flat roof details (parapet line + clutter) on top face of a box. */
  const roofDetails = (
    bx: number,
    byTop: number,
    bhw: number
  ) => {
    const bhh = Math.round(bhw / 2);
    // Parapet: darker inner line inset on the top diamond.
    const inset = 4;
    for (const [cv, edge] of [
      [ctx.day, shade(pal.trim, 1.0)],
      [ctx.night, shade(palN.trim, 1.05)],
    ] as const) {
      cv.strokePoly(
        [
          [bx, byTop - bhh + inset * 0.5],
          [bx + bhw - inset, byTop],
          [bx, byTop + bhh - inset * 0.5],
          [bx - bhw + inset, byTop],
        ],
        edge,
        160
      );
    }
  };

  switch (family) {
    case "Cryptographer": {
      // Stone civic hall: wide low podium + copper dome.
      const plates = Math.max(1, Math.min(3, Math.ceil(tier / 2.5)));
      let y = baseY;
      let phw = hw;
      for (let i = 0; i < plates; i++) {
        const ph = Math.round(h / plates);
        box(cx, y, phw, ph, 1 - i * 0.05, i === 0, 0.5);
        roofDetails(cx, y - ph, phw);
        y -= ph;
        phw = Math.round(phw * 0.84);
      }
      const domeR = Math.max(8, Math.round(hw * 0.4));
      // Copper dome: green-ish oxidized copper on day, dark at night.
      for (const [cv, roofC, outline] of [
        [ctx.day, pal.roof, OUTLINE_DAY],
        [ctx.night, palN.roof, OUTLINE_NIGHT],
      ] as const) {
        cv.fillEllipse(cx, y - domeR * 0.2, domeR, Math.round(domeR * 0.78), roofC);
        cv.fillEllipse(cx, y - domeR * 0.55, Math.round(domeR * 0.68), Math.round(domeR * 0.5), shade(roofC, 1.12));
        cv.strokeEllipse(cx, y - domeR * 0.2, domeR, Math.round(domeR * 0.78), outline);
        // Small lantern finial (mass only).
        cv.fillRect(cx - 1, y - domeR - 8, 3, 6, shade(roofC, 0.8));
      }
      // Lights: dome lantern lamp + entrance lamps at the front corners.
      ctx.lights.fillEllipse(cx, y - domeR - 6, 2, 2, WINDOW_PALE);
      ctx.lights.fillEllipse(cx - hw + 6, baseY - 4, 1, 1, DOOR_LAMP);
      ctx.lights.fillEllipse(cx + hw - 6, baseY - 4, 1, 1, DOOR_LAMP);
      break;
    }
    case "Zero-Day": {
      // Concrete twin towers + bridge deck (hollow below the bridge).
      const pw = Math.round(hw * 0.36);
      const gap = Math.round(hw * 0.54);
      const bridgeY = baseY - Math.round(h * 0.72);
      box(cx - gap, baseY, pw, h);
      box(cx + gap, baseY, pw, h);
      // Bridge deck between the towers (upper section only).
      box(cx, bridgeY, Math.round(hw * 0.8), Math.round(h * 0.28), 1.02, true, 0.6);
      break;
    }
    case "Overclocker": {
      // Brick silo block: wide base + tall cylinder shaft + cap.
      box(cx, baseY, hw, 10, 1, true, 0.3);
      const r = Math.round(hw * 0.42);
      const shaftH = h - 10;
      isoCylinder(ctx.day, cx, baseY - 8, r, shaftH, shade(pal.left, 0.95), shade(pal.right, 0.95), pal.roof, OUTLINE_DAY);
      isoCylinder(ctx.night, cx, baseY - 8, r, shaftH, shade(palN.left, 0.95), shade(palN.right, 0.95), palN.roof, OUTLINE_NIGHT);
      // Sibling small silo (variant-dependent side).
      const sr = Math.round(r * 0.45);
      const sx = cx + (variant % 2 === 0 ? hw * 0.62 : -hw * 0.62);
      isoCylinder(ctx.day, sx, baseY, sr, Math.round(shaftH * 0.55), pal.left, pal.right, pal.roof, OUTLINE_DAY);
      isoCylinder(ctx.night, sx, baseY, sr, Math.round(shaftH * 0.55), palN.left, palN.right, palN.roof, OUTLINE_NIGHT);
      break;
    }
    case "Cache Keeper": {
      // Stepped beige office stack (setbacks alternate sides).
      const layers = Math.max(2, Math.min(4, Math.ceil(tier / 2)));
      let y = baseY;
      let lhw = hw;
      for (let i = 0; i < layers; i++) {
        const lh = Math.round(h / layers);
        const dx = i === 0 ? 0 : (i + variant) % 2 === 0 ? 5 : -5;
        box(cx + dx, y, lhw, lh, 1 - i * 0.04, true, 0.45);
        roofDetails(cx + dx, y - lh, lhw);
        y -= lh;
        lhw = Math.round(lhw * 0.84);
      }
      break;
    }
    case "Server Marshal": {
      // Glass corporate slab: uniform width, dense window grid.
      box(cx, baseY, hw, h, 1, true, 0.5);
      roofDetails(cx, baseY - h, hw);
      break;
    }
    case "Bot Herder": {
      // Warehouse: wide hall + side sheds.
      const hallH = Math.round(h * 0.8);
      box(cx, baseY, Math.round(hw * 0.58), hallH, 1, true, 0.3);
      roofDetails(cx, baseY - hallH, Math.round(hw * 0.58));
      const bw = Math.round(hw * 0.3);
      const shedH = Math.round(h * 0.45);
      box(cx - Math.round(hw * 0.82), baseY + 3, bw, shedH, 0.95, false);
      box(cx + Math.round(hw * 0.82), baseY + 3, bw, shedH, 0.95, false);
      roofDetails(cx - Math.round(hw * 0.82), baseY + 3 - shedH, bw);
      roofDetails(cx + Math.round(hw * 0.82), baseY + 3 - shedH, bw);
      // Lights: loading-door lamps on each shed.
      ctx.lights.fillEllipse(cx - Math.round(hw * 0.82), baseY - 4, 1, 1, DOOR_LAMP);
      ctx.lights.fillEllipse(cx + Math.round(hw * 0.82), baseY - 4, 1, 1, DOOR_LAMP);
      break;
    }
    case "Unassigned": {
      // Small house: body + pitched roof.
      const bodyH = Math.round(h * 0.62);
      box(cx, baseY, hw, bodyH, 1, true, 0.55);
      // Pitched roof: two slopes meeting at a ridge running SW→NE.
      const ridge = Math.round(h * 0.34);
      const rTop = baseY - bodyH;
      const slope = 0.5;
      for (const [cv, roofC, trimC, outline] of [
        [ctx.day, pal.roof, pal.trim, OUTLINE_DAY],
        [ctx.night, palN.roof, palN.trim, OUTLINE_NIGHT],
      ] as const) {
        // Front-right slope (visible), back-left slope, and the two gable
        // ends filled with wall color.
        // Gable ends (triangles on the SE and NW faces).
        cv.fillPoly(
          [
            [cx + hw, rTop],
            [cx, rTop + hh],
            [cx, rTop + hh - ridge],
            [cx + hw, rTop - ridge * (1 - slope)],
          ],
          shade(pal === FAMILY_PALETTE.Unassigned ? pal.right : pal.right, 1)
        );
        cv.fillPoly(
          [
            [cx - hw, rTop],
            [cx, rTop + hh],
            [cx, rTop + hh - ridge],
            [cx - hw, rTop - ridge * (1 - slope)],
          ],
          shade(cv === ctx.day ? pal.left : palN.left, 1)
        );
        // Roof slopes from eaves to ridge line.
        const ridgeA: [number, number] = [cx - hw, rTop - ridge * (1 - slope)];
        const ridgeB: [number, number] = [cx + hw, rTop - ridge * (1 - slope)];
        const eaveA: [number, number] = [cx - hw, rTop];
        const eaveB: [number, number] = [cx + hw, rTop];
        const eaveC: [number, number] = [cx, rTop + hh];
        const ridgeC: [number, number] = [cx, rTop + hh - ridge];
        // SE slope (front-right, lit).
        cv.fillPoly([eaveB, ridgeB, ridgeC, eaveC], shade(roofC, 1.08));
        // SW slope (front-left, shaded).
        cv.fillPoly([eaveA, ridgeA, ridgeC, eaveC], shade(roofC, 0.8));
        // NW slope (back, darkest visible sliver).
        cv.fillPoly([eaveA, ridgeA, ridgeB, eaveB], shade(roofC, 0.62));
        // Ridge line + trim.
        cv.line(ridgeA[0], ridgeA[1], ridgeB[0], ridgeB[1], trimC);
        cv.line(eaveA[0], eaveA[1], ridgeA[0], ridgeA[1], outline, 180);
        cv.line(eaveB[0], eaveB[1], ridgeB[0], ridgeB[1], outline, 180);
      }
      // Lights: porch lamp.
      ctx.lights.fillEllipse(cx, baseY - 4, 1, 1, DOOR_LAMP);
      break;
    }
  }

  // ── shared tier ladder (architectural, no glow) ──
  const topY = baseY - h;
  if (tier >= 3) {
    // Plain antenna mast (red beacon dot only in lights).
    const ax = cx + (family === "Overclocker" ? hw : -hw) * 0.55;
    ctx.day.line(ax, topY, ax, topY - 12, OUTLINE_DAY);
    ctx.night.line(ax, topY, ax, topY - 12, OUTLINE_NIGHT);
    ctx.lights.fillEllipse(ax, topY - 13, 1, 1, BEACON_RED);
  }
  if (tier >= 4) {
    // Side annexes.
    for (const dx of [-1, 1]) {
      const px = cx + dx * Math.round(hw * 0.95);
      const aH = family === "Unassigned" ? 7 : 9;
      isoBox(ctx.day, px, baseY - 2, 6, 3, aH, shade(pal.left, 0.97), shade(pal.right, 0.97), pal.roof, OUTLINE_DAY);
      isoBox(ctx.night, px, baseY - 2, 6, 3, aH, shade(palN.left, 0.97), shade(palN.right, 0.97), palN.roof, OUTLINE_NIGHT);
    }
  }
  if (tier >= 5) {
    // Upper setback tier (extra smaller block on top).
    const uHw = Math.round(hw * 0.6);
    box(cx, topY, uHw, Math.max(8, Math.round(h * 0.16)), 1.02, true, 0.4);
  }
  if (tier >= 6) {
    // Rooftop water tank + AC cluster (classic city skyline furniture).
    const topAfterSetback = topY - Math.max(8, Math.round(h * 0.16));
    const wx = cx - Math.round(hw * 0.28);
    for (const [cv, trimC, outline] of [
      [ctx.day, pal.trim, OUTLINE_DAY],
      [ctx.night, palN.trim, OUTLINE_NIGHT],
    ] as const) {
      cv.fillRect(wx - 4, topAfterSetback - 10, 9, 8, trimC);
      cv.line(wx - 4, topAfterSetback - 10, wx + 5, topAfterSetback - 10, outline);
      cv.fillEllipse(wx, topAfterSetback - 10, 5, 2.5, shade(trimC, 1.1));
      cv.line(wx - 4, topAfterSetback - 2, wx - 4, topAfterSetback, outline);
      cv.line(wx + 5, topAfterSetback - 2, wx + 5, topAfterSetback, outline);
    }
    const ax2 = cx + Math.round(hw * 0.3);
    ctx.day.fillRect(ax2 - 3, topAfterSetback - 6, 7, 5, shade(pal.right, 1.02));
    ctx.day.line(ax2 - 3, topAfterSetback - 6, ax2 + 4, topAfterSetback - 6, OUTLINE_DAY);
    ctx.night.fillRect(ax2 - 3, topAfterSetback - 6, 7, 5, shade(palN.right, 1.02));
    ctx.night.line(ax2 - 3, topAfterSetback - 6, ax2 + 4, topAfterSetback - 6, OUTLINE_NIGHT);
  }
  if (tier >= 7) {
    // Crown setback + mast (tallest read, still plain architecture).
    const setbackTop = topY - Math.max(8, Math.round(h * 0.16));
    const cHw = Math.round(hw * 0.4);
    box(cx, setbackTop, cHw, Math.max(9, Math.round(h * 0.14)), 1.03, true, 0.5);
    ctx.day.line(cx, setbackTop - Math.max(9, Math.round(h * 0.14)), cx, setbackTop - Math.max(9, Math.round(h * 0.14)) - 10, OUTLINE_DAY);
    ctx.night.line(cx, setbackTop - Math.max(9, Math.round(h * 0.14)), cx, setbackTop - Math.max(9, Math.round(h * 0.14)) - 10, OUTLINE_NIGHT);
    ctx.lights.fillEllipse(cx, setbackTop - Math.max(9, Math.round(h * 0.14)) - 11, 1, 1, BEACON_RED);
  }

  // ── rooftop clutter (vents; deterministic) ──
  if (rng() < 0.6 && family !== "Unassigned") {
    const ax = cx + Math.round((rng() * 2 - 1) * hw * 0.4);
    const ay = topY + Math.round((rng() * 2 - 1) * hh * 0.2);
    ctx.day.fillRect(ax - 3, ay - 5, 6, 4, shade(pal.trim, 1.05));
    ctx.day.line(ax - 3, ay - 5, ax + 3, ay - 5, OUTLINE_DAY);
    ctx.night.fillRect(ax - 3, ay - 5, 6, 4, shade(palN.trim, 1.05));
    ctx.night.line(ax - 3, ay - 5, ax + 3, ay - 5, OUTLINE_NIGHT);
  }

  // ── ground contact: footprint outline ──
  const diamond: Array<[number, number]> = [
    [cx, baseY - hh],
    [cx + hw, baseY],
    [cx, baseY + hh],
    [cx - hw, baseY],
  ];
  ctx.day.strokePoly(diamond, OUTLINE_DAY, 110);
  ctx.night.strokePoly(diamond, OUTLINE_NIGHT, 110);
}

// ── sheet assembly ────────────────────────────────────────────────────────

const FRAME_W = 128;
const FRAME_PAD_BOTTOM = 26;
const FRAME_PAD_TOP = 40;
const SHEET_PAD = 2;

interface SheetMeta {
  family: Family;
  tier: Tier;
  url: string;
  frameW: number;
  frameH: number;
  anchorX: number;
  anchorY: number;
  artHeight: number;
}

function fileStem(family: Family, tier: Tier): string {
  return `${family.replace(/[^A-Za-z0-9]+/g, "-")}-t${tier}`;
}

function renderFrames(family: Family, tier: Tier, variant: number, frameH: number): FrameCtx {
  const rng = mulberry32(seedOf(family, tier, variant));
  const ctx: FrameCtx = {
    day: new PixCanvas(FRAME_W, frameH),
    night: new PixCanvas(FRAME_W, frameH),
    lights: new PixCanvas(FRAME_W, frameH),
    cx: Math.round(FRAME_W / 2),
    baseY: frameH - FRAME_PAD_BOTTOM,
    rng,
    variant,
    tier,
    family,
  };
  drawBuilding(ctx);
  return ctx;
}

async function generateSheet(family: Family, tier: Tier): Promise<SheetMeta> {
  const artHeight = artHeightOf(family, tier);
  const frameH = artHeight + FRAME_PAD_TOP + FRAME_PAD_BOTTOM;
  const cols = 3;
  const sheetW = cols * FRAME_W + (cols + 1) * SHEET_PAD;
  const sheetH = VARIANTS * frameH + (VARIANTS + 1) * SHEET_PAD;

  const sheet = new PixCanvas(sheetW, sheetH);
  for (let variant = 0; variant < VARIANTS; variant++) {
    const ctx = renderFrames(family, tier, variant, frameH);
    const frameY = SHEET_PAD + variant * (frameH + SHEET_PAD);
    const frames = [ctx.day, ctx.night, ctx.lights];
    for (let col = 0; col < cols; col++) {
      blit(sheet, frames[col], SHEET_PAD + col * (FRAME_W + SHEET_PAD), frameY);
    }
  }

  const stem = fileStem(family, tier);
  await writePng(path.join(OUT_DIR, `${stem}.png`), sheet);
  return {
    family,
    tier,
    url: `/city/pixel/${stem}.png`,
    frameW: FRAME_W,
    frameH,
    anchorX: Math.round(FRAME_W / 2),
    anchorY: frameH - FRAME_PAD_BOTTOM,
    artHeight,
  };
}

function blit(dst: PixCanvas, src: PixCanvas, dx: number, dy: number): void {
  for (let y = 0; y < src.H; y++) {
    for (let x = 0; x < src.W; x++) {
      const i = (y * src.W + x) * 4;
      if (src.data[i + 3] === 0) continue;
      dst.px(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2]], src.data[i + 3]);
    }
  }
}

async function writePng(file: string, cv: PixCanvas): Promise<void> {
  await sharp(cv.data, {
    raw: { width: cv.W, height: cv.H, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(file);
}

// ── manifest emission ─────────────────────────────────────────────────────

function emitManifest(metas: SheetMeta[]): void {
  const byFamily = new Map<string, SheetMeta[]>();
  for (const m of metas) {
    const list = byFamily.get(m.family) ?? [];
    list.push(m);
    byFamily.set(m.family, list);
  }
  const lines: string[] = [
    "/**",
    " * AUTO-GENERATED by scripts/gen-city-pixel-art.ts — do not edit by hand.",
    " * Regenerate: npm run gen:city-pixel-art",
    " *",
    " * Per (family × tier) sheet metadata: 3 variant rows × 3 frame columns",
    " * (day | night | lights). anchorX/anchorY = ground-contact pixel (the",
    " * footprint diamond center) inside ONE frame; artHeight = massing height",
    " * above the contact (FX anchors, culling margins). Day frames are",
    " * TRUE-COLOR (v2 normal-city direction: no day-matrix compensation).",
    " */",
    "",
    "export interface CityPixelSheet {",
    "  url: string;",
    "  frameW: number;",
    "  frameH: number;",
    "  anchorX: number;",
    "  anchorY: number;",
    "  artHeight: number;",
    "}",
    "",
    "export const CITY_PIXEL_VARIANTS = 3;",
    "",
    "export const CITY_PIXEL_SHEETS: Readonly<Record<string, ReadonlyArray<CityPixelSheet | null>>> = {",
  ];
  for (const family of FAMILIES) {
    const list = byFamily.get(family) ?? [];
    const entries = TIERS.map((t) => {
      const m = list.find((e) => e.tier === t);
      if (!m) return "null";
      return `{ url: "${m.url}", frameW: ${m.frameW}, frameH: ${m.frameH}, anchorX: ${m.anchorX}, anchorY: ${m.anchorY}, artHeight: ${m.artHeight} }`;
    });
    lines.push(`  ${JSON.stringify(family)}: [${entries.join(", ")}],`);
  }
  lines.push("};");
  lines.push("");
  fs.writeFileSync(MANIFEST_TS, lines.join("\n"), "utf8");
}

// ── QA contact sheet ──────────────────────────────────────────────────────

async function writeContactSheet(metas: SheetMeta[]): Promise<void> {
  const SCALE = 2;
  const frameW = Math.round(FRAME_W / SCALE);
  const maxFrameH = Math.max(...metas.map((m) => m.frameH));
  const cellW = frameW * 3 + 6;
  const cellH = Math.round(maxFrameH / SCALE) + 6;
  const sheet = new PixCanvas(cellW * TIERS.length, cellH * FAMILIES.length);
  // Neutral background so both palettes read.
  for (let y = 0; y < sheet.H; y++) {
    for (let x = 0; x < sheet.W; x++) sheet.px(x, y, [58, 62, 58]);
  }

  const sample = (src: PixCanvas, x: number, y: number): RGB => {
    const i = (y * src.W + x) * 4;
    if (src.data[i + 3] === 0) return [58, 62, 58];
    return [src.data[i], src.data[i + 1], src.data[i + 2]];
  };

  for (let f = 0; f < FAMILIES.length; f++) {
    for (let t = 0; t < TIERS.length; t++) {
      const meta = metas[f * TIERS.length + t];
      const ctx = renderFrames(FAMILIES[f], TIERS[t], 0, meta.frameH);
      const frames = [ctx.day, ctx.night, ctx.lights];
      const cellX = t * cellW;
      const cellY = f * cellH;
      for (let col = 0; col < 3; col++) {
        const src = frames[col];
        const anchor = meta.anchorY / SCALE;
        for (let y = 0; y < Math.round(meta.frameH / SCALE); y++) {
          for (let x = 0; x < frameW; x++) {
            sheet.px(cellX + 2 + col * (frameW + 2) + x, cellY + cellH - 4 - anchor + y, sample(src, x * SCALE, y * SCALE));
          }
        }
      }
    }
  }
  await writePng(PREVIEW_PNG, sheet);
}

// ── entry ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const metas: SheetMeta[] = [];
  for (const family of FAMILIES) {
    for (const tier of TIERS) {
      metas.push(await generateSheet(family, tier));
    }
  }
  emitManifest(metas);
  await writeContactSheet(metas);
  console.log(
    `[gen-city-pixel-art] ${metas.length} sheets (normal-city v2) → public/city/pixel/ · manifest → ${path.relative(ROOT, MANIFEST_TS)}`
  );
  console.log(`[gen-city-pixel-art] QA contact sheet → ${path.relative(ROOT, PREVIEW_PNG)}`);
}

void main();
