/**
 * Mainframe City — procedural art (client-only, Pixi Graphics).
 *
 * ONE ART SYSTEM (2026-09-29 rework, user ruling: the generated pixel-art
 * sheets are RETIRED): every building, hero and monument in the city is
 * procedural vector Graphics drawn here or in landmarks.ts/HqSprite.ts —
 * no spritesheets, no external assets.
 *
 * PROCEDURAL MASSES (2026-09-28 SC4 contrast pass): every family renders in
 * a mid-tone, family-hued MASS color (FAMILY_MASS_HEX) with
 * gradient-shaded faces + AO seams, while lit windows / coils / beacons /
 * LED strips draw into a separate EMISSIVE Graphics (`e` params below) in
 * the saturated NEON accent (FAMILY_NEON_HEX). Faces are vertical
 * FillGradients (lit top → shadowed base), top diamonds carry a faint neon
 * rim (edge-lit architecture), and platforms are concrete slabs (day/night
 * authored pair, drawPlatform).
 *
 * PHASE C — six profession architectures (RTS plan §"Profession architecture"):
 * each family has a DISTINCT silhouette + accent + rooftop marker:
 *   Cryptographer  encryption vault / shield lattice  — squat wide vault + dome
 *   Zero-Day       breach lab / exploit gateway       — twin pillars + beam (hollow)
 *   Overclocker    reactor tower / energy coils       — cylinder + coil rings
 *   Cache Keeper   data bank / memory stacks          — offset chip-stack ziggurat
 *   Server Marshal command center / rack tower       — uniform rack slab tower
 *   Bot Herder     drone factory / bot bays           — wide hangar + side bays
 * Unassigned keeps the neutral stepped cube.
 *
 * COLOR-BLIND SAFE by construction: the six families differ by SILHOUETTE
 * (wide-dome / hollow-gate / round-column / offset-stack / uniform-slab /
 * tri-lobed-hangar), so hue only reinforces what shape already encodes.
 *
 * TWO LEAGUES, ONE SYSTEM — the 14-tier ladder:
 *   tiers 1–7  CIVIC architecture: modular family stack (drawBase +
 *              drawFloor per tier) + one shared feature per tier from
 *              drawTierFeatures (antenna 3, pods 4, halo 5, crown 6,
 *              megastructure cap 7).
 *   tiers 8–14 GRAND architecture (the spectacular endgame league, bespoke
 *              per family): each family spec owns a drawGrand() megaform —
 *              a self-contained skyscraper-cathedral that KEEPS the family
 *              silhouette but gains ring buttresses, sky-lobby glow bands,
 *              curtain-glass window fields, crown stacks, diadems and apex
 *              spires (one more elaboration per tier, `step = tier − 8`).
 *              Chroma materials mix the neon accent INTO the mass faces
 *              (mixRGB) so the high league reads saturated, not just tall.
 *
 * Color canon (kept in lockstep with the DOM BuildingTile):
 * - firewall ring = cyan #22d3ee (tailwind cyan-400)
 * - hard-lock ring = amber #f59e0b (tailwind amber-500)
 * - selection brackets + emissive edge = t1 blue accent
 * - ghost tile = green #4ade80 valid / red #ef4444 invalid
 */

import { Container, FillGradient, Graphics, Text } from "pixi.js";
import { UNASSIGNED_FAMILY } from "@/lib/city/types";
import type { BuildingTier } from "@/lib/city/types";
import {
  FAMILY_MASS_HEX,
  FAMILY_NEON_HEX,
  UNASSIGNED_MASS_HEX,
  UNASSIGNED_NEON_HEX,
} from "@/lib/city/district";
import { TILE_H, TILE_W } from "@/lib/city/scene/iso";

export const COLOR_FIREWALL = 0x22d3ee;
export const COLOR_HARDLOCK = 0xf59e0b;
export const COLOR_SELECTION = 0x4f8dff;
export const COLOR_GHOST_VALID = 0x4ade80;
export const COLOR_GHOST_INVALID = 0xef4444;

/** Night-scene shared colors (study palette canon). */
export const COLOR_VOID = 0x05060a;
export const COLOR_WET_SLAB = 0x0a0e1a;

/**
 * GRASS LAND palette (single source of truth, 2026-09-28): the terrain
 * plate, the outer terrain tier, and every mini-city pad (satellites +
 * universe) share ONE green so the world floor reads as continuous land —
 * the old near-black mini pads read as "black squares" over it.
 */
export const GRASS_DAY = 0x6b9c52;
export const GRASS_NIGHT = 0x1f2a21;
export const GRASS_BAND_DAY_A = 0x63954b;
export const GRASS_BAND_DAY_B = 0x71a358;
export const GRASS_BAND_NIGHT_A = 0x1c261e;
export const GRASS_BAND_NIGHT_B = 0x222f24;
/** Terrain rim (plate + pads): warm soil edge by day, dark loam at night. */
export const GRASS_RIM_DAY = 0x54452f;
export const GRASS_RIM_NIGHT = 0x141b16;

/**
 * Grass pad under a mini city (day/night pair — the owner crossfades like
 * every other authored state). The caller keeps its dashed accent border on
 * top: the border is the cluster's highlight identity, the FILL is the land.
 */
export function drawGrassPad(
  g: Graphics,
  halfW: number,
  halfH: number,
  variant: "day" | "night"
): void {
  const day = variant === "day";
  const diamond = [0, -halfH, halfW, 0, 0, halfH, -halfW, 0];
  g.poly(diamond).fill({ color: day ? GRASS_DAY : GRASS_NIGHT, alpha: 1 });
  // Faint inner mow ring — mowed land, not a painted shape.
  g.poly([0, -halfH * 0.7, halfW * 0.7, 0, 0, halfH * 0.7, -halfW * 0.7, 0]).stroke({
    width: 1,
    color: day ? GRASS_BAND_DAY_A : GRASS_BAND_NIGHT_A,
    alpha: 0.5,
  });
  g.poly(diamond).stroke({
    width: 1.5,
    color: day ? GRASS_RIM_DAY : GRASS_RIM_NIGHT,
    alpha: day ? 0.8 : 0.9,
  });
}

/** Hex string → 0xRRGGBB (palette lives in the pure district module). */
function hexToRgb(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/**
 * Art manifest — the single family registry. Each spec owns BOTH leagues of
 * its family: the civic modular stack (tiers 1–7) and the bespoke grand
 * megaform (tiers 8–14). Everything renders through familyArt() /
 * familyTopHeight(), so labels, FX anchors and selection brackets follow the
 * art automatically.
 */
export interface FamilyArtSpec {
  /** DB profession name, or UNASSIGNED_FAMILY. */
  readonly family: string;
  /** Emissive accent (0xRRGGBB) — windows/neon/edges (FAMILY_NEON_HEX). */
  readonly color: number;
  /** Night MASS base (0xRRGGBB) — body faces (FAMILY_MASS_HEX). */
  readonly mass: number;
  /** Tier-1 base height in px (body budget below the rooftop features). */
  readonly baseH: number;
  /** Height added per extra tier floor, px. */
  readonly floorH: number;
  /** Grand-league body height at tier 8, px (must exceed civic tier-7). */
  readonly grandBaseH: number;
  /** Height added per grand tier 9..14, px. */
  readonly grandFloorH: number;
  /** Tier-1 family silhouette (body → g, emissives → e). */
  drawBase(g: Graphics, e: Graphics): void;
  /** One modular layer for floor = 2..tier (stacked on the base). */
  drawFloor(g: Graphics, e: Graphics, floor: number): void;
  /** Family rooftop marker (drawn every tier; scales with the body). */
  drawRooftop(g: Graphics, e: Graphics, tier: BuildingTier): void;
  /** GRAND league (tier 8..14): the family's bespoke spectacular megaform.
   *  `step` = tier − 8 (0..6) — each step adds one more elaboration. */
  drawGrand(g: Graphics, e: Graphics, step: number, seed: number): void;
}

/** First tier of the grand (spectacular) league. */
export const GRAND_MIN_TIER = 8;

/** Body-top Y for a family at a tier (features/labels anchor here). */
export function familyTopHeight(profession: string | null, tier: BuildingTier): number {
  const spec = familyArt(profession);
  if (tier >= GRAND_MIN_TIER) {
    return spec.grandBaseH + (tier - GRAND_MIN_TIER) * spec.grandFloorH;
  }
  return spec.baseH + (tier - 1) * spec.floorH;
}

/** Half-extents of one building footprint (inset from the tile diamond). */
export const PLATFORM_HALF_W = TILE_W / 2 - 8;
export const PLATFORM_HALF_H = TILE_H / 2 - 4;

/** Night mass palette keyed by DB profession name (or unassigned). */
const FAMILY_MASS: Record<string, number> = Object.fromEntries(
  Object.entries(FAMILY_MASS_HEX).map(([k, v]) => [k, hexToRgb(v)])
);
/** Emissive neon palette keyed by DB profession name (or unassigned). */
const FAMILY_NEON: Record<string, number> = Object.fromEntries(
  Object.entries(FAMILY_NEON_HEX).map(([k, v]) => [k, hexToRgb(v)])
);
const UNASSIGNED_MASS = hexToRgb(UNASSIGNED_MASS_HEX);
const UNASSIGNED_NEON = hexToRgb(UNASSIGNED_NEON_HEX);

/** Night mass color, neutral fallback. */
export function professionMass(profession: string | null): number {
  if (!profession || profession === UNASSIGNED_FAMILY) return UNASSIGNED_MASS;
  return FAMILY_MASS[profession] ?? UNASSIGNED_MASS;
}

/** Emissive accent per family, neutral fallback. */
export function professionNeon(profession: string | null): number {
  if (!profession || profession === UNASSIGNED_FAMILY) return UNASSIGNED_NEON;
  return FAMILY_NEON[profession] ?? UNASSIGNED_NEON;
}

/** Legacy alias — accent color (now the NEON accent). */
export function professionColor(profession: string | null): number {
  return professionNeon(profession);
}

/** Multiply a color's channels by `k` (face shading). */
export function shade(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

/** Linear RGB mix of two colors (grand-league chroma materials). */
export function mixRGB(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
  const g = Math.round(((a >> 8) & 0xff) * (1 - t) + ((b >> 8) & 0xff) * t);
  const bl = Math.round((a & 0xff) * (1 - t) + (b & 0xff) * t);
  return (r << 16) | (g << 8) | bl;
}

// ── vertical gradient fills (night face shading) ──────────────────────────

/** 0xRRGGBB + alpha → "#rrggbbaa" (gradient stops are hexa strings). */
function hexa(color: number, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = Math.round(a * 255).toString(16).padStart(2, "0");
  return `#${color.toString(16).padStart(6, "0")}${hex}`;
}

/**
 * Cached top→bottom gradients. textureSpace "local" is NORMALIZED to each
 * filled shape's own bounds (0,0 = top-left, 1,1 = bottom-right), so ONE
 * gradient per color pair shades every face/cylinder/wall correctly — the
 * cache stays tiny (a handful of color pairs) and never rebuilds per redraw.
 */
const vGradCache = new Map<string, FillGradient>();
function vGrad(cTop: number, cBot: number, alpha = 1): FillGradient {
  const key = `${cTop}|${cBot}|${alpha}`;
  let grad = vGradCache.get(key);
  if (!grad) {
    grad = new FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: hexa(cTop, alpha) },
        { offset: 1, color: hexa(cBot, alpha) },
      ],
      textureSpace: "local",
    });
    vGradCache.set(key, grad);
  }
  return grad;
}

// ── shared drawing primitives ─────────────────────────────────────────────

/**
 * One extruded iso box whose base center sits at (cx, baseY). Faces are
 * VERTICAL GRADIENTS (lit top → shadowed base — the night "lit from above"
 * read), the top diamond is the lightest plane, and a dark AO seam outlines
 * the massing. `neon` (optional) adds a faint accent rim on the top
 * diamond's front edges — edge-lit architecture (skipped at low alpha so
 * dormant monuments stay unrimmed).
 */
export function drawIsoBox(
  g: Graphics,
  cx: number,
  baseY: number,
  halfW: number,
  halfH: number,
  height: number,
  color: number,
  alpha = 1,
  neon?: number
): void {
  const top = baseY - height;
  // Left face (screen-down-left): dimmer key plane.
  g.poly([
    cx - halfW, top,
    cx, top + halfH,
    cx, baseY + halfH,
    cx - halfW, baseY,
  ]).fill(vGrad(shade(color, 0.62), shade(color, 0.36), alpha));
  // Right face (screen-down-right): brighter key plane.
  g.poly([
    cx + halfW, top,
    cx, top + halfH,
    cx, baseY + halfH,
    cx + halfW, baseY,
  ]).fill(vGrad(shade(color, 0.95), shade(color, 0.55), alpha));
  // Top diamond — lightest plane (sky exposure).
  g.poly([
    cx, top - halfH,
    cx + halfW, top,
    cx, top + halfH,
    cx - halfW, top,
  ]).fill({ color: shade(color, 1.2), alpha });
  // AO seam: dark outline where stacked boxes meet (floor separation).
  g.poly([
    cx, top - halfH,
    cx + halfW, top,
    cx, top + halfH,
    cx - halfW, top,
  ]).stroke({ width: 0.75, color: COLOR_VOID, alpha: 0.35 * alpha });
  // Neon rim on the two FRONT top edges (edge-lit architecture).
  if (neon !== undefined && alpha >= 0.9) {
    g.moveTo(cx - halfW, top).lineTo(cx, top + halfH).lineTo(cx + halfW, top)
      .stroke({ width: 1, color: neon, alpha: 0.5 });
  }
}

/** Stroke-only iso box (holographic outline preview / selection emissive). */
export function drawIsoBoxOutline(
  g: Graphics,
  cx: number,
  baseY: number,
  halfW: number,
  halfH: number,
  height: number,
  color: number,
  alpha = 1,
  width = 2
): void {
  const top = baseY - height;
  const stroke = { color, alpha, width };
  // Vertical edges + base diamond + top diamond.
  g.moveTo(cx - halfW, baseY).lineTo(cx - halfW, top).stroke(stroke);
  g.moveTo(cx + halfW, baseY).lineTo(cx + halfW, top).stroke(stroke);
  g.moveTo(cx, baseY + halfH).lineTo(cx, baseY + halfH - height).stroke(stroke);
  g.poly([cx, baseY - halfH, cx + halfW, baseY, cx, baseY + halfH, cx - halfW, baseY]).stroke(stroke);
  g.poly([cx, top - halfH, cx + halfW, top, cx, top + halfH, cx - halfW, top]).stroke(stroke);
}

/**
 * Vertical cylinder (reactor / tower core): gradient body + shaded side +
 * light top disc.
 */
export function drawCylinder(
  g: Graphics,
  cx: number,
  baseY: number,
  radius: number,
  ry: number,
  height: number,
  color: number,
  alpha = 1
): void {
  const top = baseY - height;
  // Body: two verticals closed by half-ellipse caps, gradient-lit.
  g.poly([
    cx - radius, top,
    cx + radius, top,
    cx + radius, baseY,
    cx - radius, baseY,
  ]).fill(vGrad(shade(color, 0.85), shade(color, 0.45), alpha));
  // Right-side shading strip for volume.
  g.poly([
    cx + radius * 0.25, top,
    cx + radius, top,
    cx + radius, baseY,
    cx + radius * 0.25, baseY,
  ]).fill({ color: shade(color, 0.55), alpha });
  // Top disc.
  g.ellipse(cx, top, radius, ry).fill({ color: shade(color, 1.15), alpha });
}

/**
 * Energy coil ring around a cylinder/tower at world y — EMISSIVE (draw into
 * the neon layer). Weight-tuned after the visual gate: coils must glow as
 * the Overclocker's family tell WITHOUT drowning the massing silhouette in
 * dense clusters (gate issue #2: "ring bundles, not architecture").
 */
function drawCoil(e: Graphics, cx: number, y: number, radius: number, ry: number, neon: number): void {
  e.ellipse(cx, y, radius, ry).fill({ color: shade(neon, 1.6), alpha: 0.1 });
  e.ellipse(cx, y, radius, ry).stroke({ width: 2, color: shade(neon, 1.4), alpha: 0.8 });
}

/** Dome cap (vault / bunker roof): stacked ellipses read as a rounded shell. */
function drawDome(
  g: Graphics,
  cx: number,
  baseY: number,
  rx: number,
  ry: number,
  height: number,
  color: number
): void {
  g.ellipse(cx, baseY - height / 2, rx, height / 2 + ry / 2).fill({ color: shade(color, 0.8) });
  g.ellipse(cx, baseY - height / 2 - ry * 0.2, rx * 0.62, height / 2.4).fill({ color: shade(color, 1.25) });
}

/** Chamfered iso octagon pad (vault footprint): diamond with cut corners. */
function octagonPoly(hw: number, hh: number, k: number): number[] {
  return [
    0, -hh,
    hw - k, -hh + k * 0.5,
    hw, 0,
    hw - k, hh - k * 0.5,
    0, hh,
    -hw + k, hh - k * 0.5,
    -hw, 0,
    -hw + k, -hh + k * 0.5,
  ];
}

/** Flat iso octagon pad fill + rim (shield-lattice base), gradient walls. */
function drawOctagonPad(
  g: Graphics,
  cx: number,
  baseY: number,
  hw: number,
  hh: number,
  height: number,
  color: number
): void {
  const top = baseY - height;
  const pts = octagonPoly(hw, hh, hw * 0.3);
  const shift = (dy: number) => pts.map((v, i) => (i % 2 === 0 ? v + cx : v + dy));
  // Left wall (dark) — bottom-to-top sweep approximated with two gradient fills.
  g.poly(shift(baseY)).fill(vGrad(shade(color, 0.55), shade(color, 0.3), 0.92));
  g.poly(shift(baseY - height * 0.45)).fill(vGrad(shade(color, 0.72), shade(color, 0.42), 0.88));
  // Top face.
  g.poly(shift(top)).fill({ color: shade(color, 1.1) });
  g.poly(shift(top)).stroke({ width: 1.5, color: shade(color, 1.5), alpha: 0.45 });
}

// ── grand-league shared details (tiers 8–14) ──────────────────────────────

/**
 * Curtain-glass window field for a grand body segment (both visible faces,
 * parallelogram panes following the iso slope). Seeded per card so the lit
 * mosaic is stable across visits, varied across the skyline. Lit panes go
 * to `e` (they ARE the grand league's light identity); dark insets shade
 * the glass so unlit rows still read as curtain wall.
 */
function drawGrandWindows(
  e: Graphics,
  cx: number,
  baseY: number,
  hw: number,
  height: number,
  rows: number,
  seed: number
): void {
  const hh = hw * 0.5;
  const rng = mulberry32((seed ^ 0x6a09e667) | 0);
  const cols = Math.max(3, Math.round(hw / 9));
  for (let row = 0; row < rows; row++) {
    const yOff = 6 + row * ((height - 10) / rows);
    for (let side = -1; side <= 1; side += 2) {
      for (let col = 0; col < cols; col++) {
        const u = 0.14 + (col + 0.5) * (0.72 / cols);
        const x = cx + (side < 0 ? -hw + u * hw : u * hw);
        const y = baseY - height + u * hh + yOff;
        const r = rng();
        const wW = 4.5;
        const wH = 5;
        const shear = side < 0 ? 0.5 : -0.5;
        const pane = [
          x, y,
          x + wW, y + wW * shear,
          x + wW, y + wW * shear + wH,
          x, y + wH,
        ];
        if (r < 0.66) {
          const r2 = rng();
          const lit = r2 < 0.6 ? 0xffc061 : r2 < 0.88 ? 0xcfe3ff : 0xffffff;
          e.poly(pane).fill({ color: lit, alpha: 0.95 });
        } else {
          e.poly(pane).fill({ color: 0x1b2433, alpha: 0.55 });
        }
      }
    }
  }
}

/**
 * Sky-lobby glow band — a bright neon sliver wrapped around a grand body at
 * world y: iso-box fill in lit neon + a white-hot core seam on the front
 * edges. The grand league's "cathedral lighting" tell.
 */
function drawGlowBand(
  g: Graphics,
  cx: number,
  y: number,
  hw: number,
  neon: number
): void {
  const hh = hw * 0.5;
  g.poly([
    cx - hw, y - 5,
    cx, y - 5 + hh,
    cx, y + hh,
    cx - hw, y,
  ]).fill({ color: shade(neon, 1.25), alpha: 0.9 });
  g.poly([
    cx + hw, y - 5,
    cx, y - 5 + hh,
    cx, y + hh,
    cx + hw, y,
  ]).fill({ color: shade(neon, 1.45), alpha: 0.95 });
  g.moveTo(cx - hw, y).lineTo(cx, y + hh).lineTo(cx + hw, y)
    .stroke({ width: 1, color: 0xffffff, alpha: 0.8 });
}

/** Tapering spire crown for grand bodies: stacked shrinking boxes + tip. */
function drawGrandSpire(
  g: Graphics,
  e: Graphics,
  cx: number,
  topY: number,
  w: number,
  height: number,
  color: number,
  neon: number
): void {
  const segs = 3;
  let y = topY;
  let hw = w;
  for (let i = 0; i < segs; i++) {
    const segH = (height * (i + 1)) / (segs * (segs + 1) / 2 + segs);
    drawIsoBox(g, cx, y, hw, hw * 0.5, segH, shade(color, 1.1 + i * 0.15), 1, neon);
    y -= segH;
    hw *= 0.62;
  }
  // Crystal tip.
  g.poly([cx, y - 12, cx + 5, y - 2, cx, y + 2, cx - 5, y - 2])
    .fill({ color: shade(neon, 1.5), alpha: 0.95 });
  e.circle(cx, y - 13, 2).fill({ color: 0xffffff, alpha: 0.95 });
}

// ── the six profession families + neutral cube ────────────────────────────

/**
 * Cryptographer — ENCRYPTION VAULT / shield lattice: the widest, squattest
 * silhouette with a rounded dome (instantly distinct from every tower form).
 * GRAND league: the VAULT CITADEL — chamfered glass drum in chroma material,
 * ring buttresses, sky-lobby band and the double-shell shield dome with
 * orbiting shield satellites and a keyhole mega-finial.
 */
const cryptographerArt: FamilyArtSpec = {
  family: "Cryptographer",
  color: FAMILY_NEON["Cryptographer"],
  mass: FAMILY_MASS["Cryptographer"],
  baseH: 30,
  floorH: 11,
  grandBaseH: 112,
  grandFloorH: 14,
  drawBase(g, e) {
    // Wide low octagonal vault pad — noticeably wider than other families.
    drawOctagonPad(g, 0, 0, PLATFORM_HALF_W * 0.98, PLATFORM_HALF_H * 0.98, this.baseH, this.mass);
    // Shield-lattice band around the pad (emissive — the vault's live field).
    e.ellipse(0, -2, PLATFORM_HALF_W * 0.9, PLATFORM_HALF_H * 0.9)
      .stroke({ width: 2, color: shade(this.color, 1.35), alpha: 0.75 });
    drawDome(g, 0, -this.baseH, PLATFORM_HALF_W * 0.52, 6, 20, this.mass);
  },
  drawFloor(g, e, floor) {
    const y = -this.baseH - (floor - 2) * this.floorH;
    // Concentric shrinking octagon plates — stepped vault tiers.
    const shrink = 1 - (floor - 1) * 0.1;
    drawOctagonPad(g, 0, y, PLATFORM_HALF_W * 0.85 * shrink, PLATFORM_HALF_H * 0.85 * shrink, this.floorH, this.mass);
    // Lattice brace on each new plate (emissive).
    e.ellipse(0, y - this.floorH, PLATFORM_HALF_W * 0.6 * shrink, PLATFORM_HALF_H * 0.6 * shrink)
      .stroke({ width: 1.5, color: shade(this.color, 1.4), alpha: 0.65 });
  },
  drawRooftop(g, e, tier) {
    const top = -familyTopHeight(this.family, tier);
    // The dome rides the top plate.
    drawDome(g, 0, top, PLATFORM_HALF_W * (0.5 - tier * 0.02), 5, 16, this.mass);
    // Keyhole finial — the family's rooftop marker (emissive).
    e.circle(0, top - 20, 2).fill({ color: shade(this.color, 1.5) });
  },
  drawGrand(g, e, step, seed) {
    const neon = this.color;
    const glass = mixRGB(this.mass, neon, 0.38);
    const H = this.grandBaseH + step * this.grandFloorH;
    const hw = PLATFORM_HALF_W;
    const hh = PLATFORM_HALF_H;

    // Grand podium — two chamfered plates, live lattice arcs.
    drawOctagonPad(g, 0, 0, hw * 0.98, hh * 0.98, 16, shade(this.mass, 0.9));
    e.ellipse(0, -4, hw * 0.88, hh * 0.88).stroke({ width: 2, color: shade(neon, 1.35), alpha: 0.7 });
    drawOctagonPad(g, 0, -16, hw * 0.84, hh * 0.84, 13, shade(this.mass, 1.08));
    e.ellipse(0, -19, hw * 0.74, hh * 0.74).stroke({ width: 1.5, color: shade(neon, 1.45), alpha: 0.6 });

    // Corner annex vaults (step 2+) — domed pods flanking the drum.
    if (step >= 2) {
      for (const dx of [-hw * 0.8, hw * 0.8]) {
        drawIsoBox(g, dx, -12, hw * 0.2, hh * 0.2, 16, shade(this.mass, 1.0), 1, neon);
        drawDome(g, dx, -28, hw * 0.16, 4, 11, shade(this.mass, 1.35));
        e.circle(dx, -42, 1.7).fill({ color: shade(neon, 1.6) });
      }
    }

    // Central shield drum — chroma glass with a curtain window field.
    const drumBase = -29;
    const domeH = Math.min(40, 26 + step * 2.5);
    const drumH = H - 29 - 18 - domeH;
    drawOctagonPad(g, 0, drumBase, hw * 0.66, hh * 0.66, drumH, glass);
    drawGrandWindows(e, 0, drumBase, hw * 0.58, drumH - 4, 4 + Math.min(4, Math.floor(step / 2)), seed);

    // Ring buttresses — emissive hoops up the drum.
    const hoops = 2 + Math.floor(step / 2);
    for (let i = 0; i < hoops; i++) {
      const y = drumBase - (drumH * (i + 1)) / (hoops + 1);
      e.ellipse(0, y, hw * 0.72, hh * 0.72).stroke({ width: 1.5, color: shade(neon, 1.5), alpha: 0.55 });
    }
    // Sky-lobby glow band at the drum top.
    drawGlowBand(g, 0, drumBase - drumH + 5, hw * 0.6, neon);

    // The shield dome (double shell at step 4+).
    const domeY = drumBase - drumH;
    drawDome(g, 0, domeY, hw * 0.6, 6, domeH, shade(this.mass, 1.15));
    if (step >= 4) {
      drawDome(g, 0, domeY - 2, hw * 0.42, 4, domeH * 0.7, mixRGB(shade(this.mass, 1.3), neon, 0.25));
    }
    e.ellipse(0, domeY - domeH * 0.55, hw * 0.52, hh * 0.4)
      .stroke({ width: 1.5, color: shade(neon, 1.5), alpha: 0.75 });

    // Orbiting shield satellites (step 3+).
    if (step >= 3) {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 + 0.4;
        const sx = hw * 0.78 * Math.cos(a);
        const sy = domeY - domeH * 0.2 + hh * 0.5 * Math.sin(a);
        e.poly([sx, sy - 6, sx + 4, sy, sx, sy + 5, sx - 4, sy])
          .fill({ color: shade(neon, 1.4), alpha: 0.9 });
      }
    }

    // Crown ring (step 5+) + keyhole mega-finial (step 6).
    const topY = domeY - domeH;
    if (step >= 5) {
      e.ellipse(0, topY + 2, hw * 0.5, hh * 0.5)
        .stroke({ width: 2, color: shade(neon, 1.55), alpha: 0.8 });
    }
    if (step >= 6) {
      g.rect(-3, topY - 14, 6, 10).fill({ color: shade(this.mass, 1.5) });
      e.circle(0, topY - 4, 2.6).fill({ color: shade(neon, 1.7) });
      e.circle(0, topY - 14, 2.2).fill({ color: 0xffffff, alpha: 0.95 });
    } else {
      e.circle(0, topY - 4, 2.2).fill({ color: shade(neon, 1.6) });
    }
  },
};

/**
 * Zero-Day — BREACH GATEWAY: two slim pillars + a spanning beam with a hollow
 * center — the only silhouette with visible negative space through it.
 * GRAND league: the MEGA GATE — twin chroma-glass pillars with window fields,
 * a stacked exploit-beam lattice across the hollow, strut fins, the enlarged
 * breach shard with its orbit ring, and a crown bridge under twin apex masts.
 */
const zeroDayArt: FamilyArtSpec = {
  family: "Zero-Day",
  color: FAMILY_NEON["Zero-Day"],
  mass: FAMILY_MASS["Zero-Day"],
  baseH: 36,
  floorH: 14,
  grandBaseH: 134,
  grandFloorH: 16,
  drawBase(g, e) {
    // Pillars are deliberately WIDE with a hollow gap — the negative space
    // is the family signature and must read at world zoom too.
    const w = PLATFORM_HALF_W * 0.38;
    const h = PLATFORM_HALF_H * 0.38;
    drawIsoBox(g, -PLATFORM_HALF_W * 0.52, 0, w, h, this.baseH, this.mass, 1, this.color);
    drawIsoBox(g, PLATFORM_HALF_W * 0.52, 0, w, h, this.baseH, this.mass, 1, this.color);
    // Chunky spanning exploit beam across the top (massing, neon-rimmed).
    drawIsoBox(g, 0, -this.baseH, PLATFORM_HALF_W * 0.9, PLATFORM_HALF_H * 0.9, 9, shade(this.mass, 1.45), 1, this.color);
    // Twin cap beacons on the beam — the "two lights" silhouette tell.
    e.circle(-PLATFORM_HALF_W * 0.52, -this.baseH - 12, 2.4).fill({ color: shade(this.color, 1.7) });
    e.circle(PLATFORM_HALF_W * 0.52, -this.baseH - 12, 2.4).fill({ color: shade(this.color, 1.7) });
    // Breach shard floating in the gateway mouth (emissive hazard).
    e.poly([0, -8, 7, -20, 0, -32, -7, -20]).fill({ color: shade(this.color, 0.9), alpha: 0.85 });
    e.poly([0, -8, 7, -20, 0, -32, -7, -20]).stroke({ width: 1.5, color: shade(this.color, 1.5), alpha: 0.9 });
  },
  drawFloor(g, e, floor) {
    const y = -this.baseH - (floor - 2) * this.floorH;
    const w = PLATFORM_HALF_W * 0.38;
    const h = PLATFORM_HALF_H * 0.38;
    // Pillars keep growing; every floor adds a beam slab → layered gateway.
    drawIsoBox(g, -PLATFORM_HALF_W * 0.52, y, w, h, this.floorH, this.mass, 1, this.color);
    drawIsoBox(g, PLATFORM_HALF_W * 0.52, y, w, h, this.floorH, this.mass, 1, this.color);
    drawIsoBox(g, 0, y - this.floorH, PLATFORM_HALF_W * (0.86 - floor * 0.03), PLATFORM_HALF_H * (0.86 - floor * 0.03), 6, shade(this.mass, 1.35), 1, this.color);
  },
  drawRooftop(g, e, tier) {
    const top = -familyTopHeight(this.family, tier);
    // Warning-triangle beacon on the beam — rooftop marker (emissive).
    e.poly([0, top - 18, 6, top - 9, -6, top - 9])
      .stroke({ width: 1.5, color: shade(this.color, 1.5) })
      .fill({ color: shade(this.color, 0.7), alpha: 0.55 });
  },
  drawGrand(g, e, step, seed) {
    const neon = this.color;
    const H = this.grandBaseH + step * this.grandFloorH;
    const hw = PLATFORM_HALF_W;
    const hh = PLATFORM_HALF_H;

    // Twin mega-pillars in chroma breach glass, window field on each.
    const pw = hw * 0.4;
    const px = hw * 0.56;
    const shaftH = H - 26;
    drawIsoBox(g, -px, 0, pw, hh * 0.4, shaftH, mixRGB(this.mass, neon, 0.4), 1, neon);
    drawIsoBox(g, px, 0, pw, hh * 0.4, shaftH, mixRGB(this.mass, neon, 0.4), 1, neon);
    const winRows = 5 + Math.min(5, step);
    drawGrandWindows(e, -px, 0, pw * 0.78, shaftH - 10, winRows, seed);
    drawGrandWindows(e, px, 0, pw * 0.78, shaftH - 10, winRows, seed + 77);

    // Exploit beam shelves across the hollow — the layered gateway stack.
    const beams = 2 + Math.floor(step / 2);
    for (let i = 0; i < beams; i++) {
      const by = -(shaftH * (i + 1)) / (beams + 1);
      drawIsoBox(g, 0, by, hw * 0.86, hh * 0.86, 8, shade(this.mass, 1.4), 1, neon);
      e.rect(-hw * 0.5, by - 5, hw, 1.6).fill({ color: shade(neon, 1.5), alpha: 0.85 });
    }

    // Side strut fins (step 2+) brace the pillars.
    if (step >= 2) {
      for (const dx of [-px - pw * 0.9, px + pw * 0.9]) {
        g.moveTo(dx, 0).lineTo(dx, -shaftH * 0.7)
          .stroke({ width: 3, color: shade(this.mass, 1.25) });
        e.moveTo(dx, -shaftH * 0.35).lineTo(dx, -shaftH * 0.62)
          .stroke({ width: 1.2, color: shade(neon, 1.4), alpha: 0.8 });
      }
    }

    // The breach shard — enlarged, hotter, ringed (step 3+).
    e.poly([0, -14, 11, -shaftH * 0.55, 0, -shaftH - 14, -11, -shaftH * 0.55])
      .fill({ color: shade(neon, 0.95), alpha: 0.9 });
    e.poly([0, -14, 11, -shaftH * 0.55, 0, -shaftH - 14, -11, -shaftH * 0.55])
      .stroke({ width: 2, color: shade(neon, 1.6), alpha: 0.95 });
    if (step >= 3) {
      e.ellipse(0, -shaftH * 0.5, hw * 0.5, hh * 0.5)
        .stroke({ width: 1.5, color: shade(neon, 1.5), alpha: 0.7 });
    }

    // Crown bridge + warning beacons over both pillar caps.
    drawIsoBox(g, 0, -shaftH, hw * 0.92, hh * 0.92, 10, shade(this.mass, 1.5), 1, neon);
    drawGlowBand(g, 0, -shaftH + 2, hw * 0.78, neon);
    e.circle(-px, -shaftH - 13, 2.6).fill({ color: shade(neon, 1.7) });
    e.circle(px, -shaftH - 13, 2.6).fill({ color: shade(neon, 1.7) });

    // Twin apex masts (step 4+).
    if (step >= 4) {
      for (const dx of [-px, px]) {
        e.moveTo(dx, -shaftH - 10).lineTo(dx, -shaftH - 24)
          .stroke({ width: 1.5, color: shade(neon, 1.3) });
        e.circle(dx, -shaftH - 25, 1.8).fill({ color: 0xffffff, alpha: 0.95 });
      }
    }
    // Standing gate ring (step 6) — a vertical halo inside the mouth.
    if (step >= 6) {
      e.ellipse(0, -shaftH * 0.55, 3.5, shaftH * 0.34)
        .stroke({ width: 2, color: shade(neon, 1.65), alpha: 0.9 });
    }
  },
};

/**
 * Overclocker — REACTOR TOWER: the only round tower — a central cylinder
 * wrapped in glowing energy coil rings.
 * GRAND league: the GRAND REACTOR — a wide chroma core on a containment
 * plinth with flanking heat stacks, an emission-fin body, a densifying coil
 * ladder, mid-core glow band, plasma crown with halo rings, a tri-coil
 * cluster and (at the top step) the plasma lance.
 */
const overclockerArt: FamilyArtSpec = {
  family: "Overclocker",
  color: FAMILY_NEON["Overclocker"],
  mass: FAMILY_MASS["Overclocker"],
  baseH: 42,
  floorH: 13,
  grandBaseH: 136,
  grandFloorH: 14,
  drawBase(g, e) {
    // Footing plinth + the reactor core cylinder.
    drawIsoBox(g, 0, 0, PLATFORM_HALF_W * 0.7, PLATFORM_HALF_H * 0.7, 8, shade(this.mass, 0.8));
    drawCylinder(g, 0, -6, PLATFORM_HALF_W * 0.42, PLATFORM_HALF_H * 0.42, this.baseH, this.mass);
    drawCoil(e, 0, -6 - this.baseH * 0.45, PLATFORM_HALF_W * 0.56, PLATFORM_HALF_H * 0.56, this.color);
    drawCoil(e, 0, -6 - this.baseH * 0.8, PLATFORM_HALF_W * 0.54, PLATFORM_HALF_H * 0.54, this.color);
  },
  drawFloor(g, e, floor) {
    const y = -6 - this.baseH - (floor - 2) * this.floorH;
    // Core extends; coils arrive every OTHER floor (gate: full-coil stacks
    // read as ring bundles — the reactor massing must stay legible).
    drawCylinder(g, 0, y, PLATFORM_HALF_W * (0.42 - floor * 0.012), PLATFORM_HALF_H * (0.42 - floor * 0.012), this.floorH, this.mass);
    if (floor % 2 === 1) {
      drawCoil(e, 0, y - this.floorH * 0.55, PLATFORM_HALF_W * 0.58, PLATFORM_HALF_H * 0.58, this.color);
    }
  },
  drawRooftop(g, e, tier) {
    const top = -6 - familyTopHeight(this.family, tier);
    // Plasma tip orb — rooftop marker (its glow is the "reactor on" tell).
    e.circle(0, top - 8, 4).fill({ color: shade(this.color, 1.7) });
    e.circle(0, top - 8, 7).stroke({ width: 1.5, color: shade(this.color, 1.3), alpha: 0.8 });
  },
  drawGrand(g, e, step, seed) {
    void seed; // the reactor's light identity is architectural, not mosaic
    const neon = this.color;
    const H = this.grandBaseH + step * this.grandFloorH;
    const hw = PLATFORM_HALF_W;
    const hh = PLATFORM_HALF_H;
    const coreR = hw * 0.5;

    // Containment plinth — wide slab + base ring pair (step 3+).
    drawIsoBox(g, 0, 0, hw * 0.85, hh * 0.85, 12, shade(this.mass, 0.85));
    e.ellipse(0, -6, hw * 0.8, hh * 0.8).stroke({ width: 2, color: shade(neon, 1.35), alpha: 0.7 });
    if (step >= 3) {
      e.ellipse(0, -6, hw * 0.95, hh * 0.95)
        .stroke({ width: 1.5, color: shade(neon, 1.5), alpha: 0.5 });
    }

    // Heat stacks flanking the core (step 1+).
    if (step >= 1) {
      for (const dx of [-hw * 0.82, hw * 0.82]) {
        const stackH = H * 0.55;
        drawCylinder(g, dx, 0, hw * 0.14, hh * 0.14, stackH, shade(this.mass, 1.1));
        e.moveTo(dx, -stackH - 3).lineTo(dx, -stackH - 9)
          .stroke({ width: 1.2, color: shade(neon, 1.3), alpha: 0.7 });
        e.circle(dx, -stackH - 10, 1.8).fill({ color: shade(neon, 1.6) });
      }
    }

    // The reactor core — wide chroma cylinder with emission fins.
    const crownH = 26 + (step >= 6 ? 12 : 0);
    const coreH = H - 12 - crownH;
    drawCylinder(g, 0, -12, coreR, hh * 0.5, coreH, mixRGB(this.mass, neon, 0.3));
    for (let i = 0; i < 3; i++) {
      const fx = (i - 1) * coreR * 0.55;
      e.moveTo(fx, -16).lineTo(fx, -coreH + 6)
        .stroke({ width: 1.4, color: shade(neon, 1.2), alpha: 0.6 });
    }

    // Coil ladder — denser with tier (the reactor climbing to overload).
    const coils = 3 + Math.floor(step * 0.8);
    for (let i = 0; i < coils; i++) {
      const y = -12 - (coreH * (i + 0.7)) / (coils + 0.7);
      drawCoil(e, 0, y, coreR + hw * 0.1, hh * 0.6, neon);
    }
    // Sky-lobby glow band mid-core.
    drawGlowBand(g, 0, -12 - coreH * 0.55, coreR * 0.92, neon);

    // Plasma crown — collar + orb + halo rings.
    const topY = -12 - coreH;
    drawCylinder(g, 0, topY, coreR * 0.45, hh * 0.22, 10, shade(this.mass, 1.4));
    const orbY = topY - 14;
    e.circle(0, orbY, 5).fill({ color: shade(neon, 1.7) });
    e.circle(0, orbY, 9).stroke({ width: 1.5, color: shade(neon, 1.4), alpha: 0.85 });
    if (step >= 2) {
      e.ellipse(0, orbY, 16, 5.5).stroke({ width: 1.5, color: shade(neon, 1.5), alpha: 0.7 });
    }
    if (step >= 5) {
      // Tri-coil crown cluster around the collar.
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        drawCoil(e, coreR * 0.75 * Math.cos(a), topY - 4, hw * 0.16, hh * 0.16, neon);
      }
    }
    if (step >= 6) {
      // Plasma lance — the reactor at full output.
      e.moveTo(0, orbY - 6).lineTo(0, orbY - 20)
        .stroke({ width: 2.5, color: shade(neon, 1.6) });
      e.circle(0, orbY - 21, 3).fill({ color: 0xffffff, alpha: 0.95 });
    }
  },
};

/**
 * Cache Keeper — DATA BANK: offset memory-chip slabs stacked like a ziggurat
 * whose layers slide diagonally — the only asymmetric family silhouette.
 * GRAND league: the GRAND DATA ZIGGURAT — tall chroma chip stack with
 * connector-edge glow rows, dotted data streams down the sides, connector
 * bridges, side chip annexes and a floating bracket-chip cache crown.
 */
const cacheKeeperArt: FamilyArtSpec = {
  family: "Cache Keeper",
  color: FAMILY_NEON["Cache Keeper"],
  mass: FAMILY_MASS["Cache Keeper"],
  baseH: 30,
  floorH: 13,
  grandBaseH: 124,
  grandFloorH: 14,
  drawBase(g, e) {
    // Base chip slab + first offset module (asymmetry starts at tier 1).
    drawIsoBox(g, 0, 0, PLATFORM_HALF_W * 0.8, PLATFORM_HALF_H * 0.8, this.baseH * 0.55, this.mass, 1, this.color);
    drawIsoBox(g, -6, -this.baseH * 0.55, PLATFORM_HALF_W * 0.55, PLATFORM_HALF_H * 0.55, this.baseH * 0.45, shade(this.mass, 1.6), 1, this.color);
    // Chip pins along the base's right edge (emissive connector row).
    e.rect(PLATFORM_HALF_W * 0.5, -10, 8, 2).fill({ color: shade(this.color, 1.5), alpha: 0.9 });
    e.rect(PLATFORM_HALF_W * 0.5, -16, 8, 2).fill({ color: shade(this.color, 1.5), alpha: 0.9 });
  },
  drawFloor(g, e, floor) {
    const y = -this.baseH - (floor - 2) * this.floorH;
    // Alternating diagonal offsets — the memory-stack signature.
    const dx = floor % 2 === 0 ? 7 : -7;
    drawIsoBox(g, dx, y, PLATFORM_HALF_W * (0.62 - floor * 0.02), PLATFORM_HALF_H * (0.62 - floor * 0.02), this.floorH, floor % 2 === 0 ? shade(this.mass, 1.5) : this.mass, 1, this.color);
    // Edge connector dot on every chip (emissive).
    e.circle(dx + PLATFORM_HALF_W * 0.4, y - this.floorH * 0.5, 1.8).fill({ color: shade(this.color, 1.6), alpha: 0.9 });
  },
  drawRooftop(g, e, tier) {
    const top = -familyTopHeight(this.family, tier);
    // Cache-hit cap: bracket chip floating over the stack — rooftop marker.
    e.rect(-5, top - 12, 10, 5).stroke({ width: 1.5, color: shade(this.color, 1.45) }).fill({ color: shade(this.color, 0.7), alpha: 0.45 });
  },
  drawGrand(g, e, step, seed) {
    const neon = this.color;
    const H = this.grandBaseH + step * this.grandFloorH;
    const hw = PLATFORM_HALF_W;
    const hh = PLATFORM_HALF_H;

    // Grand chip stack — big alternating-offset slabs in chroma glass.
    const slabs = 4 + Math.floor(step / 2);
    const slabH = (H - 26) / slabs;
    let y = 0;
    let shrink = 0;
    for (let i = 0; i < slabs; i++) {
      const dx = i % 2 === 0 ? 8 : -8;
      const w = hw * (0.8 - shrink);
      drawIsoBox(
        g,
        dx,
        y,
        w,
        hh * (0.8 - shrink),
        slabH,
        i % 2 === 0 ? mixRGB(this.mass, neon, 0.32) : shade(this.mass, 1.35),
        1,
        neon
      );
      // Edge connector glow row per slab.
      e.rect(dx - w * 0.75, y - slabH * 0.72, w * 1.5, 2)
        .fill({ color: shade(neon, 1.5), alpha: 0.85 });
      y -= slabH;
      shrink += 0.09;
    }
    // Seeded curtain mosaic on the two widest slabs.
    drawGrandWindows(e, 8, 0, hw * 0.7, Math.min(slabH * 2, H - 32), 3 + Math.min(3, step), seed);

    // Data streams — dotted emissive lines down the stack sides.
    const dots = 6 + step;
    for (const dx of [-hw * 0.88, hw * 0.88]) {
      for (let s = 0; s < dots; s++) {
        const sy = -4 - s * ((H - 30) / dots);
        e.circle(dx, sy, 1.3).fill({ color: shade(neon, 1.55), alpha: 0.85 });
      }
    }

    // Connector bridges (step 2+) between slab edges.
    if (step >= 2) {
      e.moveTo(-hw * 0.55, -slabH * 1.2).lineTo(-hw * 0.95, -slabH * 1.2)
        .stroke({ width: 1.5, color: shade(neon, 1.4), alpha: 0.8 });
      e.moveTo(hw * 0.55, -slabH * 2.1).lineTo(hw * 0.95, -slabH * 2.1)
        .stroke({ width: 1.5, color: shade(neon, 1.4), alpha: 0.8 });
    }
    // Side chip annexes (step 4+).
    if (step >= 4) {
      drawIsoBox(g, -hw * 0.92, -slabH * 1.5, hw * 0.18, hh * 0.18, 12, shade(this.mass, 1.5), 1, neon);
      drawIsoBox(g, hw * 0.92, -slabH * 0.8, hw * 0.18, hh * 0.18, 12, shade(this.mass, 1.5), 1, neon);
    }

    // Cache crown — floating bracket chips stacked (grow with step).
    const topY = y;
    const chips = 1 + Math.floor(step / 3);
    for (let i = 0; i < chips; i++) {
      const cy = topY - 8 - i * 8;
      e.rect(-6 + (i % 2 ? 2 : -2), cy, 12, 5)
        .stroke({ width: 1.5, color: shade(neon, 1.5) })
        .fill({ color: shade(neon, 0.7), alpha: 0.5 });
    }
    if (step >= 6) {
      // Apex ring + white-hot cache-hit bead.
      e.ellipse(0, topY - 6, hw * 0.55, hh * 0.55)
        .stroke({ width: 2, color: shade(neon, 1.6), alpha: 0.85 });
      e.circle(0, topY - 34, 2.4).fill({ color: 0xffffff, alpha: 0.95 });
    }
  },
};

/**
 * Server Marshal — RACK TOWER: the tallest, perfectly uniform-width slab with
 * horizontal rack grooves every floor — the plainest, most rectangular form.
 * GRAND league: the RACK SPIRE — a uniform chroma mega-slab on a command
 * podium, dense LED floors, a setback upper tier behind a sky-lobby glow
 * band, ring balconies and a crown mast array under a diadem ring.
 */
const serverMarshalArt: FamilyArtSpec = {
  family: "Server Marshal",
  color: FAMILY_NEON["Server Marshal"],
  mass: FAMILY_MASS["Server Marshal"],
  baseH: 44,
  floorH: 15,
  grandBaseH: 150,
  grandFloorH: 14,
  drawBase(g, e) {
    // Uniform-width rack slab — NO taper (the anti-vault: tall + rectangular).
    const w = PLATFORM_HALF_W * 0.62;
    const h = PLATFORM_HALF_H * 0.62;
    drawIsoBox(g, 0, 0, w, h, this.baseH, this.mass, 1, this.color);
    // Rack groove lines (LED strip look) — emissive.
    for (let i = 1; i <= 2; i++) {
      e.rect(-w * 0.7, -i * 12, w * 1.4, 2).fill({ color: shade(this.color, 1.5), alpha: 0.85 });
    }
  },
  drawFloor(g, e, floor) {
    const y = -this.baseH - (floor - 2) * this.floorH;
    // Identical rack units stacked — width never changes.
    const w = PLATFORM_HALF_W * 0.62;
    const h = PLATFORM_HALF_H * 0.62;
    drawIsoBox(g, 0, y, w, h, this.floorH, this.mass, 1, this.color);
    e.rect(-w * 0.7, y - this.floorH * 0.65, w * 1.4, 2).fill({ color: shade(this.color, 1.5), alpha: 0.85 });
    e.circle(w * 0.45, y - this.floorH * 0.4, 1.6).fill({ color: shade(this.color, 1.7), alpha: 0.95 });
  },
  drawRooftop(g, e, tier) {
    const top = -familyTopHeight(this.family, tier);
    // Antenna ARRAY (three masts) — the command-center rooftop marker.
    for (const dx of [-8, 0, 8]) {
      e.moveTo(dx, top).lineTo(dx, top - 10).stroke({ width: 1.5, color: shade(this.color, 1.35) });
      e.circle(dx, top - 11, 1.4).fill({ color: shade(this.color, 1.6) });
    }
  },
  drawGrand(g, e, step, seed) {
    const neon = this.color;
    const H = this.grandBaseH + step * this.grandFloorH;
    const hw = PLATFORM_HALF_W;
    const hh = PLATFORM_HALF_H;

    // Podium — wide command base with an entry LED line.
    drawIsoBox(g, 0, 0, hw * 0.92, hh * 0.92, 18, shade(this.mass, 0.9), 1, neon);
    e.rect(-hw * 0.6, -14, hw * 1.2, 2).fill({ color: shade(neon, 1.5), alpha: 0.9 });

    // Main rack shaft — uniform width, dense LED floors, curtain mosaic.
    const shaftBase = -18;
    const lowerH = H * 0.62 - 18;
    drawIsoBox(g, 0, shaftBase, hw * 0.66, hh * 0.66, lowerH, mixRGB(this.mass, neon, 0.28), 1, neon);
    const ledRows = 6 + step;
    for (let i = 0; i < ledRows; i++) {
      const ly = shaftBase - 6 - i * ((lowerH - 12) / ledRows);
      e.rect(-hw * 0.46, ly, hw * 0.92, 2).fill({ color: shade(neon, 1.55), alpha: 0.9 });
    }
    drawGrandWindows(e, 0, shaftBase, hw * 0.58, lowerH - 6, 4 + Math.min(4, step), seed);

    // Upper tier — narrower rack climbing to the crown (setback from step 2).
    const shoulderY = shaftBase - lowerH;
    drawGlowBand(g, 0, shoulderY + 4, hw * 0.6, neon);
    const upperW = hw * (step >= 2 ? 0.5 : 0.66);
    const upperH = H - 18 - lowerH - 26;
    drawIsoBox(g, 0, shoulderY, upperW, hh * (upperW / hw), upperH, shade(this.mass, 1.3), 1, neon);
    const upRows = 3 + Math.floor(step / 2);
    for (let i = 0; i < upRows; i++) {
      const ly = shoulderY - 6 - i * ((upperH - 10) / upRows);
      e.rect(-upperW * 0.7, ly, upperW * 1.4, 2).fill({ color: shade(neon, 1.55), alpha: 0.9 });
    }

    // Ring balconies (step 3+ / 5+) around the lower shaft.
    if (step >= 3) {
      e.ellipse(0, shaftBase - lowerH * 0.45, hw * 0.74, hh * 0.74)
        .stroke({ width: 1.5, color: shade(neon, 1.45), alpha: 0.6 });
    }
    if (step >= 5) {
      e.ellipse(0, shaftBase - lowerH * 0.8, hw * 0.72, hh * 0.72)
        .stroke({ width: 1.5, color: shade(neon, 1.5), alpha: 0.55 });
    }

    // Crown mast array (3 → 5 at step 4+) + diadem ring + beacon (step 6).
    const topY = shoulderY - upperH;
    const masts = step >= 4 ? 5 : 3;
    for (let i = 0; i < masts; i++) {
      const mx = (i - (masts - 1) / 2) * (upperW * 0.45);
      e.moveTo(mx, topY).lineTo(mx, topY - 12).stroke({ width: 1.5, color: shade(neon, 1.35) });
      e.circle(mx, topY - 13, 1.6).fill({ color: shade(neon, 1.65) });
    }
    if (step >= 6) {
      e.ellipse(0, topY - 4, upperW * 0.9, hh * 0.5)
        .stroke({ width: 2, color: shade(neon, 1.6), alpha: 0.85 });
      e.circle(0, topY - 22, 2.6).fill({ color: 0xffffff, alpha: 0.95 });
      e.circle(0, topY - 22, 5).stroke({ width: 1.5, color: shade(neon, 1.5), alpha: 0.85 });
    }
  },
};

/**
 * Bot Herder — DRONE FACTORY: a wide low hangar with two attached side bays —
 * the only tri-lobed (center + flanks) massing, wide like the vault but flat.
 * GRAND league: the DRONE NEXUS — a tall tri-lobed mega-hangar in chroma
 * glass, rows of bay doors, rooftop landing rings, perch masts, a signal
 * dish, a gantry crane and (at the top step) the traffic-control nexus ring.
 */
const botHerderArt: FamilyArtSpec = {
  family: "Bot Herder",
  color: FAMILY_NEON["Bot Herder"],
  mass: FAMILY_MASS["Bot Herder"],
  baseH: 26,
  floorH: 12,
  grandBaseH: 116,
  grandFloorH: 13,
  drawBase(g, e) {
    // Central hangar (wide + low)…
    drawIsoBox(g, 0, 0, PLATFORM_HALF_W * 0.6, PLATFORM_HALF_H * 0.6, this.baseH, this.mass, 1, this.color);
    // …flanked by two BIG bot bays, pushed wide — the tri-lobed signature
    // must be legible at world zoom (small bays blurred into one blob).
    drawIsoBox(g, -PLATFORM_HALF_W * 0.78, 4, PLATFORM_HALF_W * 0.32, PLATFORM_HALF_H * 0.32, this.baseH * 0.75, shade(this.mass, 0.85), 1, shade(this.color, 0.8));
    drawIsoBox(g, PLATFORM_HALF_W * 0.78, 4, PLATFORM_HALF_W * 0.32, PLATFORM_HALF_H * 0.32, this.baseH * 0.75, shade(this.mass, 0.85), 1, shade(this.color, 0.8));
    // Bay door slits — one per lobe (emissive warm-lit strips).
    for (const dx of [-PLATFORM_HALF_W * 0.78, 0, PLATFORM_HALF_W * 0.78]) {
      e.rect(dx - 3, -this.baseH * 0.45, 6, 2).fill({ color: shade(this.color, 1.55), alpha: 0.95 });
    }
  },
  drawFloor(g, e, floor) {
    const y = -this.baseH - (floor - 2) * this.floorH;
    // Hangar grows; the bays grow with it every other floor.
    drawIsoBox(g, 0, y, PLATFORM_HALF_W * (0.6 - floor * 0.015), PLATFORM_HALF_H * (0.6 - floor * 0.015), this.floorH, this.mass, 1, this.color);
    if (floor % 2 === 0) {
      drawIsoBox(g, -PLATFORM_HALF_W * 0.8, y + 4, PLATFORM_HALF_W * 0.3, PLATFORM_HALF_H * 0.3, this.floorH * 0.85, shade(this.mass, 0.85), 1, shade(this.color, 0.8));
      drawIsoBox(g, PLATFORM_HALF_W * 0.8, y + 4, PLATFORM_HALF_W * 0.3, PLATFORM_HALF_H * 0.3, this.floorH * 0.85, shade(this.mass, 0.85), 1, shade(this.color, 0.8));
    }
  },
  drawRooftop(g, e, tier) {
    const top = -familyTopHeight(this.family, tier);
    // Drone landing pad ring + node sigil — rooftop marker (emissive).
    e.ellipse(0, top - 4, 11, 5.5).stroke({ width: 1.5, color: shade(this.color, 1.4), alpha: 0.95 });
    e.circle(0, top - 4, 2.2).fill({ color: shade(this.color, 1.6) });
  },
  drawGrand(g, e, step, seed) {
    const neon = this.color;
    const H = this.grandBaseH + step * this.grandFloorH;
    const hw = PLATFORM_HALF_W;
    const hh = PLATFORM_HALF_H;

    // Tri-lobed mega-hangar — wide chroma center + two BIG flank bays.
    const centerH = H - 40;
    const bayH = centerH * 0.66;
    drawIsoBox(g, 0, 0, hw * 0.62, hh * 0.62, centerH, mixRGB(this.mass, neon, 0.3), 1, neon);
    drawIsoBox(g, -hw * 0.8, 4, hw * 0.34, hh * 0.34, bayH, shade(this.mass, 0.95), 1, shade(neon, 0.85));
    drawIsoBox(g, hw * 0.8, 4, hw * 0.34, hh * 0.34, bayH, shade(this.mass, 0.95), 1, shade(neon, 0.85));

    // Bay door slits — more with tier (the nexus at full throughput).
    const doors = 3 + Math.floor(step / 2);
    for (let i = 0; i < doors; i++) {
      const which = [-hw * 0.8, 0, hw * 0.8][i % 3];
      const dy = -8 - Math.floor(i / 3) * 14;
      e.rect(which - 4, dy, 8, 2.5).fill({ color: shade(neon, 1.6), alpha: 0.95 });
    }

    // Hangar curtain mosaic + roof glow band.
    drawGrandWindows(e, 0, 0, hw * 0.54, centerH - 8, 4 + Math.min(4, step), seed);
    drawGlowBand(g, 0, -centerH + 6, hw * 0.55, neon);

    // Rear pods (step 2+) — extra drone berths on the shoulders.
    if (step >= 2) {
      drawIsoBox(g, -hw * 0.45, -centerH * 0.55, hw * 0.2, hh * 0.2, 14, shade(this.mass, 1.2), 1, neon);
      drawIsoBox(g, hw * 0.45, -centerH * 0.55, hw * 0.2, hh * 0.2, 14, shade(this.mass, 1.2), 1, neon);
    }

    // Rooftop landing rings — stacked, one more every other step.
    const topY = -centerH;
    const rings = 1 + Math.floor(step / 2);
    for (let i = 0; i < rings; i++) {
      const ry = topY - 3 - i * 7;
      const rx = Math.max(6, hw * (0.34 - i * 0.09));
      e.ellipse(0, ry, rx, rx * 0.5)
        .stroke({ width: 1.5, color: shade(neon, 1.45), alpha: 0.9 });
    }
    e.circle(0, topY - 4, 2.2).fill({ color: shade(neon, 1.65) });

    // Perch masts (step 3+).
    if (step >= 3) {
      for (const dx of [-hw * 0.4, hw * 0.4]) {
        e.moveTo(dx, topY - 2).lineTo(dx, topY - 14)
          .stroke({ width: 1.5, color: shade(neon, 1.3) });
        e.circle(dx, topY - 15, 1.7).fill({ color: shade(neon, 1.6) });
      }
    }
    // Signal dish (step 4+).
    if (step >= 4) {
      e.arc(hw * 0.5, topY - 8, 7, -Math.PI * 0.9, -Math.PI * 0.2)
        .stroke({ width: 1.5, color: shade(neon, 1.5), alpha: 0.9 });
      e.circle(hw * 0.5, topY - 8, 1.6).fill({ color: shade(neon, 1.65) });
    }
    // Gantry crane (step 5+) over the center roof.
    if (step >= 5) {
      e.moveTo(-hw * 0.5, topY - 16).lineTo(hw * 0.5, topY - 16)
        .stroke({ width: 2, color: shade(neon, 1.4), alpha: 0.9 });
      e.moveTo(-hw * 0.32, topY - 16).lineTo(-hw * 0.32, topY - 6)
        .stroke({ width: 1.5, color: shade(neon, 1.3), alpha: 0.8 });
    }
    // Nexus ring (step 6) — the whole roof reads as one traffic halo.
    if (step >= 6) {
      e.ellipse(0, topY - 10, hw * 0.85, hh * 0.85)
        .stroke({ width: 2, color: shade(neon, 1.6), alpha: 0.85 });
      e.circle(0, topY - 30, 2.6).fill({ color: 0xffffff, alpha: 0.95 });
    }
  },
};

/** Unassigned — neutral stepped cube (the Phase B placeholder, unchanged).
 *  GRAND league: a stepped chroma mega-mast with halo rings and a spire. */
const unassignedArt: FamilyArtSpec = {
  family: UNASSIGNED_FAMILY,
  color: UNASSIGNED_NEON,
  mass: UNASSIGNED_MASS,
  baseH: 36,
  floorH: 14,
  grandBaseH: 130,
  grandFloorH: 12,
  drawBase(g) {
    drawIsoBox(g, 0, 0, PLATFORM_HALF_W * 0.82, PLATFORM_HALF_H * 0.82, this.baseH, this.mass, 1, this.color);
  },
  drawFloor(g, e, floor) {
    const shrink = (floor - 1) * 0.07;
    drawIsoBox(
      g,
      0,
      -this.baseH - (floor - 2) * this.floorH,
      PLATFORM_HALF_W * (0.82 - shrink),
      PLATFORM_HALF_H * (0.82 - shrink),
      this.floorH,
      this.mass,
      0.96,
      this.color
    );
  },
  drawRooftop() {
    /* neutral cube carries no marker */
  },
  drawGrand(g, e, step, seed) {
    const H = this.grandBaseH + step * this.grandFloorH;
    const hw = PLATFORM_HALF_W;
    const hh = PLATFORM_HALF_H;
    const glass = mixRGB(this.mass, this.color, 0.25);

    // Stepped mega-mast: four shrinking decks in chroma glass.
    const decks = 4;
    const deckH = (H - 30) / decks;
    let y = 0;
    let w = 0.85;
    for (let i = 0; i < decks; i++) {
      drawIsoBox(g, 0, y, hw * w, hh * w, deckH, i === 0 ? this.mass : shade(glass, 1 + i * 0.12), 1, this.color);
      if (i >= 1) {
        e.ellipse(0, y + 2, hw * w * 0.9, hh * w * 0.9)
          .stroke({ width: 1.2, color: shade(this.color, 1.4), alpha: 0.5 });
      }
      y -= deckH;
      w -= 0.16;
    }
    drawGrandWindows(e, 0, 0, hw * 0.72, deckH * 2, 4 + Math.min(4, step), seed);

    // Halo rings up the mast + the spire crown.
    const topY = y;
    if (step >= 1) {
      e.ellipse(0, topY + deckH, hw * 0.62, hh * 0.62)
        .stroke({ width: 1.5, color: shade(this.color, 1.45), alpha: 0.6 });
    }
    if (step >= 3) {
      e.ellipse(0, topY + deckH * 2, hw * 0.66, hh * 0.66)
        .stroke({ width: 1.5, color: shade(this.color, 1.5), alpha: 0.55 });
    }
    drawGrandSpire(g, e, 0, topY, hw * 0.3, 22, this.mass, this.color);
    if (step >= 6) {
      e.ellipse(0, topY - 4, hw * 0.75, hh * 0.75)
        .stroke({ width: 2, color: shade(this.color, 1.6), alpha: 0.85 });
      e.circle(0, topY - 34, 2.4).fill({ color: 0xffffff, alpha: 0.95 });
    }
  },
};

/**
 * THE MANIFEST. Keyed by DB profession name (or UNASSIGNED_FAMILY); unknown
 * professions fall back to the neutral cube. Each spec owns BOTH leagues of
 * its family: the civic stack (drawBase/drawFloor/drawRooftop, tiers 1–7)
 * and the grand megaform (drawGrand, tiers 8–14).
 */
export const CITY_ART_MANIFEST: Readonly<Record<string, FamilyArtSpec>> = Object.freeze({
  Cryptographer: cryptographerArt,
  "Zero-Day": zeroDayArt,
  Overclocker: overclockerArt,
  "Cache Keeper": cacheKeeperArt,
  "Server Marshal": serverMarshalArt,
  "Bot Herder": botHerderArt,
  [UNASSIGNED_FAMILY]: unassignedArt,
});

/** Manifest lookup for any building (unknown → neutral cube). */
export function familyArt(profession: string | null): FamilyArtSpec {
  if (!profession) return unassignedArt;
  return CITY_ART_MANIFEST[profession] ?? unassignedArt;
}

// ── shared tier features (civic league, family-agnostic) ──────────────────

/**
 * CIVIC tier 3..7 architectural features — one NEW feature per tier so the
 * ladder reads without labels: antenna (3), side pods (4), halo ring (5),
 * crown (6), megastructure cap (7). The GRAND league (8–14) does NOT call
 * this — each family's drawGrand() megaform is self-contained. Bodies draw
 * into `g` (mass), lights into `e` (neon).
 */
export function drawTierFeatures(
  g: Graphics,
  e: Graphics,
  profession: string | null,
  tier: BuildingTier
): void {
  const spec = familyArt(profession);
  const neon = spec.color;
  const top = -familyTopHeight(profession, tier);
  const w = PLATFORM_HALF_W;
  const h = PLATFORM_HALF_H;

  if (tier >= 3) {
    // Antenna mast beside the family rooftop (reactor keeps its orb center).
    const ax = spec === overclockerArt ? w * 0.55 : -w * 0.55;
    e.moveTo(ax, top).lineTo(ax, top - 16).stroke({ width: 1.5, color: shade(neon, 1.2), alpha: 0.95 });
    e.circle(ax, top - 17, 1.8).fill({ color: shade(neon, 1.6) });
  }
  if (tier >= 4) {
    // Side pods flanking the base.
    const podY = -Math.min(spec.baseH * 0.5, 14);
    drawIsoBox(g, -w * 0.85, podY, w * 0.2, h * 0.2, 12, shade(spec.mass, 0.95), 1, neon);
    drawIsoBox(g, w * 0.85, podY, w * 0.2, h * 0.2, 12, shade(spec.mass, 0.95), 1, neon);
  }
  if (tier >= 5) {
    // Halo ring around the body's upper third (emissive, thin — must not
    // compete with the family silhouette).
    e.ellipse(0, top * 0.55, w * 0.85, h * 0.85)
      .stroke({ width: 1.5, color: shade(neon, 1.45), alpha: 0.5 });
  }
  if (tier >= 6) {
    // Crown: wider cap plate + corner pins.
    drawIsoBox(g, 0, top - 4, w * 0.7, h * 0.7, 6, shade(spec.mass, 1.6), 1, neon);
    for (const [px, py] of [[-w * 0.6, 0], [w * 0.6, 0], [0, -h * 0.6], [0, h * 0.6]] as const) {
      e.circle(px, top - 10 + py * 0.4, 1.6).fill({ color: shade(neon, 1.6) });
    }
  }
  if (tier >= 7) {
    // Megastructure cap: oversized overshading slab + beacon.
    drawIsoBox(g, 0, top - 12, w * 1.02, h * 1.02, 8, shade(spec.mass, 1.35), 0.96, neon);
    e.circle(0, top - 24, 3).fill({ color: 0xffffff, alpha: 0.95 });
    e.circle(0, top - 24, 6).stroke({ width: 1.5, color: shade(neon, 1.5), alpha: 0.8 });
  }
}

/**
 * Holographic outline preview of a family's NEXT-tier silhouette (upgrade FX
 * step 1): wireframe massing at the toTier height, stroke-only.
 */
export function drawFamilyWireframe(
  g: Graphics,
  profession: string | null,
  toTier: BuildingTier,
  alpha: number
): void {
  const spec = familyArt(profession);
  const height = familyTopHeight(profession, toTier);
  const w = spec === cryptographerArt || spec === botHerderArt
    ? PLATFORM_HALF_W * 0.95
    : PLATFORM_HALF_W * 0.62;
  drawIsoBoxOutline(g, 0, 0, w, w * 0.5, height, spec.color, alpha, 2);
  // Next-floor ghost box on top of the current body.
  drawIsoBoxOutline(g, 0, -height, w * 0.7, w * 0.35, spec.floorH, spec.color, alpha * 0.8, 1.5);
}

// ── shared surface / state layers ─────────────────────────────────────────

/**
 * Dashed straight segment (locked-sector boundaries). Pixi Graphics has no
 * native dash pattern — walk the segment in on/off strides.
 */
export function drawDashedLine(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash: number,
  gap: number,
  stroke: { color: number; alpha: number; width: number }
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= 0) return;
  const ux = dx / len;
  const uy = dy / len;
  let d = 0;
  while (d < len) {
    const end = Math.min(len, d + dash);
    g.moveTo(x1 + ux * d, y1 + uy * d)
      .lineTo(x1 + ux * end, y1 + uy * end)
      .stroke(stroke);
    d = end + gap;
  }
}

/**
 * Static padlock glyph at the center of a LOCKED sector pad (Phase D). No
 * pulse, no animation — reduced-motion safe by construction.
 */
export function drawLockMarker(g: Graphics, cx: number, cy: number): void {
  const color = 0x64748b;
  // Shackle: top half-circle (PI→2PI is the screen-up arc in Pixi angles).
  g.moveTo(cx - 5, cy - 1)
    .arc(cx, cy - 1, 5, Math.PI, Math.PI * 2)
    .stroke({ width: 2, color, alpha: 0.55 });
  // Body plate.
  g.roundRect(cx - 7, cy - 1, 14, 11, 2).fill({ color: 0x0b1220, alpha: 0.8 });
  g.roundRect(cx - 7, cy - 1, 14, 11, 2).stroke({ width: 1.5, color, alpha: 0.55 });
  // Keyhole.
  g.circle(cx, cy + 4, 1.5).fill({ color, alpha: 0.8 });
}

/**
 * Dark plated text chip (the building name-chip style, Phase D sector
 * labels): rounded plate + bold label, anchored at its center. Used for the
 * ONE identity chip per unlocked sector pad at world/district LOD.
 */
export function makeTextChip(
  text: string,
  opts?: { fontSize?: number; fill?: number; borderColor?: number }
): Container {
  const fontSize = opts?.fontSize ?? 11;
  const label = new Text({
    text,
    style: {
      fontFamily: "Arial, sans-serif",
      fontSize,
      fontWeight: "bold",
      letterSpacing: 0.5,
      fill: opts?.fill ?? 0xffffff,
    },
  });
  label.anchor.set(0.5);
  const padX = 10;
  const padY = 5;
  const w = label.width + padX * 2;
  const h = Math.max(label.height, 12) + padY * 2;
  const plate = new Graphics();
  plate.roundRect(-w / 2, -h / 2, w, h, 6).fill({ color: 0x0b1220, alpha: 0.88 });
  plate.roundRect(-w / 2, -h / 2, w, h, 6).stroke({
    width: 1,
    color: opts?.borderColor ?? 0x64748b,
    alpha: 0.85,
  });
  const chip = new Container();
  chip.addChild(plate, label);
  return chip;
}


/**
 * Tile platform — CONCRETE SLAB (normal-city v2, 2026-09-28): plain paving
 * under each building, day and night variants (the scene crossfades the two
 * Graphics by daylight). Replaces the old "wet slab" neon wash + reflection
 * streak — no glow, no family tint; the building carries identity.
 */
export function drawPlatform(
  g: Graphics,
  variant: "day" | "night",
  professioned = false
): void {
  const hw = PLATFORM_HALF_W;
  const hh = PLATFORM_HALF_H;
  const diamond = [0, -hh, hw, 0, 0, hh, -hw, 0];
  if (variant === "day") {
    g.poly(diamond).fill({ color: 0xb4b0a6, alpha: 1 });
    // Sidewalk inner line (slightly darker paving seam).
    g.poly([0, -hh + 3, hw - 5, 0, 0, hh - 3, -hw + 5, 0])
      .stroke({ width: 1, color: 0x9a968c, alpha: 0.7 });
    g.poly(diamond).stroke({ width: 1.5, color: 0x84806f, alpha: 1 });
  } else {
    g.poly(diamond).fill({ color: 0x3d424b, alpha: 1 });
    g.poly([0, -hh + 3, hw - 5, 0, 0, hh - 3, -hw + 5, 0])
      .stroke({ width: 1, color: 0x333841, alpha: 0.7 });
    g.poly(diamond).stroke({ width: 1.5, color: 0x2b3038, alpha: 1 });
  }
  void professioned;
}

// ── facade windows (study §A3) ────────────────────────────────────────────

/** Deterministic RNG (gen-scifi-art precedent: stable across visits). */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Facade profile: which families carry a window GRID on their central mass,
 * and how wide it is. The gateway (hollow) and reactor (round) families are
 * deliberately window-less — their light identity lives in beacons/coils, so
 * the silhouette stays the primary differentiator.
 */
const FACADE: Record<string, { hw: number; cols: number; baseOnly: boolean }> = {
  Cryptographer: { hw: 0.62, cols: 4, baseOnly: false }, // vault pad + plates
  "Cache Keeper": { hw: 0.55, cols: 3, baseOnly: false },
  "Server Marshal": { hw: 0.62, cols: 4, baseOnly: false },
  "Bot Herder": { hw: 0.55, cols: 3, baseOnly: false },
  [UNASSIGNED_FAMILY]: { hw: 0.62, cols: 3, baseOnly: false },
};

/**
 * Seeded window grid on the central massing's two visible faces (study §A3).
 * `seed` (the cardId) makes the lit/unlit pattern stable per building yet
 * varied across the city. Lit windows (warm/cool mix) draw into `gLit` and
 * dark insets into `gDark` — SEPARATE targets so the scene can dim the LIT
 * layer toward a glass sheen at full day while the insets keep the facade
 * textured (engine-audit §3.1; glow = facadeGlowAt(daylight)). Close LOD
 * only (the caller's windows layer).
 */
export function drawFacadeWindows(
  gLit: Graphics,
  gDark: Graphics,
  seed: number,
  tier: BuildingTier,
  profession: string | null
): void {
  // GRAND league bodies draw their own curtain-glass mosaics inside
  // drawGrand() — this grid only exists for the civic league's boxes.
  if (tier >= GRAND_MIN_TIER) return;
  const spec = familyArt(profession);
  const profile = FACADE[spec.family];
  if (!profile) return;
  const rng = mulberry32((seed ^ 0x9e3779b9) | 0);

  const hw = PLATFORM_HALF_W * profile.hw;
  const hh = PLATFORM_HALF_H * profile.hw;
  const bodyH = profile.baseOnly ? spec.baseH : familyTopHeight(profession, tier);
  const rows = Math.max(1, Math.min(6, Math.floor((bodyH - 12) / 12), tier + 1));
  const cols = profile.cols;

  for (let row = 0; row < rows; row++) {
    // Vertical spread: ground-floor shadow to just under the roofline.
    const yOff = 7 + row * ((bodyH - 13) / rows);
    for (let side = -1; side <= 1; side += 2) {
      for (let col = 0; col < cols; col++) {
        const u = 0.18 + (col + 0.5) * (0.64 / cols);
        // Face-space point (left face runs -hw→0 sloping down, right face
        // mirrors) mapped to screen.
        const x = side < 0 ? -hw + u * hw : u * hw;
        const y = -bodyH + u * hh + yOff;
        const r = rng();
        const wW = 4;
        const wH = 4.5;
        const shear = side < 0 ? 0.5 : -0.5; // parallelogram follows the face slope
        const pane = [
          x, y,
          x + wW, y + wW * shear,
          x + wW, y + wW * shear + wH,
          x, y + wH,
        ];
        if (r < 0.62) {
          const r2 = rng();
          const lit = r2 < 0.62 ? 0xffb547 : r2 < 0.9 ? 0xbfd7ff : 0xf2f7ff;
          gLit.poly(pane).fill({ color: lit, alpha: 0.95 });
        } else {
          gDark.poly(pane).fill({ color: shade(spec.mass, 1.9), alpha: 0.5 });
        }
      }
    }
  }
}

// ── rooftop micro-props (study §Track D, 2026-09-27) ──────────────────────

/**
 * Families whose rooftop marker already occupies the crown (mast arrays,
 * orbs, finials) skip the whip antenna so props never hide the family tell.
 */
const WHIP_FAMILIES = new Set(["Cache Keeper", "Bot Herder", UNASSIGNED_FAMILY]);

/**
 * Seeded rooftop clutter at close LOD (study §Track D): AC/vent boxes,
 * whip antennas with blinker LEDs, vent pipes. Deterministic per cardId so
 * a building's clutter is stable across visits; drawn into the caller's
 * close-LOD layer (windows Graphics) so it costs nothing at distance.
 * Family-aware — never covers a family's rooftop marker.
 */
export function drawMicroProps(
  g: Graphics,
  seed: number,
  tier: BuildingTier,
  profession: string | null
): void {
  // Grand crowns are spires, diadems and landing rings — rooftop clutter
  // would float in the air around them. Civic roofs only.
  if (tier >= GRAND_MIN_TIER) return;
  const spec = familyArt(profession);
  const rng = mulberry32((seed ^ 0x51ed270b) | 0);
  const top = -familyTopHeight(profession, tier);
  const w = PLATFORM_HALF_W;
  const h = PLATFORM_HALF_H;

  // AC / vent box on the roof — ~60% of buildings, offset from the marker.
  if (rng() < 0.6) {
    const ax = (rng() * 2 - 1) * w * 0.42;
    const ay = top + (rng() * 2 - 1) * h * 0.3;
    drawIsoBox(g, ax, ay, 4, 2, 5, shade(spec.mass, 1.45), 1, shade(spec.color, 0.9));
    // Status LED on the box front.
    g.circle(ax, ay - 5, 1)
      .fill({ color: rng() < 0.5 ? 0x3ddc97 : 0xe5484d, alpha: 0.95 });
  }

  // Whip antenna with a blinking-red tip — tier 2+, ~35%, marker-free crowns.
  if (tier >= 2 && rng() < 0.35 && WHIP_FAMILIES.has(spec.family)) {
    const wx = (rng() * 2 - 1) * w * 0.5;
    g.moveTo(wx, top).lineTo(wx, top - 9).stroke({ width: 1, color: shade(spec.mass, 2.2) });
    g.circle(wx, top - 10, 1.2).fill({ color: 0xe5484d, alpha: 0.95 });
  }

  // Vent pipes cluster — tier 4+, two short stacks near an edge.
  if (tier >= 4 && rng() < 0.5) {
    const px = w * (rng() < 0.5 ? -0.55 : 0.55);
    for (let i = 0; i < 2; i++) {
      g.rect(px + i * 4, top + i * 2 - 4, 2.5, 5)
        .fill({ color: shade(spec.mass, 1.7), alpha: 0.95 });
    }
  }
}

/**
 * Floating profession sigil over the tower top — one distinct primitive per
 * family (backup identity cue at close LOD; the silhouette is primary).
 */
export function drawIdentityMarker(g: Graphics, profession: string | null, tier: BuildingTier): void {
  const spec = familyArt(profession);
  const color = spec.color;
  const y = -familyTopHeight(profession, tier) - (tier >= 7 ? 34 : 16);
  const ordinal = ["Cryptographer", "Zero-Day", "Overclocker", "Cache Keeper", "Server Marshal", "Bot Herder"].indexOf(spec.family);
  const sigilStroke = { width: 1.5, color, alpha: 0.95 };
  switch (((ordinal % 6) + 6) % 6) {
    case 0: // Cryptographer — keyhole diamond
      g.poly([0, y - 5, 4, y, 0, y + 5, -4, y]).stroke(sigilStroke);
      g.circle(0, y, 1.6).fill({ color });
      break;
    case 1: // Zero-Day — warning triangle
      g.poly([0, y - 5, 5, y + 4, -5, y + 4]).stroke(sigilStroke);
      break;
    case 2: // Overclocker — chevrons up
      g.moveTo(-4, y + 3).lineTo(0, y - 2).lineTo(4, y + 3).stroke(sigilStroke);
      g.moveTo(-4, y - 2).lineTo(0, y - 7).lineTo(4, y - 2).stroke(sigilStroke);
      break;
    case 3: // Cache Keeper — bracket stack
      g.rect(-4, y - 4, 8, 3).stroke(sigilStroke);
      g.rect(-3, y, 6, 3).stroke(sigilStroke);
      break;
    case 4: // Server Marshal — rack bars
      g.moveTo(-5, y - 4).lineTo(5, y - 4).stroke(sigilStroke);
      g.moveTo(-5, y).lineTo(5, y).stroke(sigilStroke);
      g.moveTo(-5, y + 4).lineTo(5, y + 4).stroke(sigilStroke);
      break;
    default: // Bot Herder — node + links
      g.circle(0, y, 2.5).stroke(sigilStroke);
      g.moveTo(-5, y - 4).lineTo(0, y - 2).stroke(sigilStroke);
      g.moveTo(5, y - 4).lineTo(0, y - 2).stroke(sigilStroke);
      break;
  }
}

/** Status ring around the platform (firewall cyan / hard lock amber). */
export function drawStatusRing(g: Graphics, protection: "firewall" | "hardlock" | null): void {
  if (!protection) {
    g.clear();
    return;
  }
  const color = protection === "hardlock" ? COLOR_HARDLOCK : COLOR_FIREWALL;
  const hw = PLATFORM_HALF_W + 5;
  const hh = PLATFORM_HALF_H + 3;
  g.ellipse(0, 0, hw, hh).stroke({ width: 2, color, alpha: 0.9 });
  g.ellipse(0, 0, hw, hh).fill({ color, alpha: 0.08 });
}

/**
 * Selection state — drawn ONLY on the selected building (the layer starts
 * hidden; see BuildingSprite): a brighter platform ring (the at-a-glance
 * ground tell) + corner brackets + an emissive wireframe edge tracing the
 * family body silhouette at its CURRENT tier height.
 */
export function drawSelectionBrackets(
  g: Graphics,
  profession: string | null,
  tier: BuildingTier
): void {
  const hw = PLATFORM_HALF_W + 3;
  const hh = PLATFORM_HALF_H + 2;
  // Brighter platform ring — reads from any zoom angle.
  g.ellipse(0, 0, PLATFORM_HALF_W + 8, PLATFORM_HALF_H + 5)
    .stroke({ width: 2.5, color: COLOR_SELECTION, alpha: 0.95 });
  g.ellipse(0, 0, PLATFORM_HALF_W + 8, PLATFORM_HALF_H + 5)
    .fill({ color: COLOR_SELECTION, alpha: 0.1 });
  const corner = (cx: number, cy: number, dx: number, dy: number) => {
    g.moveTo(cx + dx * 10, cy).lineTo(cx, cy).lineTo(cx, cy + dy * 5).stroke({
      width: 2.5,
      color: COLOR_SELECTION,
      alpha: 1,
    });
  };
  corner(0, -hh, -1, -1);
  corner(hw, 0, 1, -1);
  corner(0, hh, 1, 1);
  corner(-hw, 0, 1, 1);
  // Emissive body edge hugging the family silhouette (soft double stroke
  // reads as glow at placeholder fidelity).
  const bodyH = familyTopHeight(profession, tier);
  drawIsoBoxOutline(
    g,
    0,
    0,
    PLATFORM_HALF_W * 0.88,
    PLATFORM_HALF_H * 0.88,
    bodyH,
    COLOR_SELECTION,
    0.85,
    2
  );
  drawIsoBoxOutline(
    g,
    0,
    0,
    PLATFORM_HALF_W * 0.88,
    PLATFORM_HALF_H * 0.88,
    bodyH,
    COLOR_SELECTION,
    0.28,
    5
  );
}

/**
 * Ghost tile diamond — the validity verdict is a TRANSLUCENT FILL (green =
 * valid, red = invalid), not a thin outline: the fill must read through the
 * faint ghost building above it (ghost alpha is 0.45 for exactly this).
 */
export function drawGhostTile(g: Graphics, valid: boolean): void {
  const hw = PLATFORM_HALF_W + 3;
  const hh = PLATFORM_HALF_H + 2;
  const color = valid ? COLOR_GHOST_VALID : COLOR_GHOST_INVALID;
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).fill({ color, alpha: valid ? 0.55 : 0.5 });
  g.poly([0, -hh, hw, 0, 0, hh, -hw, 0]).stroke({ width: 2.5, color, alpha: 0.95 });
}
