/**
 * Original pixel-art building generator (city engine upgrade, 2026-09-28).
 *
 * Deterministic, dependency-free art: every sprite is PLOTTED PIXEL BY PIXEL
 * into an RGBA buffer (scanline polygon fills, Bresenham edges — no
 * anti-aliasing, integer coordinates only) and written as PNG via sharp.
 * 100% original work drawn by code — inspired by the broad qualities of
 * 1990s isometric city builders, never by any specific asset.
 *
 * Output per (family × tier): public/city/pixel/<Family>-t<N>.png — a sheet
 * with 3 DETERMINISTIC VARIANTS (rows) × 3 frames (columns):
 *
 *   col 0  day     full-daylight art (authored pre-compensated for the
 *                  scene's day matrix lift, see DAY_LIFT_* below)
 *   col 1  night   night-native mass (matches the city's dark ambience)
 *   col 2  lights  emissive-only pass (transparent + lit windows/neon) —
 *                  rendered additively at night, feeds the bloom pass
 *
 * Plus src/components/city/world/scene/city-pixel-art.generated.ts — the
 * manifest (URL + frame geometry + ground-contact anchor + art height).
 *
 * Night frames reuse the FAMILY_MASS_HEX / FAMILY_NEON_HEX canon from
 * src/lib/city/district.ts so pixel art, procedural art and the DOM tiles
 * stay one palette family.
 *
 * Run: npm run gen:city-pixel-art   (deterministic — safe to re-run)
 */
import * as path from "path";
import * as fs from "fs";
import sharp from "sharp";
import {
  FAMILY_MASS_HEX,
  FAMILY_NEON_HEX,
  UNASSIGNED_MASS_HEX,
  UNASSIGNED_NEON_HEX,
} from "../src/lib/city/district";

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
/** QA contact sheet (dev artifact — not shipped; delete or ignore). */
const PREVIEW_PNG = path.join(ROOT, "scripts", "city-pixel-preview.png");

/** Families in manifest order (keys of CITY_ART_MANIFEST / DB professions). */
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

/**
 * Day frames are authored knowing the scene lifts the whole world at full
 * day (ColorMatrix c → c·SCALE + OFFSET — CityScene DAY_MATRIX_* in pixel
 * mode). Authoring in "pre-compensated" space keeps ONE global day system
 * (hero landmarks, paths, aggregates stay procedural and keep working)
 * while pixel buildings land on the intended palette after the lift. The
 * contact sheet applies the same map so what is QA'd is what ships.
 */
const DAY_LIFT_SCALE = 0.72;
const DAY_LIFT_OFFSET = 0.26;

// ── tiny deterministic RNG (same algorithm as art.ts mulberry32) ──────────

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
/** Author-space → screen-space day color (the scene's day matrix, in JS). */
function dayLift(c: RGB): RGB {
  return [
    Math.min(255, Math.round(c[0] * DAY_LIFT_SCALE + DAY_LIFT_OFFSET * 255)),
    Math.min(255, Math.round(c[1] * DAY_LIFT_SCALE + DAY_LIFT_OFFSET * 255)),
    Math.min(255, Math.round(c[2] * DAY_LIFT_SCALE + DAY_LIFT_OFFSET * 255)),
  ];
}
/** Push a color toward gray (day signage reads as paint, not neon). */
function desaturate(c: RGB, k: number): RGB {
  const l = (c[0] + c[1] + c[2]) / 3;
  return [
    Math.round(c[0] + (l - c[0]) * k),
    Math.round(c[1] + (l - c[1]) * k),
    Math.round(c[2] + (l - c[2]) * k),
  ];
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

  /** Bresenham segment. */
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

  /** Even-odd scanline polygon fill on the integer grid (crisp by design). */
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

// ── palettes ──────────────────────────────────────────────────────────────

const OUTLINE_NIGHT: RGB = hexToRgb("#04060c");
const OUTLINE_DAY: RGB = hexToRgb("#2a3450");
const GLASS_DAY: RGB = hexToRgb("#426094");
const GLASS_DAY_HI: RGB = hexToRgb("#93b7de");
const GLASS_NIGHT: RGB = hexToRgb("#141a2b");
const WINDOW_WARM: RGB = hexToRgb("#ffb547");
const WINDOW_COOL: RGB = hexToRgb("#bfd7ff");
const WINDOW_WHITE: RGB = hexToRgb("#f2f7ff");
const DOOR_GLOW: RGB = hexToRgb("#ffd9a0");
const LED_GREEN: RGB = [61, 220, 151];
const LED_RED: RGB = [229, 72, 77];

function massOf(family: Family): RGB {
  return hexToRgb(FAMILY_MASS_HEX[family] ?? UNASSIGNED_MASS_HEX);
}
function neonOf(family: Family): RGB {
  return hexToRgb(FAMILY_NEON_HEX[family] ?? UNASSIGNED_NEON_HEX);
}

/**
 * Day wall ramps: neutral concrete/steel with a whisper of the family hue,
 * authored in pre-compensated space (dayLift maps to the screen palette).
 */
function dayWalls(family: Family): { left: RGB; right: RGB; roof: RGB } {
  const tint = desaturate(massOf(family), 0.7);
  const base: RGB = mix([108, 114, 130], tint, 0.32);
  return {
    left: shade(base, 0.7), // away from the key light (upper-right)
    right: shade(base, 1.0),
    roof: shade(mix(base, [150, 158, 172], 0.5), 1.12),
  };
}

// ── iso geometry ──────────────────────────────────────────────────────────

interface WallRamp {
  left: RGB;
  right: RGB;
  roof: RGB;
}

/** One extruded iso box; footprint diamond center at (cx, baseY). */
function isoBox(
  cv: PixCanvas,
  cx: number,
  baseY: number,
  hw: number,
  hh: number,
  h: number,
  walls: WallRamp,
  outline: RGB
): void {
  const top = baseY - h;
  // Left face (away from the key light).
  cv.fillPoly(
    [
      [cx - hw, top],
      [cx, top + hh],
      [cx, baseY + hh],
      [cx - hw, baseY],
    ],
    walls.left
  );
  // Right face (key light).
  cv.fillPoly(
    [
      [cx + hw, top],
      [cx, top + hh],
      [cx, baseY + hh],
      [cx + hw, baseY],
    ],
    walls.right
  );
  // Top diamond (sky exposure — lightest plane).
  cv.fillPoly(
    [
      [cx, top - hh],
      [cx + hw, top],
      [cx, top + hh],
      [cx - hw, top],
    ],
    walls.roof
  );
  // Front-corner vertical seam.
  cv.line(cx, top + hh, cx, baseY + hh, outline);
  // Selective outline: roof diamond + the two front ground edges.
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

/** Iso cylinder (reactor core): body + shading + top disc. */
function isoCylinder(
  cv: PixCanvas,
  cx: number,
  baseY: number,
  r: number,
  h: number,
  walls: WallRamp,
  outline: RGB
): void {
  const top = baseY - h;
  cv.fillRect(Math.round(cx - r), Math.round(top), Math.round(2 * r), Math.round(h), walls.right);
  cv.fillRect(Math.round(cx - r), Math.round(top), Math.round(r), Math.round(h), walls.left);
  cv.fillEllipse(cx, top, r, r / 2, walls.roof);
  cv.line(Math.round(cx - r), top, Math.round(cx - r), baseY, outline);
  cv.line(Math.round(cx + r), top, Math.round(cx + r), baseY, outline);
  cv.strokeEllipse(cx, top, r, r / 2, outline);
  cv.fillEllipse(cx, baseY, r, r / 2, shade(walls.left, 0.72));
}

/**
 * Window grid on ONE face of an iso box, in FACE SPACE:
 *   u ∈ [0,1] across the face (from the outer corner to the front corner),
 *   v ∈ [0,1] up the wall. Screen point = outer + u·(across) − v·(up·h).
 * Rectangles in face space map to correct iso parallelograms for free.
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
  rng: () => number
): void {
  const ox = cx + side * hw; // face bottom-outer corner
  const ax = -side * hw; // across → front corner
  const ay = hh;
  const wU = 4.5 / hw; // window width in face units (~4-5 px)
  const wV = 4.5 / h; // window height in face units
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
      // Day: glass + 1px sky highlight on the sill edge.
      day.fillPoly(quad, GLASS_DAY);
      day.line(quad[0][0], quad[0][1], quad[1][0], quad[1][1], GLASS_DAY_HI);
      // Night: dark inset (facade texture without light).
      night.fillPoly(quad, GLASS_NIGHT);
      // Lights: seeded ~58% lit, warm/cool/white canon (matches the
      // procedural window palette).
      const r = rng();
      if (r < 0.58) {
        const r2 = rng();
        const lit = r2 < 0.6 ? WINDOW_WARM : r2 < 0.88 ? WINDOW_COOL : WINDOW_WHITE;
        lights.fillPoly(quad, lit);
      }
    }
  }
}

// ── family specs (silhouettes mirror art.ts; pixel proportions) ───────────

interface FamilySpec {
  baseH: number;
  floorH: number;
  hw: number; // tier-1 footprint half-width (px); hh = hw/2
  cols: number; // window columns per face
}

const FAMILY_SPEC: Record<Family, FamilySpec> = {
  Cryptographer: { baseH: 26, floorH: 8, hw: 54, cols: 5 },
  "Zero-Day": { baseH: 34, floorH: 12, hw: 48, cols: 2 },
  Overclocker: { baseH: 38, floorH: 11, hw: 40, cols: 3 },
  "Cache Keeper": { baseH: 26, floorH: 10, hw: 44, cols: 3 },
  "Server Marshal": { baseH: 40, floorH: 13, hw: 34, cols: 4 },
  "Bot Herder": { baseH: 22, floorH: 9, hw: 52, cols: 3 },
  Unassigned: { baseH: 30, floorH: 12, hw: 36, cols: 2 },
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
  cx: number; // ground-contact column (frame-local)
  baseY: number; // ground-contact row (frame-local)
  rng: () => number;
  variant: number;
  tier: Tier;
  family: Family;
}

function drawBuilding(ctx: FrameCtx): void {
  const { family, tier, rng, cx, baseY, variant } = ctx;
  const spec = FAMILY_SPEC[family];
  const neon = neonOf(family);
  const h = artHeightOf(family, tier);
  const hw = Math.min(58, spec.hw + Math.floor((tier - 1) * 1.5));
  const hh = Math.round(hw / 2);
  const wallsDay = dayWalls(family);
  const mass = massOf(family);
  const wallsNight: WallRamp = {
    left: shade(mass, 0.66),
    right: shade(mass, 1.12),
    roof: shade(mass, 1.5),
  };

  /** isoBox into BOTH day + night frames (+ windows into all three). */
  const box = (
    bx: number,
    by: number,
    bhw: number,
    bh: number,
    dayTint = 1,
    windows = true
  ) => {
    const bhh = Math.round(bhw / 2);
    const tinted = (w: WallRamp, k: number): WallRamp => ({
      left: shade(w.left, k),
      right: shade(w.right, k),
      roof: shade(w.roof, k),
    });
    isoBox(ctx.day, bx, by, bhw, bhh, bh, tinted(wallsDay, dayTint), OUTLINE_DAY);
    isoBox(ctx.night, bx, by, bhw, bhh, bh, tinted(wallsNight, dayTint), OUTLINE_NIGHT);
    if (windows && bh >= 14) {
      const rows = Math.max(1, Math.min(6, Math.floor((bh - 8) / 11)));
      const cols = Math.max(1, Math.min(spec.cols, Math.floor(bhw / 9)));
      faceWindows(ctx.day, ctx.night, ctx.lights, bx, by, bhw, bhh, bh, -1, cols, rows, rng);
      faceWindows(ctx.day, ctx.night, ctx.lights, bx, by, bhw, bhh, bh, 1, cols, rows, rng);
    }
  };

  switch (family) {
    case "Cryptographer": {
      // Wide squat vault: stacked shrinking plates + dome cap.
      const plates = Math.max(1, Math.min(3, Math.ceil(tier / 2.5)));
      let y = baseY;
      let phw = hw;
      for (let i = 0; i < plates; i++) {
        const ph = Math.round(h / plates);
        box(cx, y, phw, ph, 1 - i * 0.06, i === 0);
        y -= ph;
        phw = Math.round(phw * 0.82);
      }
      const domeR = Math.max(8, Math.round(hw * 0.4));
      for (const [cv, walls, outline] of [
        [ctx.day, wallsDay, OUTLINE_DAY],
        [ctx.night, wallsNight, OUTLINE_NIGHT],
      ] as const) {
        cv.fillEllipse(cx, y - domeR * 0.2, domeR, Math.round(domeR * 0.75), walls.roof);
        cv.fillEllipse(
          cx,
          y - domeR * 0.55,
          Math.round(domeR * 0.66),
          Math.round(domeR * 0.45),
          shade(walls.roof, 1.08)
        );
        cv.strokeEllipse(cx, y - domeR * 0.2, domeR, Math.round(domeR * 0.75), outline);
      }
      // Lights: keyhole finial + base lattice ring.
      ctx.lights.strokeEllipse(cx, baseY - 2, hw - 4, Math.round((hw - 4) / 2), shade(neon, 1.25), 210);
      ctx.lights.fillEllipse(cx, y - domeR - 5, 2, 2, WINDOW_WHITE);
      break;
    }
    case "Zero-Day": {
      // Twin pillars + spanning beam; hollow center (negative space) with a
      // dark backdrop so the gap reads as an opening, not missing pixels.
      const pw = Math.round(hw * 0.34);
      const gap = Math.round(hw * 0.56);
      // Backdrop: the gateway mouth (drawn first, pillars overlap its edges).
      const mouth = Math.max(3, gap - pw - 2);
      ctx.day.fillRect(cx - mouth, baseY - h + 6, mouth * 2, h - 6, shade(wallsDay.left, 0.5));
      ctx.night.fillRect(cx - mouth, baseY - h + 6, mouth * 2, h - 6, shade(mass, 0.35));
      box(cx - gap, baseY, pw, h);
      box(cx + gap, baseY, pw, h);
      const beamH = 8;
      box(cx, baseY - h, Math.round(hw * 0.88), beamH, 1.1, false);
      // Lights: twin cap beacons + breach shard in the mouth.
      ctx.lights.fillEllipse(cx - gap, baseY - h - beamH - 4, 2, 2, shade(neon, 1.5));
      ctx.lights.fillEllipse(cx + gap, baseY - h - beamH - 4, 2, 2, shade(neon, 1.5));
      const sy = baseY - Math.round(h * 0.45);
      ctx.lights.fillPoly(
        [
          [cx, sy],
          [cx + 4, sy - 8],
          [cx, sy - 15],
          [cx - 4, sy - 8],
        ],
        shade(neon, 1.15)
      );
      break;
    }
    case "Overclocker": {
      // Reactor cylinder + coil rings.
      const r = Math.round(hw * 0.42);
      box(cx, baseY, hw, 6, 0.9, false);
      isoCylinder(ctx.day, cx, baseY - 5, r, h, wallsDay, OUTLINE_DAY);
      isoCylinder(ctx.night, cx, baseY - 5, r, h, wallsNight, OUTLINE_NIGHT);
      // Night top rim — the disc must read against the dark sky.
      ctx.night.strokeEllipse(cx, baseY - 5 - h, r, Math.round(r / 2), shade(mass, 2.1), 170);
      // Lights: coil rings down the core + plasma tip.
      for (let y = baseY - 14; y > baseY - h - 2; y -= 11) {
        ctx.lights.strokeEllipse(cx, y, r + 3, Math.round((r + 3) / 2), shade(neon, 1.35), 225);
      }
      ctx.lights.fillEllipse(cx, baseY - h - 11, 3, 3, shade(neon, 1.6));
      ctx.lights.strokeEllipse(cx, baseY - h - 11, 5, 3, shade(neon, 1.2), 200);
      break;
    }
    case "Cache Keeper": {
      // Offset stacked chip slabs (alternating diagonal offset).
      const layers = Math.max(2, Math.min(4, Math.ceil(tier / 2)));
      let y = baseY;
      let lhw = hw;
      for (let i = 0; i < layers; i++) {
        const lh = Math.round(h / layers);
        const dx = i === 0 ? 0 : (i + variant) % 2 === 0 ? 5 : -5;
        box(cx + dx, y, lhw, lh, 1 - i * 0.05, i === 0 || i === layers - 1);
        y -= lh;
        lhw = Math.round(lhw * 0.84);
      }
      // Lights: connector pins along the base right edge + bracket cap.
      for (let i = 0; i < 4; i++) {
        ctx.lights.fillRect(cx + Math.round(hw * 0.72), baseY - 10 - i * 7, 5, 2, shade(neon, 1.5));
      }
      ctx.lights.strokePoly(
        [
          [cx - 4, y - 13],
          [cx + 4, y - 13],
          [cx + 4, y - 7],
          [cx - 4, y - 7],
        ],
        shade(neon, 1.4)
      );
      break;
    }
    case "Server Marshal": {
      // Uniform rack slab + horizontal grooves.
      box(cx, baseY, hw, h);
      for (const [cv, walls] of [
        [ctx.day, wallsDay],
        [ctx.night, wallsNight],
      ] as const) {
        for (let y = baseY - 10; y > baseY - h + 6; y -= 9) {
          cv.line(
            cx - hw + 3,
            y + Math.round(hh * 0.25),
            cx + hw - 3,
            y - Math.round(hh * 0.25),
            shade(walls.left, 0.82),
            200
          );
        }
      }
      // Lights: LED strip rows + antenna array.
      for (let y = baseY - 12; y > baseY - h + 8; y -= 9) {
        ctx.lights.fillRect(cx - hw + 5, y, Math.round(hw * 1.1), 1, shade(neon, 1.45));
      }
      for (const dx of [-6, 0, 6]) {
        ctx.lights.line(cx + dx, baseY - h, cx + dx, baseY - h - 8, shade(neon, 1.2));
        ctx.lights.fillEllipse(cx + dx, baseY - h - 9, 1, 1, shade(neon, 1.7));
      }
      break;
    }
    case "Bot Herder": {
      // Tri-lobed hangar: center + two side bays.
      const bayH = Math.round(h * 0.68);
      box(cx, baseY, Math.round(hw * 0.58), h);
      const bw = Math.round(hw * 0.3);
      box(cx - Math.round(hw * 0.82), baseY + 3, bw, bayH, 0.92);
      box(cx + Math.round(hw * 0.82), baseY + 3, bw, bayH, 0.92);
      // Lights: bay door slits + landing pad ring.
      for (const dx of [-Math.round(hw * 0.82), 0, Math.round(hw * 0.82)]) {
        ctx.lights.fillRect(cx + dx - 2, baseY - Math.round(bayH * 0.4), 4, 2, shade(neon, 1.55));
      }
      ctx.lights.strokeEllipse(cx, baseY - h - 5, 8, 4, shade(neon, 1.35));
      ctx.lights.fillEllipse(cx, baseY - h - 5, 1, 1, WINDOW_WHITE);
      break;
    }
    case "Unassigned": {
      // Neutral stepped cube (two steps).
      box(cx, baseY, hw, Math.round(h * 0.62));
      box(cx, baseY - Math.round(h * 0.62), Math.round(hw * 0.72), Math.round(h * 0.38), 1.05);
      break;
    }
  }

  // ── shared tier features (the no-label tier ladder) ──
  const topY = baseY - h;
  if (tier >= 3) {
    const ax = cx + (family === "Overclocker" ? hw : -hw) * 0.55;
    ctx.day.line(ax, topY, ax, topY - 12, OUTLINE_DAY);
    ctx.night.line(ax, topY, ax, topY - 12, OUTLINE_NIGHT);
    ctx.lights.fillEllipse(ax, topY - 13, 1, 1, LED_RED);
  }
  if (tier >= 4) {
    for (const dx of [-1, 1]) {
      const px = cx + dx * Math.round(hw * 0.95);
      isoBox(ctx.day, px, baseY - 2, 6, 3, 9, wallsDay, OUTLINE_DAY);
      isoBox(ctx.night, px, baseY - 2, 6, 3, 9, wallsNight, OUTLINE_NIGHT);
    }
  }
  if (tier >= 5) {
    ctx.lights.strokeEllipse(cx, topY + Math.round(h * 0.34), hw + 4, Math.round((hw + 4) / 2), shade(neon, 1.3), 205);
  }
  if (tier >= 6) {
    const crowned: WallRamp = { left: wallsDay.roof, right: shade(wallsDay.roof, 1.05), roof: shade(wallsDay.roof, 1.15) };
    const crownedN: WallRamp = { left: wallsNight.roof, right: shade(wallsNight.roof, 1.05), roof: shade(wallsNight.roof, 1.15) };
    const cHw = Math.round(hw * 0.66);
    isoBox(ctx.day, cx, topY - 4, cHw, Math.round(cHw / 2), 5, crowned, OUTLINE_DAY);
    isoBox(ctx.night, cx, topY - 4, cHw, Math.round(cHw / 2), 5, crownedN, OUTLINE_NIGHT);
  }
  if (tier >= 7) {
    const mega: WallRamp = { left: shade(wallsDay.roof, 0.95), right: wallsDay.roof, roof: shade(wallsDay.roof, 1.1) };
    const megaN: WallRamp = { left: shade(wallsNight.roof, 0.9), right: wallsNight.roof, roof: shade(wallsNight.roof, 1.1) };
    const mHw = Math.round(hw * 0.98);
    isoBox(ctx.day, cx, topY - 11, mHw, Math.round(mHw / 2), 7, mega, OUTLINE_DAY);
    isoBox(ctx.night, cx, topY - 11, mHw, Math.round(mHw / 2), 7, megaN, OUTLINE_NIGHT);
    ctx.lights.fillEllipse(cx, topY - 22, 2, 2, WINDOW_WHITE);
    ctx.lights.strokeEllipse(cx, topY - 22, 4, 3, shade(neon, 1.25), 210);
  }

  // ── rooftop clutter (deterministic; LED into lights) ──
  if (rng() < 0.65) {
    const ax = cx + Math.round((rng() * 2 - 1) * hw * 0.4);
    const ay = topY + Math.round((rng() * 2 - 1) * hh * 0.25);
    ctx.day.fillRect(ax - 3, ay - 5, 6, 4, shade(wallsDay.roof, 0.88));
    ctx.day.line(ax - 3, ay - 5, ax + 3, ay - 5, OUTLINE_DAY);
    ctx.night.fillRect(ax - 3, ay - 5, 6, 4, shade(wallsNight.roof, 0.88));
    ctx.night.line(ax - 3, ay - 5, ax + 3, ay - 5, OUTLINE_NIGHT);
    ctx.lights.fillEllipse(ax, ay - 6, 1, 1, rng() < 0.5 ? LED_GREEN : LED_RED);
  }

  // Door glow at the front corner (night identity).
  ctx.lights.fillRect(cx - 2, baseY - 5, 4, 3, DOOR_GLOW);

  // ── ground contact: footprint diamond outline (day + night frames) ──
  const diamond: Array<[number, number]> = [
    [cx, baseY - hh],
    [cx + hw, baseY],
    [cx, baseY + hh],
    [cx - hw, baseY],
  ];
  ctx.day.strokePoly(diamond, OUTLINE_DAY, 120);
  ctx.night.strokePoly(diamond, OUTLINE_NIGHT, 120);
}

// ── sheet assembly ────────────────────────────────────────────────────────

const FRAME_W = 128;
/** Room below the contact row for the footprint diamond's lower half. */
const FRAME_PAD_BOTTOM = 26;
/** Headroom above the roofline for tier features/beacons/antennas. */
const FRAME_PAD_TOP = 34;
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

/** Render variant `variant` of (family, tier) into three fresh frames. */
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
  const cols = 3; // day | night | lights
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

/** Copy src's opaque pixels into dst at (dx, dy). */
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
    " * authored pre-compensated for the scene's day matrix lift.",
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

/**
 * One row per family, one column per tier; each cell shows variant 0's
 * day (matrix-lifted — what ships on screen) | night | lights frames at
 * half scale. Dev artifact for visual review only.
 */
async function writeContactSheet(metas: SheetMeta[]): Promise<void> {
  const SCALE = 2; // nearest-neighbor downscale
  const frameW = Math.round(FRAME_W / SCALE);
  const maxFrameH = Math.max(...metas.map((m) => m.frameH));
  const cellW = frameW * 3 + 6;
  const cellH = Math.round(maxFrameH / SCALE) + 6;
  const sheet = new PixCanvas(cellW * TIERS.length, cellH * FAMILIES.length);

  const sample = (src: PixCanvas, x: number, y: number, lift: boolean): RGB => {
    const i = (y * src.W + x) * 4;
    if (src.data[i + 3] === 0) return [46, 50, 58]; // gray = empty (≠ dark pixel)
    const c: RGB = [src.data[i], src.data[i + 1], src.data[i + 2]];
    return lift ? dayLift(c) : c;
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
        const lift = col === 0;
        const anchor = meta.anchorY / SCALE;
        for (let y = 0; y < Math.round(meta.frameH / SCALE); y++) {
          for (let x = 0; x < frameW; x++) {
            const c = sample(src, x * SCALE, y * SCALE, lift);
            sheet.px(cellX + 2 + col * (frameW + 2) + x, cellY + cellH - 4 - anchor + y, c);
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
    `[gen-city-pixel-art] ${metas.length} sheets → public/city/pixel/ · manifest → ${path.relative(ROOT, MANIFEST_TS)}`
  );
  console.log(`[gen-city-pixel-art] QA contact sheet → ${path.relative(ROOT, PREVIEW_PNG)}`);
}

void main();
