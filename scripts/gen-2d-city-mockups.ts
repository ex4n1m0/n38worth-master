/**
 * 2D CITY WORLD — style mockups (2026-10-01 study, NOT shipped UI).
 *
 * Generates the proposed 2D top-down map in four art directions. The layout
 * code here PROTOTYPES the real spec (square-ring clockwise spiral at both
 * city and world scale) so the mockups are honest, not hand-drawn lies:
 *
 *   CITY:  HQ 3x3 core at center → up to 6 Founder landmarks on hexagon
 *          slots of ring 2 → owned buildings filling rings 3+ clockwise,
 *          sorted by value desc (priciest innermost).
 *   WORLD: biggest city at map center → remaining cities on square rings
 *          clockwise, ordered by building count desc. Owner→owned roads.
 *
 * Run: npx tsx scripts/gen-2d-city-mockups.ts
 * Out:  docs/city-2d-mockups/*.png (1024x1024 — the proposed 1:1 viewport)
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";

// ── avatar pool (mockups): hotlinked picsum seeds like the game's own NPC
//    fallback; deterministic per card. Falls back to null (ring only) offline.
const AVATAR_POOL = 32;
const AVATARS: (string | null)[] = [];
async function fetchAvatar(seed: number): Promise<string | null> {
  try {
    const res = await fetch(`https://picsum.photos/seed/n38a${seed}/96`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const small = await sharp(buf).resize(72, 72).jpeg({ quality: 78 }).toBuffer();
    return `data:image/jpeg;base64,${small.toString("base64")}`;
  } catch {
    return null;
  }
}
async function loadAvatars() {
  for (let i = 0; i < AVATAR_POOL; i++) AVATARS.push(await fetchAvatar(i));
  console.log(`avatars: ${AVATARS.filter(Boolean).length}/${AVATAR_POOL} loaded`);
}
function avatarFor(...parts: (string | number)[]): string | null {
  let h = 2166136261;
  const key = parts.join("|");
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return AVATARS[Math.abs(h) % AVATAR_POOL];
}
let clipSeq = 0;

// ── deterministic RNG (mockups must be reproducible) ──
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(38);

// ── shared model ──
const FAMILY_NAMES = ["Notary", "Auctioneer", "Renovator", "Vault Keeper", "City Planner", "Prospector", "No trade"];
const FAMILY_GLYPH = ["N", "A", "R", "V", "C", "P", "·"];

interface Bld { tier: number; fam: number; locked: boolean; }
interface CityData {
  name: string; count: number; landmarks: number; buildings: Bld[];
  isYou?: boolean;
}

function makeCity(name: string, count: number, landmarks: number, isYou = false): CityData {
  const buildings: Bld[] = [];
  for (let i = 0; i < count; i++) {
    // value-desc ⇒ mostly tier-desc with churn, like the real ladder
    const frac = i / Math.max(1, count - 1);
    const tier = Math.max(1, Math.min(14, Math.round(13 * Math.pow(1 - frac, 1.6) + 1 + (rng() < 0.12 ? 2 : 0))));
    const fam = rng() < 0.45 ? 6 : Math.floor(rng() * 6);
    buildings.push({ tier, fam, locked: rng() < 0.09 });
  }
  return { name, count, landmarks, buildings, isYou };
}

// sample world: biggest at center, others by size desc (names are SAMPLES)
const WORLD: CityData[] = [
  makeCity("Mogul_Mike", 420, 6, true),
  makeCity("Skyline_Sue", 214, 4),
  makeCity("Baron_Builds", 186, 3),
  makeCity("Landlord_Lia", 96, 2),
  makeCity("Grid_Gary", 61, 1),
  makeCity("Notary_Ned", 38, 1),
  makeCity("Newcomer_Nia", 21, 0),
  makeCity("Plots_Paul", 14, 0),
  makeCity("Rent_Rosa", 9, 0),
];
// ownership roads (owner owns target as a card): owner→target
const ROADS: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [3, 6], [5, 7], [1, 8],
];

// ── LAYOUT (the spec prototype) ──

/** Cells of square ring r, clockwise starting at 12 o'clock. 8r cells. */
function ringCellsClockwise(r: number): { x: number; y: number }[] {
  if (r === 0) return [{ x: 0, y: 0 }];
  const cells: { x: number; y: number }[] = [];
  for (let x = -r; x < r; x++) cells.push({ x, y: -r });   // top, L→R
  for (let y = -r; y < r; y++) cells.push({ x: r, y });    // right, T→B
  for (let x = r; x > -r; x--) cells.push({ x, y: r });    // bottom, R→L
  for (let y = r; y > -r; y--) cells.push({ x: -r, y });   // left, B→T
  return cells;
}

/** Hexagon slots for the six Founder landmarks, on ring 2. */
const LANDMARK_SLOTS = [{ x: 0, y: -2 }, { x: 2, y: -1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: -2, y: 1 }, { x: -2, y: -1 }];

interface CityLayout {
  landmarks: { x: number; y: number }[];   // placed landmark slots
  blds: { b: Bld; x: number; y: number }[];
  radius: number;                          // outer ring used
}
function layoutCity(c: CityData): CityLayout {
  const used = new Set<string>(["0,0"]);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) used.add(`${dx},${dy}`); // HQ 3x3
  const landmarks = LANDMARK_SLOTS.slice(0, c.landmarks);
  landmarks.forEach((s) => used.add(`${s.x},${s.y}`));
  const blds: CityLayout["blds"] = [];
  let r = 3;
  for (const b of c.buildings) {
    let placed = false;
    while (!placed) {
      let placedThisScan = false;
      for (const cell of ringCellsClockwise(r)) {
        if (
          !used.has(`${cell.x},${cell.y}`) &&
          !blds.some((p) => p.x === cell.x && p.y === cell.y)
        ) {
          blds.push({ b, x: cell.x, y: cell.y });
          placed = true;
          placedThisScan = true;
          break;
        }
      }
      // Only advance to the next ring when this one is FULL.
      if (!placedThisScan) r++;
      if (r > 60) { placed = true; } // mockup safety
    }
  }
  return { landmarks, blds, radius: Math.max(3, r) };
}

// ── world placement: square-ring clockwise spiral of city plots ──
interface Plot { city: CityData; layout: CityLayout; cx: number; cy: number; half: number; } // cx,cy in world cells
function layoutWorld(): Plot[] {
  const sorted = [...WORLD].sort((a, b) => b.count - a.count);
  const layouts = sorted.map((c) => layoutCity(c));
  const halfOf = (c: CityData, l: CityLayout) => l.radius + 1.6; // plot half-size in "city cells" units

  const plots: Plot[] = [];
  // center = biggest
  plots.push({ city: sorted[0], layout: layouts[0], cx: 0, cy: 0, half: halfOf(sorted[0], layouts[0]) });

  let ring = 1;
  let idx = 1;
  while (idx < sorted.length) {
    const inRing: number[] = [];
    while (idx < sorted.length && inRing.length < 8 * ring) inRing.push(idx++);
    const maxHalf = Math.max(...inRing.map((i) => halfOf(sorted[i], layouts[i])));
    const ringDist = plots[0].half + maxHalf + 4; // from center, per side (rough)
    // param walk around the square perimeter clockwise, slots evenly spaced
    const n = inRing.length;
    for (let s = 0; s < n; s++) {
      const t = s / n + 1 / (2 * n); // fraction of perimeter
      const { x, y } = perimeterPoint(t, ringDist);
      const i = inRing[s];
      plots.push({ city: sorted[i], layout: layouts[i], cx: x, cy: y, half: halfOf(sorted[i], layouts[i]) });
    }
    ring++;
  }
  return plots;
}
/** Point on square perimeter (half=half side) at fraction t, clockwise from top-center. */
function perimeterPoint(t: number, half: number): { x: number; y: number } {
  const side = 2 * half;
  const per = 4 * side;
  let d = t * per;
  if (d < side) return { x: -half + d, y: -half };
  d -= side;
  if (d < side) return { x: half, y: -half + d };
  d -= side;
  if (d < side) return { x: half - d, y: half };
  d -= side;
  return { x: -half, y: half - d };
}

// ── STYLES ──
type StyleId = "blueprint" | "pastel" | "pixel" | "ink";

function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

/** family → fill/stroke per style */
function famColor(style: StyleId, fam: number): { fill: string; stroke: string } {
  const palettes: Record<StyleId, string[]> = {
    blueprint: ["#7FA8C9", "#89B49B", "#C9A97F", "#A893C9", "#C98F8F", "#8FC0C9", "#B9B3A8"],
    pastel: ["#F9C784", "#90E0A6", "#F4978E", "#9BC1F9", "#C7A9F5", "#F7E07A", "#D8D3C8"],
    pixel: ["#3D7DCA", "#3FA34D", "#C0392B", "#8E44AD", "#D68910", "#16A085", "#7F8C8D"],
    ink: ["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#F0EDE6"],
  };
  const strokes: Record<StyleId, string[]> = {
    blueprint: ["#33506B", "#3B5F49", "#6B5335", "#4E3F6B", "#6B4545", "#3F6069", "#5C574E"],
    pastel: ["#8A6A3B", "#3F7A52", "#8A4740", "#3E5E8A", "#6B4E8A", "#8A7A34", "#75705F"],
    pixel: ["#1B2F4B", "#173D1D", "#4A1010", "#2E1440", "#4A3205", "#05332A", "#26292B"],
    ink: ["#1F2328", "#1F2328", "#1F2328", "#1F2328", "#1F2328", "#1F2328", "#1F2328"],
  };
  return { fill: palettes[style][fam], stroke: strokes[style][fam] };
}

function tierScale(tier: number): number {
  // 0.42 .. 1.0 of the cell, by tier 1..14
  return 0.42 + 0.58 * Math.min(1, (tier - 1) / 13);
}

// building rect as SVG bits, per style
function bldSvg(style: StyleId, b: Bld, cx: number, cy: number, cell: number): string {
  const s = tierScale(b.tier) * cell;
  const x = cx - s / 2, y = cy - s / 2;
  const { fill, stroke } = famColor(style, b.fam);
  const sw = style === "pixel" ? 2 : style === "ink" ? 1.4 : 1.2;
  let bits = "";
  if (style === "blueprint") {
    bits = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${fill}" fill-opacity="0.85" stroke="${stroke}" stroke-width="${sw}"/>`;
    if (b.tier >= 8) bits += `<rect x="${(x + s * 0.28).toFixed(1)}" y="${(y + s * 0.28).toFixed(1)}" width="${(s * 0.44).toFixed(1)}" height="${(s * 0.44).toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="0.8"/>`;
    // 2026-10-01 user ruling: the card's AVATAR takes the center of its
    // square whenever the square is legible (world-scale cells skip it).
    if (s >= 24) {
      const av = avatarFor(b.fam, b.tier, cx.toFixed(0), cy.toFixed(0));
      if (av) {
        const d = s * 0.72;
        const cid = `ac${clipSeq++}`;
        bits += `<clipPath id="${cid}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(d / 2).toFixed(1)}"/></clipPath>`;
        bits += `<image href="${av}" x="${(cx - d / 2).toFixed(1)}" y="${(cy - d / 2).toFixed(1)}" width="${d.toFixed(1)}" height="${d.toFixed(1)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`;
        bits += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(d / 2).toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1.6"/>`;
      }
    }
  } else if (style === "pastel") {
    const rr = Math.min(3, s / 5);
    bits = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${rr}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    if (b.tier >= 8) bits += `<line x1="${x.toFixed(1)}" y1="${(y + s * 0.3).toFixed(1)}" x2="${(x + s).toFixed(1)}" y2="${(y + s * 0.3).toFixed(1)}" stroke="${stroke}" stroke-width="1" stroke-opacity="0.6"/>`;
  } else if (style === "pixel") {
    bits = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    // pixel top-lip shading
    bits += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${Math.max(2, s * 0.18).toFixed(1)}" fill="#FFFFFF" fill-opacity="0.28"/>`;
  } else { // ink
    bits = `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    const lines = Math.min(6, Math.max(1, Math.floor(b.tier / 3)));
    for (let i = 1; i <= lines; i++) {
      const yy = y + (s * i) / (lines + 1);
      bits += `<line x1="${(x + 1).toFixed(1)}" y1="${yy.toFixed(1)}" x2="${(x + s - 1).toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${stroke}" stroke-width="0.7" stroke-opacity="0.55"/>`;
    }
    if (b.fam < 6) bits += `<text x="${cx.toFixed(1)}" y="${(cy + 2.2).toFixed(1)}" font-family="monospace" font-size="${Math.max(4, s * 0.42).toFixed(1)}" fill="#1F2328" text-anchor="middle">${FAMILY_GLYPH[b.fam]}</text>`;
  }
  if (b.locked) {
    const lx = x - 1, ly = y - 1, ls = Math.max(4, s * 0.26);
    bits += `<rect x="${lx.toFixed(1)}" y="${(ly - ls * 0.5).toFixed(1)}" width="${ls.toFixed(1)}" height="${ls.toFixed(1)}" rx="1" fill="#1F2328"/><rect x="${(lx + ls * 0.35).toFixed(1)}" y="${(ly - ls * 0.5 + ls * 0.3).toFixed(1)}" width="${Math.max(1, ls * 0.3).toFixed(1)}" height="${Math.max(1, ls * 0.3).toFixed(1)}" fill="#F5C518"/>`;
  }
  return bits;
}

function hqSvg(style: StyleId, cx: number, cy: number, cell: number, avatarKey?: string): string {
  const s = cell * 2.6;
  const x = cx - s / 2, y = cy - s / 2;
  if (style === "ink") {
    return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#1F2328"/><rect x="${x + s * 0.18}" y="${y + s * 0.18}" width="${s * 0.64}" height="${s * 0.64}" fill="#FBFBF9"/><rect x="${x + s * 0.36}" y="${y + s * 0.36}" width="${s * 0.28}" height="${s * 0.28}" fill="#E8590C"/>`;
  }
  if (style === "pixel") {
    return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#22313F" stroke="#0B1219" stroke-width="2"/><rect x="${x + s * 0.2}" y="${y + s * 0.2}" width="${s * 0.6}" height="${s * 0.6}" fill="#F5C518"/><rect x="${x + s * 0.38}" y="${y + s * 0.38}" width="${s * 0.24}" height="${s * 0.24}" fill="#22313F"/>`;
  }
  if (style === "pastel") {
    return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="5" fill="#253764" stroke="#101B33" stroke-width="2"/><rect x="${x + s * 0.2}" y="${y + s * 0.2}" width="${s * 0.6}" height="${s * 0.6}" rx="3" fill="#F5C518"/>`;
  }
  // blueprint: dark plate + gold center square; the city OWNER's avatar sits
  // in that center square whenever the HQ is legible (world + zoom scale).
  let out = `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#2E4A66" stroke="#1B2F42" stroke-width="1.6"/><line x1="${x}" y1="${y}" x2="${x + s}" y2="${y + s}" stroke="#1B2F42" stroke-width="0.8"/><line x1="${x + s}" y1="${y}" x2="${x}" y2="${y + s}" stroke="#1B2F42" stroke-width="0.8"/>`;
  const av = s >= 22 ? avatarFor(avatarKey ?? "hq", "owner") : null;
  if (av) {
    const d = s * 0.52;
    const cid = `hc${clipSeq++}`;
    out += `<clipPath id="${cid}"><circle cx="${cx}" cy="${cy}" r="${(d / 2).toFixed(1)}"/></clipPath>`;
    out += `<image href="${av}" x="${(cx - d / 2).toFixed(1)}" y="${(cy - d / 2).toFixed(1)}" width="${d.toFixed(1)}" height="${d.toFixed(1)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`;
    out += `<circle cx="${cx}" cy="${cy}" r="${(d / 2).toFixed(1)}" fill="none" stroke="#F5C518" stroke-width="2"/>`;
  } else {
    out += `<rect x="${x + s * 0.28}" y="${y + s * 0.28}" width="${s * 0.44}" height="${s * 0.44}" fill="#F5C518" fill-opacity="0.9"/>`;
  }
  return out;
}

function landmarkSvg(style: StyleId, cx: number, cy: number, cell: number): string {
  const s = cell * 1.15;
  const pts = hexPoints(cx, cy, s / 2);
  if (style === "ink") return `<polygon points="${pts}" fill="#FBFBF9" stroke="#1F2328" stroke-width="1.6"/><circle cx="${cx}" cy="${cy}" r="${s * 0.16}" fill="#E8590C"/>`;
  if (style === "pixel") return `<polygon points="${pts}" fill="#F5C518" stroke="#4A3205" stroke-width="2"/><polygon points="${hexPoints(cx, cy, s * 0.24)}" fill="#C0392B"/>`;
  if (style === "pastel") return `<polygon points="${pts}" fill="#F5C518" stroke="#8A6A3B" stroke-width="1.6"/><circle cx="${cx}" cy="${cy}" r="${s * 0.18}" fill="#253764"/>`;
  return `<polygon points="${pts}" fill="#F5C518" fill-opacity="0.92" stroke="#6B5335" stroke-width="1.2"/>`;
}
function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

// ── scene assembly ──
const BG: Record<StyleId, string> = {
  blueprint: "#F4F1E8", pastel: "#FBF4E4", pixel: "#8FBF6A", ink: "#FBFBF9",
};

function gridSvg(style: StyleId, W: number): string {
  if (style === "blueprint") {
    let g = "";
    for (let i = 0; i <= W; i += 32) g += `<line x1="${i}" y1="0" x2="${i}" y2="${W}" stroke="#9FB4C4" stroke-width="0.5" stroke-opacity="0.5"/><line x1="0" y1="${i}" x2="${W}" y2="${i}" stroke="#9FB4C4" stroke-width="0.5" stroke-opacity="0.5"/>`;
    return g;
  }
  if (style === "pixel") {
    let g = "";
    for (let y = 0; y < W; y += 16) for (let x = 0; x < W; x += 16) if (((x / 16) + (y / 16)) % 2 === 0) g += `<rect x="${x}" y="${y}" width="16" height="16" fill="#000" fill-opacity="0.045"/>`;
    return g;
  }
  return "";
}

function drawCity(style: StyleId, plot: Plot, ox: number, oy: number, cell: number, label: boolean): string {
  const L = plot.layout;
  const cx = ox, cy = oy;
  // plot ground pad
  const padHalf = (L.radius + 1.6) * cell;
  let svg = "";
  if (style === "pastel") svg += `<rect x="${(cx - padHalf).toFixed(1)}" y="${(cy - padHalf).toFixed(1)}" width="${(padHalf * 2).toFixed(1)}" height="${(padHalf * 2).toFixed(1)}" rx="8" fill="#E4EFD9" stroke="#B9CBA6" stroke-width="1"/>`;
  if (style === "ink" && plot.city.isYou) svg += `<rect x="${(cx - padHalf).toFixed(1)}" y="${(cy - padHalf).toFixed(1)}" width="${(padHalf * 2).toFixed(1)}" height="${(padHalf * 2).toFixed(1)}" fill="none" stroke="#E8590C" stroke-width="2" stroke-dasharray="6 4"/>`;
  svg += hqSvg(style, cx, cy, cell, plot.city.name);
  for (let i = 0; i < L.landmarks.length; i++) {
    const s = L.landmarks[i];
    svg += landmarkSvg(style, cx + s.x * cell, cy + s.y * cell, cell);
  }
  for (const p of L.blds) svg += bldSvg(style, p.b, cx + p.x * cell, cy + p.y * cell, cell);
  if (label) {
    const fs = Math.max(9, cell * 1.15);
    const ly = cy + padHalf + fs + 3;
    const labelFill = style === "pixel" ? "#10240E" : style === "ink" ? "#1F2328" : "#3A3630";
    svg += `<text x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="${style === "ink" || style === "blueprint" ? "monospace" : "sans-serif"}" font-size="${fs.toFixed(1)}" font-weight="700" fill="${labelFill}" text-anchor="middle">${esc(plot.city.name)} · ${plot.city.count}</text>`;
  }
  return svg;
}

function worldSvg(style: StyleId): string {
  const W = 1024;
  const plots = layoutWorld();
  // world cell unit: fit everything
  const maxExtent = Math.max(
    ...plots.map((p) => Math.max(Math.abs(p.cx) + p.half, Math.abs(p.cy) + p.half)),
    1
  );
  const cell = (W / 2 - 70) / maxExtent;
  const ox = W / 2, oy = W / 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">`;
  svg += `<rect width="${W}" height="${W}" fill="${BG[style]}"/>`;
  svg += gridSvg(style, W);

  // roads first (under plots)
  for (const [a, b] of ROADS) {
    const pa = plots[a], pb = plots[b];
    const x1 = ox + pa.cx * cell, y1 = oy + pa.cy * cell, x2 = ox + pb.cx * cell, y2 = oy + pb.cy * cell;
    if (style === "blueprint") svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#5A7186" stroke-width="2.2" stroke-dasharray="7 5"/>`;
    else if (style === "pastel") svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#C9B79A" stroke-width="5" stroke-linecap="round"/><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#FBF4E4" stroke-width="1.1" stroke-dasharray="6 7"/>`;
    else if (style === "pixel") svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#8A6F4D" stroke-width="5"/><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#B99B72" stroke-width="1.6" stroke-dasharray="3 6"/>`;
    else svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#E8590C" stroke-width="1.6" stroke-opacity="0.85"/>`;
  }

  for (const p of plots) svg += drawCity(style, p, ox + p.cx * cell, oy + p.cy * cell, cell, true);

  // plate / title block
  const title: Record<StyleId, string> = {
    blueprint: "N38WORTH — CITY GRID · SURVEY PLATE 01 · ALL CITIES, ONE MAP",
    pastel: "n38worth — your city among cities",
    pixel: "N38WORTH WORLD MAP — 1:1",
    ink: "n38worth · the shared city map",
  };
  const tf = style === "ink" ? "#1F2328" : style === "pixel" ? "#10240E" : "#3A3630";
  svg += `<text x="24" y="${W - 22}" font-family="${style === "pixel" ? "monospace" : "sans-serif"}" font-size="13" font-weight="700" fill="${tf}" fill-opacity="0.75">${title[style]}</text>`;
  svg += `</svg>`;
  return svg;
}

function zoomSvg(style: StyleId): string {
  const W = 1024;
  const city = WORLD[0];
  const L = layoutCity(city);
  const cell = (W / 2 - 40) / (L.radius + 1.6);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">`;
  svg += `<rect width="${W}" height="${W}" fill="${BG[style]}"/>`;
  svg += gridSvg(style, W);
  svg += drawCity(style, { city, layout: L, cx: 0, cy: 0, half: L.radius + 1.6 }, W / 2, W / 2, cell, false);
  // legend
  let lx = 24, ly = 30;
  const legFs = 13;
  const tf = style === "ink" ? "#1F2328" : "#3A3630";
  svg += `<text x="${lx}" y="${ly}" font-family="sans-serif" font-size="15" font-weight="800" fill="${tf}">${esc(city.name)} — ${city.count} buildings · zoomed view</text>`;
  ly += 22;
  for (let f = 0; f < 7; f++) {
    const { fill, stroke } = famColor(style, f);
    svg += `<rect x="${lx}" y="${ly - 9}" width="12" height="12" fill="${fill}" stroke="${stroke}" stroke-width="1"/><text x="${lx + 17}" y="${ly + 1}" font-family="sans-serif" font-size="${legFs}" fill="${tf}">${FAMILY_NAMES[f]}</text>`;
    lx += 150;
    if (f === 3) { lx = 24; ly += 20; }
  }
  svg += `<polygon points="${hexPoints(30, ly + 8, 7)}" fill="#F5C518" stroke="#6B5335" stroke-width="1"/><text x="42" y="${ly + 12}" font-family="sans-serif" font-size="${legFs}" fill="${tf}">Founder landmark</text>`;
  svg += `<rect x="${228}" y="${ly + 1}" width="9" height="9" fill="#1F2328"/><rect x="${231}" y="${ly + 4}" width="3" height="3" fill="#F5C518"/><text x="242" y="${ly + 12}" font-family="sans-serif" font-size="${legFs}" fill="${tf}">Deed lock / Iron deed</text>`;
  svg += `</svg>`;
  return svg;
}

// ── render all ──
async function main() {
  const outDir = "docs/city-2d-mockups";
  mkdirSync(outDir, { recursive: true });
  await loadAvatars();
  // 2026-10-01 user pick: STYLE A (Blueprint) + avatars in the squares.
  const styles: StyleId[] = ["blueprint"];
  for (const s of styles) {
    for (const [name, svg] of [["world-avatars", worldSvg(s)], ["zoom-avatars", zoomSvg(s)]] as const) {
      const buf = Buffer.from(svg);
      const png = await sharp(buf, { density: 160 }).png().toBuffer();
      writeFileSync(`${outDir}/mockup-${s}-${name}.png`, png);
      console.log(`wrote ${outDir}/mockup-${s}-${name}.png (${(png.length / 1024).toFixed(0)} KB)`);
    }
  }
}
main();
