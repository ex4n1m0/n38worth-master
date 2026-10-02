/**
 * map3d ART-GEOMETRY — compiles the CARD ART (building-art.ts ArtSpec) into
 * volumetric primitives for the 3D renderer ("buildings details like the
 * isometric view" ruling, 2026-10-02).
 *
 * The card art is drawn in 2:1 iso with pvBox triplets (left face / right
 * face / top diamond). This module detects those faces and reinterprets each
 * box as a REAL 3D box at the same position/size/color, so family
 * silhouettes, stacked masses, windows, halos, antennas and beacons all
 * carry into 3D from the ONE shared art source — no second art pipeline.
 *
 * Pure data out (no three.js): the engine turns these into BufferGeometry.
 * Coordinate mapping (k = cells per art px): worldX = (artX − w/2)·k,
 * worldY = (h − artY)·k (art y grows down), z = 0 plane, square footprints.
 */

import type { ArtSpec, ArtShape } from "@/lib/city/building-art";

export interface VolBox {
  /** Center X (cells). */
  x: number;
  /** Center Z (cells). */
  z: number;
  /** Footprint width/depth (cells). */
  w: number;
  d: number;
  /** Bottom Y (cells). */
  y0: number;
  /** Top Y (cells). */
  y1: number;
  color: string;
}

export interface VolSphere {
  x: number;
  y: number;
  z: number;
  r: number;
  squashY: number;
  color: string;
}

export interface VolTorus {
  x: number;
  y: number;
  z: number;
  r: number;
  tube: number;
  color: string;
}

export interface ArtVolumes {
  boxes: VolBox[];
  spheres: VolSphere[];
  tori: VolTorus[];
  /** Overall footprint width incl. overhangs (cells). */
  widthCells: number;
  /** Overall height (cells). */
  heightCells: number;
  /** Half-width of the main (tallest) mass — wall anchor for facade quads. */
  mainHalfW: number;
}

function unshade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) / k));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) / k));
  const b = Math.min(255, Math.round((n & 0xff) / k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** pvBox LEFT face: p0,p3 share x (left edge), p1,p2 share x (right edge),
 *  right edge lower than the left top → carries cx/baseY/hw/h. */
function parseLeftFace(pts: Array<[number, number]>):
  | { cx: number; baseY: number; hw: number; h: number }
  | null {
  if (pts.length !== 4) return null;
  const [p0, p1, p2, p3] = pts;
  if (Math.abs(p0[0] - p3[0]) > 0.01 || Math.abs(p1[0] - p2[0]) > 0.01) return null;
  if (p1[0] - p0[0] <= 0.01) return null; // right face / diamond excluded
  if (p3[1] <= p0[1] + 0.01) return null; // must extend downward
  const hw = p1[0] - p0[0];
  const h = p2[1] - p1[1];
  if (h <= 0.01) return null;
  return { cx: p1[0], baseY: p3[1], hw, h };
}

/**
 * Compile one ArtSpec to volumes. `k` = cells per art pixel (the iso view
 * uses tierScale(tier)·1.45/128 — matching it keeps 3D massing ≈ iso massing).
 */
export function compileArtToVolumes(spec: ArtSpec, k: number): ArtVolumes {
  const boxes: VolBox[] = [];
  const spheres: VolSphere[] = [];
  const tori: VolTorus[] = [];
  const windowRects: ArtShape[] = [];
  const toX = (artX: number) => (artX - spec.w / 2) * k;
  const toY = (artY: number) => (spec.h - artY) * k;

  const pushBox = (
    cxArt: number,
    baseYArt: number,
    wArt: number,
    hArt: number,
    color: string,
    depthFactor = 0.85
  ) => {
    const w = wArt * k;
    boxes.push({
      x: toX(cxArt),
      z: 0,
      w,
      d: Math.max(0.04, w * depthFactor),
      y0: toY(baseYArt),
      y1: toY(baseYArt - hArt),
      color,
    });
  };

  for (const s of spec.shapes) {
    if (s.kind === "poly") {
      const face = parseLeftFace(s.pts);
      if (face) {
        // pvBox: real volumetric box, color un-shaded from the 0.62 left face.
        pushBox(face.cx, face.baseY, face.hw * 2, face.h, unshade(s.fill ?? "#888888", 0.62));
        continue;
      }
      if (s.fill && s.fill !== "none") {
        // Free polygon (shards, pyramid steps, pads): bbox slab with the
        // polygon's own color — flat pads get a shallow box.
        const xs = s.pts.map((p) => p[0]);
        const ys = s.pts.map((p) => p[1]);
        const wArt = Math.max(...xs) - Math.min(...xs);
        const hArt = Math.max(...ys) - Math.min(...ys);
        const maxArt = spec.h;
        const isPad = hArt < maxArt * 0.2 && toY(Math.max(...ys)) < 0.12;
        pushBox(
          (Math.min(...xs) + Math.max(...xs)) / 2,
          Math.max(...ys),
          wArt,
          isPad ? Math.max(1.5, hArt) : hArt,
          s.fill,
          isPad ? 0.9 : 0.5
        );
      }
    } else if (s.kind === "rect") {
      const wk = s.w * k;
      const hk = s.h * k;
      if (Math.min(wk, hk) < 0.09) {
        windowRects.push(s); // lit-window dots → facade quads after main box
      } else if (s.fill && s.fill !== "none") {
        // Glass cores, LED strips, plates: thin boxes at their spot.
        pushBox(s.x + s.w / 2, s.y + s.h, s.w, s.h, s.fill, 0.7);
      }
    } else if (s.kind === "ellipse") {
      if (s.fill && s.fill !== "none") {
        spheres.push({
          x: toX(s.cx),
          y: toY(s.cy),
          z: 0,
          r: s.rx * k,
          squashY: Math.min(1, s.ry / Math.max(0.01, s.rx)),
          color: s.fill,
        });
      } else if (s.stroke) {
        tori.push({
          x: toX(s.cx),
          y: toY(s.cy),
          z: 0,
          r: s.rx * k,
          tube: Math.max(0.012, (s.strokeW ?? 1.5) * k * 0.5),
          color: s.stroke,
        });
      }
    } else if (s.kind === "circle") {
      if (s.fill && s.fill !== "none") {
        spheres.push({ x: toX(s.cx), y: toY(s.cy), z: 0, r: s.r * k, squashY: 1, color: s.fill });
      } else if (s.stroke) {
        tori.push({
          x: toX(s.cx),
          y: toY(s.cy),
          z: 0,
          r: s.r * k,
          tube: Math.max(0.012, (s.strokeW ?? 1.5) * k * 0.5),
          color: s.stroke,
        });
      }
    } else if (s.kind === "line") {
      const dx = Math.abs(s.x2 - s.x1);
      const dy = Math.abs(s.y2 - s.y1);
      const th = Math.max(0.02, s.strokeW * k);
      if (dy >= dx) {
        // vertical mast/antenna
        pushBox(s.x1, Math.max(s.y1, s.y2), th / k, dy + th, s.stroke, 0.4);
      } else {
        pushBox((s.x1 + s.x2) / 2, Math.max(s.y1, s.y2), dx + th, th / k, s.stroke, 0.4);
      }
    }
    // paths (monument arcs) are skipped — below map legibility
  }

  // Facade windows: thin quads ON the main mass walls (mirrored to all four
  // sides so lit windows read from any camera rotation).
  let mainHalfW = 0;
  let mainTop = 0;
  for (const b of boxes) {
    const bh = b.y1 - b.y0;
    if (bh > mainTop) {
      mainTop = bh;
      mainHalfW = b.w / 2;
    }
  }
  for (const r of windowRects) {
    if (r.kind !== "rect") continue;
    const yMid = toY(r.y + r.h / 2);
    const h = Math.max(0.035, r.h * k);
    const along = Math.max(0.045, r.w * k * 2.4);
    const off = toX(r.x);
    for (const side of [-1, 1]) {
      boxes.push({
        x: side * (mainHalfW + 0.012),
        z: off,
        w: 0.018,
        d: along,
        y0: yMid - h / 2,
        y1: yMid + h / 2,
        color: r.fill ?? "#ffb547",
      });
      boxes.push({
        x: off,
        z: side * (mainHalfW * 0.85 + 0.012),
        w: along,
        d: 0.018,
        y0: yMid - h / 2,
        y1: yMid + h / 2,
        color: r.fill ?? "#ffb547",
      });
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let topY = 0;
  for (const b of boxes) {
    minX = Math.min(minX, b.x - b.w / 2);
    maxX = Math.max(maxX, b.x + b.w / 2);
    topY = Math.max(topY, b.y1);
  }
  for (const s of spheres) topY = Math.max(topY, s.y + s.r * s.squashY);
  for (const t of tori) topY = Math.max(topY, t.y + t.tube);

  return {
    boxes,
    spheres,
    tori,
    widthCells: Number.isFinite(minX) ? maxX - minX : 1,
    heightCells: topY,
    mainHalfW,
  };
}
