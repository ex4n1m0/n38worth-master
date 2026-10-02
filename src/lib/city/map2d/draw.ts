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

/**
 * VISUAL-ONLY object gap (2026-10-02 user ruling): every object's footprint
 * is drawn at this FRACTION of its cell in BOTH renderers (2D square sizes,
 * 3D x/z instance scale), leaving (1 − factor) of shared edge space between
 * neighbors so buildings, landmarks and props read as separate objects.
 * Cell positions, ring order and city shape are UNTOUCHED — this is a draw
 * multiplier, not a layout stride. Keep 2D draw calls and the 3D engine
 * (instance/monument/prop scales) in lockstep with it.
 */
export const OBJECT_GAP_FACTOR = 0.85;

/** Footprint size as a fraction of the cell, by tier 1..14. The GRAND
 *  league (8+) jumps to near-full cell (study F4, 2026-10-02) so towers
 *  announce themselves on the registry map; civic grows 0.40→0.86. Shared
 *  by the 2D draw calls, the 3D scale ladder (ART_K) and the card renderer —
 *  composes with OBJECT_GAP_FACTOR (visual gap is multiplicative). */
export function tierScale(tier: number): number {
  const t = Math.max(1, Math.min(14, tier));
  if (t >= 8) return 0.97 + 0.03 * ((t - 8) / 6);
  return 0.4 + 0.46 * ((t - 1) / 7);
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
    // Grand-tier inner register (blueprint "nested plate" look)…
    const inset = size * 0.28;
    ctx.lineWidth = Math.max(0.5, size * 0.04);
    ctx.strokeRect(px + inset, py + inset, size - 2 * inset, size - 2 * inset);
    // …plus corner brackets (F4, 2026-10-02): drafting marks that make a
    // grand tower read as a MAJOR structure even at small sizes.
    const c = Math.max(2, size * 0.16);
    ctx.lineWidth = Math.max(0.8, size * 0.055);
    ctx.beginPath();
    ctx.moveTo(px, py + c);
    ctx.lineTo(px, py);
    ctx.lineTo(px + c, py);
    ctx.moveTo(px + size - c, py);
    ctx.lineTo(px + size, py);
    ctx.lineTo(px + size, py + c);
    ctx.moveTo(px + size, py + size - c);
    ctx.lineTo(px + size, py + size);
    ctx.lineTo(px + size - c, py + size);
    ctx.moveTo(px + c, py + size);
    ctx.lineTo(px, py + size);
    ctx.lineTo(px, py + size - c);
    ctx.stroke();
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
    // Protection badges (F11, 2026-10-02): the two states are now DISTINCT —
    // Deed Lock (timed) = ink SQUARE + gold keyhole; Iron Deed (permanent) =
    // gold DIAMOND + ink keyhole. Same two-color language as the 3D base
    // rings (gold = timed, ink = permanent).
    const s = Math.max(4, size * 0.26);
    const bx = px - 1;
    const by = py - 1;
    const keyhole = (ink: string) => {
      ctx.fillStyle = ink;
      ctx.fillRect(
        bx + s * 0.35,
        by + s * 0.3,
        Math.max(1, s * 0.3),
        Math.max(1, s * 0.3)
      );
    };
    if (b.p === "hardlock") {
      ctx.fillStyle = BLUEPRINT.hq.gold;
      ctx.beginPath();
      ctx.moveTo(bx + s / 2, by);
      ctx.lineTo(bx + s, by + s / 2);
      ctx.lineTo(bx + s / 2, by + s);
      ctx.lineTo(bx, by + s / 2);
      ctx.closePath();
      ctx.fill();
      keyhole(BLUEPRINT.lockBadge.body);
    } else {
      ctx.fillStyle = BLUEPRINT.lockBadge.body;
      ctx.fillRect(bx, by, s, s);
      keyhole(BLUEPRINT.hq.gold);
    }
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

/**
 * Founder landmark: the gold hexagon + a per-Founder SIGIL (F2, 2026-10-02)
 * in blueprint ink — the six monuments' identity reduced to drafting marks,
 * so landmarks are tellable apart ON the 2D map (they were six identical
 * hexes before). `canonical` is the GODDESS_USERNAMES index (0..5); unknown
 * values fall back to the plain center dot. Card art + 3D keep the full
 * monuments.
 */
export function drawLandmark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  canonical: number = -1
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
  if (size < 14) {
    if (size >= 8) {
      ctx.fillStyle = BLUEPRINT.landmark.stroke;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.2, size * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  const ink = BLUEPRINT.landmark.stroke;
  const u = size * 0.01; // sigil unit
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(0.9, size * 0.055);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (canonical) {
    case 0: {
      // The Architect — root spire: mast, cross arm, needle tip.
      ctx.beginPath();
      ctx.moveTo(x, y + 15 * u);
      ctx.lineTo(x, y - 13 * u);
      ctx.moveTo(x - 7 * u, y - 4 * u);
      ctx.lineTo(x + 7 * u, y - 4 * u);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - 22 * u);
      ctx.lineTo(x + 3.2 * u, y - 14 * u);
      ctx.lineTo(x - 3.2 * u, y - 14 * u);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 1: {
      // The Registrar — the key: bow ring, shaft, two wards.
      ctx.beginPath();
      ctx.arc(x, y - 8 * u, 6.5 * u, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - 1.5 * u);
      ctx.lineTo(x, y + 15 * u);
      ctx.moveTo(x, y + 7 * u);
      ctx.lineTo(x + 5 * u, y + 7 * u);
      ctx.moveTo(x, y + 12 * u);
      ctx.lineTo(x + 6 * u, y + 12 * u);
      ctx.stroke();
      break;
    }
    case 2: {
      // The Surveyor — observatory dome + sight dot.
      ctx.beginPath();
      ctx.arc(x, y + 6 * u, 11 * u, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 12 * u, y + 6 * u);
      ctx.lineTo(x + 12 * u, y + 6 * u);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - 6 * u, 2.4 * u, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 3: {
      // The Foreman — clock face with hands.
      ctx.beginPath();
      ctx.arc(x, y, 10.5 * u, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 6.5 * u);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 5 * u, y + 3 * u);
      ctx.stroke();
      break;
    }
    case 4: {
      // The Wrecker — the fracture: a split obelisk bolt.
      ctx.beginPath();
      ctx.moveTo(x - 7 * u, y + 15 * u);
      ctx.lineTo(x + 3 * u, y + 4 * u);
      ctx.lineTo(x - 2 * u, y + 2 * u);
      ctx.lineTo(x + 7 * u, y - 15 * u);
      ctx.stroke();
      break;
    }
    case 5: {
      // The Banker — stepped treasury pyramid.
      ctx.beginPath();
      ctx.moveTo(x - 12 * u, y + 13 * u);
      ctx.lineTo(x, y - 13 * u);
      ctx.lineTo(x + 12 * u, y + 13 * u);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 7 * u, y + 3 * u);
      ctx.lineTo(x + 7 * u, y + 3 * u);
      ctx.moveTo(x - 3.5 * u, y + 8 * u);
      ctx.lineTo(x + 3.5 * u, y + 8 * u);
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.2, size * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
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

/** Completed-album prop key — matches ALBUMS[].prop in lib/blueprints. */
export type PropKey = "park" | "marquee" | "crane" | "rotunda" | "goldvault";

/**
 * Draw a completed-album prop as a REAL STRUCTURE on its ring-2 slot (drawn
 * by CityMap2D; see layout.PROP_SLOTS). Blueprint-language line work that
 * degrades gracefully — details switch on at size thresholds like
 * drawBuilding. Static by ruling: no clock, no animation. `prop` comes off
 * the wire as a plain string; unknown keys draw nothing (forward-compatible).
 */
export function drawProp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  prop: string
) {
  const s = size;
  switch (prop) {
    case "park": {
      // Central Park: lawn plate, diagonal footpath, three trees.
      ctx.fillStyle = BLUEPRINT.props.park.lawn;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeStyle = BLUEPRINT.props.park.lawnDark;
      ctx.lineWidth = Math.max(0.7, s * 0.06);
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeStyle = BLUEPRINT.props.park.path;
      ctx.lineWidth = Math.max(0.8, s * 0.13);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.5, y + s * 0.5);
      ctx.lineTo(x + s * 0.5, y - s * 0.5);
      ctx.stroke();
      if (s >= 8) {
        ctx.fillStyle = BLUEPRINT.props.park.lawnDark;
        for (const [tx, ty, r] of [
          [-0.28, -0.3, 0.16],
          [0.27, -0.14, 0.14],
          [-0.08, 0.28, 0.15],
        ] as const) {
          ctx.beginPath();
          ctx.arc(x + tx * s, y + ty * s, r * s, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "marquee": {
      // Neon Marquee: theater gate — two posts, striped canopy, bulb row.
      ctx.strokeStyle = BLUEPRINT.props.marquee.post;
      ctx.lineWidth = Math.max(0.8, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.3, y + s * 0.48);
      ctx.lineTo(x - s * 0.3, y - s * 0.06);
      ctx.moveTo(x + s * 0.3, y + s * 0.48);
      ctx.lineTo(x + s * 0.3, y - s * 0.06);
      ctx.stroke();
      const cw = s * 1.06;
      const ch = s * 0.42;
      const cy = y - s * 0.44;
      ctx.fillStyle = BLUEPRINT.props.marquee.canopy;
      ctx.fillRect(x - cw / 2, cy, cw, ch);
      ctx.strokeStyle = BLUEPRINT.props.marquee.post;
      ctx.lineWidth = Math.max(0.7, s * 0.06);
      ctx.strokeRect(x - cw / 2, cy, cw, ch);
      if (s >= 10) {
        ctx.fillStyle = BLUEPRINT.paper;
        const sw = cw / 7;
        for (let i = 0; i < 3; i++) ctx.fillRect(x - cw / 2 + sw * (1 + i * 2), cy, sw, ch);
      }
      if (s >= 14) {
        ctx.fillStyle = BLUEPRINT.props.marquee.post;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(x - cw * 0.3 + (i * cw) / 5.2, cy + ch + s * 0.08, Math.max(0.6, s * 0.045), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "crane": {
      // Crane Row: tower crane — base pad, mast, peak ties, jib +
      // counterweight, cable + hook. Line work over a paper pad so it holds
      // up against busy neighbors (QA 2026-10-02: heavier strokes too).
      ctx.save();
      ctx.fillStyle = BLUEPRINT.paper;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x - s * 0.48, y - s * 0.48, s * 0.96, s * 0.96);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = BLUEPRINT.props.crane.mast;
      ctx.fillStyle = BLUEPRINT.props.crane.mast;
      ctx.lineCap = "round";
      ctx.fillRect(x - s * 0.24, y + s * 0.38, s * 0.48, s * 0.12); // base pad
      ctx.lineWidth = Math.max(1.2, s * 0.15);
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.4);
      ctx.lineTo(x, y - s * 0.36); // mast
      ctx.moveTo(x - s * 0.44, y - s * 0.36);
      ctx.lineTo(x + s * 0.52, y - s * 0.36); // jib + counter-jib
      ctx.stroke();
      ctx.lineWidth = Math.max(0.8, s * 0.07);
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.58); // peak
      ctx.lineTo(x - s * 0.44, y - s * 0.36);
      ctx.moveTo(x, y - s * 0.58);
      ctx.lineTo(x + s * 0.52, y - s * 0.36);
      ctx.moveTo(x + s * 0.3, y - s * 0.36); // cable
      ctx.lineTo(x + s * 0.3, y + s * 0.06);
      ctx.stroke();
      ctx.fillRect(x - s * 0.46, y - s * 0.3, s * 0.16, s * 0.14); // counterweight
      ctx.lineWidth = Math.max(1, s * 0.1);
      ctx.beginPath();
      ctx.arc(x + s * 0.3, y + s * 0.14, s * 0.1, Math.PI * 0.4, Math.PI * 2.1); // hook
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "rotunda": {
      // City Rotunda: colonnade base + dome + gold finial.
      const bw = s * 0.86;
      const bh = s * 0.34;
      const by = y - s * 0.02;
      ctx.fillStyle = BLUEPRINT.paper;
      ctx.fillRect(x - bw / 2, by, bw, bh);
      ctx.strokeStyle = BLUEPRINT.props.rotunda.stroke;
      ctx.lineWidth = Math.max(0.7, s * 0.055);
      ctx.strokeRect(x - bw / 2, by, bw, bh);
      if (s >= 10) {
        ctx.lineWidth = Math.max(0.5, s * 0.04);
        ctx.beginPath();
        for (let i = 1; i <= 3; i++) {
          const cx2 = x - bw / 2 + (bw * i) / 4;
          ctx.moveTo(cx2, by + 1);
          ctx.lineTo(cx2, by + bh - 1);
        }
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, by, s * 0.4, Math.PI, 0); // dome above the colonnade
      ctx.closePath();
      ctx.fillStyle = BLUEPRINT.paper;
      ctx.fill();
      ctx.lineWidth = Math.max(0.7, s * 0.055);
      ctx.stroke();
      if (s >= 12) {
        ctx.fillStyle = BLUEPRINT.props.rotunda.finial;
        ctx.beginPath();
        ctx.arc(x, by - s * 0.4, Math.max(0.8, s * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "goldvault": {
      // Golden Vault Emblem: a SQUARE vault plate with a combination dial —
      // deliberately NOT a hexagon, so it never twins the Founder landmarks
      // (QA 2026-10-02 de-twin ruling).
      const plate = s * 0.92;
      ctx.fillStyle = BLUEPRINT.props.goldvault.gold;
      ctx.fillRect(x - plate / 2, y - plate / 2, plate, plate);
      ctx.strokeStyle = BLUEPRINT.props.goldvault.stroke;
      ctx.lineWidth = Math.max(1, s * 0.09);
      ctx.strokeRect(x - plate / 2, y - plate / 2, plate, plate);
      // Combination dial: ink ring + spokes + hub.
      ctx.strokeStyle = BLUEPRINT.props.goldvault.dial;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(0.8, s * 0.06);
      ctx.stroke();
      if (s >= 10) {
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI / 180) * (45 + 90 * i);
          ctx.moveTo(x + s * 0.12 * Math.cos(a), y + s * 0.12 * Math.sin(a));
          ctx.lineTo(x + s * 0.28 * Math.cos(a), y + s * 0.28 * Math.sin(a));
        }
        ctx.stroke();
      }
      ctx.fillStyle = BLUEPRINT.props.goldvault.dial;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.8, s * 0.07), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}
