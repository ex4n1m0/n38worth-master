/**
 * VOLUME-ART — cards render the COMPILED VOLUMES (user ruling 2026-10-02:
 * "make the drawing on the card match the 3D map view").
 *
 * Pure projection of ArtVolumes (art-geometry.ts — the exact volumes the 3D
 * engine draws) into a 2:1 isometric ArtSpec: every VolBox becomes three
 * face polygons shaded with the SAME constants as the engine's GeoWriter
 * (0.95 +x / 0.8 +z / 1.2 top), spheres become ellipses, tori become
 * flattened stroked ellipses. Because both renderers consume ONE compiled
 * source, the card and the 3D view cannot drift apart — whatever fails to
 * compile (paths, sub-cell details) also disappears from the card, which is
 * the intended simplification.
 *
 * Painter order: depth = x + z ascending (far first), ties by y0 (ground
 * up). The rooftop beacon (compiler-marked pulse sphere) keeps its CSS
 * pulse on cards only — the canvas/3D views stay static by ruling.
 */

import type { ArtShape, ArtSpec } from "@/lib/city/building-art";
import { shadeHex } from "@/lib/city/building-art";
import type { ArtVolumes, VolBox } from "@/lib/city/map3d/art-geometry";

// Face-shading constants — must match the 3D engine's GeoWriter exactly.
const SHADE_RIGHT = 0.95; // +x face (screen right)
const SHADE_LEFT = 0.8; // +z face (screen left)
const SHADE_TOP = 1.2; // top face

interface Drawable {
  depth: number;
  y0: number;
  emit: (push: (s: ArtShape) => void, P: (x: number, y: number, z: number) => [number, number]) => void;
}

export function volumesToCardArt(
  vols: ArtVolumes,
  opts: { targetWidth?: number; pad?: number } = {}
): ArtSpec {
  const targetW = opts.targetWidth ?? 128;
  const pad = opts.pad ?? 6;

  // 2:1 iso projection (before scaling): sx = x − z, sy = −y + (x + z)/2.
  const proj = (x: number, y: number, z: number): [number, number] => [
    x - z,
    -y + (x + z) * 0.5,
  ];

  const drawables: Drawable[] = [];

  const boxDrawable = (b: VolBox): Drawable => ({
    depth: b.x + b.z,
    y0: b.y0,
    emit: (push, P) => {
      const hw = b.w / 2;
      const hd = b.d / 2;
      // +z face (screen left, shade 0.8)
      push({
        kind: "poly",
        pts: [
          P(b.x - hw, b.y0, b.z + hd),
          P(b.x + hw, b.y0, b.z + hd),
          P(b.x + hw, b.y1, b.z + hd),
          P(b.x - hw, b.y1, b.z + hd),
        ],
        fill: shadeHex(b.color, SHADE_LEFT),
      });
      // +x face (screen right, shade 0.95)
      push({
        kind: "poly",
        pts: [
          P(b.x + hw, b.y0, b.z + hd),
          P(b.x + hw, b.y0, b.z - hd),
          P(b.x + hw, b.y1, b.z - hd),
          P(b.x + hw, b.y1, b.z + hd),
        ],
        fill: shadeHex(b.color, SHADE_RIGHT),
      });
      // top face (shade 1.2)
      push({
        kind: "poly",
        pts: [
          P(b.x - hw, b.y1, b.z + hd),
          P(b.x + hw, b.y1, b.z + hd),
          P(b.x + hw, b.y1, b.z - hd),
          P(b.x - hw, b.y1, b.z - hd),
        ],
        fill: shadeHex(b.color, SHADE_TOP),
      });
    },
  });

  for (const b of vols.boxes) drawables.push(boxDrawable(b));

  vols.spheres.forEach((s, i) => {
    drawables.push({
      depth: s.x + s.z,
      y0: s.y - s.r,
      emit: (push, P) => {
        const [cx, cy] = P(s.x, s.y, s.z);
        const pulse = i === vols.beaconSphere;
        push({
          kind: "ellipse",
          cx,
          cy,
          rx: s.r,
          ry: s.r * s.squashY,
          fill: s.color,
          ...(pulse ? { pulse: true } : {}),
        });
      },
    });
  });

  for (const t of vols.tori) {
    drawables.push({
      depth: t.x + t.z,
      y0: t.y - t.tube,
      emit: (push, P) => {
        const [cx, cy] = P(t.x, t.y, t.z);
        push({
          kind: "ellipse",
          cx,
          cy,
          rx: t.r,
          ry: t.r * 0.5,
          fill: "none",
          stroke: t.color,
          // tube is the tube RADIUS — stroke ≈ its visible diameter (scaled
          // with the radii in the pass below, clamped there).
          strokeW: t.tube * 1.6,
        });
      },
    });
  }

  drawables.sort((a, b) => a.depth - b.depth || a.y0 - b.y0);

  // Bounds over every projected extreme, then fit to the target width. The
  // height FOLLOWS the content (a taller tier = a taller card), which is how
  // the tier ladder stays readable on cards.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const expand = (x: number, y: number, z: number, r = 0, ry = r) => {
    const [sx, sy] = proj(x, y, z);
    minX = Math.min(minX, sx - r);
    maxX = Math.max(maxX, sx + r);
    minY = Math.min(minY, sy - ry);
    maxY = Math.max(maxY, sy + ry);
  };
  for (const b of vols.boxes) {
    const hw = b.w / 2;
    const hd = b.d / 2;
    expand(b.x - hw, b.y1, b.z + hd);
    expand(b.x + hw, b.y1, b.z - hd);
    expand(b.x + hw, b.y0, b.z + hd);
    expand(b.x - hw, b.y0, b.z - hd);
  }
  for (const s of vols.spheres) expand(s.x, s.y, s.z, s.r, s.r * s.squashY);
  for (const t of vols.tori) expand(t.x, t.y, t.z, t.r + t.tube, t.r * 0.5 + t.tube);
  if (!Number.isFinite(minX)) {
    return { w: targetW, h: targetW, shapes: [] };
  }

  const boundsW = Math.max(1e-6, maxX - minX);
  const boundsH = Math.max(1e-6, maxY - minY);
  const scale = (targetW - pad * 2) / boundsW;
  const w = targetW;
  const h = Math.max(pad * 2, Math.round(boundsH * scale + pad * 2));
  const P = (x: number, y: number, z: number): [number, number] => {
    const [sx, sy] = proj(x, y, z);
    return [(sx - minX) * scale + pad, (sy - minY) * scale + pad];
  };

  const shapes: ArtShape[] = [];
  for (const d of drawables) d.emit((s) => shapes.push(s), P);

  // Spheres/tori were emitted with cell-unit radii — scale them in place.
  for (const s of shapes) {
    if (s.kind === "ellipse") {
      s.rx *= scale;
      s.ry *= scale;
      if (s.strokeW) s.strokeW = Math.max(0.7, s.strokeW * scale);
    }
  }

  return { w, h, shapes };
}
