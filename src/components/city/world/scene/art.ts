/**
 * Mainframe City — PLACEHOLDER procedural art (client-only, Pixi Graphics).
 *
 * ⚠ PLACEHOLDER_ART: every silhouette here is a procedural stand-in drawn
 * with Pixi Graphics primitives — no spritesheets, no external assets.
 * Real art lands later by filling the `atlasByTier` slots of CITY_ART_MANIFEST
 * (see "Art manifest" below) — components only ever call familyArt(), so the
 * swap touches this module alone (RTS plan §Phase B task 2 / §Phase C).
 *
 * PHASE C — six profession architectures (RTS plan §"Profession architecture"):
 * each family has a DISTINCT silhouette + accent + rooftop marker, following
 * the plan's directions:
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

import { Container, Graphics, Text } from "pixi.js";
import { UNASSIGNED_FAMILY } from "@/lib/city/types";
import type { BuildingTier } from "@/lib/city/types";
import { DISTRICT_PROFESSIONS, FAMILY_HEX } from "@/lib/city/district";
import { TILE_H, TILE_W } from "@/lib/city/scene/iso";

/** Flip to wire real art; placeholder drawing stays the default. */
export const PLACEHOLDER_ART = true;

export const COLOR_FIREWALL = 0x22d3ee;
export const COLOR_HARDLOCK = 0xf59e0b;
export const COLOR_SELECTION = 0x4f8dff;
export const COLOR_GHOST_VALID = 0x4ade80;
export const COLOR_GHOST_INVALID = 0xef4444;

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
  /** Accent color (0xRRGGBB), derived from the shared FAMILY_HEX palette. */
  readonly color: number;
  /** Future WebP atlas slot per tier 1..7 (null = procedural placeholder). */
  readonly atlasByTier: readonly (string | null)[];
  /** Tier-1 base height in px (body budget below the rooftop features). */
  readonly baseH: number;
  /** Height added per extra tier floor, px. */
  readonly floorH: number;
  /** Tier-1 family silhouette (drawn in the family accent). */
  drawBase(g: Graphics): void;
  /** One modular layer for floor = 2..tier (stacked on the base). */
  drawFloor(g: Graphics, floor: number): void;
  /** Family rooftop marker (drawn every tier; scales with the body). */
  drawRooftop(g: Graphics, tier: BuildingTier): void;
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

/** Sci-fi family palette keyed by DB profession name (or unassigned). */
const FAMILY_COLORS: Record<string, number> = Object.fromEntries(
  Object.entries(FAMILY_HEX).map(([k, v]) => [k, hexToRgb(v)])
);
const UNASSIGNED_COLOR = hexToRgb("#9ca3af");

/** Hex → 0xRRGGBB per-family color, neutral fallback. */
export function professionColor(profession: string | null): number {
  if (!profession || profession === UNASSIGNED_FAMILY) return UNASSIGNED_COLOR;
  return FAMILY_COLORS[profession] ?? UNASSIGNED_COLOR;
}

/** Multiply a color's channels by `k` (face shading). */
export function shade(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

// ── shared drawing primitives ─────────────────────────────────────────────

/**
 * One extruded iso box whose base center sits at (cx, baseY). Faces are
 * filled top / left / right with shaded variants of `color`.
 */
export function drawIsoBox(
  g: Graphics,
  cx: number,
  baseY: number,
  halfW: number,
  halfH: number,
  height: number,
  color: number,
  alpha = 1
): void {
  const top = baseY - height;
  // Face shading is deliberately BRIGHT (0.55/0.78): darker multiples washed
  // the family hue out to gray at world zoom, which read as "generic cubes".
  const dark = shade(color, 0.55);
  const mid = shade(color, 0.78);
  // Left face (screen-down-left).
  g.poly([
    cx - halfW, top,
    cx, top + halfH,
    cx, baseY + halfH,
    cx - halfW, baseY,
  ]).fill({ color: dark, alpha });
  // Right face (screen-down-right).
  g.poly([
    cx + halfW, top,
    cx, top + halfH,
    cx, baseY + halfH,
    cx + halfW, baseY,
  ]).fill({ color: mid, alpha });
  // Top diamond.
  g.poly([
    cx, top - halfH,
    cx + halfW, top,
    cx, top + halfH,
    cx - halfW, top,
  ]).fill({ color, alpha });
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

/** Vertical cylinder (reactor / tower core): body + shaded side + top disc. */
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
  // Body: two verticals closed by half-ellipse caps.
  g.poly([
    cx - radius, top,
    cx + radius, top,
    cx + radius, baseY,
    cx - radius, baseY,
  ]).fill({ color: shade(color, 0.7), alpha });
  // Right-side shading strip for volume.
  g.poly([
    cx + radius * 0.25, top,
    cx + radius, top,
    cx + radius, baseY,
    cx + radius * 0.25, baseY,
  ]).fill({ color: shade(color, 0.5), alpha });
  // Top disc.
  g.ellipse(cx, top, radius, ry).fill({ color, alpha });
}

/** Energy coil ring around a cylinder/tower at world y. */
function drawCoil(g: Graphics, cx: number, y: number, radius: number, ry: number, color: number): void {
  // THICK + bright: coils are the Overclocker's family tell — they must
  // survive world zoom (thin 2px strokes vanished at distance).
  g.ellipse(cx, y, radius, ry).fill({ color: shade(color, 1.6), alpha: 0.2 });
  g.ellipse(cx, y, radius, ry).stroke({ width: 3, color: shade(color, 1.4), alpha: 0.95 });
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
  g.ellipse(cx, baseY - height / 2, rx, height / 2 + ry / 2).fill({ color: shade(color, 0.9) });
  g.ellipse(cx, baseY - height / 2 - ry * 0.2, rx * 0.62, height / 2.4).fill({ color: shade(color, 1.2) });
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

/** Flat iso octagon pad fill + rim (shield-lattice base). */
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
  // Left wall (dark) — bottom-to-top sweep approximated with two fills.
  g.poly(shift(baseY)).fill({ color: shade(color, 0.4), alpha: 0.9 });
  g.poly(shift(baseY - height * 0.45)).fill({ color: shade(color, 0.6), alpha: 0.85 });
  // Top face.
  g.poly(shift(top)).fill({ color });
  g.poly(shift(top)).stroke({ width: 1.5, color: shade(color, 1.4), alpha: 0.7 });
}

// ── the six profession families + neutral cube ────────────────────────────

const NO_ATLAS: readonly (string | null)[] = [null, null, null, null, null, null, null];

/**
 * Cryptographer — ENCRYPTION VAULT / shield lattice: the widest, squattest
 * silhouette with a rounded dome (instantly distinct from every tower form).
 */
const cryptographerArt: FamilyArtSpec = {
  family: "Cryptographer",
  color: FAMILY_COLORS["Cryptographer"],
  atlasByTier: NO_ATLAS,
  baseH: 30,
  floorH: 11,
  drawBase(g) {
    const c = this.color;
    // Wide low octagonal vault pad — noticeably wider than other families.
    drawOctagonPad(g, 0, 0, PLATFORM_HALF_W * 0.98, PLATFORM_HALF_H * 0.98, this.baseH, c);
    // Shield-lattice band around the pad.
    g.ellipse(0, -2, PLATFORM_HALF_W * 0.9, PLATFORM_HALF_H * 0.9)
      .stroke({ width: 2, color: shade(c, 1.35), alpha: 0.8 });
    drawDome(g, 0, -this.baseH, PLATFORM_HALF_W * 0.52, 6, 20, c);
  },
  drawFloor(g, floor) {
    const c = this.color;
    const y = -this.baseH - (floor - 2) * this.floorH;
    // Concentric shrinking octagon plates — stepped vault tiers.
    const shrink = 1 - (floor - 1) * 0.1;
    drawOctagonPad(g, 0, y, PLATFORM_HALF_W * 0.85 * shrink, PLATFORM_HALF_H * 0.85 * shrink, this.floorH, c);
    // Lattice brace on each new plate.
    g.ellipse(0, y - this.floorH, PLATFORM_HALF_W * 0.6 * shrink, PLATFORM_HALF_H * 0.6 * shrink)
      .stroke({ width: 1.5, color: shade(c, 1.4), alpha: 0.7 });
  },
  drawRooftop(g, tier) {
    const c = this.color;
    const top = -familyTopHeight(this.family, tier);
    // The dome rides the top plate.
    drawDome(g, 0, top, PLATFORM_HALF_W * (0.5 - tier * 0.02), 5, 16, c);
    // Keyhole finial — the family's rooftop marker.
    g.circle(0, top - 20, 2).fill({ color: shade(c, 1.5) });
  },
};

/**
 * Zero-Day — BREACH GATEWAY: two slim pillars + a spanning beam with a hollow
 * center — the only silhouette with visible negative space through it.
 */
const zeroDayArt: FamilyArtSpec = {
  family: "Zero-Day",
  color: FAMILY_COLORS["Zero-Day"],
  atlasByTier: NO_ATLAS,
  baseH: 36,
  floorH: 14,
  drawBase(g) {
    const c = this.color;
    // Pillars are deliberately WIDE with a hollow gap — the negative space
    // is the family signature and must read at world zoom too.
    const w = PLATFORM_HALF_W * 0.38;
    const h = PLATFORM_HALF_H * 0.38;
    drawIsoBox(g, -PLATFORM_HALF_W * 0.52, 0, w, h, this.baseH, c);
    drawIsoBox(g, PLATFORM_HALF_W * 0.52, 0, w, h, this.baseH, c);
    // Chunky spanning exploit beam across the top.
    drawIsoBox(g, 0, -this.baseH, PLATFORM_HALF_W * 0.9, PLATFORM_HALF_H * 0.9, 9, shade(c, 1.25));
    // Twin cap beacons on the beam — the "two lights" silhouette tell.
    g.circle(-PLATFORM_HALF_W * 0.52, -this.baseH - 12, 2.4).fill({ color: shade(c, 1.7) });
    g.circle(PLATFORM_HALF_W * 0.52, -this.baseH - 12, 2.4).fill({ color: shade(c, 1.7) });
    // Breach shard floating in the gateway mouth.
    g.poly([0, -8, 7, -20, 0, -32, -7, -20]).fill({ color: shade(c, 0.75), alpha: 0.9 });
  },
  drawFloor(g, floor) {
    const c = this.color;
    const y = -this.baseH - (floor - 2) * this.floorH;
    const w = PLATFORM_HALF_W * 0.38;
    const h = PLATFORM_HALF_H * 0.38;
    // Pillars keep growing; every floor adds a beam slab → layered gateway.
    drawIsoBox(g, -PLATFORM_HALF_W * 0.52, y, w, h, this.floorH, c);
    drawIsoBox(g, PLATFORM_HALF_W * 0.52, y, w, h, this.floorH, c);
    drawIsoBox(g, 0, y - this.floorH, PLATFORM_HALF_W * (0.86 - floor * 0.03), PLATFORM_HALF_H * (0.86 - floor * 0.03), 6, shade(c, 1.15));
  },
  drawRooftop(g, tier) {
    const c = this.color;
    const top = -familyTopHeight(this.family, tier);
    // Warning-triangle beacon on the beam — rooftop marker.
    g.poly([0, top - 18, 6, top - 9, -6, top - 9])
      .stroke({ width: 1.5, color: shade(c, 1.4) })
      .fill({ color: shade(c, 0.8), alpha: 0.6 });
  },
};

/**
 * Overclocker — REACTOR TOWER: the only round tower — a central cylinder
 * wrapped in glowing energy coil rings.
 */
const overclockerArt: FamilyArtSpec = {
  family: "Overclocker",
  color: FAMILY_COLORS["Overclocker"],
  atlasByTier: NO_ATLAS,
  baseH: 42,
  floorH: 13,
  drawBase(g) {
    const c = this.color;
    // Footing plinth + the reactor core cylinder.
    drawIsoBox(g, 0, 0, PLATFORM_HALF_W * 0.7, PLATFORM_HALF_H * 0.7, 8, shade(c, 0.7));
    drawCylinder(g, 0, -6, PLATFORM_HALF_W * 0.42, PLATFORM_HALF_H * 0.42, this.baseH, c);
    drawCoil(g, 0, -6 - this.baseH * 0.45, PLATFORM_HALF_W * 0.56, PLATFORM_HALF_H * 0.56, c);
    drawCoil(g, 0, -6 - this.baseH * 0.8, PLATFORM_HALF_W * 0.54, PLATFORM_HALF_H * 0.54, c);
  },
  drawFloor(g, floor) {
    const c = this.color;
    const y = -6 - this.baseH - (floor - 2) * this.floorH;
    // Core extends; every floor adds another coil (reactor heating up).
    drawCylinder(g, 0, y, PLATFORM_HALF_W * (0.42 - floor * 0.012), PLATFORM_HALF_H * (0.42 - floor * 0.012), this.floorH, c);
    drawCoil(g, 0, y - this.floorH * 0.55, PLATFORM_HALF_W * 0.58, PLATFORM_HALF_H * 0.58, c);
  },
  drawRooftop(g, tier) {
    const c = this.color;
    const top = -6 - familyTopHeight(this.family, tier);
    // Plasma tip orb — rooftop marker (its glow is the "reactor on" tell).
    g.circle(0, top - 8, 4).fill({ color: shade(c, 1.7) });
    g.circle(0, top - 8, 7).stroke({ width: 1.5, color: shade(c, 1.3), alpha: 0.8 });
  },
};

/**
 * Cache Keeper — DATA BANK: offset memory-chip slabs stacked like a ziggurat
 * whose layers slide diagonally — the only asymmetric family silhouette.
 */
const cacheKeeperArt: FamilyArtSpec = {
  family: "Cache Keeper",
  color: FAMILY_COLORS["Cache Keeper"],
  atlasByTier: NO_ATLAS,
  baseH: 30,
  floorH: 13,
  drawBase(g) {
    const c = this.color;
    // Base chip slab + first offset module (asymmetry starts at tier 1).
    drawIsoBox(g, 0, 0, PLATFORM_HALF_W * 0.8, PLATFORM_HALF_H * 0.8, this.baseH * 0.55, c);
    drawIsoBox(g, -6, -this.baseH * 0.55, PLATFORM_HALF_W * 0.55, PLATFORM_HALF_H * 0.55, this.baseH * 0.45, shade(c, 1.12));
    // Chip pins along the base's right edge.
    g.rect(PLATFORM_HALF_W * 0.5, -10, 8, 2).fill({ color: shade(c, 1.5), alpha: 0.9 });
    g.rect(PLATFORM_HALF_W * 0.5, -16, 8, 2).fill({ color: shade(c, 1.5), alpha: 0.9 });
  },
  drawFloor(g, floor) {
    const c = this.color;
    const y = -this.baseH - (floor - 2) * this.floorH;
    // Alternating diagonal offsets — the memory-stack signature.
    const dx = floor % 2 === 0 ? 7 : -7;
    drawIsoBox(g, dx, y, PLATFORM_HALF_W * (0.62 - floor * 0.02), PLATFORM_HALF_H * (0.62 - floor * 0.02), this.floorH, floor % 2 === 0 ? shade(c, 1.1) : c);
    // Edge connector dot on every chip.
    g.circle(dx + PLATFORM_HALF_W * 0.4, y - this.floorH * 0.5, 1.8).fill({ color: shade(c, 1.6), alpha: 0.9 });
  },
  drawRooftop(g, tier) {
    const c = this.color;
    const top = -familyTopHeight(this.family, tier);
    // Cache-hit cap: bracket chip floating over the stack — rooftop marker.
    g.rect(-5, top - 12, 10, 5).stroke({ width: 1.5, color: shade(c, 1.4) }).fill({ color: shade(c, 0.8), alpha: 0.5 });
  },
};

/**
 * Server Marshal — RACK TOWER: the tallest, perfectly uniform-width slab with
 * horizontal rack grooves every floor — the plainest, most rectangular form.
 */
const serverMarshalArt: FamilyArtSpec = {
  family: "Server Marshal",
  color: FAMILY_COLORS["Server Marshal"],
  atlasByTier: NO_ATLAS,
  baseH: 44,
  floorH: 15,
  drawBase(g) {
    const c = this.color;
    // Uniform-width rack slab — NO taper (the anti-vault: tall + rectangular).
    const w = PLATFORM_HALF_W * 0.62;
    const h = PLATFORM_HALF_H * 0.62;
    drawIsoBox(g, 0, 0, w, h, this.baseH, c);
    // Rack groove lines (LED strip look).
    for (let i = 1; i <= 2; i++) {
      g.rect(-w * 0.7, -i * 12, w * 1.4, 2).fill({ color: shade(c, 1.5), alpha: 0.85 });
    }
  },
  drawFloor(g, floor) {
    const c = this.color;
    const y = -this.baseH - (floor - 2) * this.floorH;
    // Identical rack units stacked — width never changes.
    const w = PLATFORM_HALF_W * 0.62;
    const h = PLATFORM_HALF_H * 0.62;
    drawIsoBox(g, 0, y, w, h, this.floorH, c);
    g.rect(-w * 0.7, y - this.floorH * 0.65, w * 1.4, 2).fill({ color: shade(c, 1.5), alpha: 0.85 });
    g.circle(w * 0.45, y - this.floorH * 0.4, 1.6).fill({ color: shade(c, 1.7), alpha: 0.95 });
  },
  drawRooftop(g, tier) {
    const c = this.color;
    const top = -familyTopHeight(this.family, tier);
    // Antenna ARRAY (three masts) — the command-center rooftop marker.
    for (const dx of [-8, 0, 8]) {
      g.moveTo(dx, top).lineTo(dx, top - 10).stroke({ width: 1.5, color: shade(c, 1.35) });
      g.circle(dx, top - 11, 1.4).fill({ color: shade(c, 1.6) });
    }
  },
};

/**
 * Bot Herder — DRONE FACTORY: a wide low hangar with two attached side bays —
 * the only tri-lobed (center + flanks) massing, wide like the vault but flat.
 */
const botHerderArt: FamilyArtSpec = {
  family: "Bot Herder",
  color: FAMILY_COLORS["Bot Herder"],
  atlasByTier: NO_ATLAS,
  baseH: 26,
  floorH: 12,
  drawBase(g) {
    const c = this.color;
    // Central hangar (wide + low)…
    drawIsoBox(g, 0, 0, PLATFORM_HALF_W * 0.6, PLATFORM_HALF_H * 0.6, this.baseH, c);
    // …flanked by two BIG bot bays, pushed wide — the tri-lobed signature
    // must be legible at world zoom (small bays blurred into one blob).
    drawIsoBox(g, -PLATFORM_HALF_W * 0.78, 4, PLATFORM_HALF_W * 0.32, PLATFORM_HALF_H * 0.32, this.baseH * 0.75, shade(c, 0.85));
    drawIsoBox(g, PLATFORM_HALF_W * 0.78, 4, PLATFORM_HALF_W * 0.32, PLATFORM_HALF_H * 0.32, this.baseH * 0.75, shade(c, 0.85));
    // Bay door slits — one per lobe (bright family-lit strips).
    for (const dx of [-PLATFORM_HALF_W * 0.78, 0, PLATFORM_HALF_W * 0.78]) {
      g.rect(dx - 3, -this.baseH * 0.45, 6, 2).fill({ color: shade(c, 1.55), alpha: 0.95 });
    }
  },
  drawFloor(g, floor) {
    const c = this.color;
    const y = -this.baseH - (floor - 2) * this.floorH;
    // Hangar grows; the bays grow with it every other floor.
    drawIsoBox(g, 0, y, PLATFORM_HALF_W * (0.6 - floor * 0.015), PLATFORM_HALF_H * (0.6 - floor * 0.015), this.floorH, c);
    if (floor % 2 === 0) {
      drawIsoBox(g, -PLATFORM_HALF_W * 0.8, y + 4, PLATFORM_HALF_W * 0.3, PLATFORM_HALF_H * 0.3, this.floorH * 0.85, shade(c, 0.85));
      drawIsoBox(g, PLATFORM_HALF_W * 0.8, y + 4, PLATFORM_HALF_W * 0.3, PLATFORM_HALF_H * 0.3, this.floorH * 0.85, shade(c, 0.85));
    }
  },
  drawRooftop(g, tier) {
    const c = this.color;
    const top = -familyTopHeight(this.family, tier);
    // Drone landing pad ring + node sigil — rooftop marker.
    g.ellipse(0, top - 4, 11, 5.5).stroke({ width: 1.5, color: shade(c, 1.4), alpha: 0.95 });
    g.circle(0, top - 4, 2.2).fill({ color: shade(c, 1.6) });
  },
};

/** Unassigned — neutral stepped cube (the Phase B placeholder, unchanged). */
const unassignedArt: FamilyArtSpec = {
  family: UNASSIGNED_FAMILY,
  color: UNASSIGNED_COLOR,
  atlasByTier: NO_ATLAS,
  baseH: 36,
  floorH: 14,
  drawBase(g) {
    drawIsoBox(g, 0, 0, PLATFORM_HALF_W * 0.82, PLATFORM_HALF_H * 0.82, this.baseH, this.color);
  },
  drawFloor(g, floor) {
    const shrink = (floor - 1) * 0.07;
    drawIsoBox(
      g,
      0,
      -this.baseH - (floor - 2) * this.floorH,
      PLATFORM_HALF_W * (0.82 - shrink),
      PLATFORM_HALF_H * (0.82 - shrink),
      this.floorH,
      this.color,
      0.96
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
 * megastructure cap (7). Families whose silhouette already carries a feature
 * (vault pods, reactor coils, hangar bays) still get it — the shared feature
 * is placed to reinforce, never to hide, the family form.
 */
export function drawTierFeatures(
  g: Graphics,
  profession: string | null,
  tier: BuildingTier
): void {
  const spec = familyArt(profession);
  const color = spec.color;
  const top = -familyTopHeight(profession, tier);
  const w = PLATFORM_HALF_W;
  const h = PLATFORM_HALF_H;

  if (tier >= 3) {
    // Antenna mast beside the family rooftop (reactor keeps its orb center).
    const ax = spec === overclockerArt ? w * 0.55 : -w * 0.55;
    g.moveTo(ax, top).lineTo(ax, top - 16).stroke({ width: 1.5, color: shade(color, 1.3), alpha: 0.95 });
    g.circle(ax, top - 17, 1.8).fill({ color: shade(color, 1.6) });
  }
  if (tier >= 4) {
    // Side pods flanking the base.
    const podY = -Math.min(spec.baseH * 0.5, 14);
    drawIsoBox(g, -w * 0.85, podY, w * 0.2, h * 0.2, 12, shade(color, 0.9));
    drawIsoBox(g, w * 0.85, podY, w * 0.2, h * 0.2, 12, shade(color, 0.9));
  }
  if (tier >= 5) {
    // Halo ring around the body's upper third.
    g.ellipse(0, top * 0.55, w * 0.85, h * 0.85)
      .stroke({ width: 2, color: shade(color, 1.45), alpha: 0.75 });
  }
  if (tier >= 6) {
    // Crown: wider cap plate + corner pins.
    drawIsoBox(g, 0, top - 4, w * 0.7, h * 0.7, 6, shade(color, 1.2));
    for (const [px, py] of [[-w * 0.6, 0], [w * 0.6, 0], [0, -h * 0.6], [0, h * 0.6]] as const) {
      g.circle(px, top - 10 + py * 0.4, 1.6).fill({ color: shade(color, 1.6) });
    }
  }
  if (tier >= 7) {
    // Megastructure cap: oversized overshading slab + beacon.
    drawIsoBox(g, 0, top - 12, w * 1.02, h * 1.02, 8, shade(color, 1.05), 0.96);
    g.circle(0, top - 24, 3).fill({ color: 0xffffff, alpha: 0.95 });
    g.circle(0, top - 24, 6).stroke({ width: 1.5, color: shade(color, 1.5), alpha: 0.8 });
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
 * Tile platform: a flat inset diamond. Professioned buildings get a family
 * accent WASH + strong rim (so tier-1 hue reads even at world zoom);
 * unassigned keeps the subtle neutral rim — the two must not look alike.
 */
export function drawPlatform(g: Graphics, color: number, professioned = false): void {
  const hw = PLATFORM_HALF_W;
  const hh = PLATFORM_HALF_H;
  const diamond = [0, -hh, hw, 0, 0, hh, -hw, 0];
  g.poly(diamond).fill({ color: 0x0b1220, alpha: 0.92 });
  if (professioned) {
    g.poly(diamond).fill({ color, alpha: 0.14 });
    g.poly(diamond).stroke({ width: 2, color, alpha: 0.9 });
  } else {
    g.poly(diamond).stroke({ width: 1.5, color, alpha: 0.55 });
  }
}

/**
 * Window mask: lit dots along the left/right faces. Rows AND columns grow
 * with the tier so value growth stays legible at close LOD, clamped to the
 * family's actual body height (short families never float windows above the
 * roofline); the whole layer hides at district/world LOD.
 */
export function drawWindows(
  g: Graphics,
  tier: BuildingTier,
  color: number,
  profession: string | null = null
): void {
  const lit = 0x9be8ff;
  const bodyH = familyTopHeight(profession, tier);
  // Row anchors: y(row) = -(8 + 13·row + 23·[row ≥ 1]); every lit row must
  // stay inside the family's body, so cap rows by the family's height.
  let maxRows = 1;
  for (let r = 5; r >= 2; r--) {
    if (8 + 13 * (r - 1) + 23 <= bodyH - 5) {
      maxRows = r;
      break;
    }
  }
  const rows = Math.max(1, Math.min(5, tier, maxRows));
  const perRow = tier >= 4 ? 3 : 2;
  for (let row = 0; row < rows; row++) {
    const y = -8 - row * 13 - (row >= 1 ? 23 : 0);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < perRow; i++) {
        const x = side * (6 + i * 11);
        g.rect(x - 1.5, y - 2.5, 3, 5).fill({
          color: (i + row) % perRow === 0 ? lit : shade(color, 0.5),
          alpha: 0.9,
        });
      }
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
  const ordinal = DISTRICT_PROFESSIONS.indexOf(spec.family);
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
