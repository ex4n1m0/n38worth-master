/**
 * Mainframe City — procedural building art as PURE DATA (2026-10-02).
 *
 * 1:1 extraction of the art that used to live inside the BuildingSprite SVG
 * component: every SVG element became exactly one ArtShape with the SAME
 * numbers in the SAME document (= paint) order. Both the card renderer
 * (components/city/BuildingSprite.tsx — thin SVG echo) and the canvas world
 * map (map3d/art-geometry.ts compiler) consume this ONE spec.
 *
 *   tiers 1–7  → CIVIC art (family stack + shared tier features)
 *   tiers 8–14 → GRAND art (the family megaform, step = tier − 8)
 *   goddesses  → their LANDMARK monument echo (stage-2 elaborated form)
 *
 * Pure and node-safe: no React, no DOM, no canvas — only the hex palette
 * constants from the pure district/landmark-colors modules. The `pulse`
 * flag marks the animate-pulse beacon shapes; ONLY the SVG renderer
 * consumes it (the canvas map is static by ruling).
 */

import { LANDMARK_HEX_COLORS } from "@/lib/city/landmark-colors";
import {
  FAMILY_MASS_HEX,
  FAMILY_NEON_HEX,
  UNASSIGNED_MASS_HEX,
  UNASSIGNED_NEON_HEX,
} from "@/lib/city/district";

export type ArtShape =
  | {
      kind: "poly";
      pts: Array<[number, number]>;
      fill?: string;
      opacity?: number;
      stroke?: string;
      strokeW?: number;
    }
  | {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      rx?: number;
      fill?: string;
      opacity?: number;
      stroke?: string;
      strokeW?: number;
    }
  | {
      kind: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      fill?: string;
      stroke?: string;
      strokeW?: number;
      opacity?: number;
      pulse?: boolean;
    }
  | {
      kind: "circle";
      cx: number;
      cy: number;
      r: number;
      fill?: string;
      stroke?: string;
      strokeW?: number;
      opacity?: number;
      pulse?: boolean;
    }
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      strokeW: number;
      opacity?: number;
    }
  | {
      kind: "path";
      d: string;
      fill?: string;
      stroke?: string;
      strokeW?: number;
      opacity?: number;
    };

export interface ArtSpec {
  w: number;
  h: number;
  shapes: ArtShape[];
}

const UNASSIGNED = "Unassigned";
/** First tier of the grand league (mirrors art.ts GRAND_MIN_TIER). */
const GRAND_MIN_TIER = 8;

const PV_W = 128;
const PV_PAD_TOP = 34;
const PV_PAD_BOTTOM = 20;

/** Family geometry (mirrors art.ts FamilyArtSpec height ratios). */
const PV_SPEC: Record<
  string,
  { baseH: number; floorH: number; hw: number; grandBaseH: number; grandFloorH: number }
> = {
  Cryptographer: { baseH: 26, floorH: 9, hw: 46, grandBaseH: 96, grandFloorH: 12 },
  "Zero-Day": { baseH: 30, floorH: 12, hw: 44, grandBaseH: 116, grandFloorH: 14 },
  Overclocker: { baseH: 34, floorH: 11, hw: 36, grandBaseH: 118, grandFloorH: 12 },
  "Cache Keeper": { baseH: 26, floorH: 10, hw: 40, grandBaseH: 106, grandFloorH: 12 },
  "Server Marshal": { baseH: 36, floorH: 13, hw: 32, grandBaseH: 130, grandFloorH: 12 },
  "Bot Herder": { baseH: 22, floorH: 10, hw: 46, grandBaseH: 100, grandFloorH: 11 },
  Unassigned: { baseH: 28, floorH: 12, hw: 34, grandBaseH: 112, grandFloorH: 10 },
};

/** Every family key in the geometry table (test coverage / catalog use). */
export const ART_FAMILIES: readonly string[] = Object.keys(PV_SPEC);

function shadeHex(hexColor: string, k: number): string {
  const n = parseInt(hexColor.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((n & 0xff) * k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function mixHex(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(
      ((na >> shift) & 0xff) * (1 - t) + ((nb >> shift) & 0xff) * t
    );
  const r = ch(16);
  const g = ch(8);
  const bl = ch(0);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

/** Seeded RNG (art.ts mulberry32): stable lit-window dots per card. */
function pvRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One iso box: three shaded polygons (left/right faces + top diamond),
 *  pushed in the same order the old JSX rendered them. */
function pvBox(
  shapes: ArtShape[],
  cx: number,
  baseY: number,
  hw: number,
  h: number,
  mass: string
): void {
  const hh = hw / 2;
  const top = baseY - h;
  shapes.push({
    kind: "poly",
    pts: [
      [cx - hw, top],
      [cx, top + hh],
      [cx, baseY + hh],
      [cx - hw, baseY],
    ],
    fill: shadeHex(mass, 0.62),
  });
  shapes.push({
    kind: "poly",
    pts: [
      [cx + hw, top],
      [cx, top + hh],
      [cx, baseY + hh],
      [cx + hw, baseY],
    ],
    fill: shadeHex(mass, 0.95),
  });
  shapes.push({
    kind: "poly",
    pts: [
      [cx, top - hh],
      [cx + hw, top],
      [cx, top + hh],
      [cx - hw, top],
    ],
    fill: shadeHex(mass, 1.2),
  });
}

/** Seeded lit-window dots across a body (both faces, warm/cool mix). The
 *  gate rand() and the color rand() calls stay in the original order. */
function pvWindows(
  shapes: ArtShape[],
  rand: () => number,
  cx: number,
  baseY: number,
  hw: number,
  artH: number,
  rows: number
): void {
  const dots: Array<{ x: number; y: number; c: string }> = [];
  const cols = 3;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols * 2; col++) {
      if (rand() < 0.6) {
        const side = col < cols ? -1 : 1;
        const c = col % cols;
        dots.push({
          x: cx + side * (hw * 0.14 + c * hw * 0.28),
          y: baseY - 10 - row * ((artH - 14) / rows),
          c: rand() < 0.6 ? "#ffb547" : "#cfe0ff",
        });
      }
    }
  }
  for (const d of dots) {
    shapes.push({ kind: "rect", x: d.x, y: d.y, w: 3.5, h: 4, fill: d.c, opacity: 0.9 });
  }
}

export function buildingArt(input: {
  tier: number;
  family: string | null | undefined;
  seed: number;
}): ArtSpec {
  const tier = input.tier;
  const family =
    input.family && PV_SPEC[input.family] && FAMILY_MASS_HEX[input.family]
      ? input.family
      : UNASSIGNED;
  const spec = PV_SPEC[family] ?? PV_SPEC[UNASSIGNED];
  const mass =
    (family !== UNASSIGNED && FAMILY_MASS_HEX[family]) || UNASSIGNED_MASS_HEX;
  const neon =
    (family !== UNASSIGNED && FAMILY_NEON_HEX[family]) || UNASSIGNED_NEON_HEX;
  const grand = tier >= GRAND_MIN_TIER;
  const artH = grand
    ? spec.grandBaseH + (tier - GRAND_MIN_TIER) * spec.grandFloorH
    : spec.baseH + (tier - 1) * spec.floorH;
  const h = artH + PV_PAD_TOP + PV_PAD_BOTTOM;
  const cx = PV_W / 2;
  const baseY = h - PV_PAD_BOTTOM;
  const hw = spec.hw;
  const hh = hw / 2;
  const top = baseY - artH;
  const rand = pvRng(input.seed);

  // Precomputed stack geometry (Array.from's mapFn has no length param).
  const stackCount = Math.max(2, Math.min(4, Math.ceil(tier / 2) + 1));
  const stackH = artH / stackCount;

  const shapes: ArtShape[] = [];

  // Platform slab (concrete day read).
  shapes.push({
    kind: "poly",
    pts: [
      [cx, baseY - hh * 0.8],
      [cx + hw * 0.9, baseY],
      [cx, baseY + hh * 0.8],
      [cx - hw * 0.9, baseY],
    ],
    fill: "#b4b0a6",
    stroke: "#84806f",
    strokeW: 1.5,
  });

  if (grand) {
    grandBody(shapes, {
      family,
      step: tier - GRAND_MIN_TIER,
      mass,
      neon,
      cx,
      baseY,
      hw,
      artH,
    });
  } else if (family === "Zero-Day") {
    // Twin pillars + beam — the hollow gateway silhouette.
    pvBox(shapes, cx - hw * 0.5, baseY, hw * 0.34, artH, mass);
    pvBox(shapes, cx + hw * 0.5, baseY, hw * 0.34, artH, mass);
    pvBox(shapes, cx, top, hw * 0.8, 8, shadeHex(mass, 1.4));
    shapes.push({
      kind: "poly",
      pts: [
        [cx, top - 20],
        [cx + 6, top - 8],
        [cx, top + 2],
        [cx - 6, top - 8],
      ],
      fill: neon,
      opacity: 0.85,
    });
  } else if (family === "Overclocker") {
    // Reactor cylinder + coil rings.
    shapes.push({
      kind: "rect",
      x: cx - hw * 0.42,
      y: top,
      w: hw * 0.84,
      h: artH,
      fill: shadeHex(mass, 0.8),
    });
    shapes.push({
      kind: "rect",
      x: cx + hw * 0.1,
      y: top,
      w: hw * 0.32,
      h: artH,
      fill: shadeHex(mass, 0.55),
    });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: top,
      rx: hw * 0.42,
      ry: hh * 0.42,
      fill: shadeHex(mass, 1.15),
    });
    for (let i = 0; i < Math.min(4, 1 + tier); i++) {
      shapes.push({
        kind: "ellipse",
        cx,
        cy: top + artH * (0.25 + (i % 3) * 0.22),
        rx: hw * 0.55,
        ry: hh * 0.5,
        fill: "none",
        stroke: neon,
        strokeW: 1.5,
        opacity: 0.8,
      });
    }
    shapes.push({ kind: "circle", cx, cy: top - 8, r: 3.5, fill: neon });
  } else if (family === "Cryptographer") {
    // Wide vault plates + dome.
    for (let i = 0; i < stackCount; i++) {
      pvBox(shapes, cx, baseY - i * stackH, hw * (1 - i * 0.12), stackH, mass);
    }
    shapes.push({
      kind: "ellipse",
      cx,
      cy: top - 6,
      rx: hw * 0.4,
      ry: hh * 0.6,
      fill: shadeHex(mass, 1.3),
    });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: top - 10,
      rx: hw * 0.26,
      ry: hh * 0.36,
      fill: shadeHex(mass, 1.6),
    });
    shapes.push({ kind: "circle", cx, cy: top - 18, r: 1.8, fill: neon });
  } else if (family === "Cache Keeper") {
    // Offset chip stacks.
    for (let i = 0; i < stackCount; i++) {
      pvBox(
        shapes,
        cx + (i % 2 === 0 ? 5 : -5),
        baseY - i * stackH,
        hw * (0.72 - i * 0.08),
        stackH,
        i % 2 === 0 ? mass : shadeHex(mass, 1.35)
      );
    }
    shapes.push({
      kind: "rect",
      x: cx - 5,
      y: top - 12,
      w: 10,
      h: 5,
      fill: "none",
      stroke: neon,
      strokeW: 1.5,
    });
  } else if (family === "Bot Herder") {
    // Hangar + side bays.
    pvBox(shapes, cx, baseY, hw * 0.6, artH, mass);
    pvBox(shapes, cx - hw * 0.8, baseY + 2, hw * 0.3, artH * 0.7, shadeHex(mass, 0.85));
    pvBox(shapes, cx + hw * 0.8, baseY + 2, hw * 0.3, artH * 0.7, shadeHex(mass, 0.85));
    shapes.push({
      kind: "ellipse",
      cx,
      cy: top - 4,
      rx: 11,
      ry: 5.5,
      fill: "none",
      stroke: neon,
      strokeW: 1.5,
    });
  } else if (family === "Server Marshal") {
    // Uniform rack slab + LED rows.
    pvBox(shapes, cx, baseY, hw * 0.62, artH, mass);
    for (let i = 0; i < Math.min(5, tier + 1); i++) {
      shapes.push({
        kind: "rect",
        x: cx - hw * 0.44,
        y: top + 6 + i * ((artH - 10) / Math.min(5, tier + 1)),
        w: hw * 0.88,
        h: 2,
        fill: neon,
        opacity: 0.85,
      });
    }
  } else {
    // Unassigned: stepped cube.
    for (let i = 0; i < Math.max(1, Math.min(4, tier)); i++) {
      pvBox(
        shapes,
        cx,
        baseY - (i * artH) / Math.min(4, tier),
        hw * 0.82 * (1 - i * 0.16),
        artH / Math.min(4, tier),
        mass
      );
    }
  }

  if (!grand) {
    // Shared civic tier tells: antenna (3+), pods (4+), halo (5+),
    // crown (6+), mega cap (7).
    if (tier >= 3) {
      shapes.push({
        kind: "line",
        x1: cx - hw * 0.55,
        y1: top,
        x2: cx - hw * 0.55,
        y2: top - 14,
        stroke: neon,
        strokeW: 1.5,
      });
      shapes.push({ kind: "circle", cx: cx - hw * 0.55, cy: top - 15, r: 1.8, fill: neon });
    }
    if (tier >= 4) {
      pvBox(shapes, cx - hw * 0.85, baseY - 8, hw * 0.2, 10, shadeHex(mass, 0.95));
      pvBox(shapes, cx + hw * 0.85, baseY - 8, hw * 0.2, 10, shadeHex(mass, 0.95));
    }
    if (tier >= 5) {
      shapes.push({
        kind: "ellipse",
        cx,
        cy: top + artH * 0.35,
        rx: hw * 0.85,
        ry: hh * 0.85,
        fill: "none",
        stroke: neon,
        strokeW: 1.5,
        opacity: 0.55,
      });
    }
    if (tier >= 6) pvBox(shapes, cx, top - 5, hw * 0.6, 6, shadeHex(mass, 1.6));
    if (tier >= 7) {
      pvBox(shapes, cx, top - 12, hw * 0.9, 7, shadeHex(mass, 1.35));
      shapes.push({
        kind: "circle",
        cx,
        cy: top - 23,
        r: 2.6,
        fill: "#ffffff",
        opacity: 0.95,
      });
      shapes.push({
        kind: "circle",
        cx,
        cy: top - 23,
        r: 5,
        fill: "none",
        stroke: neon,
        strokeW: 1.5,
        opacity: 0.8,
      });
    }
  }

  // Animated rooftop beacon — CSS opacity pulse in the SVG renderer, static
  // under reduced motion (motion-reduce variant) and on the canvas map.
  shapes.push({
    kind: "circle",
    cx,
    cy: top - 5,
    r: grand ? 2.4 : 1.8,
    fill: "#ffffff",
    opacity: 0.9,
    pulse: true,
  });

  // Seeded lit windows (stable per card, warm/cool mix).
  const rows = grand
    ? 6
    : Math.min(5, Math.max(1, Math.floor((artH - 8) / 14)));
  pvWindows(shapes, rand, cx, baseY, hw * 0.6, artH, rows);

  return { w: PV_W, h, shapes };
}

// ── grand league echo (tiers 8–14) ────────────────────────────────────────
//
// Chroma glass mass + glow band + halo ring + family crown. step = tier − 8.
// (The old GrandBody received the shared rand but never called it — `void
// rand` — so the window pass below consumes the exact same sequence.)

function grandBody(
  shapes: ArtShape[],
  ctx: {
    family: string;
    step: number;
    mass: string;
    neon: string;
    cx: number;
    baseY: number;
    hw: number;
    artH: number;
  }
): void {
  const { family, step, mass, neon, cx, baseY, hw, artH } = ctx;
  const hh = hw / 2;
  const top = baseY - artH;
  const glass = mixHex(mass, neon, 0.35);

  const glowBand = (y: number, w: number) => {
    shapes.push({
      kind: "rect",
      x: cx - w,
      y,
      w: w * 2,
      h: 3.5,
      fill: neon,
      opacity: 0.9,
    });
    shapes.push({
      kind: "rect",
      x: cx - w * 0.6,
      y: y + 0.75,
      w: w * 1.2,
      h: 2,
      fill: "#ffffff",
      opacity: 0.75,
    });
  };
  const halo = (y: number, rx: number, opacity = 0.6) => {
    shapes.push({
      kind: "ellipse",
      cx,
      cy: y,
      rx,
      ry: rx * 0.34,
      fill: "none",
      stroke: neon,
      strokeW: 1.5,
      opacity,
    });
  };

  if (family === "Zero-Day") {
    // MEGA GATE — twin pillars, beam shelves, shard, crown bridge.
    const px = hw * 0.56;
    const pw = hw * 0.4;
    pvBox(shapes, cx - px, baseY, pw, artH - 26, glass);
    pvBox(shapes, cx + px, baseY, pw, artH - 26, glass);
    for (let i = 0; i < 2 + Math.floor(step / 2); i++) {
      const by = baseY - ((artH - 26) * (i + 1)) / (3 + Math.floor(step / 2));
      pvBox(shapes, cx, by, hw * 0.86, 5, shadeHex(mass, 1.4));
      glowBand(by - 5, hw * 0.5);
    }
    shapes.push({
      kind: "poly",
      pts: [
        [cx, baseY - 14],
        [cx + 11, baseY - artH * 0.55],
        [cx, top - 12],
        [cx - 11, baseY - artH * 0.55],
      ],
      fill: neon,
      opacity: 0.85,
    });
    pvBox(shapes, cx, top - 10, hw * 0.92, 9, shadeHex(mass, 1.5));
    shapes.push({ kind: "circle", cx: cx - px, cy: top - 23, r: 2.6, fill: neon });
    shapes.push({ kind: "circle", cx: cx + px, cy: top - 23, r: 2.6, fill: neon });
    if (step >= 4) {
      shapes.push({
        kind: "line",
        x1: cx - px,
        y1: top - 10,
        x2: cx - px,
        y2: top - 24,
        stroke: neon,
        strokeW: 1.5,
      });
      shapes.push({
        kind: "line",
        x1: cx + px,
        y1: top - 10,
        x2: cx + px,
        y2: top - 24,
        stroke: neon,
        strokeW: 1.5,
      });
    }
    if (step >= 6) {
      shapes.push({
        kind: "ellipse",
        cx,
        cy: baseY - artH * 0.55,
        rx: 4,
        ry: artH * 0.3,
        fill: "none",
        stroke: neon,
        strokeW: 2,
        opacity: 0.9,
      });
    }
    return;
  }

  if (family === "Overclocker") {
    // GRAND REACTOR — wide core, coil ladder, plasma crown.
    const r = hw * 0.5;
    pvBox(shapes, cx, baseY, hw * 0.85, 10, shadeHex(mass, 0.9));
    shapes.push({
      kind: "rect",
      x: cx - r,
      y: baseY - artH + 24,
      w: r * 2,
      h: artH - 34,
      fill: shadeHex(glass, 0.9),
    });
    shapes.push({
      kind: "rect",
      x: cx + r * 0.25,
      y: baseY - artH + 24,
      w: r * 0.75,
      h: artH - 34,
      fill: shadeHex(mass, 0.6),
    });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: baseY - artH + 24,
      rx: r,
      ry: r * 0.42,
      fill: shadeHex(glass, 1.2),
    });
    for (let i = 0; i < 3 + Math.floor(step * 0.8); i++) {
      shapes.push({
        kind: "ellipse",
        cx,
        cy: baseY - 12 - ((artH - 36) * i) / (3 + Math.floor(step * 0.8)),
        rx: r + hw * 0.1,
        ry: r * 0.42 + 2,
        fill: "none",
        stroke: neon,
        strokeW: 1.8,
        opacity: 0.8,
      });
    }
    glowBand(baseY - artH * 0.55, r * 0.9);
    if (step >= 1) {
      for (const dx of [-hw * 0.82, hw * 0.82]) {
        shapes.push({
          kind: "rect",
          x: dx - hw * 0.14,
          y: baseY - artH * 0.55,
          w: hw * 0.28,
          h: artH * 0.55,
          fill: shadeHex(mass, 1.1),
        });
        shapes.push({
          kind: "circle",
          cx: dx,
          cy: baseY - artH * 0.55 - 4,
          r: 2,
          fill: neon,
        });
      }
    }
    shapes.push({ kind: "circle", cx, cy: top - 10, r: 5, fill: neon });
    shapes.push({
      kind: "circle",
      cx,
      cy: top - 10,
      r: 9,
      fill: "none",
      stroke: neon,
      strokeW: 1.5,
      opacity: 0.8,
    });
    if (step >= 2) halo(top - 10, 16);
    if (step >= 6) {
      shapes.push({
        kind: "line",
        x1: cx,
        y1: top - 16,
        x2: cx,
        y2: top - 30,
        stroke: neon,
        strokeW: 2.5,
      });
    }
    return;
  }

  if (family === "Cryptographer") {
    // VAULT CITADEL — podium plates, glass drum, shield dome.
    const domeH = 26 + step * 2;
    pvBox(shapes, cx, baseY, hw * 0.98, 14, shadeHex(mass, 0.9));
    pvBox(shapes, cx, baseY - 14, hw * 0.84, 11, shadeHex(mass, 1.08));
    pvBox(shapes, cx, baseY - 25, hw * 0.66, artH - 25 - domeH - 16, glass);
    glowBand(baseY - artH + domeH + 8, hw * 0.5);
    if (step >= 2) {
      for (const dx of [-hw * 0.8, hw * 0.8]) {
        pvBox(shapes, dx, baseY - 12, hw * 0.2, 14, shadeHex(mass, 1));
        shapes.push({
          kind: "ellipse",
          cx: dx,
          cy: baseY - 30,
          rx: hw * 0.16,
          ry: hh * 0.3,
          fill: shadeHex(mass, 1.35),
        });
      }
    }
    shapes.push({
      kind: "ellipse",
      cx,
      cy: top - domeH * 0.45,
      rx: hw * 0.58,
      ry: domeH * 0.62,
      fill: shadeHex(mass, 1.15),
    });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: top - domeH * 0.58,
      rx: hw * 0.4,
      ry: domeH * 0.42,
      fill: shadeHex(mass, 1.45),
    });
    if (step >= 4) {
      shapes.push({
        kind: "ellipse",
        cx,
        cy: top - domeH * 0.5,
        rx: hw * 0.44,
        ry: domeH * 0.5,
        fill: "none",
        stroke: neon,
        strokeW: 1.5,
        opacity: 0.8,
      });
    }
    if (step >= 5) halo(top + 4, hw * 0.5);
    if (step >= 6) {
      shapes.push({
        kind: "rect",
        x: cx - 3,
        y: top - 16,
        w: 6,
        h: 11,
        fill: shadeHex(mass, 1.5),
      });
      shapes.push({ kind: "circle", cx, cy: top - 4, r: 2.6, fill: neon });
      shapes.push({
        kind: "circle",
        cx,
        cy: top - 17,
        r: 2.2,
        fill: "#ffffff",
        opacity: 0.95,
      });
    } else {
      shapes.push({ kind: "circle", cx, cy: top - 4, r: 2.2, fill: neon });
    }
    return;
  }

  if (family === "Cache Keeper") {
    // GRAND DATA ZIGGURAT — offset chip stack + floating cache crown.
    const slabs = 4 + Math.floor(step / 2);
    const slabH = (artH - 24) / slabs;
    for (let i = 0; i < slabs; i++) {
      const dx = i % 2 === 0 ? 7 : -7;
      const w = hw * (0.8 - i * 0.09);
      pvBox(
        shapes,
        cx + dx,
        baseY - i * slabH,
        w,
        slabH,
        i % 2 === 0 ? glass : shadeHex(mass, 1.35)
      );
      shapes.push({
        kind: "rect",
        x: cx + dx - w * 0.75,
        y: baseY - i * slabH - slabH * 0.72,
        w: w * 1.5,
        h: 2,
        fill: neon,
        opacity: 0.85,
      });
    }
    for (const dx of [-hw * 0.88, hw * 0.88]) {
      for (let s = 0; s < 6 + step; s++) {
        shapes.push({
          kind: "circle",
          cx: dx,
          cy: baseY - 4 - (s * (artH - 30)) / (6 + step),
          r: 1.3,
          fill: neon,
          opacity: 0.85,
        });
      }
    }
    for (let i = 0; i < 1 + Math.floor(step / 3); i++) {
      shapes.push({
        kind: "rect",
        x: cx - 6 + (i % 2 ? 2 : -2),
        y: baseY - artH + 24 - 8 - i * 8,
        w: 12,
        h: 5,
        fill: "none",
        stroke: neon,
        strokeW: 1.5,
        opacity: 0.95,
      });
    }
    if (step >= 6) {
      halo(baseY - artH + 18, hw * 0.55, 0.85);
      shapes.push({
        kind: "circle",
        cx,
        cy: top - 8,
        r: 2.4,
        fill: "#ffffff",
        opacity: 0.95,
      });
    }
    return;
  }

  if (family === "Server Marshal") {
    // RACK SPIRE — podium, dense-LED shaft, setback crown, mast array.
    const lowerH = artH * 0.62 - 18;
    const upperW = hw * (step >= 2 ? 0.5 : 0.66);
    const shoulderY = baseY - 18 - lowerH;
    pvBox(shapes, cx, baseY, hw * 0.92, 16, shadeHex(mass, 0.9));
    pvBox(shapes, cx, baseY - 18, hw * 0.66, lowerH, glass);
    for (let i = 0; i < 6 + step; i++) {
      shapes.push({
        kind: "rect",
        x: cx - hw * 0.46,
        y: baseY - 24 - i * ((lowerH - 12) / (6 + step)),
        w: hw * 0.92,
        h: 2,
        fill: neon,
        opacity: 0.9,
      });
    }
    glowBand(shoulderY + 4, hw * 0.5);
    pvBox(shapes, cx, shoulderY, upperW, artH - 18 - lowerH - 26, shadeHex(mass, 1.3));
    for (let i = 0; i < 3 + Math.floor(step / 2); i++) {
      shapes.push({
        kind: "rect",
        x: cx - upperW * 0.7,
        y: shoulderY - 6 - i * ((artH - 18 - lowerH - 36) / (3 + Math.floor(step / 2))),
        w: upperW * 1.4,
        h: 2,
        fill: neon,
        opacity: 0.9,
      });
    }
    if (step >= 3) halo(baseY - 18 - lowerH * 0.45, hw * 0.74);
    if (step >= 5) halo(baseY - 18 - lowerH * 0.8, hw * 0.72, 0.55);
    for (let i = 0; i < (step >= 4 ? 5 : 3); i++) {
      const n = step >= 4 ? 5 : 3;
      const mx = cx + (i - (n - 1) / 2) * (upperW * 0.45);
      const my = shoulderY - (artH - 18 - lowerH - 26);
      shapes.push({
        kind: "line",
        x1: mx,
        y1: my,
        x2: mx,
        y2: my - 12,
        stroke: neon,
        strokeW: 1.5,
      });
      shapes.push({ kind: "circle", cx: mx, cy: my - 13, r: 1.6, fill: neon });
    }
    if (step >= 6) {
      halo(shoulderY - (artH - 18 - lowerH - 26) - 4, upperW * 0.9, 0.85);
      shapes.push({
        kind: "circle",
        cx,
        cy: shoulderY - (artH - 18 - lowerH - 26) - 22,
        r: 2.6,
        fill: "#ffffff",
        opacity: 0.95,
      });
    }
    return;
  }

  if (family === "Bot Herder") {
    // DRONE NEXUS — tri-lobed mega-hangar, doors, landing rings.
    const centerH = artH - 40;
    pvBox(shapes, cx, baseY, hw * 0.62, centerH, glass);
    pvBox(shapes, cx - hw * 0.8, baseY + 2, hw * 0.34, centerH * 0.66, shadeHex(mass, 0.95));
    pvBox(shapes, cx + hw * 0.8, baseY + 2, hw * 0.34, centerH * 0.66, shadeHex(mass, 0.95));
    for (let i = 0; i < 3 + Math.floor(step / 2); i++) {
      const which = [-hw * 0.8, 0, hw * 0.8][i % 3];
      shapes.push({
        kind: "rect",
        x: cx + which - 4,
        y: baseY - 8 - Math.floor(i / 3) * 14,
        w: 8,
        h: 2.5,
        fill: neon,
        opacity: 0.95,
      });
    }
    glowBand(baseY - centerH + 6, hw * 0.55);
    for (let i = 0; i < 1 + Math.floor(step / 2); i++) {
      shapes.push({
        kind: "ellipse",
        cx,
        cy: baseY - centerH - 3 - i * 7,
        rx: Math.max(6, hw * (0.34 - i * 0.09)),
        ry: Math.max(3, hw * (0.17 - i * 0.045)),
        fill: "none",
        stroke: neon,
        strokeW: 1.5,
        opacity: 0.9,
      });
    }
    if (step >= 3) {
      for (const dx of [-hw * 0.4, hw * 0.4]) {
        shapes.push({
          kind: "line",
          x1: cx + dx,
          y1: baseY - centerH - 2,
          x2: cx + dx,
          y2: baseY - centerH - 14,
          stroke: neon,
          strokeW: 1.5,
        });
        shapes.push({
          kind: "circle",
          cx: cx + dx,
          cy: baseY - centerH - 15,
          r: 1.7,
          fill: neon,
        });
      }
    }
    if (step >= 6) {
      halo(baseY - centerH - 10, hw * 0.85, 0.85);
      shapes.push({
        kind: "circle",
        cx,
        cy: baseY - centerH - 30,
        r: 2.6,
        fill: "#ffffff",
        opacity: 0.95,
      });
    }
    return;
  }

  // Unassigned grand — stepped chroma mega-mast with halo rings + spire.
  const decks = 4;
  const deckH = (artH - 30) / decks;
  for (let i = 0; i < decks; i++) {
    pvBox(
      shapes,
      cx,
      baseY - i * deckH,
      hw * (0.85 - i * 0.16),
      deckH,
      i === 0 ? mass : shadeHex(glass, 1 + i * 0.12)
    );
  }
  if (step >= 1) halo(baseY - deckH * 3, hw * 0.62);
  if (step >= 3) halo(baseY - deckH * 2, hw * 0.66, 0.55);
  pvBox(shapes, cx, top + 6, hw * 0.3, 12, shadeHex(mass, 1.3));
  pvBox(shapes, cx, top - 6, hw * 0.18, 9, shadeHex(mass, 1.5));
  shapes.push({
    kind: "poly",
    pts: [
      [cx, top - 26],
      [cx + 5, top - 14],
      [cx, top - 10],
      [cx - 5, top - 14],
    ],
    fill: neon,
    opacity: 0.95,
  });
  if (step >= 6) {
    halo(top - 2, hw * 0.75, 0.85);
    shapes.push({
      kind: "circle",
      cx,
      cy: top - 28,
      r: 2.4,
      fill: "#ffffff",
      opacity: 0.95,
    });
  }
}

// ── goddess monument echo ─────────────────────────────────────────────────
//
// Echoes of the six LandmarkSprite monuments (landmarks.ts), in their
// stage-2 (climbing) elaborated forms — the representative look of each
// Founder's landmark. Indexed by GODDESS_USERNAMES order (0..5).

export function monumentArt(index: number): ArtSpec {
  const color = LANDMARK_HEX_COLORS[index] ?? "#7dd3fc";
  const stone = shadeHex(color, 0.3);
  const H = 210;
  const W = 150;
  const cx = W / 2;
  const baseY = H - 18;

  const shapes: ArtShape[] = [];

  // Monument pad — the two-tile identity base.
  shapes.push({
    kind: "poly",
    pts: [
      [cx, baseY - 20],
      [cx + 52, baseY],
      [cx, baseY + 20],
      [cx - 52, baseY],
    ],
    fill: "#0a0e1a",
    stroke: color,
    strokeW: 2,
    opacity: 0.95,
  });
  shapes.push({
    kind: "ellipse",
    cx,
    cy: baseY,
    rx: 64,
    ry: 24,
    fill: "none",
    stroke: color,
    strokeW: 1.5,
    opacity: 0.5,
  });

  if (index === 0) {
    // The Architect — root spire + orbit rings.
    pvBox(shapes, cx, baseY, 26, 40, stone);
    pvBox(shapes, cx, baseY - 40, 18, 34, shadeHex(color, 0.4));
    pvBox(shapes, cx, baseY - 74, 11, 30, shadeHex(color, 0.55));
    pvBox(shapes, cx, baseY - 104, 6, 22, shadeHex(color, 0.7));
    shapes.push({
      kind: "poly",
      pts: [
        [cx, baseY - 182],
        [cx + 7, baseY - 134],
        [cx, baseY - 126],
        [cx - 7, baseY - 134],
      ],
      fill: "#ffffff",
    });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: baseY - 96,
      rx: 34,
      ry: 10,
      fill: "none",
      stroke: color,
      strokeW: 1.5,
      opacity: 0.8,
    });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: baseY - 134,
      rx: 26,
      ry: 8,
      fill: "none",
      stroke: color,
      strokeW: 1.5,
      opacity: 0.7,
    });
    shapes.push({ kind: "circle", cx: cx - 34, cy: baseY - 96, r: 3, fill: "#ffffff" });
    shapes.push({ kind: "circle", cx: cx + 34, cy: baseY - 96, r: 3, fill: "#ffffff" });
  } else if (index === 1) {
    // The Locksmith — citadel towers + the floating key.
    pvBox(shapes, cx - 22, baseY, 12, 88, stone);
    pvBox(shapes, cx + 22, baseY, 12, 88, stone);
    pvBox(shapes, cx, baseY - 2, 14, 34, shadeHex(color, 0.25));
    pvBox(shapes, cx, baseY - 90, 18, 8, shadeHex(color, 0.45));
    shapes.push({
      kind: "rect",
      x: cx - 12,
      y: baseY - 74,
      w: 24,
      h: 20,
      rx: 4,
      fill: shadeHex(color, 0.55),
    });
    shapes.push({
      kind: "path",
      d: `M ${cx - 9} ${baseY - 74} A 9 9 0 0 1 ${cx + 9} ${baseY - 74}`,
      fill: "none",
      stroke: color,
      strokeW: 4,
    });
    shapes.push({ kind: "circle", cx, cy: baseY - 68, r: 3, fill: "#fffbeb" });
    shapes.push({
      kind: "circle",
      cx,
      cy: baseY - 108,
      r: 5,
      fill: "none",
      stroke: color,
      strokeW: 2,
    });
    shapes.push({
      kind: "line",
      x1: cx,
      y1: baseY - 103,
      x2: cx,
      y2: baseY - 118,
      stroke: color,
      strokeW: 2,
    });
    shapes.push({
      kind: "line",
      x1: cx,
      y1: baseY - 113,
      x2: cx + 5,
      y2: baseY - 113,
      stroke: color,
      strokeW: 2,
    });
    shapes.push({
      kind: "line",
      x1: cx,
      y1: baseY - 118,
      x2: cx + 6,
      y2: baseY - 118,
      stroke: color,
      strokeW: 2,
    });
  } else if (index === 2) {
    // The Oracle — observatory dome, sensor eye + relay mast.
    shapes.push({ kind: "rect", x: cx - 17, y: baseY - 46, w: 34, h: 46, fill: stone });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: baseY,
      rx: 17,
      ry: 8.5,
      fill: shadeHex(color, 0.2),
    });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: baseY - 54,
      rx: 15,
      ry: 12,
      fill: shadeHex(color, 0.5),
    });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: baseY - 58,
      rx: 9,
      ry: 7,
      fill: shadeHex(color, 0.75),
    });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: baseY - 58,
      rx: 5.5,
      ry: 3.5,
      fill: "#ffffff",
    });
    shapes.push({
      kind: "path",
      d: `M ${cx - 14} ${baseY - 62} A 14 14 0 0 1 ${cx + 14} ${baseY - 62}`,
      fill: "none",
      stroke: color,
      strokeW: 2,
      opacity: 0.75,
    });
    shapes.push({
      kind: "line",
      x1: cx,
      y1: baseY - 66,
      x2: cx,
      y2: baseY - 94,
      stroke: shadeHex(color, 0.6),
      strokeW: 2.5,
    });
    shapes.push({
      kind: "path",
      d: `M ${cx - 7} ${baseY - 76} A 7 7 0 0 1 ${cx + 7} ${baseY - 76}`,
      fill: "none",
      stroke: color,
      strokeW: 1.5,
    });
    shapes.push({
      kind: "path",
      d: `M ${cx - 6} ${baseY - 88} A 6 6 0 0 1 ${cx + 6} ${baseY - 88}`,
      fill: "none",
      stroke: color,
      strokeW: 1.5,
    });
    shapes.push({ kind: "circle", cx, cy: baseY - 98, r: 2.2, fill: "#ffffff" });
  } else if (index === 3) {
    // The Clockkeeper — clock tower + chrono rings.
    pvBox(shapes, cx, baseY, 15, 58, stone);
    pvBox(shapes, cx, baseY - 58, 18, 16, shadeHex(color, 0.45));
    shapes.push({
      kind: "circle",
      cx,
      cy: baseY - 66,
      r: 13,
      fill: "#0b1220",
      stroke: shadeHex(color, 1.3),
      strokeW: 2.5,
    });
    shapes.push({
      kind: "line",
      x1: cx,
      y1: baseY - 66,
      x2: cx,
      y2: baseY - 72,
      stroke: "#ffffff",
      strokeW: 2,
    });
    shapes.push({
      kind: "line",
      x1: cx,
      y1: baseY - 66,
      x2: cx - 5.5,
      y2: baseY - 72,
      stroke: "#ffffff",
      strokeW: 1.5,
    });
    pvBox(shapes, cx, baseY - 74, 12, 26, shadeHex(color, 0.4));
    shapes.push({
      kind: "ellipse",
      cx,
      cy: baseY - 92,
      rx: 22,
      ry: 7,
      fill: "none",
      stroke: color,
      strokeW: 2,
      opacity: 0.85,
    });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: baseY - 118,
      rx: 18,
      ry: 6,
      fill: "none",
      stroke: color,
      strokeW: 1.5,
      opacity: 0.7,
    });
    shapes.push({ kind: "circle", cx, cy: baseY - 122, r: 2.2, fill: "#ffffff" });
  } else if (index === 4) {
    // NullPointer — fractured obelisk + orbit shards.
    shapes.push({
      kind: "poly",
      pts: [
        [cx - 9, baseY],
        [cx + 9, baseY],
        [cx + 6, baseY - 86],
        [cx - 6, baseY - 86],
      ],
      fill: stone,
    });
    shapes.push({
      kind: "poly",
      pts: [
        [cx - 8, baseY - 86],
        [cx + 8, baseY - 86],
        [cx + 5, baseY - 122],
        [cx - 5, baseY - 118],
      ],
      fill: stone,
    });
    shapes.push({
      kind: "poly",
      pts: [
        [cx - 5, baseY - 120],
        [cx + 6, baseY - 122],
        [cx + 3, baseY - 150],
        [cx - 4, baseY - 146],
      ],
      fill: stone,
    });
    shapes.push({
      kind: "line",
      x1: cx - 6,
      y1: baseY - 84,
      x2: cx + 2,
      y2: baseY - 88,
      stroke: shadeHex(color, 1.4),
      strokeW: 2,
    });
    shapes.push({
      kind: "line",
      x1: cx - 2,
      y1: baseY - 128,
      x2: cx + 4,
      y2: baseY - 134,
      stroke: shadeHex(color, 1.4),
      strokeW: 2,
    });
    [-18, 0, 18].forEach((dx, i) => {
      shapes.push({
        kind: "poly",
        pts: [
          [cx + dx, baseY - 108 - (i % 2) * 22 - 7],
          [cx + dx + 4, baseY - 108 - (i % 2) * 22],
          [cx + dx, baseY - 108 - (i % 2) * 22 + 6],
          [cx + dx - 4, baseY - 108 - (i % 2) * 22],
        ],
        fill: shadeHex(color, 1.2),
        opacity: 0.95,
      });
    });
    shapes.push({
      kind: "line",
      x1: cx,
      y1: baseY - 150,
      x2: cx,
      y2: baseY - 176,
      stroke: shadeHex(color, 1.4),
      strokeW: 2,
    });
    shapes.push({ kind: "circle", cx, cy: baseY - 178, r: 2.6, fill: "#ffffff" });
  } else if (index === 5) {
    // The Banker — stepped treasury pyramid + colonnade + coins.
    (
      [
        [30, 18],
        [24, 18],
        [17, 18],
        [10, 16],
      ] as Array<[number, number]>
    ).forEach(([halfW, h], i) => {
      const y = baseY - [0, 11.7, 23.4, 35.1][i];
      shapes.push({
        kind: "poly",
        pts: [
          [cx - halfW, y],
          [cx, y - h * 0.35],
          [cx + halfW, y],
        ],
        fill: shadeHex(color, 0.3 + i * 0.05),
        stroke: shadeHex(color, 1.3),
        strokeW: 1,
      });
      shapes.push({
        kind: "poly",
        pts: [
          [cx - halfW, y],
          [cx, y + halfW * 0.66],
          [cx, y + halfW * 0.66 - h * 0.35],
          [cx - halfW, y - h * 0.35],
        ],
        fill: shadeHex(color, 0.24 + i * 0.05),
      });
      shapes.push({
        kind: "poly",
        pts: [
          [cx + halfW, y],
          [cx, y + halfW * 0.66],
          [cx, y + halfW * 0.66 - h * 0.35],
          [cx + halfW, y - h * 0.35],
        ],
        fill: shadeHex(color, 0.2 + i * 0.05),
      });
    });
    for (const dx of [-38, -19, 19, 38]) {
      shapes.push({
        kind: "rect",
        x: cx + dx - 2,
        y: baseY - 26,
        w: 4,
        h: 27,
        fill: shadeHex(color, 0.4),
      });
      shapes.push({ kind: "circle", cx: cx + dx, cy: baseY - 28, r: 2.2, fill: "#fffbeb" });
    }
    shapes.push({
      kind: "poly",
      pts: [
        [cx, baseY - 68],
        [cx + 6, baseY - 56],
        [cx, baseY - 51],
        [cx - 6, baseY - 56],
      ],
      fill: "#fffbeb",
    });
    shapes.push({
      kind: "ellipse",
      cx,
      cy: baseY - 62,
      rx: 16,
      ry: 5,
      fill: "none",
      stroke: color,
      strokeW: 1.5,
      opacity: 0.7,
    });
    shapes.push({ kind: "circle", cx: cx - 16, cy: baseY - 62, r: 2, fill: "#fffbeb" });
    shapes.push({ kind: "circle", cx: cx + 16, cy: baseY - 62, r: 2, fill: "#fffbeb" });
  }

  return { w: W, h: H, shapes };
}
