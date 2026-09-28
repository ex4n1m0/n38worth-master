/**
 * Mainframe City — procedural art (client-only, Pixi Graphics).
 *
 * ⚠ PLACEHOLDER_ART: every silhouette here is a procedural stand-in drawn
 * with Pixi Graphics primitives — no spritesheets, no external assets.
 * Real art lands later by filling the `atlasByTier` slots of CITY_ART_MANIFEST
 * (see "Art manifest" below) — components only ever call familyArt(), so the
 * swap touches this module alone (RTS plan §Phase B task 2 / §Phase C).
 *
 * NIGHT RELIGHT (CITY_VISUALS_STUDY §Track A, 2026-09): the reference look
 * is 80% near-black blue mass with family hue carried by EMISSIVES. Every
 * family now renders in a blue-black MASS color (FAMILY_MASS_HEX) with
 * gradient-shaded faces + AO seams, while lit windows / coils / beacons /
 * LED strips draw into a separate EMISSIVE Graphics (`e` params below) in
 * the saturated NEON accent (FAMILY_NEON_HEX) — that layer is what the
 * scene's threshold bloom (Track B) picks up. Faces are vertical
 * FillGradients (lit top → shadowed base), top diamonds carry a faint neon
 * rim (edge-lit architecture), and platforms are WET SLABS (dark fill +
 * accent wash + a vertical reflection streak).
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
 * Tier ladder 1–7 = modular layers (§"Upgrade presentation"): every tier adds
 * one visible structural layer (taller family stack) PLUS one architectural
 * feature — antenna at 3, side pods at 4, halo ring at 5, crown at 6,
 * megastructure cap at 7 — so the tier reads WITHOUT labels at close zoom.
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

/** Flip to wire real art; placeholder drawing stays the default. */
export const PLACEHOLDER_ART = true;

export const COLOR_FIREWALL = 0x22d3ee;
export const COLOR_HARDLOCK = 0xf59e0b;
export const COLOR_SELECTION = 0x4f8dff;
export const COLOR_GHOST_VALID = 0x4ade80;
export const COLOR_GHOST_INVALID = 0xef4444;

/** Night-scene shared colors (study palette canon). */
export const COLOR_VOID = 0x05060a;
export const COLOR_WET_SLAB = 0x0a0e1a;

/** Hex string → 0xRRGGBB (palette lives in the pure district module). */
function hexToRgb(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/**
 * Art manifest — the single (family × tier) registry. Each entry's
 * `atlasByTier` slot (index = tier − 1) is the FUTURE WebP atlas URL for that
 * exact (profession, tier) pair; every slot is null while PLACEHOLDER_ART is
 * on. When real art lands, fill the URLs here and add the texture-loading
 * branch in this module — BuildingSprite and the rest of the scene keep
 * calling familyArt() untouched.
 */
export interface FamilyArtSpec {
  /** DB profession name, or UNASSIGNED_FAMILY. */
  readonly family: string;
  /** Emissive accent (0xRRGGBB) — windows/neon/edges (FAMILY_NEON_HEX). */
  readonly color: number;
  /** Night MASS base (0xRRGGBB) — body faces (FAMILY_MASS_HEX). */
  readonly mass: number;
  /** Future WebP atlas slot per tier 1..7 (null = procedural placeholder). */
  readonly atlasByTier: readonly (string | null)[];
  /** Tier-1 base height in px (body budget below the rooftop features). */
  readonly baseH: number;
  /** Height added per extra tier floor, px. */
  readonly floorH: number;
  /** Tier-1 family silhouette (body → g, emissives → e). */
  drawBase(g: Graphics, e: Graphics): void;
  /** One modular layer for floor = 2..tier (stacked on the base). */
  drawFloor(g: Graphics, e: Graphics, floor: number): void;
  /** Family rooftop marker (drawn every tier; scales with the body). */
  drawRooftop(g: Graphics, e: Graphics, tier: BuildingTier): void;
}

/** Body-top Y for a family at a tier (features/labels anchor here). */
export function familyTopHeight(profession: string | null, tier: BuildingTier): number {
  const spec = familyArt(profession);
  return spec.baseH + (tier - 1) * spec.floorH;
}

/** Half-extents of one building footprint (inset from the tile diamond). */
export const PLATFORM_HALF_W = TILE_W / 2 - 8;
export const PLATFORM_HALF_H = TILE_H / 2 - 4;

/** Total placeholder body height for a tier (1..7) — shared FX anchor. */
export function tierHeight(tier: BuildingTier): number {
  return 22 + tier * 14;
}

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

// ── the six profession families + neutral cube ────────────────────────────

const NO_ATLAS: readonly (string | null)[] = [null, null, null, null, null, null, null];

/**
 * Cryptographer — ENCRYPTION VAULT / shield lattice: the widest, squattest
 * silhouette with a rounded dome (instantly distinct from every tower form).
 */
const cryptographerArt: FamilyArtSpec = {
  family: "Cryptographer",
  color: FAMILY_NEON["Cryptographer"],
  mass: FAMILY_MASS["Cryptographer"],
  atlasByTier: NO_ATLAS,
  baseH: 30,
  floorH: 11,
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
};

/**
 * Zero-Day — BREACH GATEWAY: two slim pillars + a spanning beam with a hollow
 * center — the only silhouette with visible negative space through it.
 */
const zeroDayArt: FamilyArtSpec = {
  family: "Zero-Day",
  color: FAMILY_NEON["Zero-Day"],
  mass: FAMILY_MASS["Zero-Day"],
  atlasByTier: NO_ATLAS,
  baseH: 36,
  floorH: 14,
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
};

/**
 * Overclocker — REACTOR TOWER: the only round tower — a central cylinder
 * wrapped in glowing energy coil rings.
 */
const overclockerArt: FamilyArtSpec = {
  family: "Overclocker",
  color: FAMILY_NEON["Overclocker"],
  mass: FAMILY_MASS["Overclocker"],
  atlasByTier: NO_ATLAS,
  baseH: 42,
  floorH: 13,
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
};

/**
 * Cache Keeper — DATA BANK: offset memory-chip slabs stacked like a ziggurat
 * whose layers slide diagonally — the only asymmetric family silhouette.
 */
const cacheKeeperArt: FamilyArtSpec = {
  family: "Cache Keeper",
  color: FAMILY_NEON["Cache Keeper"],
  mass: FAMILY_MASS["Cache Keeper"],
  atlasByTier: NO_ATLAS,
  baseH: 30,
  floorH: 13,
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
};

/**
 * Server Marshal — RACK TOWER: the tallest, perfectly uniform-width slab with
 * horizontal rack grooves every floor — the plainest, most rectangular form.
 */
const serverMarshalArt: FamilyArtSpec = {
  family: "Server Marshal",
  color: FAMILY_NEON["Server Marshal"],
  mass: FAMILY_MASS["Server Marshal"],
  atlasByTier: NO_ATLAS,
  baseH: 44,
  floorH: 15,
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
};

/**
 * Bot Herder — DRONE FACTORY: a wide low hangar with two attached side bays —
 * the only tri-lobed (center + flanks) massing, wide like the vault but flat.
 */
const botHerderArt: FamilyArtSpec = {
  family: "Bot Herder",
  color: FAMILY_NEON["Bot Herder"],
  mass: FAMILY_MASS["Bot Herder"],
  atlasByTier: NO_ATLAS,
  baseH: 26,
  floorH: 12,
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
};

/** Unassigned — neutral stepped cube (the Phase B placeholder, unchanged). */
const unassignedArt: FamilyArtSpec = {
  family: UNASSIGNED_FAMILY,
  color: UNASSIGNED_NEON,
  mass: UNASSIGNED_MASS,
  atlasByTier: NO_ATLAS,
  baseH: 36,
  floorH: 14,
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
};

/**
 * THE MANIFEST. Keyed by DB profession name (or UNASSIGNED_FAMILY); unknown
 * professions fall back to the neutral cube. Swap in real art by filling
 * `atlasByTier` URLs — no component changes required.
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

// ── shared tier features (progressive, family-agnostic) ───────────────────

/**
 * Tier 3..7 architectural features — one NEW feature per tier so the ladder
 * reads without labels: antenna (3), side pods (4), halo ring (5), crown (6),
 * megastructure cap (7). Bodies draw into `g` (mass), lights into `e` (neon).
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
 * Tile platform — the WET SLAB (study §A4): dark near-black fill with a
 * layered neon wash (the family light reflecting in the puddle) and, for
 * professioned buildings, a vertical REFLECTION STREAK below center — the
 * "neon mirrored on wet ground" tell from the reference. The streak is drawn
 * bright enough to join the bloom pass.
 */
export function drawPlatform(
  g: Graphics,
  neon: number,
  professioned = false
): void {
  const hw = PLATFORM_HALF_W;
  const hh = PLATFORM_HALF_H;
  const diamond = [0, -hh, hw, 0, 0, hh, -hw, 0];
  g.poly(diamond).fill({ color: COLOR_WET_SLAB, alpha: 0.94 });
  if (professioned) {
    // Layered accent wash = cheap radial glow under the building.
    g.poly(diamond).fill({ color: neon, alpha: 0.1 });
    g.ellipse(0, 0, hw * 0.55, hh * 0.55).fill({ color: neon, alpha: 0.1 });
    g.poly(diamond).stroke({ width: 2, color: neon, alpha: 0.85 });
    // Reflection streak toward the viewer (bright — feeds bloom). Wide
    // enough to read as wet-ground light spill, not a stray line.
    g.rect(-3, 0, 6, hh + 10).fill(vGrad(neon, shade(neon, 0.4), 0.6));
    g.ellipse(0, hh * 0.55, 11, hh * 0.55).fill({ color: neon, alpha: 0.12 });
  } else {
    g.poly(diamond).stroke({ width: 1.5, color: neon, alpha: 0.5 });
  }
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
