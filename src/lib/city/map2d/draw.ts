/**
 * map2d DRAW — canvas 2D primitives for the Blueprint world map.
 *
 * Everything here draws onto a CanvasRenderingContext2D in SCREEN pixels —
 * the caller (CityMap2D) applies the camera transform via world→screen
 * conversion; no rAF loop exists anywhere (static-draw ruling).
 */
import { BLUEPRINT, familyStyle } from "./palette";
import type { WorldBuilding, WorldPlot } from "./layout";

/** Building footprints ≥ this many px carry the card's avatar (2026-10-01
 *  user ruling; below it a photo is noise — plain footprint instead). */
export const AVATAR_MIN_PX = 24;

/** Footprint size as a fraction of the cell, by tier 1..14. */
export function tierScale(tier: number): number {
  return 0.42 + 0.58 * Math.min(1, Math.max(0, (tier - 1) / 13));
}

export function drawPaperBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
) {
  ctx.fillStyle = BLUEPRINT.paper;
  ctx.fillRect(0, 0, w, h);
  // Screen-space drafting grid (fixed 32px pitch — the paper's texture, not
  // a world feature, so it never swims while panning).
  ctx.strokeStyle = BLUEPRINT.grid;
  ctx.globalAlpha = BLUEPRINT.gridAlpha;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 32) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += 32) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawRoad(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  ctx.strokeStyle = BLUEPRINT.road;
  ctx.lineWidth = 2.2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  b: WorldBuilding,
  avatar?: CanvasImageSource | null
) {
  const fam = familyStyle(b.f);
  const px = x - size / 2;
  const py = y - size / 2;
  ctx.fillStyle = fam.fill;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(px, py, size, size);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = fam.stroke;
  ctx.lineWidth = Math.max(0.7, size * 0.06);
  ctx.strokeRect(px, py, size, size);
  if (b.t >= 8 && size >= 12) {
    // Grand-tier inner register (blueprint "nested plate" look).
    const inset = size * 0.28;
    ctx.lineWidth = Math.max(0.5, size * 0.04);
    ctx.strokeRect(px + inset, py + inset, size - 2 * inset, size - 2 * inset);
  }
  if (size >= AVATAR_MIN_PX) {
    // The card's avatar takes the center of its square (user ruling).
    const d = size * 0.72;
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, d / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, x - d / 2, y - d / 2, d, d);
      ctx.restore();
    }
    ctx.strokeStyle = fam.stroke;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, d / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (b.p && size >= 10) {
    // Deed-lock / iron-deed badge (top-left corner).
    const s = Math.max(4, size * 0.26);
    ctx.fillStyle = BLUEPRINT.lockBadge.body;
    ctx.fillRect(px - 1, py - 1, s, s);
    ctx.fillStyle = BLUEPRINT.lockBadge.keyhole;
    ctx.fillRect(px - 1 + s * 0.35, py - 1 + s * 0.3, Math.max(1, s * 0.3), Math.max(1, s * 0.3));
  }
}

export function drawHq(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  stage: number,
  avatar?: CanvasImageSource | null
) {
  const px = x - size / 2;
  const py = y - size / 2;
  ctx.fillStyle = BLUEPRINT.hq.plate;
  ctx.fillRect(px, py, size, size);
  ctx.strokeStyle = BLUEPRINT.hq.stroke;
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.strokeRect(px, py, size, size);
  if (size >= 14) {
    ctx.lineWidth = Math.max(0.6, size * 0.03);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + size, py + size);
    ctx.moveTo(px + size, py);
    ctx.lineTo(px, py + size);
    ctx.stroke();
  }
  if (size >= 22) {
    // The city OWNER's avatar takes the HQ center square (gold ring).
    const d = size * 0.52;
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, d / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, x - d / 2, y - d / 2, d, d);
      ctx.restore();
    }
    ctx.strokeStyle = BLUEPRINT.hq.gold;
    ctx.lineWidth = Math.max(1.5, size * 0.07);
    ctx.beginPath();
    ctx.arc(x, y, d / 2, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = BLUEPRINT.hq.gold;
    ctx.globalAlpha = 0.9;
    const inset = size * 0.28;
    ctx.fillRect(px + inset, py + inset, size - 2 * inset, size - 2 * inset);
    ctx.globalAlpha = 1;
  }
  // Stage 2/3 flourish: outer register corners (subtle, static).
  if (stage >= 2 && size >= 26) {
    ctx.strokeStyle = BLUEPRINT.hq.gold;
    ctx.lineWidth = 1.4;
    const inset = size * 0.12;
    ctx.strokeRect(px - inset, py - inset, size + 2 * inset, size + 2 * inset);
    if (stage >= 3) {
      ctx.beginPath();
      ctx.arc(x, y, size * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

export function drawLandmark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
) {
  const r = size * 0.575; // hexagon circumradius (slightly over cell)
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    const px = x + r * Math.cos(a);
    const py = y + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = BLUEPRINT.landmark.fill;
  ctx.globalAlpha = BLUEPRINT.landmark.fillAlpha;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = BLUEPRINT.landmark.stroke;
  ctx.lineWidth = Math.max(0.8, size * 0.07);
  ctx.stroke();
  if (size >= 14) {
    ctx.fillStyle = BLUEPRINT.landmark.stroke;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.2, size * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPlotPad(
  ctx: CanvasRenderingContext2D,
  plot: WorldPlot,
  cx: number,
  cy: number,
  cell: number,
  isYou: boolean,
  selected: boolean
) {
  const halfPx = (plot.half + 0.2) * cell;
  if (isYou) {
    ctx.strokeStyle = BLUEPRINT.you;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(cx - halfPx, cy - halfPx, halfPx * 2, halfPx * 2);
    ctx.setLineDash([]);
  }
  if (selected) {
    ctx.strokeStyle = BLUEPRINT.selection;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cx - halfPx - 3, cy - halfPx - 3, halfPx * 2 + 6, halfPx * 2 + 6);
  }
}

export function drawCityLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  yBelow: number,
  text: string,
  fontSize: number
) {
  ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = BLUEPRINT.label;
  ctx.fillText(text, x, yBelow);
}
