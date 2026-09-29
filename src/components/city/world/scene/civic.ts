/**
 * Mainframe City — CIVIC LANDMARKS (client-only Pixi, 2026-09-29 user ruling).
 *
 * Four city-service buildings derived from the owned-building count
 * (projection.ts CIVIC_TIER_THRESHOLDS — 10 / 100 / 1000 owned buildings):
 *
 *   kind      monument                        identity tell
 *   police    precinct tower + badge          red/blue strobe bar
 *   fire      garage hall + watch tower       red siren pulse
 *   school    low campus wing + clock gable   warm windows, flag pennant
 *   hospital  white block + red crosses       breathing cross glow
 *
 * Each kind grows one elaboration per tier (same identity silhouette, like
 * the goddess monuments' value stages). Placement is FIXED: the four ring-4
 * diagonals (placement.ts CIVIC_RING_OFFSETS) — always on the road-grid
 * checkerboard, so the civic square paves exactly like every block.
 *
 * RENDER-ONLY: the tier arrives from the server projection; nothing here
 * reads or computes economy state. Static art redrawn on state change
 * (tier/daylight/label/selection); the ONLY animation is alpha on the
 * scene's quantized light clock (strobes/glow — reduced-motion safe: the
 * static alphas simply stay).
 */

import { ColorMatrixFilter, Container, Graphics } from "pixi.js";
import type { CivicKind } from "@/lib/city/types";
import { CIVIC_KINDS } from "@/lib/city/types";
import type { Lod } from "@/lib/city/scene/lod";
import { TILE_H, TILE_W } from "@/lib/city/scene/iso";
import { beaconStrobeAt, haloBreathAt } from "@/lib/city/scene/lights";
import {
  COLOR_SELECTION,
  drawIsoBox,
  drawPlatform,
  makeTextChip,
  shade,
} from "./art";

/** Per-kind palette: night MASS body + saturated NEON identity. */
export const CIVIC_COLORS: Record<CivicKind, { mass: number; neon: number }> = {
  police: { mass: 0x33518f, neon: 0x60a5fa },
  fire: { mass: 0x8a3a2c, neon: 0xf97316 },
  school: { mass: 0x8a6b3a, neon: 0xfbbf24 },
  hospital: { mass: 0xb9c3d0, neon: 0xf87171 },
};

/** Body heights (px above the tile) per kind × tier — culling + labels. */
export const CIVIC_HEIGHTS: Record<CivicKind, readonly [number, number, number]> = {
  police: [86, 126, 166],
  fire: [80, 118, 156],
  school: [74, 104, 142],
  hospital: [92, 132, 172],
};

export type CivicFormTier = 1 | 2 | 3;

/** Kind index in the fixed CIVIC_KINDS roster order. */
export function civicKindIndex(kind: CivicKind): number {
  return CIVIC_KINDS.indexOf(kind);
}

// ── shared fragments ────────────────────────────────────────────────────────

/** Small lit-window strip on a front face (one channel of the mosaic). */
function windowStrip(
  g: Graphics,
  cx: number,
  topY: number,
  cols: number,
  rows: number,
  w: number,
  h: number,
  gapX: number,
  gapY: number,
  color: number,
  alpha: number
): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      g.rect(cx + (c - (cols - 1) / 2) * (w + gapX), topY + r * (h + gapY), w, h).fill({
        color,
        alpha,
      });
    }
  }
}

/** Red cross emblem (hospital) — two bars, emissive. */
function drawRedCross(e: Graphics, cx: number, cy: number, s: number, alpha = 0.95): void {
  e.rect(cx - s / 2, cy - s * 1.5, s, s * 3).fill({ color: 0xef4444, alpha });
  e.rect(cx - s * 1.5, cy - s / 2, s * 3, s).fill({ color: 0xef4444, alpha });
}

/** Badge emblem (police) — shield disc with star, emissive. */
function drawBadge(e: Graphics, cx: number, cy: number, r: number, neon: number): void {
  e.circle(cx, cy, r).fill({ color: 0xf8fafc, alpha: 0.92 });
  e.circle(cx, cy, r).stroke({ width: 1.5, color: neon, alpha: 0.9 });
  // Five-point star (simple polygon).
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r * 0.62 : r * 0.26;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  e.poly(pts).fill({ color: 0x1d4ed8, alpha: 0.95 });
}

/** Flag pole with pennant (school). */
function drawFlag(g: Graphics, e: Graphics, x: number, baseY: number, h: number, neon: number): void {
  g.moveTo(x, baseY).lineTo(x, baseY - h).stroke({ width: 1.5, color: 0x94a3b8, alpha: 0.9 });
  e.poly([x, baseY - h, x + 14, baseY - h + 4, x, baseY - h + 8]).fill({
    color: neon,
    alpha: 0.9,
  });
}

// ── kind architectures (g = mass body, e = emissive) ───────────────────────

type CivicDraw = (
  g: Graphics,
  e: Graphics,
  tier: CivicFormTier,
  neon: number,
  mass: number
) => void;

/** POLICE — precinct hall, tower climbing with the tier, badge + strobe bar. */
function drawPolice(g: Graphics, e: Graphics, tier: CivicFormTier, neon: number, mass: number): void {
  // Two-story garage/hall base with the badge over the entrance.
  drawIsoBox(g, -14, 0, 16, 8, 34, shade(mass, 0.9), 1, neon);
  drawIsoBox(g, 14, 0, 12, 6, 26, shade(mass, 0.78), 1, neon);
  drawBadge(e, 0, -12, 7, neon);
  windowStrip(e, -14, -28, 3, 2, 4, 4, 3, 8, shade(neon, 1.1), 0.75);
  if (tier >= 2) {
    // Central tower — the precinct proper.
    drawIsoBox(g, -14, -34, 12, 6, 52, shade(mass, 1.05), 1, neon);
    windowStrip(e, -14, -44, 2, 4, 4, 4, 4, 7, shade(neon, 1.1), 0.8);
    if (tier >= 3) {
      // Metro command crown: setback tower + antenna + radar ring.
      drawIsoBox(g, -14, -86, 8, 4, 34, shade(mass, 1.15), 1, neon);
      windowStrip(e, -14, -94, 1, 3, 4, 4, 0, 7, shade(neon, 1.1), 0.8);
      e.ellipse(-14, -128, 14, 5).stroke({ width: 1.2, color: neon, alpha: 0.7 });
    }
  }
}

/** FIRE — garage hall with lighted bays; watch tower at tier 2, ladder rack 3. */
function drawFire(g: Graphics, e: Graphics, tier: CivicFormTier, neon: number, mass: number): void {
  const bays = tier >= 3 ? 3 : 2;
  // Wide hall.
  drawIsoBox(g, 0, 0, 30, 15, 30, shade(mass, 0.95), 1, neon);
  // Garage bays — bright lit doors on the front-right face (two lanes).
  for (let i = 0; i < bays; i++) {
    const bx = -12 + i * 12;
    e.poly([bx, -24, bx + 8, -20, bx + 8, -2, bx, 0]).fill({
      color: 0xffd9a0,
      alpha: 0.85,
    });
    e.poly([bx, -24, bx + 8, -20, bx + 8, -2, bx, 0]).stroke({
      width: 1,
      color: shade(mass, 0.5),
      alpha: 0.8,
    });
  }
  windowStrip(e, 18, -22, 2, 1, 4, 4, 4, 0, shade(neon, 1.05), 0.75);
  if (tier >= 2) {
    // Hose-drying watch tower + bell housing.
    drawIsoBox(g, -26, -4, 7, 3.5, 60, shade(mass, 1.02), 1, neon);
    drawIsoBox(g, -26, -64, 9, 4.5, 9, shade(mass, 1.12), 1, neon);
    windowStrip(e, -26, -46, 1, 3, 3, 4, 0, 8, 0xffd9a0, 0.8);
    if (tier >= 3) {
      // Ladder rack across the roof + siren mast.
      g.moveTo(-20, -32).lineTo(8, -18).stroke({ width: 2, color: 0xd9d9d2, alpha: 0.9 });
      g.moveTo(-20, -36).lineTo(8, -22).stroke({ width: 2, color: 0xd9d9d2, alpha: 0.9 });
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        g.moveTo(-20 + 28 * t, -32 - 4 * t).lineTo(-20 + 28 * t, -36 - 4 * t).stroke({
          width: 1,
          color: 0xb9b9b0,
          alpha: 0.85,
        });
      }
      g.moveTo(20, -30).lineTo(20, -48).stroke({ width: 1.5, color: 0x94a3b8, alpha: 0.9 });
    }
  }
}

/** SCHOOL — low warm campus wing; second wing at 2, clock tower at 3. */
function drawSchool(g: Graphics, e: Graphics, tier: CivicFormTier, neon: number, mass: number): void {
  // Long low wing with a pitched gable.
  drawIsoBox(g, 0, 0, 26, 13, 22, shade(mass, 0.95), 1, neon);
  g.poly([-26, -22, -13, -30, 13, -18, 26, -26].map((v, i) => (i % 2 === 0 ? v * 0.92 : v))).fill({
    color: shade(mass, 0.72),
    alpha: 1,
  });
  // Pitched roof ridge (screen-right face read).
  g.poly([-24, -23, 0, -11, 24, -23, 0, -35]).fill({ color: shade(mass, 0.62), alpha: 1 });
  windowStrip(e, 0, -16, 5, 1, 5, 4, 4, 0, 0xffd9a0, 0.8);
  drawFlag(g, e, 30, -4, 44, neon);
  if (tier >= 2) {
    // Classroom wing (L-shape) + gable clock.
    drawIsoBox(g, -30, 6, 11, 5.5, 18, shade(mass, 0.85), 1, neon);
    windowStrip(e, -30, -13, 2, 1, 4, 4, 4, 0, 0xffd9a0, 0.8);
    e.circle(0, -30, 5).fill({ color: 0x0b1220, alpha: 0.9 });
    e.circle(0, -30, 5).stroke({ width: 1.5, color: neon, alpha: 0.9 });
    e.moveTo(0, -30).lineTo(0, -34).stroke({ width: 1.2, color: 0xffffff, alpha: 0.9 });
    e.moveTo(0, -30).lineTo(3, -28.5).stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
    if (tier >= 3) {
      // Clock tower + gym arc annex.
      drawIsoBox(g, 14, -12, 7, 3.5, 40, shade(mass, 1.05), 1, neon);
      e.moveTo(14, -52).lineTo(14, -70).stroke({ width: 1.5, color: 0x94a3b8, alpha: 0.9 });
      e.circle(14, -72, 2).fill({ color: neon, alpha: 0.9 });
      g.arc(-8, -6, 12, Math.PI, 0).fill({ color: shade(mass, 0.8), alpha: 1 });
      windowStrip(e, 14, -44, 1, 3, 3, 4, 0, 8, 0xffd9a0, 0.8);
    }
  }
}

/** HOSPITAL — white blocks with red crosses; tower + helipad at the top tier. */
function drawHospital(g: Graphics, e: Graphics, tier: CivicFormTier, neon: number, mass: number): void {
  // Entrance block with the cross over a lit canopy.
  drawIsoBox(g, 0, 0, 24, 12, 30, mass, 1, neon);
  drawRedCross(e, 0, -16, 3);
  e.poly([-10, 0, 0, -5, 10, 0, 0, 5]).fill({ color: 0xdbeafe, alpha: 0.35 });
  windowStrip(e, 0, -24, 4, 1, 4, 4, 4, 0, 0xbfdbfe, 0.8);
  if (tier >= 2) {
    // Main ward tower + rooftop cross sign.
    drawIsoBox(g, -2, -30, 13, 6.5, 44, shade(mass, 1.06), 1, neon);
    windowStrip(e, -2, -40, 3, 3, 4, 4, 4, 6, 0xbfdbfe, 0.85);
    drawRedCross(e, -2, -84, 2.4);
    if (tier >= 3) {
      // Central medical tower + helipad ring + beacon mast.
      drawIsoBox(g, -2, -74, 9, 4.5, 40, shade(mass, 1.14), 1, neon);
      windowStrip(e, -2, -84, 2, 4, 4, 4, 4, 6, 0xbfdbfe, 0.85);
      e.ellipse(16, -34, 11, 5.5).stroke({ width: 1.5, color: neon, alpha: 0.85 });
      e.moveTo(-2, -114).lineTo(-2, -128).stroke({ width: 1.5, color: 0x94a3b8, alpha: 0.9 });
    }
  }
}

const CIVIC_DRAW: Record<CivicKind, CivicDraw> = {
  police: drawPolice,
  fire: drawFire,
  school: drawSchool,
  hospital: drawHospital,
};

/**
 * One civic landmark. Static art per (kind, tier); lit windows live in two
 * flicker channels like ordinary buildings; the identity beacon (strobes /
 * cross glow) animates alpha-only on the scene's light clock.
 */
export class CivicSprite extends Container {
  readonly kind: CivicKind;
  private tierCurrent: CivicFormTier;
  private daylightCurrent = 0;
  private lod: Lod = "district";

  private readonly platformNight = new Graphics();
  private readonly platformDay = new Graphics();
  /** Procedural body + scoped day lift (identity at night, stone by day). */
  private readonly body = new Container();
  private readonly bodyDay = new ColorMatrixFilter();
  /** Animated identity lights (alpha-only; rebuilt with the art). */
  private readonly beaconA = new Graphics();
  private readonly beaconB = new Graphics();
  private labelChip: Container | null = null;
  private labelKey = "";
  private selection: Graphics | null = null;

  constructor(kind: CivicKind, tier: CivicFormTier = 1) {
    super();
    this.kind = kind;
    this.tierCurrent = tier;
    this.body.filters = [this.bodyDay];
    this.addChild(
      this.platformNight,
      this.platformDay,
      this.body,
      this.beaconA,
      this.beaconB
    );
    this.redraw();
  }

  /** Tier swap (server-derived 1..3) — rebuilds the elaboration. */
  setTier(tier: number): void {
    const t = (tier >= 3 ? 3 : tier <= 1 ? 1 : 2) as CivicFormTier;
    if (t === this.tierCurrent) return;
    this.tierCurrent = t;
    this.redraw();
    if (this.labelChip) {
      this.labelChip.position.set(0, -(this.artHeightPx() + 22));
    }
  }

  /** Art height above the tile at the CURRENT tier (culling, label anchors). */
  artHeightPx(): number {
    return CIVIC_HEIGHTS[this.kind][this.tierCurrent - 1];
  }

  /**
   * Daylight factor 0..1: platform crossfade + scoped body lift + the lit
   * windows dimming to a glass sheen (same policy as ordinary buildings).
   */
  setDaylight(daylight: number): void {
    this.daylightCurrent = daylight;
    this.platformDay.alpha = daylight;
    const scale = 1 + (0.68 - 1) * daylight;
    const offset = 0.3 * daylight;
    this.bodyDay.matrix = [
      scale, 0, 0, 0, offset,
      0, scale, 0, 0, offset,
      0, 0, scale, 0, offset,
      0, 0, 0, 1, 0,
    ];
  }

  /** Display-name chip (locale text resolved by the React shell). */
  setLabel(text: string | null): void {
    const key = text ?? "";
    if (key === this.labelKey) return;
    this.labelKey = key;
    if (this.labelChip) {
      this.labelChip.destroy({ children: true });
      this.labelChip = null;
    }
    if (!text) return;
    this.labelChip = makeTextChip(text, {
      borderColor: CIVIC_COLORS[this.kind].neon,
    });
    this.labelChip.position.set(0, -(this.artHeightPx() + 22));
    this.labelChip.visible = this.lod === "close";
    this.addChild(this.labelChip);
  }

  /** Triple selection ring (the monument tell — survives occlusion). */
  setSelected(on: boolean): void {
    if (on === !!this.selection) return;
    if (on) {
      this.selection = new Graphics();
      this.selection
        .ellipse(0, 0, TILE_W * 0.9, TILE_H * 0.9)
        .stroke({ width: 1.5, color: COLOR_SELECTION, alpha: 0.35 });
      this.selection
        .ellipse(0, 0, TILE_W * 0.75, TILE_H * 0.75)
        .stroke({ width: 3, color: COLOR_SELECTION, alpha: 0.95 });
      this.selection
        .ellipse(0, 0, TILE_W * 0.5, TILE_H * 0.5)
        .stroke({ width: 1.5, color: COLOR_SELECTION, alpha: 0.55 });
      this.addChild(this.selection);
    } else if (this.selection) {
      this.selection.destroy();
      this.selection = null;
    }
  }

  setLod(lod: Lod): void {
    this.lod = lod;
    if (this.labelChip) this.labelChip.visible = lod === "close";
  }

  /**
   * One light-clock sample (alpha-only, no redraws):
   *   police  — alternating red/blue strobe bar (two lamps, opposite phase)
   *   fire    — red siren breathing pulse
   *   hospital— white-red cross glow breathing
   *   school  — static warm windows (no beacon)
   * The window mosaic churns out of phase on both channels.
   */
  updateLights(tMs: number): void {
    if (!this.visible) return;
    const seed = 61 + civicKindIndex(this.kind) * 17;
    switch (this.kind) {
      case "police":
        this.beaconA.alpha = beaconStrobeAt(tMs, seed);
        this.beaconB.alpha = beaconStrobeAt(tMs, seed + 13);
        break;
      case "fire":
        this.beaconA.alpha = 0.25 + 0.75 * haloBreathAt(tMs, seed);
        break;
      case "hospital":
        this.beaconA.alpha = 0.5 + 0.5 * haloBreathAt(tMs, seed);
        break;
      case "school":
        break;
    }
  }

  private redraw(): void {
    const { mass, neon } = CIVIC_COLORS[this.kind];

    this.platformNight.clear();
    drawPlatform(this.platformNight, "night");
    this.platformDay.clear();
    drawPlatform(this.platformDay, "day");
    this.platformDay.alpha = this.daylightCurrent;

    // Selection ring + label live on the sprite itself (above the body) —
    // only the body's per-redraw art (g/e) is rebuilt and destroyed here.
    for (const child of this.body.removeChildren()) child.destroy();

    const g = new Graphics();
    const e = new Graphics();
    CIVIC_DRAW[this.kind](g, e, this.tierCurrent, neon, mass);
    // Ground identity ring — the civic-institution cue (thin, static).
    g.ellipse(0, 0, TILE_W * 0.5, TILE_H * 0.5).stroke({
      width: 1.5,
      color: neon,
      alpha: 0.4,
    });
    this.body.addChild(g);
    // (Windows live in the per-kind emissive strips inside `e` — placed on
    // each facade by the kind art, never a detached generic grid.)
    this.body.addChild(e);

    // Identity beacon geometry (alpha animated in updateLights).
    this.beaconA.clear();
    this.beaconB.clear();
    const topY = -this.artHeightPx() - 3;
    if (this.kind === "police") {
      this.beaconA.circle(-4, topY, 2).fill({ color: 0xff3b3b, alpha: 0.95 });
      this.beaconA.circle(-4, topY, 4.5).fill({ color: 0xff3b3b, alpha: 0.3 });
      this.beaconB.circle(4, topY, 2).fill({ color: 0x3b82f6, alpha: 0.95 });
      this.beaconB.circle(4, topY, 4.5).fill({ color: 0x3b82f6, alpha: 0.3 });
    } else if (this.kind === "fire") {
      this.beaconA.circle(20, -34, 2).fill({ color: 0xff5a5a, alpha: 0.95 });
      this.beaconA.circle(20, -34, 4.5).fill({ color: 0xff5a5a, alpha: 0.3 });
    } else if (this.kind === "hospital") {
      this.beaconA.circle(-2, topY, 2).fill({ color: 0xffffff, alpha: 0.95 });
      this.beaconA.circle(-2, topY, 5).fill({ color: 0xf87171, alpha: 0.25 });
    }
    this.beaconA.alpha = 0.9;
    this.beaconB.alpha = 0.9;

    this.setDaylight(this.daylightCurrent);
  }
}
