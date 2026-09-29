/**
 * Mainframe City — the Six goddess landmarks (client-only Pixi, Phase E).
 *
 * Six UNIQUE monuments at the fixed ring tiles (IsoWorld LANDMARK_RING,
 * roster order = GODDESS_USERNAMES; §D7 — landmarks are never layout rows):
 *
 *   index  username              display name   monument
 *   0      "Goddess"             The Architect  root spire + orbit ring
 *   1      "Goddess of Fate"     The Locksmith  fortified lock citadel
 *   2      "Goddess of Knowledge" The Oracle    sensor-eye observatory
 *   3      "Goddess of Time"     The Clockkeeper chrono-ring clock tower
 *   4      "Goddess of War"      NullPointer    fractured obelisk
 *   5      "Goddess of Wealth"   The Banker     stepped treasury pyramid
 *
 * Each monument's OWNED silhouette embodies HELD status — the visible
 * world-state mapping Phase E asks for. NOTE (L1): "owned" is ownership only;
 * power TOGGLES and the Architect's all-powers grant are NOT represented
 * here (that would need a server-computed powerActive flag). All art
 * is procedural vector Graphics and 100% STATIC: landmark identity never
 * animates per-frame, so the render-on-demand ticker and
 * prefers-reduced-motion need no special handling here. State transitions
 * (acquired / lost / selected / stage swap / LOD swap) redraw once.
 *
 * VALUE STAGES (2026-09-29, pixel-sheet retirement): each monument grows a
 * procedural ELABORATION per server-derived stage (1..3) — taller masts,
 * extra rings, orbit shards — keeping its identity silhouette. The stage
 * heights live in LANDMARK_STAGE_HEIGHTS.
 */

import { ColorMatrixFilter, Container, Graphics } from "pixi.js";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import type { Lod } from "@/lib/city/scene/lod";
import { TILE_H, TILE_W } from "@/lib/city/scene/iso";
import { LANDMARK_COLORS } from "@/lib/city/landmark-colors";
import {
  COLOR_SELECTION,
  drawIsoBox,
  makeTextChip,
  shade,
} from "./art";

/**
 * Monument body heights (art extent above the tile, UNSCALED) per value
 * stage — matched to each draw function's tallest point at that stage.
 */
export const LANDMARK_STAGE_HEIGHTS: readonly (readonly [number, number, number])[] = [
  [158, 194, 214], // 0 Architect
  [100, 126, 158], // 1 Locksmith
  [92, 110, 132],  // 2 Oracle
  [112, 132, 158], // 3 Clockkeeper
  [122, 158, 186], // 4 NullPointer
  [84, 106, 128],  // 5 Banker
];

/**
 * Monument upscaling: monuments must dominate the skyline — grand-league
 * buildings reach ~230px, so the ring reads as MONUMENTAL architecture
 * above the ordinary towers' podiums. Applied as container scale so art,
 * pads and selection rings grow together.
 */
export const MONUMENT_SCALE = 1.3;

/** Scaled art height of monument i at a value stage (culling, label anchors). */
export function landmarkArtHeight(index: number, stage = 1): number {
  const s = stage >= 3 ? 3 : stage <= 1 ? 1 : 2;
  const row = LANDMARK_STAGE_HEIGHTS[index] ?? LANDMARK_STAGE_HEIGHTS[0];
  return Math.round((row[s - 1] ?? row[0]) * MONUMENT_SCALE);
}

/** Base pad: wider than a building platform — monuments read as 2-tile. */
function drawMonumentPad(g: Graphics, color: number, owned: boolean): void {
  const hw = TILE_W * 0.62;
  const hh = TILE_H * 0.62;
  const diamond = [0, -hh, hw, 0, 0, hh, -hw, 0];
  g.poly(diamond).fill({ color: 0x0a0e1a, alpha: owned ? 0.95 : 0.55 });
  if (owned) g.poly(diamond).fill({ color, alpha: 0.08 });
  g.poly(diamond).stroke({
    width: owned ? 2 : 1.25,
    color: owned ? color : 0x475569,
    alpha: owned ? 0.75 : 0.4,
  });
  // Ground ring ALWAYS present — the monument-vs-building cue. Owned =
  // bright activation halo; dormant = dim slate ring so an unawakened
  // monument still reads as a monument (not another grey tower).
  g.ellipse(0, 0, hw * 1.25, hh * 1.25).stroke({
    width: owned ? 2 : 1.25,
    color: owned ? color : 0x64748b,
    alpha: owned ? 0.5 : 0.3,
  });
}

type MonumentStage = 1 | 2 | 3;

/** 0 — The Architect ("Goddess"): root spire + orbit ring, the tallest. */
function drawArchitectSpire(g: Graphics, owned: boolean, stage: MonumentStage): void {
  const color = LANDMARK_COLORS[0];
  const a = owned ? 1 : 0.42;
  // Tapering spire segments (night massing, neon-rimmed when owned).
  drawIsoBox(g, 0, 0, 26, 13, 40, shade(color, 0.22), a, owned ? color : undefined);
  drawIsoBox(g, 0, -40, 18, 9, 34, shade(color, 0.3), a, owned ? color : undefined);
  drawIsoBox(g, 0, -74, 11, 6, 30, shade(color, 0.4), a, owned ? color : undefined);
  drawIsoBox(g, 0, -104, 6, 3, 22, shade(color, 0.5), a, owned ? color : undefined);
  // Root crystal tip.
  g.poly([0, -152, 7, -134, 0, -126, -7, -134]).fill({
    color: owned ? 0xffffff : 0x334155,
    alpha: a,
  });
  if (owned) {
    // Orbit ring around the upper spire (the Architect commands all six).
    g.ellipse(0, -96, 34, 10).stroke({ width: 1.5, color, alpha: 0.8 });
    g.ellipse(0, -96, 34, 10).fill({ color, alpha: 0.07 });
    for (const dx of [-34, 34]) {
      g.circle(dx, -96, 3).fill({ color: 0xffffff, alpha: 0.9 });
    }
  }
  if (stage >= 2) {
    // Root mast — the spire climbs another segment with a second ring.
    drawIsoBox(g, 0, -126, 8, 4, 28, shade(color, 0.55), a, owned ? color : undefined);
    g.poly([0, -182, 5, -166, 0, -158, -5, -166]).fill({
      color: owned ? 0xffffff : 0x334155,
      alpha: a,
    });
    if (owned) {
      g.ellipse(0, -134, 26, 8).stroke({ width: 1.5, color, alpha: 0.7 });
      g.circle(0, -186, 2).fill({ color: 0xffffff, alpha: 0.9 });
    }
  }
  if (stage >= 3) {
    // Command halo + twin obelisk shards — the skyline's crown.
    if (owned) {
      g.ellipse(0, -162, 32, 10).stroke({ width: 1.5, color, alpha: 0.65 });
      g.ellipse(0, -182, 20, 6.5).stroke({ width: 1.2, color, alpha: 0.5 });
    }
    for (const dx of [-26, 26]) {
      g.poly([dx, -128, dx + 4, -128, dx + 2.5, -172, dx - 2.5, -172]).fill({
        color: shade(color, owned ? 0.6 : 0.3),
        alpha: a,
      });
      if (owned) g.circle(dx, -175, 2).fill({ color: 0xffffff, alpha: 0.85 });
    }
  }
}

/** 1 — The Locksmith ("Goddess of Fate"): fortified citadel + padlock. */
function drawLocksmithCitadel(g: Graphics, owned: boolean, stage: MonumentStage): void {
  const color = LANDMARK_COLORS[1];
  const a = owned ? 1 : 0.42;
  // Two fortress towers + connecting wall (night massing).
  drawIsoBox(g, -20, -2, 12, 6, 62, shade(color, 0.3), a, owned ? color : undefined);
  drawIsoBox(g, 20, -2, 12, 6, 62, shade(color, 0.25), a, owned ? color : undefined);
  drawIsoBox(g, 0, 2, 14, 7, 34, shade(color, 0.2), a, owned ? color : undefined);
  // Crenellations on the near tower.
  for (let i = -1; i <= 1; i++) {
    drawIsoBox(g, -20 + i * 8, -64, 3, 1.5, 7, shade(color, 0.38), a);
  }
  // The padlock: shackle arc + keyhole body floating between the towers.
  g.moveTo(-9, -72).arc(-0, -72, 9, Math.PI, 0).stroke({
    width: 4,
    color: owned ? shade(color, 1.4) : 0x475569,
    alpha: a,
  });
  g.roundRect(-12, -72, 24, 20, 4).fill({
    color: owned ? shade(color, 0.5) : 0x1e293b,
    alpha: a,
  });
  if (owned) {
    // Keyhole glows while the Fate hard-lock power is live.
    g.circle(0, -64, 3.2).fill({ color: 0xfffbeb, alpha: 0.95 });
    g.poly([0, -63, 2.5, -56, -2.5, -56]).fill({ color: 0xfffbeb, alpha: 0.95 });
  }
  if (stage >= 2) {
    // Tower extensions + the crown wall + the great key emblem.
    drawIsoBox(g, -20, -64, 13, 6.5, 26, shade(color, 0.34), a, owned ? color : undefined);
    drawIsoBox(g, 20, -64, 13, 6.5, 26, shade(color, 0.3), a, owned ? color : undefined);
    drawIsoBox(g, 0, -90, 18, 9, 8, shade(color, 0.42), a, owned ? color : undefined);
    if (owned) {
      // Floating key: bow circle + stem + teeth, the citadel's seal.
      g.circle(0, -106, 5).stroke({ width: 2, color: shade(color, 1.4), alpha: 0.95 });
      g.moveTo(0, -101).lineTo(0, -114).stroke({ width: 2, color: shade(color, 1.4), alpha: 0.95 });
      g.moveTo(0, -110).lineTo(4, -110).stroke({ width: 2, color: shade(color, 1.4), alpha: 0.95 });
      g.moveTo(0, -114).lineTo(5, -114).stroke({ width: 2, color: shade(color, 1.4), alpha: 0.95 });
    }
  }
  if (stage >= 3) {
    // Side turrets + watch beacons on every crown.
    for (const dx of [-36, 36]) {
      drawIsoBox(g, dx, 2, 8, 4, 44, shade(color, 0.26), a, owned ? color : undefined);
      drawIsoBox(g, dx, -42, 9, 4.5, 6, shade(color, 0.4), a);
      if (owned) g.circle(dx, -44, 2.2).fill({ color: 0xfffbeb, alpha: 0.9 });
    }
    if (owned) {
      g.circle(-20, -93, 2.2).fill({ color: 0xfffbeb, alpha: 0.9 });
      g.circle(20, -93, 2.2).fill({ color: 0xfffbeb, alpha: 0.9 });
      // Containment shackle arc over the crown wall.
      g.moveTo(-16, -98).arc(0, -98, 16, Math.PI, 0).stroke({
        width: 2,
        color: shade(color, 1.3),
        alpha: 0.85,
      });
    }
  }
}

/** 2 — The Oracle ("Goddess of Knowledge"): observatory + sensor eye. */
function drawOracleObservatory(g: Graphics, owned: boolean, stage: MonumentStage): void {
  const color = LANDMARK_COLORS[2];
  const a = owned ? 1 : 0.42;
  // Cylinder base + dome (night massing).
  g.poly([-17, -46, 17, -46, 17, 0, -17, 0]).fill({
    color: shade(color, 0.25),
    alpha: a,
  });
  g.ellipse(0, 0, 17, 8.5).fill({ color: shade(color, 0.2), alpha: a });
  g.ellipse(0, -46, 17, 8.5).fill({ color: shade(color, 0.35), alpha: a });
  g.ellipse(0, -54, 15, 12).fill({ color: shade(color, 0.45), alpha: a });
  g.ellipse(0, -58, 9, 7).fill({ color: shade(color, 0.7), alpha: a });
  // Sensor aperture slit — the all-seeing eye.
  g.ellipse(0, -58, 5.5, 3.5).fill({
    color: owned ? 0xffffff : 0x334155,
    alpha: a,
  });
  if (owned) {
    // Scan arcs (static) — the revelation array sweeps the whole grid.
    g.arc(0, -58, 14, -Math.PI * 0.82, -Math.PI * 0.18).stroke({
      width: 2,
      color,
      alpha: 0.75,
    });
    g.arc(0, -58, 24, -Math.PI * 0.76, -Math.PI * 0.24).stroke({
      width: 1.5,
      color,
      alpha: 0.4,
    });
  }
  if (stage >= 2) {
    // Sensor mast — stacked relay dishes climb above the dome.
    g.moveTo(0, -64).lineTo(0, -92).stroke({ width: 2.5, color: shade(color, 0.5), alpha: a });
    for (const [ry, rr] of [[-74, 7], [-86, 6]] as const) {
      g.arc(0, ry, rr, -Math.PI * 0.85, -Math.PI * 0.15).stroke({
        width: 1.5,
        color: owned ? shade(color, 1.3) : 0x475569,
        alpha: a,
      });
    }
    if (owned) g.circle(0, -96, 2.2).fill({ color: 0xffffff, alpha: 0.9 });
  }
  if (stage >= 3) {
    // Twin side masts + the insight halo.
    for (const dx of [-16, 16]) {
      g.moveTo(dx, -60).lineTo(dx, -100).stroke({ width: 1.5, color: shade(color, 0.5), alpha: a });
      if (owned) g.circle(dx, -103, 1.8).fill({ color, alpha: 0.9 });
    }
    if (owned) {
      g.ellipse(0, -96, 24, 8).stroke({ width: 1.5, color, alpha: 0.7 });
      g.ellipse(0, -96, 24, 8).fill({ color, alpha: 0.06 });
    }
  }
}

/** 3 — The Clockkeeper ("Goddess of Time"): clock tower + chrono rings. */
function drawClockkeeperTower(g: Graphics, owned: boolean, stage: MonumentStage): void {
  const color = LANDMARK_COLORS[3];
  const a = owned ? 1 : 0.42;
  // Tower shaft (night massing).
  drawIsoBox(g, 0, 0, 15, 7.5, 58, shade(color, 0.25), a, owned ? color : undefined);
  drawIsoBox(g, 0, -58, 18, 9, 16, shade(color, 0.38), a, owned ? color : undefined);
  // Clock face — set to 11:57, three minutes to the root.
  const faceY = -66;
  g.circle(0, faceY, 13).fill({ color: 0x0b1220, alpha: a });
  g.circle(0, faceY, 13).stroke({
    width: 2.5,
    color: owned ? shade(color, 1.3) : 0x475569,
    alpha: a,
  });
  // Hour hand (≈12) + minute hand (≈57 min → just left of 12).
  g.moveTo(0, faceY).lineTo(0, faceY - 6).stroke({
    width: 2,
    color: owned ? 0xffffff : 0x64748b,
    alpha: a,
  });
  g.moveTo(0, faceY).lineTo(-5.5, faceY - 6).stroke({
    width: 1.5,
    color: owned ? 0xffffff : 0x64748b,
    alpha: a,
  });
  // Chrono ring above the face (2× reward cadence).
  g.ellipse(0, -92, 22, 7).stroke({ width: 2, color, alpha: owned ? 0.85 : 0.3 * a });
  if (owned) {
    g.ellipse(0, -92, 22, 7).fill({ color, alpha: 0.08 });
    g.ellipse(0, -104, 13, 4.5).stroke({ width: 1.5, color, alpha: 0.5 });
  }
  if (stage >= 2) {
    // Shaft extension + a second chrono ring at a quicker cadence.
    drawIsoBox(g, 0, -74, 12, 6, 30, shade(color, 0.32), a, owned ? color : undefined);
    if (owned) {
      g.ellipse(0, -118, 18, 6).stroke({ width: 1.5, color, alpha: 0.7 });
      g.circle(0, -122, 2.2).fill({ color: 0xffffff, alpha: 0.9 });
    }
  }
  if (stage >= 3) {
    // The midnight bell + twin side escapement wheels.
    g.poly([0, -148, 6, -132, -6, -132]).fill({
      color: owned ? shade(color, 1.4) : 0x334155,
      alpha: a,
    });
    if (owned) g.circle(0, -150, 2).fill({ color: 0xffffff, alpha: 0.95 });
    for (const dx of [-14, 14]) {
      g.circle(dx, -96, 5).stroke({ width: 1.5, color, alpha: owned ? 0.6 : 0.25 * a });
      g.moveTo(dx - 5, -96).lineTo(dx + 5, -96).stroke({ width: 1, color, alpha: owned ? 0.5 : 0.2 * a });
    }
  }
}

/** 4 — NullPointer ("Goddess of War"): fractured obelisk, held by force. */
function drawWarObelisk(g: Graphics, owned: boolean, stage: MonumentStage): void {
  const color = LANDMARK_COLORS[4];
  const a = owned ? 1 : 0.42;
  const stone = owned ? shade(color, 0.22) : 0x1e293b;
  const glow = owned ? shade(color, 1.4) : 0x475569;
  // Main shaft.
  g.poly([-9, 0, 9, 0, 6, -86, -6, -86]).fill({ color: stone, alpha: a });
  g.poly([-9, 0, -3, 0, -4, -86, -6, -86]).fill({
    color: shade(stone, 0.6),
    alpha: a,
  });
  // Fracture: upper half displaced and tilted — "controlled corruption".
  g.poly([-8, -86, 8, -86, 5, -122, -5, -118]).fill({ color: stone, alpha: a });
  g.poly([-8, -86, -2, -86, -3, -118, -5, -118]).fill({
    color: shade(stone, 0.55),
    alpha: a,
  });
  // Crack seams between the fragments.
  g.moveTo(-6, -84).lineTo(2, -88).stroke({ width: 2, color: glow, alpha: owned ? 0.95 : 0.35 });
  if (owned) {
    g.moveTo(-4, -40).lineTo(3, -52).lineTo(-2, -64).stroke({
      width: 1.5,
      color: glow,
      alpha: 0.8,
    });
    // Containment ring at the base — the corruption is HELD, not loose.
    g.ellipse(0, 0, TILE_W * 0.4, TILE_H * 0.4).stroke({
      width: 2,
      color,
      alpha: 0.7,
    });
  }
  if (stage >= 2) {
    // The fracture climbs — a third displaced shard + outer ring.
    g.poly([-5, -120, 6, -122, 3, -150, -4, -146]).fill({ color: stone, alpha: a });
    g.moveTo(-2, -128).lineTo(4, -134).stroke({ width: 2, color: glow, alpha: owned ? 0.9 : 0.35 });
    if (owned) {
      g.ellipse(0, 0, TILE_W * 0.52, TILE_H * 0.52).stroke({ width: 1.5, color, alpha: 0.5 });
      g.circle(0, -154, 2.2).fill({ color, alpha: 0.9 });
    }
  }
  if (stage >= 3) {
    // Orbiting war shards + the white-hot apex spike.
    for (let i = 0; i < 3; i++) {
      const sx = (i - 1) * 18;
      const sy = -108 - (i % 2) * 22;
      g.poly([sx, sy - 7, sx + 4, sy, sx, sy + 6, sx - 4, sy]).fill({
        color: owned ? shade(color, 1.2) : 0x334155,
        alpha: a * 0.95,
      });
    }
    g.moveTo(0, -150).lineTo(0, -178).stroke({ width: 2, color: glow, alpha: owned ? 0.95 : 0.4 });
    if (owned) {
      g.circle(0, -180, 2.6).fill({ color: 0xffffff, alpha: 0.95 });
      g.circle(0, -180, 5).stroke({ width: 1.5, color, alpha: 0.8 });
    }
  }
}

/** 5 — The Banker ("Goddess of Wealth"): stepped treasury pyramid. */
function drawBankerPyramid(g: Graphics, owned: boolean, stage: MonumentStage): void {
  const color = LANDMARK_COLORS[5];
  const a = owned ? 1 : 0.42;
  // Four stepped tiers (front faces + shading), monumentally wide — night
  // massing with a bright crest stroke per step.
  const tiers: ReadonlyArray<[number, number, number]> = [
    [30, 20, 18],
    [24, 16, 18],
    [17, 11.5, 18],
    [10, 7, 16],
  ];
  let y = 0;
  for (const [halfW, halfH, h] of tiers) {
    // Front-left / front-right faces of each step (iso pyramid).
    g.poly([-halfW, y, 0, y + halfH, 0, y + halfH - h * 0.35, -halfW, y - h * 0.35])
      .fill({ color: shade(color, 0.3), alpha: a });
    g.poly([halfW, y, 0, y + halfH, 0, y + halfH - h * 0.35, halfW, y - h * 0.35])
      .fill({ color: shade(color, 0.24), alpha: a });
    g.moveTo(-halfW, y).lineTo(0, y - h * 0.35).lineTo(halfW, y).stroke({
      width: 1,
      color: owned ? shade(color, 1.3) : shade(color, 0.5),
      alpha: a * 0.8,
    });
    y -= h * 0.65;
  }
  // Glowing capstone — the vault's seal.
  g.poly([0, y - 14, 6, y - 2, 0, y + 3, -6, y - 2]).fill({
    color: owned ? 0xfffbeb : 0x334155,
    alpha: a,
  });
  if (owned) {
    // Coin rings orbiting the capstone (double rewards).
    g.ellipse(0, y - 8, 16, 5).stroke({ width: 1.5, color, alpha: 0.7 });
    g.circle(-16, y - 8, 2).fill({ color: 0xfffbeb, alpha: 0.9 });
    g.circle(16, y - 8, 2).fill({ color: 0xfffbeb, alpha: 0.9 });
  }
  if (stage >= 2) {
    // Treasury colonnade — a ring of gold-capped columns around the base.
    for (const dx of [-38, -19, 19, 38]) {
      g.rect(dx - 2, -26, 4, 26).fill({ color: shade(color, 0.4), alpha: a });
      g.circle(dx, -28, 2.2).fill({
        color: owned ? 0xfffbeb : 0x334155,
        alpha: a,
      });
    }
    if (owned) {
      // Second coin orbit, wider — the compound interest ring.
      g.ellipse(0, y - 10, 24, 7).stroke({ width: 1.2, color, alpha: 0.5 });
    }
  }
  if (stage >= 3) {
    // Crown tier + the golden flame apex.
    g.poly([-7, y, 0, y + 4.5, 7, y, 0, y - 4.5]).fill({ color: shade(color, 0.5), alpha: a });
    g.moveTo(0, y - 14).lineTo(0, y - 34).stroke({ width: 2, color: owned ? shade(color, 1.5) : shade(color, 0.5), alpha: a });
    g.poly([0, y - 46, 4, y - 34, 0, y - 30, -4, y - 34]).fill({
      color: owned ? 0xfffbeb : 0x334155,
      alpha: a,
    });
    if (owned) {
      for (const dx of [-12, 12]) {
        g.circle(dx, y - 40, 1.8).fill({ color: 0xfffbeb, alpha: 0.9 });
      }
    }
  }
}

const LANDMARK_DRAW: ReadonlyArray<(g: Graphics, owned: boolean, stage: MonumentStage) => void> = [
  drawArchitectSpire,
  drawLocksmithCitadel,
  drawOracleObservatory,
  drawClockkeeperTower,
  drawWarObelisk,
  drawBankerPyramid,
];

/** Monument index for a goddess username (roster order; -1 if not one). */
export function landmarkIndexFor(username: string): number {
  return GODDESS_USERNAMES.indexOf(username);
}

/**
 * One goddess landmark monument. Static art per (username, owned, stage);
 * the name chip shows at close LOD; the selection ring mirrors mirror-list/
 * panel focus. `owned` + `stage` arrive from the city projection — never
 * client-derived.
 */
export class LandmarkSprite extends Container {
  readonly username: string;
  readonly index: number;
  private drawnOwned: boolean | null = null;
  private labelChip: Container | null = null;
  private labelKey = "";
  private selection: Graphics | null = null;
  private lod: Lod = "district";
  private stageCurrent = 0;
  private daylightCurrent = 0;
  /** Procedural monument body + scoped day lift (identity at night). */
  private readonly body = new Container();
  private readonly bodyDay = new ColorMatrixFilter();

  constructor(index: number, owned: boolean, stage = 1) {
    super();
    this.index = ((index % GODDESS_USERNAMES.length) + GODDESS_USERNAMES.length) % GODDESS_USERNAMES.length;
    this.username = GODDESS_USERNAMES[this.index];
    this.stageCurrent = stage >= 3 ? 3 : stage <= 1 ? 1 : 2;
    this.scale.set(MONUMENT_SCALE);
    this.body.filters = [this.bodyDay];
    this.setOwned(owned);
  }

  /** Ownership flip (server projection) — full redraw.
   *
   * UNOWNED MONUMENTS RENDER NOTHING (2026-09-28 user ruling): the reserved
   * ring tile + moat stay as empty space — "acquire to awaken" is told by
   * The Six panel, not by dim placeholder art. `visible=false` also keeps
   * landmarkHitAt from selecting ghosts; applyCull re-checks `owned` so the
   * viewport pass can never un-hide a dormant monument. */
  setOwned(owned: boolean): void {
    this.visible = owned;
    if (owned === this.drawnOwned) return;
    this.drawnOwned = owned;
    this.redraw();
  }

  /** Value-stage swap (server-derived 1..3) — rebuilds the elaboration. */
  setStage(stage: number): void {
    const s = stage >= 3 ? 3 : stage <= 1 ? 1 : 2;
    if (s === this.stageCurrent) return;
    this.stageCurrent = s;
    this.redraw();
    if (this.labelChip) {
      this.labelChip.position.set(0, -(this.artHeightPx() + 24));
    }
  }

  get owned(): boolean {
    return this.drawnOwned === true;
  }

  /**
   * Daylight factor 0..1: the procedural body lerps its scoped lift (this
   * IS the hero's authored day state — identity at night, civic stone by
   * day).
   */
  setDaylight(daylight: number): void {
    this.daylightCurrent = daylight;
    const scale = 1 + (0.68 - 1) * daylight;
    const offset = 0.3 * daylight;
    this.bodyDay.matrix = [
      scale, 0, 0, 0, offset,
      0, scale, 0, 0, offset,
      0, 0, scale, 0, offset,
      0, 0, 0, 1, 0,
    ];
  }

  /** Scaled art height above the tile at the CURRENT value stage. */
  artHeightPx(): number {
    return landmarkArtHeight(this.index, this.stageCurrent);
  }

  /** Display-name chip (resolved locale text from the React shell). */
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
      borderColor: LANDMARK_COLORS[this.index],
    });
    this.labelChip.position.set(0, -(this.artHeightPx() + 24));
    this.labelChip.visible = this.lod === "close";
    this.addChild(this.labelChip);
  }

  setSelected(on: boolean): void {
    if (on === !!this.selection) return;
    if (on) {
      this.selection = new Graphics();
      // Triple ring: faint outer halo + bold main + inner echo — survives
      // neighboring rooftops even at district LOD (image-analyst Phase E:
      // the old 2px ring vanished under occlusion).
      this.selection
        .ellipse(0, 0, TILE_W * 0.95, TILE_H * 0.95)
        .stroke({ width: 1.5, color: COLOR_SELECTION, alpha: 0.35 });
      this.selection
        .ellipse(0, 0, TILE_W * 0.8, TILE_H * 0.8)
        .stroke({ width: 3.5, color: COLOR_SELECTION, alpha: 0.95 });
      this.selection
        .ellipse(0, 0, TILE_W * 0.55, TILE_H * 0.55)
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

  private redraw(): void {
    const owned = this.drawnOwned === true;
    // Selection ring + label must survive the redraw.
    const keep: Container[] = [];
    if (this.selection) keep.push(this.selection);
    if (this.labelChip) keep.push(this.labelChip);
    this.removeChildren();
    this.body.removeChildren();
    const pad = new Graphics();
    drawMonumentPad(pad, LANDMARK_COLORS[this.index], owned);
    const g = new Graphics();
    LANDMARK_DRAW[this.index](g, owned, this.stageCurrent as MonumentStage);
    this.body.addChild(g);
    this.addChild(pad, this.body, ...keep);
    this.setDaylight(this.daylightCurrent);
  }
}

/** Beam anchor point of a landmark (monument tip) for the Root Sequence. */
export function landmarkBeamAnchor(index: number, stage = 1): { dx: number; dy: number } {
  return { dx: 0, dy: -(landmarkArtHeight(index, stage) - 14) };
}
