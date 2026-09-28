/**
 * Original pixel-art building generator — SimCity 4 edition (2026-09-28 v3,
 * user art-direction ruling: "buildings read as black bricks — aim for
 * SimCity 4000, remove the bloom/gloom").
 *
 * Deterministic, dependency-free art: every sprite is PLOTTED PIXEL BY PIXEL
 * into an RGBA buffer (scanline polygon fills, Bresenham edges — no
 * anti-aliasing, integer coordinates only) and written as PNG via sharp.
 * 100% original work drawn by code, inspired only by the broad qualities of
 * early-2000s realistic city builders.
 *
 * Art direction (v3 — SimCity 4 contrast pass):
 * - Day frames are TRUE COLOR, BRIGHT and SATURATED: strong sun/shade split
 *   between the two visible faces (~0.74× on the shade wall), LIGHT
 *   sky-blue day glass (the v2 dark-navy glass was the main "black brick"
 *   cause), floor spandrel bands under every window row.
 * - Night frames are MOONLIT, not black: masses keep ~40% luminance with a
 *   cool blue cast (v2 mixed to ~16% → unreadable dark slabs), windows stay
 *   visible as darker insets, lit ratio raised.
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
/** Night mass: moonlit blue-gray — keep hue + ~40% luminance (v3: readable,
 *  not the v2 near-black mix that made buildings read as "black bricks"). */
function nightOf(c: RGB): RGB {
  return mix(shade(c, 0.55), [46, 54, 80], 0.42);
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

// ── shared palette (SimCity-4 contrast pass) ──────────────────────────────

const OUTLINE_DAY: RGB = hexToRgb("#4a4438");
const OUTLINE_NIGHT: RGB = hexToRgb("#10141f");
// Day glass is SKY-LIGHT steel blue (SC4 curtain walls read light by day —
// dark navy glass turned whole facades into "black bricks").
const GLASS_DAY: RGB = hexToRgb("#7ea6c9");
const GLASS_DAY_HI: RGB = hexToRgb("#e2f0fb");
// Night glass: a visible darker inset against the moonlit walls (v2 #121826
// vanished into the near-black masses).
const GLASS_NIGHT: RGB = hexToRgb("#25304a");
const WINDOW_WARM: RGB = hexToRgb("#ffd27a");
const WINDOW_PALE: RGB = hexToRgb("#fff3c9");
const WINDOW_COOL: RGB = hexToRgb("#cfe0ff");
const DOOR_LAMP: RGB = hexToRgb("#ffdf9e");
const BEACON_RED: RGB = [226, 88, 74];

/**
 * Per-family day materials (walls/roof) — night derives via nightOf(). The
 * left/right split is the SC4 sun read: the shade face sits at ~0.72–0.78×
 * the sunlit face (v2 used 0.88–0.92 — too flat to read as architecture).
 */
interface FamilyPalette {
  left: RGB; // wall, away from light
  right: RGB; // wall, key light
  roof: RGB;
  trim: RGB; // roof edge / details
}

const FAMILY_PALETTE: Record<Family, FamilyPalette> = {
  // Stone civic building with a copper-green dome.
  Cryptographer: {
    left: shade(hexToRgb("#cfb98e"), 0.74),
    right: hexToRgb("#cfb98e"),
    roof: hexToRgb("#7fa98d"),
    trim: hexToRgb("#5e7862"),
  },
  // Pale concrete twin towers + bridge.
  "Zero-Day": {
    left: shade(hexToRgb("#c9ced6"), 0.76),
    right: hexToRgb("#c9ced6"),
    roof: hexToRgb("#aab0b8"),
    trim: hexToRgb("#848b94"),
  },
  // Brick industrial silo block.
  Overclocker: {
    left: shade(hexToRgb("#c4735a"), 0.74),
    right: hexToRgb("#c4735a"),
    roof: hexToRgb("#a3aab3"),
    trim: hexToRgb("#7d848d"),
  },
  // Beige stepped offices, brown roof trims.
  "Cache Keeper": {
    left: shade(hexToRgb("#d8c8a0"), 0.76),
    right: hexToRgb("#d8c8a0"),
    roof: hexToRgb("#9a7550"),
    trim: hexToRgb("#7a5c40"),
  },
  // Blue-glass corporate tower.
  "Server Marshal": {
    left: shade(hexToRgb("#b6c6d8"), 0.78),
    right: hexToRgb("#b6c6d8"),
    roof: hexToRgb("#ccd1d7"),
    trim: hexToRgb("#97a0aa"),
  },
  // Metal warehouse, brick-red roof.
  "Bot Herder": {
    left: shade(hexToRgb("#c3cbd4"), 0.75),
    right: hexToRgb("#c3cbd4"),
    roof: hexToRgb("#b26852"),
    trim: hexToRgb("#85503f"),
  },
  // Small warm house.
  Unassigned: {
    left: shade(hexToRgb("#e3d5ae"), 0.78),
    right: hexToRgb("#e3d5ae"),
    roof: hexToRgb("#9a6a4a"),
    trim: hexToRgb("#78533a"),
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
 * Day: LIGHT sky-blue glass + sky highlight (SC4 curtain-wall read). Night:
 * darker moonlit inset. Lights: seeded lit windows (mostly warm — a normal
 * city at night). A thin SPANDREL BAND under every window row gives the
 * facade its floor rhythm (the SC4 signature detail).
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
  litRatio = 0.5,
  wallDay: RGB = OUTLINE_DAY,
  wallNight: RGB = OUTLINE_NIGHT
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
  // Spandrel band between window rows (floor separation): slightly darker
  // than its wall, spanning nearly the full face.
  const bV = 2.5 / h;
  const bandDay = shade(wallDay, 0.87);
  const bandNight = shade(wallNight, 0.93);
  for (let row = 0; row < rows; row++) {
    const v0 = 0.12 + (row + 0.5) * (0.72 / rows) - wV / 2;
    const bv = 0.12 + (row + 1) * (0.72 / rows) - bV / 2;
    if (row < rows - 1 || rows === 1) {
      const band: Array<[number, number]> = [
        point(0.07, bv),
        point(0.93, bv),
        point(0.93, bv + bV),
        point(0.07, bv + bV),
      ];
      day.fillPoly(band, bandDay);
      night.fillPoly(band, bandNight);
    }
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
    litRatio = 0.5
  ) => {
    const bhh = Math.round(bhw / 2);
    isoBox(ctx.day, bx, by, bhw, bhh, bh, shade(pal.left, tint), shade(pal.right, tint), shade(pal.roof, tint), OUTLINE_DAY);
    isoBox(ctx.night, bx, by, bhw, bhh, bh, shade(palN.left, tint), shade(palN.right, tint), shade(palN.roof, tint), OUTLINE_NIGHT);
    if (windows && bh >= 12) {
      const rows = Math.max(1, Math.min(7, Math.floor((bh - 6) / 9)));
      const cols = Math.max(1, Math.min(spec.cols, Math.floor(bhw / 9)));
      const winArgs = [
        bx, by, bhw, bhh, bh,
      ] as const;
      for (const side of [-1, 1] as const) {
        faceWindows(
          ctx.day, ctx.night, ctx.lights,
          ...winArgs, side, cols, rows, rng, litRatio,
          shade(side < 0 ? pal.left : pal.right, tint),
          shade(side < 0 ? palN.left : palN.right, tint)
        );
      }
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
      box(cx, baseY, hw, 10, 1, true, 0.45);
      const r = Math.round(hw * 0.42);
      const shaftH = h - 10;
      isoCylinder(ctx.day, cx, baseY - 8, r, shaftH, shade(pal.left, 0.95), shade(pal.right, 0.95), pal.roof, OUTLINE_DAY);
      isoCylinder(ctx.night, cx, baseY - 8, r, shaftH, shade(palN.left, 0.95), shade(palN.right, 0.95), palN.roof, OUTLINE_NIGHT);
      // Shaft window slits (2 columns): day glass, night inset, seeded lights —
      // an inhabited plant, not a blank silo (2026-09-28 SC4 contrast pass).
      const slitRows = Math.max(2, Math.floor(shaftH / 15));
      for (let i = 0; i < slitRows * 2; i++) {
        const col = i < slitRows ? -0.4 : 0.4;
        const sxp = Math.round(cx + col * r + (rng() * 2 - 1) * 3);
        const syp = Math.round(baseY - 12 - (i % slitRows) * 15 - rng() * 5);
        ctx.day.fillRect(sxp, syp, 2, 3, GLASS_DAY);
        ctx.night.fillRect(sxp, syp, 2, 3, GLASS_NIGHT);
        if (rng() < 0.55) {
          ctx.lights.fillRect(sxp, syp, 2, 3, rng() < 0.75 ? WINDOW_WARM : WINDOW_COOL);
        }
      }
      // Sibling small silo (variant-dependent side).
      const sr = Math.round(r * 0.45);
      const sx = cx + (variant % 2 === 0 ? hw * 0.62 : -hw * 0.62);
      isoCylinder(ctx.day, sx, baseY, sr, Math.round(shaftH * 0.55), pal.left, pal.right, pal.roof, OUTLINE_DAY);
      isoCylinder(ctx.night, sx, baseY, sr, Math.round(shaftH * 0.55), palN.left, palN.right, palN.roof, OUTLINE_NIGHT);
      for (let i = 0; i < 3; i++) {
        const px2 = Math.round(sx + (rng() * 2 - 1) * sr * 0.4);
        const py2 = Math.round(baseY - 8 - rng() * shaftH * 0.4);
        ctx.day.fillRect(px2, py2, 2, 2, GLASS_DAY);
        ctx.night.fillRect(px2, py2, 2, 2, GLASS_NIGHT);
        if (rng() < 0.6) ctx.lights.fillRect(px2, py2, 2, 2, WINDOW_WARM);
      }
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
      box(cx, baseY, Math.round(hw * 0.58), hallH, 1, true, 0.45);
      roofDetails(cx, baseY - hallH, Math.round(hw * 0.58));
      const bw = Math.round(hw * 0.3);
      const shedH = Math.round(h * 0.45);
      box(cx - Math.round(hw * 0.82), baseY + 3, bw, shedH, 0.95, true, 0.4);
      box(cx + Math.round(hw * 0.82), baseY + 3, bw, shedH, 0.95, true, 0.4);
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

// ── HERO ART: HQ core + the Six monuments (3 VALUE STAGES each) ───────────
//
// 2026-09-28 user ruling: the HQ and the goddess landmarks get the same
// pixel-art detail level as ordinary buildings, in 3 value-driven forms
// (stage 3 reserved for the neighborhood of the CURRENT game max — stages
// derive server-side in projection.ts heroStageOf). One stage per sheet,
// one variant row; frames are 192px wide (heroes are monumental).
//
// Identity accents (landmark-colors.ts roster order) survive as TRIM,
// beacons and lit details — the architecture itself is normal-city SC4
// materials, same palette family as the buildings.

const HERO_FRAME_W = 192;

function hex(c: string): RGB {
  return hexToRgb(c);
}

/** Hero-local iso box with window grids into all three frames. */
function heroBox(
  ctx: FrameCtx,
  cx: number,
  baseY: number,
  hw: number,
  h: number,
  pal: FamilyPalette,
  cols: number,
  litRatio = 0.5
): void {
  const palN = nightPalette(pal);
  const hh = Math.round(hw / 2);
  isoBox(ctx.day, cx, baseY, hw, hh, h, pal.left, pal.right, pal.roof, OUTLINE_DAY);
  isoBox(ctx.night, cx, baseY, hw, hh, h, palN.left, palN.right, palN.roof, OUTLINE_NIGHT);
  if (h >= 12) {
    const rows = Math.max(1, Math.min(9, Math.floor((h - 6) / 9)));
    for (const side of [-1, 1] as const) {
      faceWindows(
        ctx.day, ctx.night, ctx.lights, cx, baseY, hw, hh, h, side,
        Math.max(1, Math.min(cols, Math.floor(hw / 9))), rows, ctx.rng, litRatio,
        side < 0 ? pal.left : pal.right,
        side < 0 ? palN.left : palN.right
      );
    }
  }
}

/** Roof edge + clutter for hero boxes (same read as the family tier ladder). */
function heroRoof(ctx: FrameCtx, cx: number, topY: number, hw: number, pal: FamilyPalette): void {
  const palN = nightPalette(pal);
  const hh = Math.round(hw / 2);
  const inset = 4;
  ctx.day.strokePoly(
    [
      [cx, topY - hh + inset * 0.5],
      [cx + hw - inset, topY],
      [cx, topY + hh - inset * 0.5],
      [cx - hw + inset, topY],
    ],
    pal.trim,
    170
  );
  ctx.night.strokePoly(
    [
      [cx, topY - hh + inset * 0.5],
      [cx + hw - inset, topY],
      [cx, topY + hh - inset * 0.5],
      [cx - hw + inset, topY],
    ],
    shade(palN.trim, 1.05),
    170
  );
}

/** Thin antenna with a beacon dot in the lights frame. */
function heroMast(ctx: FrameCtx, x: number, topY: number, len: number, beacon: RGB): void {
  ctx.day.line(x, topY, x, topY - len, OUTLINE_DAY);
  ctx.night.line(x, topY, x, topY - len, OUTLINE_NIGHT);
  ctx.lights.fillEllipse(x, topY - len - 1, 1, 1, beacon);
}

/** HQ accent: soft selection-blue (matches the scene's HQ identity marks). */
const HQ_BEACON: RGB = hex("#9be8ff");

const HQ_PAL: FamilyPalette = {
  left: shade(hex("#cfb98e"), 0.74),
  right: hex("#cfb98e"),
  roof: hex("#9aa1aa"),
  trim: hex("#7a5c40"),
};

/**
 * The player's OWN card as the city centerpiece — a limestone civic tower
 * (profession-neutral; identity stays in the CORE tag + owner plate).
 * s1 compact hall → s2 stepped skyscraper → s3 grand spire with wings.
 */
function drawHq(ctx: FrameCtx, stage: 1 | 2 | 3): void {
  const pal = HQ_PAL;
  const cx = ctx.cx;
  const baseY = ctx.baseY;
  if (stage === 1) {
    heroBox(ctx, cx, baseY, 46, 22, pal, 5, 0.45);
    heroRoof(ctx, cx, baseY - 22, 46, pal);
    heroBox(ctx, cx, baseY - 22, 30, 46, pal, 3);
    heroRoof(ctx, cx, baseY - 68, 30, pal);
    heroBox(ctx, cx, baseY - 68, 18, 14, pal, 2, 0.55);
    heroMast(ctx, cx, baseY - 82, 10, HQ_BEACON);
  } else if (stage === 2) {
    heroBox(ctx, cx, baseY, 42, 20, pal, 5, 0.45);
    heroBox(ctx, cx, baseY - 20, 27, 76, pal, 3);
    // Sky-lobby band (glass ring read: thin trim-colored box).
    heroBox(ctx, cx, baseY - 96, 29, 9, pal, 0, 0.5);
    heroBox(ctx, cx, baseY - 105, 17, 18, pal, 2, 0.55);
    heroMast(ctx, cx, baseY - 123, 14, HQ_BEACON);
    ctx.lights.fillEllipse(cx, baseY - 100, 16, 3, HQ_BEACON);
  } else {
    // Grand spire: podium + wings + shaft + sky lobby + crown + mast.
    heroBox(ctx, cx, baseY, 44, 22, pal, 5, 0.45);
    heroBox(ctx, cx - 52, baseY + 2, 12, 16, pal, 1, 0.4);
    heroBox(ctx, cx + 52, baseY + 2, 12, 16, pal, 1, 0.4);
    heroBox(ctx, cx, baseY - 22, 28, 94, pal, 3);
    heroBox(ctx, cx, baseY - 116, 30, 10, pal, 0, 0.5);
    heroBox(ctx, cx, baseY - 126, 19, 32, pal, 2, 0.55);
    heroBox(ctx, cx, baseY - 158, 11, 16, pal, 1, 0.6);
    heroMast(ctx, cx, baseY - 174, 18, HQ_BEACON);
    // Sky-lobby glow ring + wing door lamps (night identity).
    ctx.lights.fillEllipse(cx, baseY - 121, 17, 3, HQ_BEACON);
    ctx.lights.fillEllipse(cx - 52, baseY - 2, 1, 1, DOOR_LAMP);
    ctx.lights.fillEllipse(cx + 52, baseY - 2, 1, 1, DOOR_LAMP);
  }
  contactDiamond(ctx, cx, baseY, Math.round(46 + (stage - 1) * 2));
}

/** Faint ground-contact outline shared by all heroes. */
function contactDiamond(ctx: FrameCtx, cx: number, baseY: number, hw: number): void {
  const hh = Math.round(hw / 2);
  const diamond: Array<[number, number]> = [
    [cx, baseY - hh],
    [cx + hw, baseY],
    [cx, baseY + hh],
    [cx - hw, baseY],
  ];
  ctx.day.strokePoly(diamond, OUTLINE_DAY, 110);
  ctx.night.strokePoly(diamond, OUTLINE_NIGHT, 110);
}

// Landmark palettes (accent = LANDMARK_COLORS roster order).
const LM_PAL: ReadonlyArray<{ pal: FamilyPalette; accent: RGB; accentNight: RGB }> = [
  // 0 Architect — sky-blue glass spire.
  {
    pal: {
      left: shade(hex("#b6c6d8"), 0.78),
      right: hex("#b6c6d8"),
      roof: hex("#ccd1d7"),
      trim: hex("#7dd3fc"),
    },
    accent: hex("#7dd3fc"),
    accentNight: hex("#5cb8e8"),
  },
  // 1 Locksmith — amber limestone citadel.
  {
    pal: {
      left: shade(hex("#cfb98e"), 0.72),
      right: hex("#cfb98e"),
      roof: hex("#8b95a5"),
      trim: hex("#f59e0b"),
    },
    accent: hex("#f59e0b"),
    accentNight: hex("#d98a0b"),
  },
  // 2 Oracle — violet observatory.
  {
    pal: {
      left: shade(hex("#c9ced6"), 0.76),
      right: hex("#c9ced6"),
      roof: hex("#6d5fae"),
      trim: hex("#a78bfa"),
    },
    accent: hex("#a78bfa"),
    accentNight: hex("#8b6fe0"),
  },
  // 3 Clockkeeper — teal sandstone clock tower.
  {
    pal: {
      left: shade(hex("#d8c8a0"), 0.74),
      right: hex("#d8c8a0"),
      roof: hex("#8b95a5"),
      trim: hex("#5eead4"),
    },
    accent: hex("#5eead4"),
    accentNight: hex("#3fc4ae"),
  },
  // 4 NullPointer — crimson obsidian obelisk.
  {
    pal: {
      left: shade(hex("#4a4f63"), 0.8),
      right: hex("#4a4f63"),
      roof: hex("#3a3f52"),
      trim: hex("#ef4444"),
    },
    accent: hex("#ef4444"),
    accentNight: hex("#c93a3a"),
  },
  // 5 Banker — gold marble treasury.
  {
    pal: {
      left: shade(hex("#dcd6c4"), 0.76),
      right: hex("#dcd6c4"),
      roof: hex("#c9a24a"),
      trim: hex("#a8842f"),
    },
    accent: hex("#fbbf24"),
    accentNight: hex("#d99e14"),
  },
];

/**
 * The Six monuments (roster order). Each grows with its goddess card's
 * value: taller massing, more ornament, an extra identity tell per stage.
 */
function drawLandmark(ctx: FrameCtx, index: number, stage: 1 | 2 | 3): void {
  const { pal, accent } = LM_PAL[index];
  const palN = nightPalette(pal);
  const cx = ctx.cx;
  const baseY = ctx.baseY;

  /** Accent seam/ring visible day + night (thin identity line). */
  const accentLine = (x0: number, y0: number, x1: number, y1: number, alpha = 200) => {
    ctx.day.line(x0, y0, x1, y1, accent, alpha);
    ctx.night.line(x0, y0, x1, y1, shade(accent, 0.75), alpha);
  };

  switch (index) {
    case 0: {
      // The Architect — tapering glass spire + observation ring.
      const tiers: ReadonlyArray<[number, number]> =
        stage === 1
          ? [[15, 40], [10, 30], [6, 22]]
          : stage === 2
            ? [[17, 48], [12, 38], [8, 30], [5, 20]]
            : [[18, 54], [13, 44], [9, 34], [6, 26], [4, 18]];
      let y = baseY;
      let total = 0;
      tiers.forEach(([hw, h], i) => {
        heroBox(ctx, cx, y, hw, h, pal, i === 0 ? 3 : 2, 0.55);
        y -= h;
        total += h;
      });
      // Crystal tip (white core, accent base).
      const tipY = baseY - total;
      for (const [cv, core, outline] of [
        [ctx.day, hex("#e8f4ff"), OUTLINE_DAY],
        [ctx.night, hex("#3d4a66"), OUTLINE_NIGHT],
      ] as const) {
        cv.fillPoly(
          [
            [cx, tipY - 16],
            [cx + 6, tipY - 6],
            [cx, tipY],
            [cx - 6, tipY - 6],
          ],
          core
        );
        cv.strokePoly(
          [
            [cx, tipY - 16],
            [cx + 6, tipY - 6],
            [cx, tipY],
            [cx - 6, tipY - 6],
          ],
          outline
        );
      }
      // Observation ring(s) — more with stage.
      const rings = stage;
      for (let r = 0; r < rings; r++) {
        const ry = baseY - total * (0.45 + r * 0.22);
        for (const cv of [ctx.day, ctx.night]) {
          cv.strokeEllipse(cx, ry, 30 - r * 4, 8, accent, 190);
        }
        ctx.lights.fillEllipse(cx - (30 - r * 4), ry, 1.5, 1.5, WINDOW_PALE);
        ctx.lights.fillEllipse(cx + (30 - r * 4), ry, 1.5, 1.5, WINDOW_PALE);
      }
      ctx.lights.fillEllipse(cx, tipY - 14, 1.5, 1.5, WINDOW_PALE);
      contactDiamond(ctx, cx, baseY, 22 + stage * 2);
      break;
    }
    case 1: {
      // The Locksmith — twin keeps, gate, keyhole glow.
      const keepH = 56 + stage * 18;
      const gap = stage === 1 ? 0 : stage === 2 ? 15 : 18;
      if (stage === 1) {
        heroBox(ctx, cx, baseY, 24, keepH, pal, 2, 0.45);
        heroRoof(ctx, cx, baseY - keepH, 24, pal);
      } else {
        heroBox(ctx, cx - gap, baseY, 20, keepH, pal, 2, 0.45);
        heroRoof(ctx, cx - gap, baseY - keepH, 20, pal);
        heroBox(ctx, cx + gap, baseY, 20, keepH, pal, 2, 0.45);
        heroRoof(ctx, cx + gap, baseY - keepH, 20, pal);
        // Connecting gatehouse wall.
        heroBox(ctx, cx, baseY, 30 + stage * 2, 22, pal, 1, 0.35);
        heroRoof(ctx, cx, baseY - 22, 30 + stage * 2, pal);
      }
      // Crenellations on the near keep.
      const kx = stage === 1 ? cx : cx - gap;
      for (let i = -1; i <= 1; i++) {
        heroBox(ctx, kx + i * 9, baseY - keepH, 3, 6, pal, 0, 0.3);
      }
      // The gate: dark arch + accent keystone + keyhole glow (lights).
      const gateH = 18;
      const gateW = 10;
      const gy = baseY + Math.round(10 / 2) - 2;
      for (const [cv, dark] of [
        [ctx.day, hex("#3a3324")],
        [ctx.night, hex("#141821")],
      ] as const) {
        cv.fillPoly(
          [
            [cx - gateW, gy],
            [cx + gateW, gy],
            [cx + gateW, gy - gateH * 0.6],
            [cx, gy - gateH],
            [cx - gateW, gy - gateH * 0.6],
          ],
          dark
        );
      }
      accentLine(cx, gy - gateH - 2, cx, gy - gateH + 3);
      ctx.lights.fillEllipse(cx, gy - 10, 2, 3, accent);
      ctx.lights.fillRect(cx - 1, gy - 10, 2, 4, accent);
      // Stage 3: twin flags.
      if (stage === 3) {
        for (const fx of [cx - gap, cx + gap]) {
          ctx.day.line(fx, baseY - keepH - 6, fx, baseY - keepH - 16, OUTLINE_DAY);
          ctx.night.line(fx, baseY - keepH - 6, fx, baseY - keepH - 16, OUTLINE_NIGHT);
          ctx.lights.fillEllipse(fx + 3, baseY - keepH - 14, 2, 2, accent);
        }
      }
      contactDiamond(ctx, cx, baseY, stage === 1 ? 26 : 40);
      break;
    }
    case 2: {
      // The Oracle — rotunda + dome + telescope slit.
      const r = 22 + stage * 3;
      const cylH = 26 + stage * 6;
      const domeR = r + 2;
      const domeLift = Math.round(domeR * 0.9);
      for (const [cv, left, right, top] of [
        [ctx.day, pal.left, pal.right, pal.roof],
        [ctx.night, palN.left, palN.right, palN.roof],
      ] as const) {
        cv.fillRect(cx - r, baseY - cylH, 2 * r, cylH, right);
        cv.fillRect(cx - r, baseY - cylH, r, cylH, left);
        cv.line(cx - r, baseY - cylH, cx - r, baseY, OUTLINE_DAY);
        cv.line(cx + r, baseY - cylH, cx + r, baseY, OUTLINE_DAY);
        // Dome (double shell on stage 3).
        cv.fillEllipse(cx, baseY - cylH, domeR, domeLift, top);
        cv.fillEllipse(cx, baseY - cylH - domeLift * 0.3, domeR * 0.72, domeLift * 0.62, shade(top, 1.15));
        cv.strokeEllipse(cx, baseY - cylH, domeR, domeLift, OUTLINE_DAY);
      }
      // Telescope slit (dark band across the dome) + aperture.
      for (const cv of [ctx.day, ctx.night]) {
        cv.fillEllipse(cx + 2, baseY - cylH - domeLift * 0.35, domeR * 0.55, 2.5, hex("#1a1f2e"));
      }
      ctx.lights.fillEllipse(cx + 2, baseY - cylH - domeLift * 0.35, 2, 2, WINDOW_PALE);
      // Colonnade windows around the drum.
      const cols = 5 + stage;
      for (let i = 0; i < cols; i++) {
        const wx = cx - r + 3 + Math.round((i * (2 * r - 6)) / Math.max(1, cols - 1));
        ctx.day.fillRect(wx, baseY - cylH + 6, 3, 5, GLASS_DAY);
        ctx.night.fillRect(wx, baseY - cylH + 6, 3, 5, GLASS_NIGHT);
        if (ctx.rng() < 0.5) ctx.lights.fillRect(wx, baseY - cylH + 6, 3, 5, WINDOW_WARM);
      }
      // Side wings from stage 2; second dome on stage 3.
      if (stage >= 2) {
        heroBox(ctx, cx - r - 12, baseY, 10, 16, pal, 1, 0.4);
        heroBox(ctx, cx + r + 12, baseY, 10, 16, pal, 1, 0.4);
      }
      if (stage === 3) {
        for (const cv of [ctx.day, ctx.night]) {
          cv.fillEllipse(cx - r - 12, baseY - 20, 8, 6, shade(pal.roof, cv === ctx.day ? 1 : 0.9));
        }
        ctx.lights.fillEllipse(cx - r - 12, baseY - 22, 1, 1, accent);
      }
      contactDiamond(ctx, cx, baseY, r + 10);
      break;
    }
    case 3: {
      // The Clockkeeper — clock tower, face set to 11:57.
      const shaftH = 56 + stage * 24;
      heroBox(ctx, cx, baseY, 17, shaftH, pal, 2, 0.45);
      // Clock head (wider box) + pitched slate roof.
      const headH = 18;
      heroBox(ctx, cx, baseY - shaftH, 22, headH, pal, 0, 0.3);
      const rTop = baseY - shaftH - headH;
      const ridge = 12;
      for (const [cv, roofC, outline] of [
        [ctx.day, pal.roof, OUTLINE_DAY],
        [ctx.night, palN.roof, OUTLINE_NIGHT],
      ] as const) {
        cv.fillPoly(
          [
            [cx - 22, rTop],
            [cx, rTop + 11],
            [cx, rTop + 11 - ridge],
            [cx - 22, rTop - ridge * 0.4],
          ],
          shade(roofC, 0.85)
        );
        cv.fillPoly(
          [
            [cx + 22, rTop],
            [cx, rTop + 11],
            [cx, rTop + 11 - ridge],
            [cx + 22, rTop - ridge * 0.4],
          ],
          shade(roofC, 1.05)
        );
        cv.line(cx - 22, rTop - ridge * 0.4, cx + 22, rTop - ridge * 0.4, outline);
      }
      // Clock faces (SE + SW) — white with dark rim + hands at 11:57.
      const faceY = baseY - shaftH - headH * 0.4;
      for (const fx of [cx + 13, cx - 13]) {
        for (const cv of [ctx.day, ctx.night]) {
          cv.fillEllipse(fx, faceY, 7, 7, hex("#f4efe0"));
          cv.strokeEllipse(fx, faceY, 7, 7, hex("#2a2620"));
        }
        // Hands: hour ≈ 12, minute just left of 12.
        for (const cv of [ctx.day, ctx.night]) {
          cv.line(fx, faceY, fx, faceY - 4, hex("#2a2620"));
          cv.line(fx, faceY, fx - 3, faceY - 3.5, hex("#2a2620"));
        }
        ctx.lights.fillEllipse(fx, faceY, 6, 6, WINDOW_PALE);
      }
      // Teal finial + chrono ring (stage 3).
      heroMast(ctx, cx, rTop - Math.round(ridge * 0.4), 12, accent);
      if (stage === 3) {
        accentLine(cx - 26, rTop + 4, cx + 26, rTop + 4, 150);
        ctx.lights.fillEllipse(cx - 26, rTop + 4, 1, 1, accent);
        ctx.lights.fillEllipse(cx + 26, rTop + 4, 1, 1, accent);
      }
      contactDiamond(ctx, cx, baseY, 24);
      break;
    }
    case 4: {
      // NullPointer — fractured obsidian obelisk, crimson seams.
      const totalH = 80 + stage * 30;
      const halfBase = 13 + stage;
      // Main shaft (tapered quad, hand-shaded faces).
      const shaftTop = baseY - totalH * 0.62;
      for (const [cv, l, r] of [
        [ctx.day, pal.left, pal.right],
        [ctx.night, palN.left, palN.right],
      ] as const) {
        cv.fillPoly(
          [
            [cx - halfBase, baseY],
            [cx, baseY + halfBase / 2],
            [cx, shaftTop],
            [cx - halfBase * 0.55, shaftTop],
          ],
          l
        );
        cv.fillPoly(
          [
            [cx + halfBase, baseY],
            [cx, baseY + halfBase / 2],
            [cx, shaftTop],
            [cx + halfBase * 0.55, shaftTop],
          ],
          r
        );
        // Chisel banding.
        for (let i = 1; i <= 4; i++) {
          const by = baseY - Math.round((totalH * 0.62 * i) / 5);
          cv.line(cx - halfBase * (1 - 0.45 * (i / 5)) - 1, by, cx - 2, by - 2, shade(l, 0.85), 120);
        }
      }
      // Fracture: displaced upper fragment (+ a second one at stage 3).
      const frag = (top: number, h: number, dx: number) => {
        for (const [cv, l] of [
          [ctx.day, pal.left],
          [ctx.night, palN.left],
        ] as const) {
          cv.fillPoly(
            [
              [cx - halfBase * 0.55 + dx, top],
              [cx + halfBase * 0.55 + dx, top],
              [cx + halfBase * 0.3 + dx * 1.6, top - h],
              [cx - halfBase * 0.35 + dx * 1.6, top - h + 3],
            ],
            shade(l, 1.08)
          );
        }
      };
      frag(shaftTop, Math.round(totalH * 0.3), stage >= 2 ? 5 : 0);
      const tipH = Math.round(totalH * 0.3);
      if (stage === 3) frag(shaftTop - tipH + 3, Math.round(totalH * 0.16), 8);
      // Crimson seams (day: dark red lines; lights: glowing).
      const seamY0 = baseY - Math.round(totalH * 0.25);
      accentLine(cx - 2, seamY0, cx + 4, shaftTop + 6, 170);
      ctx.lights.line(cx - 2, seamY0, cx + 4, shaftTop + 6, accent);
      ctx.lights.line(cx + 5, shaftTop - 2, cx + 9, shaftTop - tipH + 4, accent);
      // Containment ring at the base.
      for (const cv of [ctx.day, ctx.night]) {
        cv.strokeEllipse(cx, baseY, halfBase + 10, (halfBase + 10) / 2, accent, 160);
      }
      ctx.lights.strokeEllipse(cx, baseY, halfBase + 10, (halfBase + 10) / 2, accent, 140);
      contactDiamond(ctx, cx, baseY, halfBase + 6);
      break;
    }
    case 5: {
      // The Banker — stepped treasury: podium, colonnade, dome, capstone.
      const steps = 2 + stage;
      let y = baseY;
      for (let i = 0; i < steps; i++) {
        heroBox(ctx, cx, y, 40 - i * 4, 7, pal, 0, 0.3);
        y -= 7;
      }
      const colH = 22 + stage * 5;
      heroBox(ctx, cx, y, 26 + stage * 2, colH, pal, 4 + stage, 0.5);
      // Column strips (vertical light lines over the colonnade faces).
      const cols = 4 + stage;
      for (let i = 0; i < cols; i++) {
        const u = 0.15 + (i * 0.7) / Math.max(1, cols - 1);
        for (const side of [-1, 1] as const) {
          const x0 = cx + side * (26 + stage * 2);
          const px = Math.round(x0 - side * u * (26 + stage * 2));
          ctx.day.line(px, y, px, y - colH + 3, shade(pal.right, 1.08), 140);
        }
      }
      const domeY = y - colH;
      const dR = 16 + stage * 3;
      for (const [cv, roofC] of [
        [ctx.day, pal.roof],
        [ctx.night, palN.roof],
      ] as const) {
        cv.fillEllipse(cx, domeY, dR, Math.round(dR * 0.85), roofC);
        cv.fillEllipse(cx, domeY - dR * 0.25, dR * 0.7, dR * 0.5, shade(roofC, 1.15));
        cv.strokeEllipse(cx, domeY, dR, Math.round(dR * 0.85), OUTLINE_DAY);
      }
      // Gold capstone lantern.
      ctx.day.fillRect(cx - 2, domeY - dR * 0.85 - 8, 4, 6, shade(pal.roof, 1.2));
      ctx.night.fillRect(cx - 2, domeY - dR * 0.85 - 8, 4, 6, shade(palN.roof, 1.2));
      ctx.lights.fillEllipse(cx, domeY - dR * 0.85 - 6, 2, 2, accent);
      // Coin ring on stage 3 + minor domes.
      if (stage >= 2) {
        heroBox(ctx, cx - 30 - stage * 2, baseY, 9, 14, pal, 1, 0.4);
        heroBox(ctx, cx + 30 + stage * 2, baseY, 9, 14, pal, 1, 0.4);
      }
      if (stage === 3) {
        for (const cv of [ctx.day, ctx.night]) {
          cv.strokeEllipse(cx, domeY - 6, dR + 6, 4, accent, 170);
        }
        ctx.lights.fillEllipse(cx - dR - 6, domeY - 6, 1, 1, accent);
        ctx.lights.fillEllipse(cx + dR + 6, domeY - 6, 1, 1, accent);
      }
      contactDiamond(ctx, cx, baseY, 42);
      break;
    }
  }
}

/** Hero art heights (structure above ground contact) per stage. */
const HQ_ART_HEIGHTS: ReadonlyArray<number> = [92, 140, 182];
const LANDMARK_ART_HEIGHTS: ReadonlyArray<readonly number[]> = [
  [112, 150, 186], // Architect spire (incl. crystal tip)
  [80, 96, 116], // Locksmith keeps
  [76, 94, 116], // Oracle rotunda + dome
  [94, 118, 142], // Clockkeeper tower
  [84, 114, 146], // NullPointer obelisk
  [72, 92, 114], // Banker treasury
];

// ── sheet assembly ────────────────────────────────────────────────────────

const FRAME_W = 128;
const FRAME_PAD_BOTTOM = 26;
const FRAME_PAD_TOP = 40;
const SHEET_PAD = 2;

interface SheetMeta {
  /** Unique manifest key (family|tier, HQ|sN, LM|i|sN). */
  key: string;
  url: string;
  frameW: number;
  frameH: number;
  anchorX: number;
  anchorY: number;
  artHeight: number;
  /** Variant rows in the sheet (families: 3; heroes: 1 — stages ARE the variants). */
  variants: number;
  family?: Family;
  tier?: Tier;
  hero?: "hq" | number;
  stage?: 1 | 2 | 3;
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

function renderHeroFrames(
  hero: "hq" | number,
  stage: 1 | 2 | 3,
  frameH: number
): FrameCtx {
  const name = hero === "hq" ? "HQ" : `LM${hero}`;
  let a = 0x9e3779b9;
  for (const ch of `${name}:s${stage}`) a = (a * 33 + ch.charCodeAt(0)) | 0;
  const ctx: FrameCtx = {
    day: new PixCanvas(HERO_FRAME_W, frameH),
    night: new PixCanvas(HERO_FRAME_W, frameH),
    lights: new PixCanvas(HERO_FRAME_W, frameH),
    cx: Math.round(HERO_FRAME_W / 2),
    baseY: frameH - FRAME_PAD_BOTTOM,
    rng: mulberry32(a),
    variant: 0,
    tier: stage,
    family: "Unassigned",
  };
  if (hero === "hq") drawHq(ctx, stage);
  else drawLandmark(ctx, hero, stage);
  return ctx;
}

/** Lay out a (variants × 3 frames) sheet PNG. */
async function writeSheetPng(
  stem: string,
  frameW: number,
  frameH: number,
  variants: number,
  renderVariant: (variant: number) => FrameCtx
): Promise<void> {
  const cols = 3;
  const sheetW = cols * frameW + (cols + 1) * SHEET_PAD;
  const sheetH = variants * frameH + (variants + 1) * SHEET_PAD;
  const sheet = new PixCanvas(sheetW, sheetH);
  for (let variant = 0; variant < variants; variant++) {
    const ctx = renderVariant(variant);
    const frameY = SHEET_PAD + variant * (frameH + SHEET_PAD);
    const frames = [ctx.day, ctx.night, ctx.lights];
    for (let col = 0; col < cols; col++) {
      blit(sheet, frames[col], SHEET_PAD + col * (frameW + SHEET_PAD), frameY);
    }
  }
  await writePng(path.join(OUT_DIR, `${stem}.png`), sheet);
}

async function generateSheet(family: Family, tier: Tier): Promise<SheetMeta> {
  const artHeight = artHeightOf(family, tier);
  const frameH = artHeight + FRAME_PAD_TOP + FRAME_PAD_BOTTOM;
  const stem = fileStem(family, tier);
  await writeSheetPng(stem, FRAME_W, frameH, VARIANTS, (variant) =>
    renderFrames(family, tier, variant, frameH)
  );
  return {
    key: `${family}|${tier}`,
    family,
    tier,
    url: `/city/pixel/${stem}.png`,
    frameW: FRAME_W,
    frameH,
    anchorX: Math.round(FRAME_W / 2),
    anchorY: frameH - FRAME_PAD_BOTTOM,
    artHeight,
    variants: VARIANTS,
  };
}

async function generateHeroSheet(
  hero: "hq" | number,
  stage: 1 | 2 | 3
): Promise<SheetMeta> {
  const artHeight = hero === "hq" ? HQ_ART_HEIGHTS[stage - 1] : LANDMARK_ART_HEIGHTS[hero][stage - 1];
  const frameH = artHeight + FRAME_PAD_TOP + FRAME_PAD_BOTTOM;
  const stem = hero === "hq" ? `HQ-s${stage}` : `Landmark-${hero}-s${stage}`;
  await writeSheetPng(stem, HERO_FRAME_W, frameH, 1, () =>
    renderHeroFrames(hero, stage, frameH)
  );
  return {
    key: hero === "hq" ? `HQ|s${stage}` : `LM|${hero}|s${stage}`,
    hero,
    stage,
    url: `/city/pixel/${stem}.png`,
    frameW: HERO_FRAME_W,
    frameH,
    anchorX: Math.round(HERO_FRAME_W / 2),
    anchorY: frameH - FRAME_PAD_BOTTOM,
    artHeight,
    variants: 1,
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
    if (!m.family) continue;
    const list = byFamily.get(m.family) ?? [];
    list.push(m);
    byFamily.set(m.family, list);
  }
  const entry = (m: SheetMeta): string =>
    `{ url: "${m.url}", frameW: ${m.frameW}, frameH: ${m.frameH}, anchorX: ${m.anchorX}, anchorY: ${m.anchorY}, artHeight: ${m.artHeight}, variants: ${m.variants} }`;
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
    " *",
    " * HERO sheets (2026-09-28): the HQ core and the Six goddess monuments",
    " * in 3 VALUE STAGES each (server-derived heroStageOf) — one stage per",
    " * sheet, ONE variant row (variants: 1), 192px frames.",
    " */",
    "",
    "export interface CityPixelSheet {",
    "  url: string;",
    "  frameW: number;",
    "  frameH: number;",
    "  anchorX: number;",
    "  anchorY: number;",
    "  artHeight: number;",
    "  /** Variant rows in the sheet (families: 3; heroes: 1). */",
    "  variants: number;",
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
      return m ? entry(m) : "null";
    });
    lines.push(`  ${JSON.stringify(family)}: [${entries.join(", ")}],`);
  }
  lines.push("};");

  // Hero exports: HQ stages 1..3 + the Six monuments × stages (roster order).
  const hq = [1, 2, 3].map((s) =>
    metas.find((m) => m.hero === "hq" && m.stage === s)
  );
  lines.push("");
  lines.push(
    "/** HQ core stages (value vs the current game max player value). */"
  );
  lines.push(
    `export const CITY_HQ_SHEETS: ReadonlyArray<CityPixelSheet | null> = [${hq
      .map((m) => (m ? entry(m) : "null"))
      .join(", ")}];`
  );
  lines.push("");
  lines.push(
    "/** The Six monuments × stages, GODDESS_USERNAMES roster order (value vs the priciest goddess). */"
  );
  lines.push(
    "export const CITY_LANDMARK_SHEETS: Readonly<Record<string, ReadonlyArray<CityPixelSheet | null>>> = {"
  );
  for (let i = 0; i < 6; i++) {
    const lm = [1, 2, 3].map((s) =>
      metas.find((m) => m.hero === i && m.stage === s)
    );
    lines.push(`  ${JSON.stringify(String(i))}: [${lm.map((m) => (m ? entry(m) : "null")).join(", ")}],`);
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

  // HERO contact sheet (separate artifact — stages ARE the columns).
  const heroW = Math.round(HERO_FRAME_W / SCALE);
  const heroCellW = heroW * 3 + 8;
  const heroCellH = Math.round(210 / SCALE) + 8;
  const heroSheet = new PixCanvas(
    heroCellW * 3,
    heroCellH * 7 // 1 HQ row + 6 landmark rows
  );
  for (let y = 0; y < heroSheet.H; y++) {
    for (let x = 0; x < heroSheet.W; x++) heroSheet.px(x, y, [58, 62, 58]);
  }
  const heroSample = (src: PixCanvas, x: number, y: number): RGB => {
    const i = (Math.round(y) * src.W + Math.round(x)) * 4;
    if (src.data[i + 3] === 0) return [58, 62, 58];
    return [src.data[i], src.data[i + 1], src.data[i + 2]];
  };
  for (let row = 0; row < 7; row++) {
    const hero: "hq" | number = row === 0 ? "hq" : row - 1;
    for (let stage = 1; stage <= 3; stage++) {
      const artH = hero === "hq" ? HQ_ART_HEIGHTS[stage - 1] : LANDMARK_ART_HEIGHTS[hero][stage - 1];
      const frameH = artH + FRAME_PAD_TOP + FRAME_PAD_BOTTOM;
      const ctx = renderHeroFrames(hero, stage as 1 | 2 | 3, frameH);
      const frames = [ctx.day, ctx.night, ctx.lights];
      const cellX = (stage - 1) * heroCellW;
      const cellY = row * heroCellH;
      for (let col = 0; col < 3; col++) {
        const src = frames[col];
        const anchor = (frameH - FRAME_PAD_BOTTOM) / SCALE;
        for (let y = 0; y < Math.round(frameH / SCALE); y++) {
          for (let x = 0; x < heroW; x++) {
            heroSheet.px(
              cellX + 3 + col * (heroW + 2) + x,
              cellY + heroCellH - 4 - anchor + y,
              heroSample(src, x * SCALE, y * SCALE)
            );
          }
        }
      }
    }
  }
  await writePng(path.join(ROOT, "scripts", "city-pixel-preview-heroes.png"), heroSheet);
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
  // Hero sheets: HQ (3 stages) + the Six monuments (3 stages each).
  const heroMetas: SheetMeta[] = [];
  for (let stage = 1; stage <= 3; stage++) {
    heroMetas.push(await generateHeroSheet("hq", stage as 1 | 2 | 3));
  }
  for (let i = 0; i < 6; i++) {
    for (let stage = 1; stage <= 3; stage++) {
      heroMetas.push(await generateHeroSheet(i, stage as 1 | 2 | 3));
    }
  }
  emitManifest([...metas, ...heroMetas]);
  await writeContactSheet(metas);
  console.log(
    `[gen-city-pixel-art] ${metas.length} family + ${heroMetas.length} hero sheets (SC4 v3 + hero stages) → public/city/pixel/ · manifest → ${path.relative(ROOT, MANIFEST_TS)}`
  );
  console.log(`[gen-city-pixel-art] QA contact sheet → ${path.relative(ROOT, PREVIEW_PNG)} (+ city-pixel-preview-heroes.png)`);
}

void main();
