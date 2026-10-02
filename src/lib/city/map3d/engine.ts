/**
 * map3d ENGINE — the optional 3D world renderer ("free camera rotations"
 * ruling, 2026-10-02). Same shared world as Blueprint/Iso: identical
 * /api/city/world payload + layoutWorld() geometry, every building rendered.
 *
 * Volumetric language: the card art's MASSING + family palettes (map3d/
 * metrics.ts) as real boxes with the pvBox face-shading constants baked into
 * vertex colors (0.62 left / 0.95 right / 1.2 top) — towers read as the same
 * art language, but rotatable, with a sun and soft shadows.
 *
 * Deliberately MINIMAL (the 2026-10-01 deletion taught us the maintenance
 * cost of a full scene framework): no addons imports, no GLB kit, no LOD
 * ladders — one custom orbit controller, one InstancedMesh per family, one
 * shadow-casting sun, render-on-demand (idle frames do no GPU work).
 */

import * as THREE from "three";
import {
  layoutWorld,
  landmarkCanonicalIndex,
  type WorldPlot,
} from "@/lib/city/map2d/layout";
import { buildingArt, monumentArt } from "@/lib/city/building-art";
import {
  ART_K,
  HQ_K,
  MONUMENT_K,
  compileArtToVolumes,
  type ArtVolumes,
} from "@/lib/city/map3d/art-geometry";
import { familyJitter } from "@/lib/city/map3d/metrics";
import { OBJECT_GAP_FACTOR } from "@/lib/city/map2d/draw";
import { FAMILY_KEYS } from "@/lib/city/map2d/families";

// Scene-look constants shared with the catalog plate renderer (map3d/plate.ts)
// so offscreen shots match the world view exactly.
export const PAPER_BG = "#F4F1E8";
export const PAPER_GROUND = "#EFE9DA";
export const GRID_INK = 0x9fb4c4;
export const INK = "#33506B";
export const GOLD = "#F5C518";
const YOU = "#E8590C";
const ROAD = "#5A7186";
// World floor (CITY_FLOOR_STUDY, 2026-10-02) — mirrors BLUEPRINT.floor in
// map2d/palette.ts (the 2D palette is canonical). The catalog plate renderer
// keeps PAPER_*; only the world scene uses these.
export const FIELD = "#2F5226";
export const CITY_FLOOR = "#808080";

export type Hit3D =
  | { kind: "building"; username: string; cardId: number }
  | { kind: "hq"; username: string }
  | { kind: "landmark"; username: string; slotIndex: number }
  | { kind: "prop"; username: string; prop: string };

export interface WorldExtras {
  roads: { from: string; to: string }[];
  raidHits?: { username: string; hits: number }[];
  bountyTargets?: { username: string; count: number; totalReward: number }[];
}

export interface Selection3D {
  ownUsername: string;
  selectedCardId: number | null;
  selectedUniverseBuilding: { username: string; cardId: number } | null;
}

interface CellRef {
  username: string;
  cardId: number;
  wx: number;
  wy: number;
  w: number;
}

/** Flat diamond (iso ground pad) directly in the XZ plane — no rotateX
 *  mirroring surprises. Shared with the catalog plate renderer. */
export function diamondGeometry(cx: number, cz: number, half: number): THREE.BufferGeometry {
  const verts = new Float32Array([
    cx, 0, cz,
    cx, 0, cz - half,
    cx + half, 0, cz,
    cx, 0, cz + half,
    cx - half, 0, cz,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
  geo.computeVertexNormals();
  return geo;
}

function labelTexture(text: string, tint = "#3A3630"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(244, 241, 232, 0.92)";
  ctx.strokeStyle = "rgba(51, 80, 107, 0.45)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(4, 8, 248, 48, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tint;
  ctx.font = "700 26px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.length > 22 ? text.slice(0, 21) + "…" : text, 128, 33, 224);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── ArtSpec → BufferGeometry (the card details, volumetric) ────────────────

/** Merged-geometry writer with the pvBox face-shading constants baked in. */
class GeoWriter {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private v = 0;

  private quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
    r: number, g: number, b: number
  ) {
    const p = this.pos;
    p.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    for (let i = 0; i < 4; i++) this.nor.push(nx, ny, nz);
    this.col.push(r, g, b, r, g, b, r, g, b, r, g, b);
    this.idx.push(this.v, this.v + 1, this.v + 2, this.v, this.v + 2, this.v + 3);
    this.v += 4;
  }

  box(x: number, y0: number, y1: number, z: number, w: number, d: number, hex: string) {
    const c = new THREE.Color(hex);
    const R = c.r, G = c.g, B = c.b;
    const hw = w / 2, hd = d / 2;
    // -x face (shade 0.62), +x (0.95), -z/+z (0.8), top (1.2), bottom (0.45)
    this.quad(x - hw, y0, z - hd, x - hw, y0, z + hd, x - hw, y1, z + hd, x - hw, y1, z - hd, -1, 0, 0, R * 0.62, G * 0.62, B * 0.62);
    this.quad(x + hw, y0, z + hd, x + hw, y0, z - hd, x + hw, y1, z - hd, x + hw, y1, z + hd, 1, 0, 0, R * 0.95, G * 0.95, B * 0.95);
    this.quad(x + hw, y0, z - hd, x - hw, y0, z - hd, x - hw, y1, z - hd, x + hw, y1, z - hd, 0, 0, -1, R * 0.8, G * 0.8, B * 0.8);
    this.quad(x - hw, y0, z + hd, x + hw, y0, z + hd, x + hw, y1, z + hd, x - hw, y1, z + hd, 0, 0, 1, R * 0.8, G * 0.8, B * 0.8);
    this.quad(x - hw, y1, z + hd, x + hw, y1, z + hd, x + hw, y1, z - hd, x - hw, y1, z - hd, 0, 1, 0, Math.min(1, R * 1.2), Math.min(1, G * 1.2), Math.min(1, B * 1.2));
    this.quad(x - hw, y0, z - hd, x + hw, y0, z - hd, x + hw, y0, z + hd, x - hw, y0, z + hd, 0, -1, 0, R * 0.45, G * 0.45, B * 0.45);
  }

  sphere(x: number, y: number, z: number, r: number, squashY: number, hex: string) {
    const c = new THREE.Color(hex);
    const LAT = 6, LON = 8;
    const pt = (i: number, j: number): [number, number, number] => {
      const phi = (i / LAT) * Math.PI;
      const th = (j / LON) * Math.PI * 2;
      return [x + r * Math.sin(phi) * Math.cos(th), y + r * squashY * Math.cos(phi), z + r * Math.sin(phi) * Math.sin(th)];
    };
    for (let i = 0; i < LAT; i++) {
      for (let j = 0; j < LON; j++) {
        const a = pt(i, j), b = pt(i + 1, j), cc = pt(i + 1, j + 1), d = pt(i, j + 1);
        const cx = (a[0] + cc[0]) / 2 - x, cy = (a[1] + cc[1]) / 2 - y, cz = (a[2] + cc[2]) / 2 - z;
        const len = Math.hypot(cx, cy, cz) || 1;
        this.quad(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2], d[0], d[1], d[2], cx / len, cy / len, cz / len, c.r, c.g, c.b);
      }
    }
  }

  torus(x: number, y: number, z: number, r: number, tube: number, hex: string) {
    const c = new THREE.Color(hex);
    const SEG = 16, TSEG = 6;
    const pt = (i: number, j: number): [number, number, number] => {
      const a = (i / SEG) * Math.PI * 2;
      const b = (j / TSEG) * Math.PI * 2;
      return [x + (r + tube * Math.cos(b)) * Math.cos(a), y + tube * Math.sin(b), z + (r + tube * Math.cos(b)) * Math.sin(a)];
    };
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < TSEG; j++) {
        const a = pt(i, j), b = pt(i + 1, j), cc = pt(i + 1, j + 1), d = pt(i, j + 1);
        const cx = (a[0] + cc[0]) / 2 - x, cy = (a[1] + cc[1]) / 2 - y, cz = (a[2] + cc[2]) / 2 - z;
        const len = Math.hypot(cx, cy, cz) || 1;
        this.quad(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2], d[0], d[1], d[2], cx / len, cy / len, cz / len, c.r, c.g, c.b);
      }
    }
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    return geo;
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }
}

export function volumesToGeometry(vols: ArtVolumes): THREE.BufferGeometry {
  const w = new GeoWriter();
  for (const b of vols.boxes) w.box(b.x, b.y0, b.y1, b.z, b.w, b.d, b.color);
  for (const s of vols.spheres) w.sphere(s.x, s.y, s.z, s.r, s.squashY, s.color);
  for (const t of vols.tori) w.torus(t.x, t.y, t.z, t.r, t.tube, t.color);
  return w.build();
}

/** Per-(family, tier) compiled card art — one geometry instanced per class
 *  (window pattern class-wide; per-card seed variety is invisible at map
 *  scale). Module cache survives world refreshes; capped. Also used by the
 *  catalog plate renderer — never fork this pipeline. */
const classGeoCache = new Map<string, { geo: THREE.BufferGeometry; width: number }>();

export function artClassGeometry(familyIndex: number, tier: number): { geo: THREE.BufferGeometry; width: number } | null {
  const key = `${familyIndex}|${tier}`;
  const hit = classGeoCache.get(key);
  if (hit) return hit;
  if (classGeoCache.size > 160) {
    for (const [, v] of classGeoCache) v.geo.dispose();
    classGeoCache.clear();
  }
  const family =
    familyIndex >= 0 && familyIndex < FAMILY_KEYS.length
      ? FAMILY_KEYS[familyIndex]
      : null;
  const k = ART_K(tier);
  const vols = compileArtToVolumes(buildingArt({ tier, family, seed: 0 }), k);
  const entry = { geo: volumesToGeometry(vols), width: vols.widthCells };
  classGeoCache.set(key, entry);
  return entry;
}

/** Volumetric scale constants live in art-geometry (shared with the card's
 *  volume renderer — card-matches-3D ruling, 2026-10-02); re-exported here
 *  for existing importers. */
export { HQ_K, MONUMENT_K } from "@/lib/city/map3d/art-geometry";

export function seedOfString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

// ── standalone subject builders (shared by the world engine + catalog) ─────
//
// These build the Object3D ONLY — position, userData and raycast registration
// stay with the engine; the catalog plate renderer (map3d/plate.ts) calls the
// same builders so the two can never drift apart.

export function buildMonumentObject(canonicalIndex: number): THREE.Group {
  // The Founder monuments render through the card monument art (monumentArt
  // → volumes): spires, citadels, observatory domes, obelisks, pyramids.
  const vols = compileArtToVolumes(monumentArt(canonicalIndex), MONUMENT_K);
  const mesh = new THREE.Mesh(
    volumesToGeometry(vols),
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

export function buildHqObject(
  stage: number,
  profession: string | null,
  seed: number,
  plaque?: { username: string; onTextureReady?: () => void }
): THREE.Group {
  const g = new THREE.Group();
  const stg = Math.max(1, Math.min(3, stage));
  // platform + gold mast/beacon (the one crown no regular building has);
  // the tower body itself is the OWNER'S family grand megaform from the
  // shared card art (tiers 10/12/14 by stage — always the tallest).
  const plateGeo = new THREE.BoxGeometry(3, 0.3, 3);
  const plate = new THREE.Mesh(plateGeo, new THREE.MeshLambertMaterial({ color: "#2E4A66" }));
  plate.position.y = 0.15;
  plate.receiveShadow = true;
  g.add(plate);
  const tier = Math.min(14, 10 + (stg - 1) * 2);
  const art = buildingArt({ tier, family: profession, seed });
  const vols = compileArtToVolumes(art, HQ_K);
  const body = new THREE.Mesh(
    volumesToGeometry(vols),
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  body.position.y = 0.28;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const goldMat = new THREE.MeshBasicMaterial({ color: GOLD });
  const H = vols.heightCells + 0.28;
  // Mast grows with stage (F10, 2026-10-02) so the three HQ stages read
  // apart even before the body ladder (t10/12/14) kicks in.
  const mastH = 0.7 + stg * 0.25;
  const mastGeo = new THREE.CylinderGeometry(0.04, 0.04, mastH, 6);
  const mast = new THREE.Mesh(mastGeo, goldMat);
  mast.position.y = H + mastH / 2;
  g.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), goldMat);
  beacon.position.y = H + mastH + 0.12;
  g.add(beacon);
  if (stg >= 2) {
    const trimGeo = new THREE.BoxGeometry(2.15, 0.12, 2.15);
    const trim = new THREE.Mesh(trimGeo, goldMat);
    trim.position.y = 0.36;
    g.add(trim);
  }
  if (stg >= 3) {
    // Stage-3 collar: a gold ring AROUND the body base — an inner trim box
    // would hide inside the body silhouette (QA 2026-10-02).
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.06, 8, 32),
      goldMat
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.5;
    g.add(collar);
  }
  if (plaque) {
    const p = buildAvatarPlaque(plaque.username, plaque.onTextureReady);
    p.position.set(0, 1.15, 2.0);
    p.scale.set(1.05, 1.05, 1);
    g.add(p);
  }
  return g;
}

/** Gold-ringed circular avatar plaque on a canvas texture; the photo loads
 *  async and re-renders when it arrives (render-on-demand dirty flip via
 *  the optional callback). Shared by the world engine and catalog plates. */
export function buildAvatarPlaque(
  username: string,
  onTextureReady?: () => void
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const draw = (img: HTMLImageElement | null) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 128, 128);
    ctx.save();
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#EFE9DA";
    ctx.fillRect(0, 0, 128, 128);
    if (img) {
      ctx.drawImage(img, 14, 14, 100, 100);
    } else {
      ctx.fillStyle = "#33506B";
      ctx.font = "700 44px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(username.slice(0, 1).toUpperCase(), 64, 66);
    }
    ctx.restore();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.stroke();
  };
  draw(null);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(0.95, 0.95, 1);
  sprite.renderOrder = 12;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    draw(img);
    tex.needsUpdate = true;
    onTextureReady?.();
  };
  img.src = `/api/avatar/${encodeURIComponent(username)}`;
  return sprite;
}

export function buildPropObject(prop: string): THREE.Group {
  // F3 rebuild (2026-10-02): 3D props match their 2D drawings' identity —
  // striped canopy + bulbs, full crane with counterweight + hook, colonnade
  // + finial, dial spokes. Bounded: each stays a handful of primitives.
  const g = new THREE.Group();
  const add = (mesh: THREE.Mesh) => {
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  switch (prop) {
    case "park": {
      const pad = add(
        new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 0.08, 1.1),
          new THREE.MeshLambertMaterial({ color: "#6FA35C" })
        )
      );
      pad.position.y = 0.05;
      const treeGeo = new THREE.ConeGeometry(0.16, 0.4, 6);
      const treeMat = new THREE.MeshLambertMaterial({ color: "#2F5226" });
      for (const [tx, tz] of [
        [-0.25, -0.2],
        [0.22, 0.05],
        [-0.05, 0.25],
      ]) {
        const tree = new THREE.Mesh(treeGeo, treeMat);
        tree.position.set(tx, 0.3, tz);
        add(tree);
      }
      break;
    }
    case "marquee": {
      // Neon Marquee: two posts, striped canopy, bulb row under the lip.
      const postMat = new THREE.MeshLambertMaterial({ color: "#6B5335" });
      const goldMat = new THREE.MeshLambertMaterial({ color: GOLD });
      const bulbMat = new THREE.MeshBasicMaterial({ color: "#FFF3C4" });
      for (const dx of [-0.34, 0.34]) {
        const post = add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.52, 0.09), postMat));
        post.position.set(dx, 0.26, 0.12);
      }
      const canopy = add(new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.16, 0.52), goldMat));
      canopy.position.set(0, 0.58, 0);
      // Paper stripes across the canopy top — matches the 2D drawing's
      // gold/white canopy (QA 2026-10-02 de-mismatch).
      const stripeMat = new THREE.MeshLambertMaterial({ color: "#F4F1E8" });
      for (let i = 0; i < 3; i++) {
        const stripe = add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.54), stripeMat));
        stripe.position.set(-0.32 + i * 0.32, 0.67, 0);
      }
      for (let i = 0; i < 4; i++) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), bulbMat);
        bulb.position.set(-0.33 + i * 0.22, 0.48, 0.24);
        g.add(bulb);
      }
      break;
    }
    case "crane": {
      // Crane Row: base pad, mast, peak ties, jib + counter-jib,
      // counterweight, cable and hook.
      const mat = new THREE.MeshLambertMaterial({ color: INK });
      const base = add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.24), mat));
      base.position.set(0, 0.05, 0);
      const mast = add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.2, 0.09), mat));
      mast.position.set(0, 0.7, 0);
      const apex = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 5), mat));
      apex.position.set(0, 1.39, 0);
      const jib = add(new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.06, 0.06), mat));
      jib.position.set(0.24, 1.28, 0);
      // Peak ties (rotated thin boxes from the apex down to both jib ends).
      for (const [tx, len] of [
        [-0.46, 0.62],
        [0.88, 0.78],
      ] as const) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(len, 0.035, 0.035), mat);
        tie.position.set(tx / 2 + 0.02, 1.335, 0);
        tie.rotation.z = Math.atan2(0.1, Math.abs(tx));
        tie.castShadow = true;
        g.add(tie);
      }
      const counter = add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.13), mat));
      counter.position.set(-0.44, 1.2, 0);
      const cable = add(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.5, 0.025), mat));
      cable.position.set(0.42, 1.02, 0);
      const hook = new THREE.Mesh(
        new THREE.TorusGeometry(0.07, 0.022, 8, 14),
        new THREE.MeshBasicMaterial({ color: INK })
      );
      hook.position.set(0.42, 0.74, 0);
      g.add(hook);
      break;
    }
    case "rotunda": {
      // City Rotunda: colonnade ring + drum + gold dome + finial.
      const colMat = new THREE.MeshLambertMaterial({ color: "#D9D2BE" });
      const goldMat = new THREE.MeshLambertMaterial({ color: GOLD });
      const base = add(
        new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.1, 14), colMat)
      );
      base.position.y = 0.05;
      const colGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.26, 6);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(Math.cos(a) * 0.4, 0.23, Math.sin(a) * 0.4);
        add(col);
      }
      const drum = add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.08, 14), colMat));
      drum.position.y = 0.4;
      const dome = add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.4, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2),
          goldMat
        )
      );
      dome.position.y = 0.44;
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), goldMat);
      finial.position.y = 0.92;
      g.add(finial);
      break;
    }
    case "goldvault": {
      // Golden Vault Emblem: gold plate + dial ring + four spokes + hub.
      const goldMat = new THREE.MeshLambertMaterial({ color: GOLD });
      const box = add(
        new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), goldMat)
      );
      box.position.y = 0.18;
      const dialMat = new THREE.MeshBasicMaterial({ color: "#1B2F42" });
      const dial = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 20), dialMat);
      dial.rotation.x = Math.PI / 2;
      dial.position.y = 0.38;
      g.add(dial);
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 180) * (45 + 90 * i);
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.022, 0.03), dialMat);
        spoke.position.set(Math.cos(a) * 0.11, 0.385, Math.sin(a) * 0.11);
        spoke.rotation.y = -a;
        g.add(spoke);
      }
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), dialMat);
      hub.position.y = 0.39;
      g.add(hub);
      break;
    }
  }
  return g;
}

// ── protection rings (F1 + F11, 2026-10-02) ────────────────────────────────
//
// Deed Lock (timed) reads GOLD, Iron Deed (permanent) reads dark INK — the
// same two-color language as the 2D badges. Shared by the world engine
// (instanced) and the catalog plate renderer (single mesh).

export const PROTECTION_RING = {
  radius: 0.55,
  tube: 0.055,
  colors: { firewall: GOLD, hardlock: "#1B2F42" } as const,
} as const;

/** Single protection ring mesh at the origin (plate renderer use). */
export function buildProtectionRing(kind: "firewall" | "hardlock"): THREE.Mesh {
  const geo = new THREE.TorusGeometry(
    PROTECTION_RING.radius,
    PROTECTION_RING.tube,
    8,
    28
  );
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: PROTECTION_RING.colors[kind] })
  );
  mesh.position.y = 0.07;
  return mesh;
}

export class City3DEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private worldGroup: THREE.Group | null = null;
  private cellRefs: CellRef[] = [];
  private raycastables: THREE.Object3D[] = [];
  private highlight: THREE.Mesh;
  private highlightRingGeo: THREE.TorusGeometry;
  private highlightRingMat: THREE.MeshBasicMaterial;
  private plots: WorldPlot[] = [];
  private focusUsername = "";
  private radiusMax = 120;

  // orbit state (custom, damped)
  private target = new THREE.Vector3(0, 0, 0);
  private flyTarget: THREE.Vector3 | null = null;
  private flyRadius: number | null = null;
  private theta = Math.PI / 4;
  private phi = 1.0;
  private radius = 60;
  private vTheta = 0;
  private vPhi = 0;
  private vRadius = 0;

  private dirty = true;
  private raf = 0;
  private disposed = false;
  private canvas: HTMLCanvasElement;
  private onHit: (hit: Hit3D | null) => void;
  private firstFrameCb: (() => void) | null;
  private firstFrameDone = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number } | null = null;
  private pinchDist = 0;

  constructor(
    canvas: HTMLCanvasElement,
    opts: {
      onHit: (hit: Hit3D | null) => void;
      onFirstFrame?: () => void;
    }
  ) {
    this.canvas = canvas;
    this.onHit = opts.onHit;
    this.firstFrameCb = opts.onFirstFrame ?? null;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(33, 1, 0.5, 600);

    this.scene.background = new THREE.Color(FIELD);
    this.scene.fog = new THREE.Fog(new THREE.Color(FIELD), 120, 340);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c2, 1.0));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(70, 110, 45);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);

    this.highlightRingGeo = new THREE.TorusGeometry(1, 0.05, 8, 32);
    this.highlightRingMat = new THREE.MeshBasicMaterial({ color: YOU });
    this.highlight = new THREE.Mesh(this.highlightRingGeo, this.highlightRingMat);
    this.highlight.rotation.x = Math.PI / 2;
    this.highlight.visible = false;
    this.highlight.renderOrder = 5;
    this.scene.add(this.highlight);

    this.attachInput();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ── world build ──────────────────────────────────────────────────────────

  setWorld(cities: Parameters<typeof layoutWorld>[0], extras: WorldExtras, focusUsername: string) {
    this.clearWorld();
    this.focusUsername = focusUsername;
    this.plots = layoutWorld(cities);

    const group = new THREE.Group();
    this.worldGroup = group;
    this.scene.add(group);

    let maxExtent = 10;
    for (const p of this.plots)
      maxExtent = Math.max(maxExtent, Math.abs(p.cx) + p.half, Math.abs(p.cy) + p.half);
    const groundSize = maxExtent * 2.6;
    this.radiusMax = Math.max(60, maxExtent * 3.2);
    this.camera.far = Math.max(600, maxExtent * 8);
    this.camera.updateProjectionMatrix();
    this.scene.fog = new THREE.Fog(new THREE.Color(FIELD), maxExtent * 2.2, maxExtent * 6);

    // ground + drafting grid — the field green between cities
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize).rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshLambertMaterial({ color: FIELD });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    group.add(ground);
    const grid = new THREE.GridHelper(groundSize, Math.max(8, Math.round(groundSize / 2)), GRID_INK, GRID_INK);
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.16;
    grid.position.y = 0.01;
    group.add(grid);

    const byName = new Map<string, WorldPlot>();
    for (const p of this.plots) byName.set(p.username, p);

    const raidHits = new Map((extras.raidHits ?? []).map((r) => [r.username, r.hits]));
    const bounty = new Map((extras.bountyTargets ?? []).map((b) => [b.username, b.totalReward]));

    // pads + labels + heist markers
    for (const p of this.plots) {
      const half = p.half + 0.2;
      // City floor (CITY_FLOOR_STUDY D1/D3): axis-aligned SQUARE grey plate —
      // the old diamond could never cover corner ring buildings (2r > r+1.8) —
      // Lambert + receiveShadow so building shadows land on the plot, matching
      // the 2D grey extent (half + 0.2) exactly.
      const padGeo = new THREE.PlaneGeometry(half * 2, half * 2).rotateX(-Math.PI / 2);
      const padMat = new THREE.MeshLambertMaterial({ color: CITY_FLOOR });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(p.cx, 0.02, p.cy);
      pad.receiveShadow = true;
      group.add(pad);
      const edge = new THREE.EdgesGeometry(padGeo);
      const borderMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.35 });
      const border = new THREE.LineSegments(edge, borderMat);
      border.position.set(p.cx, 0.03, p.cy);
      group.add(border);
      if (p.username === focusUsername) {
        const youEdge = new THREE.EdgesGeometry(padGeo);
        const youMat = new THREE.LineDashedMaterial({ color: YOU, dashSize: 0.6, gapSize: 0.4 });
        const you = new THREE.LineSegments(youEdge, youMat);
        you.computeLineDistances();
        you.position.set(p.cx, 0.05, p.cy);
        group.add(you);
      }
      const hits = raidHits.get(p.username) ?? 0;
      if (hits > 0) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: labelTexture(`×${hits}`, "#F4F1E8"), depthWrite: false, color: "#8B2E2E" })
        );
        sprite.position.set(p.cx, 0.5, p.cy + half + 0.6);
        sprite.scale.set(2.4, 0.6, 1);
        sprite.renderOrder = 11;
        group.add(sprite);
      }
      const bountyTotal = bounty.get(p.username);
      if (bountyTotal != null && bountyTotal > 0) {
        const geo = new THREE.TorusGeometry(Math.min(2.4, half * 0.5), 0.09, 8, 32);
        const mat = new THREE.MeshBasicMaterial({ color: "#C0392B" });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(p.cx, 0.06, p.cy - half - 0.6);
        group.add(ring);
      }
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: labelTexture(`${p.username} · ${p.city.buildings.length}`), depthWrite: false })
      );
      label.position.set(p.cx, 0.4, p.cy + half + 1.8);
      label.scale.set(5.2, 1.3, 1);
      label.renderOrder = 10;
      group.add(label);
    }

    // roads (dashed, on the ground)
    for (const r of extras.roads) {
      const a = byName.get(r.from);
      const b = byName.get(r.to);
      if (!a || !b) continue;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.cx, 0.03, a.cy),
        new THREE.Vector3(b.cx, 0.03, b.cy),
      ]);
      const mat = new THREE.LineDashedMaterial({ color: ROAD, dashSize: 0.5, gapSize: 0.35 });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      group.add(line);
    }

    // buildings — the CARD ART compiled to geometry, one InstancedMesh per
    // (family, tier) class: family silhouettes, stacked masses, lit windows,
    // halos/antennas all render from the shared building-art.ts source.
    const classCells = new Map<string, { f: number; t: number; cells: { wx: number; wy: number; refIndex: number }[] }>();
    for (const p of this.plots) {
      for (const c of p.layout.cells) {
        this.cellRefs.push({ username: p.username, cardId: c.id, wx: p.cx + c.x, wy: p.cy + c.y, w: 1 });
        const key = `${c.f}|${c.t}`;
        let entry = classCells.get(key);
        if (!entry) {
          entry = { f: c.f, t: c.t, cells: [] };
          classCells.set(key, entry);
        }
        entry.cells.push({ wx: p.cx + c.x, wy: p.cy + c.y, refIndex: this.cellRefs.length - 1 });
      }
    }
    const matrix = new THREE.Matrix4();
    const tint = new THREE.Color();
    // VISUAL-ONLY gap (2026-10-02): footprints shrink to OBJECT_GAP_FACTOR of
    // the cell, heights untouched — cells/rings/shape stay identical to 2D.
    const instPos = new THREE.Vector3();
    const instQuat = new THREE.Quaternion();
    const instScale = new THREE.Vector3(OBJECT_GAP_FACTOR, 1, OBJECT_GAP_FACTOR);
    const buildingMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const [key, entry] of classCells) {
      const cls = artClassGeometry(entry.f, entry.t);
      if (!cls || cls.geo.attributes.position.count === 0) continue;
      for (const cell of entry.cells) this.cellRefs[cell.refIndex].w = cls.width;
      const mesh = new THREE.InstancedMesh(
        cls.geo,
        buildingMaterial,
        entry.cells.length
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { kind: "building", familyCells: entry.cells };
      for (let i = 0; i < entry.cells.length; i++) {
        const cell = entry.cells[i];
        instPos.set(cell.wx, 0, cell.wy);
        matrix.compose(instPos, instQuat, instScale);
        mesh.setMatrixAt(i, matrix);
        tint.setScalar(familyJitter(this.cellRefs[cell.refIndex].cardId));
        mesh.setColorAt(i, tint);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
      this.raycastables.push(mesh);
      void key;
    }

    // Protection rings (F1, 2026-10-02): Deed Lock = gold, Iron Deed = ink —
    // the 3D counterpart of the 2D corner badges, one flat ring hugging each
    // protected tower's base (scaled to the tower's class footprint).
    // Instanced per kind (shared geometry + material, disposed with the
    // world group on rebuild).
    const classWidth = new Map<string, number>();
    for (const [key, entry] of classCells) {
      const cls = artClassGeometry(entry.f, entry.t);
      if (cls) classWidth.set(key, cls.width);
    }
    const ringScale = new THREE.Vector3();
    for (const kind of ["firewall", "hardlock"] as const) {
      const cells: { wx: number; wy: number; s: number }[] = [];
      for (const p of this.plots) {
        for (const c of p.layout.cells) {
          if (c.p !== kind) continue;
          const w = classWidth.get(`${c.f}|${c.t}`) ?? 0.8;
          const s = Math.max(1, (w * OBJECT_GAP_FACTOR) / 2 / PROTECTION_RING.radius + 0.22);
          cells.push({ wx: p.cx + c.x, wy: p.cy + c.y, s });
        }
      }
      if (cells.length === 0) continue;
      const ringGeo = new THREE.TorusGeometry(
        PROTECTION_RING.radius,
        PROTECTION_RING.tube,
        8,
        28
      );
      ringGeo.rotateX(Math.PI / 2);
      const rings = new THREE.InstancedMesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: PROTECTION_RING.colors[kind] }),
        cells.length
      );
      for (let i = 0; i < cells.length; i++) {
        instPos.set(cells[i].wx, 0.07, cells[i].wy);
        ringScale.set(cells[i].s, 1, cells[i].s);
        matrix.compose(instPos, instQuat, ringScale);
        rings.setMatrixAt(i, matrix);
      }
      rings.instanceMatrix.needsUpdate = true;
      group.add(rings);
    }

    // landmarks, HQs, props
    for (const p of this.plots) {
      for (const slot of p.layout.landmarkSlots) {
        group.add(this.makeMonument(p.username, slot.i, p.cx + slot.x, p.cy + slot.y));
      }
      for (const pc of p.layout.propCells) {
        const propObj = buildPropObject(pc.prop);
        propObj.position.set(p.cx + pc.x, 0, p.cy + pc.y);
        propObj.scale.set(OBJECT_GAP_FACTOR, 1, OBJECT_GAP_FACTOR);
        propObj.userData = { kind: "prop", username: p.username, prop: pc.prop };
        group.add(propObj);
        this.raycastables.push(propObj);
      }
      group.add(this.makeHq(p));
    }

    // sun shadow camera covers the whole world
    const s = maxExtent + 12;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.camera.updateProjectionMatrix();

    // open on the focus city (or fit the world)
    const mine = this.plots.find((p) => p.username === focusUsername);
    if (mine) {
      this.target.set(mine.cx, 0, mine.cy);
      this.radius = Math.max(10, (mine.half + 3) * 2.4);
    } else {
      this.target.set(0, 0, 0);
      this.radius = Math.min(this.radiusMax, maxExtent * 2.1);
    }
    this.highlight.visible = false;
    this.dirty = true;
  }

  private makeMonument(username: string, slotIndex: number, x: number, z: number): THREE.Object3D {
    // The Founder monuments render through the card monument art (monumentArt
    // → volumes): spires, citadels, observatory domes, obelisks, pyramids.
    const plot = this.plots.find((p) => p.username === username);
    const canonical = plot ? landmarkCanonicalIndex(plot.city, slotIndex) : slotIndex;
    const g = buildMonumentObject(canonical);
    g.position.set(x, 0, z);
    g.scale.set(OBJECT_GAP_FACTOR, 1, OBJECT_GAP_FACTOR);
    g.userData = { kind: "landmark", username, slotIndex };
    this.raycastables.push(g);
    return g;
  }

  private makeHq(p: WorldPlot): THREE.Object3D {
    // F6 (2026-10-02): the owner's avatar — the 2D map's gold ring, in 3D a
    // gold-ringed billboard plaque floating at the podium front (always
    // faces the free camera, never clips the body). The async photo flip
    // re-renders on demand.
    const g = buildHqObject(p.city.hqStage, p.city.profession, seedOfString(p.username), {
      username: p.username,
      onTextureReady: () => {
        this.dirty = true;
      },
    });
    g.position.set(p.cx, 0, p.cy);
    g.userData = { kind: "hq", username: p.username };
    this.raycastables.push(g);
    return g;
  }

  // ── selection highlight ──────────────────────────────────────────────────

  setSelection(sel: Selection3D) {
    let ref: CellRef | undefined;
    if (sel.selectedCardId != null && sel.ownUsername === this.focusUsername) {
      ref = this.cellRefs.find(
        (c) => c.username === sel.ownUsername && c.cardId === sel.selectedCardId
      );
    } else if (sel.selectedUniverseBuilding) {
      const selB = sel.selectedUniverseBuilding;
      ref = this.cellRefs.find((c) => c.username === selB.username && c.cardId === selB.cardId);
    }
    if (!ref) {
      this.highlight.visible = false;
      this.dirty = true;
      return;
    }
    this.highlight.position.set(ref.wx, 0.06, ref.wy);
    this.highlight.scale.setScalar(Math.max(0.7, ref.w * 0.85 * OBJECT_GAP_FACTOR));
    this.highlight.visible = true;
    this.dirty = true;
  }

  // ── imperative API (Map2DApi parity) ────────────────────────────────────

  focusCell(wx: number, wy: number, radius?: number) {
    this.flyTarget = new THREE.Vector3(wx, 0, wy);
    this.flyRadius = radius ?? Math.min(this.radius, 14);
    this.dirty = true;
  }

  fitWorld() {
    let maxExtent = 10;
    for (const p of this.plots)
      maxExtent = Math.max(maxExtent, Math.abs(p.cx) + p.half, Math.abs(p.cy) + p.half);
    this.flyTarget = new THREE.Vector3(0, 0, 0);
    this.flyRadius = Math.min(this.radiusMax, maxExtent * 2.1);
    this.dirty = true;
  }

  zoomBy(delta: number) {
    this.vRadius += delta > 0 ? this.radius * 0.22 : -this.radius * 0.22;
    this.dirty = true;
  }

  resetCamera() {
    const mine = this.plots.find((p) => p.username === this.focusUsername);
    if (mine) {
      this.flyTarget = new THREE.Vector3(mine.cx, 0, mine.cy);
      this.flyRadius = Math.max(10, (mine.half + 3) * 2.4);
    } else this.fitWorld();
    this.theta = Math.PI / 4;
    this.phi = 1.0;
    this.dirty = true;
  }

  resize(w: number, h: number) {
    if (w < 2 || h < 2) return;
    // updateStyle=true keeps the element's CSS size equal to the stage (the
    // buffer is w·dpr internally) — without it the canvas displays at its
    // intrinsic buffer size and gets cropped on DPR>1 displays.
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ── input: 1-pointer orbit, 2-pointer pan+pinch, wheel zoom, shift/right-drag pan ──

  private onPointerDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) this.dragStart = { x: e.clientX, y: e.clientY };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    this.flyTarget = null;
    this.flyRadius = null;
  };

  private onPointerMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0 && this.pinchDist > 0) {
        this.vRadius += (this.pinchDist / dist - 1) * this.radius * 0.35;
        this.dirty = true;
      }
      this.pinchDist = dist;
      this.panImpulse(-(dx * 0.5), -(dy * 0.5));
      return;
    }

    if (e.buttons === 2 || e.shiftKey) {
      this.panImpulse(-dx, -dy);
      return;
    }
    this.vTheta -= dx * 0.004;
    this.vPhi -= dy * 0.004;
    this.dirty = true;
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    const start = this.dragStart;
    if (this.pointers.size === 0) this.dragStart = null;
    if (!start || e.button === 2) return;
    if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 6) return;
    this.pick(e.clientX, e.clientY);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.vRadius += Math.exp(e.deltaY * 0.0011) * this.radius - this.radius;
    this.flyRadius = null;
    this.dirty = true;
  };

  private onContext = (e: Event) => e.preventDefault();

  private panImpulse(dx: number, dy: number) {
    // screen px → world units along the ground-plane right/forward axes
    const k = this.radius * 0.0016;
    const rightX = Math.cos(this.theta);
    const rightZ = -Math.sin(this.theta);
    const fwdX = Math.sin(this.theta);
    const fwdZ = Math.cos(this.theta);
    this.target.x += (rightX * dx + fwdX * dy) * k;
    this.target.z += (rightZ * dx + fwdZ * dy) * k;
    this.dirty = true;
  }

  private attachInput() {
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.onContext);
  }

  private pick(cx: number, cy: number) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((cx - rect.left) / rect.width) * 2 - 1,
      -((cy - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.raycastables, true);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        const data = obj.userData as {
          kind?: string;
          username?: string;
          slotIndex?: number;
          prop?: string;
          familyCells?: { refIndex: number }[];
        };
        if (data?.kind === "building" && hit.instanceId != null && data.familyCells) {
          const ref = this.cellRefs[data.familyCells[hit.instanceId]?.refIndex ?? -1];
          if (ref) {
            this.onHit({ kind: "building", username: ref.username, cardId: ref.cardId });
            return;
          }
        } else if (data?.kind === "hq" && data.username) {
          this.onHit({ kind: "hq", username: data.username });
          return;
        } else if (data?.kind === "landmark" && data.username && data.slotIndex != null) {
          this.onHit({
            kind: "landmark",
            username: data.username,
            slotIndex: data.slotIndex,
          });
          return;
        } else if (data?.kind === "prop" && data.username && data.prop) {
          this.onHit({ kind: "prop", username: data.username, prop: data.prop });
          return;
        }
        obj = obj.parent;
      }
    }
    this.onHit(null);
  }

  // ── frame loop (render-on-demand; idle frames do no GPU work) ───────────

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    if (this.flyTarget) {
      this.target.lerp(this.flyTarget, 0.14);
      if (this.flyRadius != null) this.radius += (this.flyRadius - this.radius) * 0.14;
      if (this.target.distanceTo(this.flyTarget) < 0.05) {
        this.target.copy(this.flyTarget);
        this.flyTarget = null;
      }
      this.dirty = true;
    }

    if (Math.abs(this.vTheta) + Math.abs(this.vPhi) + Math.abs(this.vRadius) > 1e-4) {
      this.theta += this.vTheta;
      this.phi += this.vPhi;
      this.radius = Math.max(4, Math.min(this.radiusMax, this.radius + this.vRadius));
      this.vTheta *= 0.82;
      this.vPhi *= 0.82;
      this.vRadius *= 0.78;
      this.dirty = true;
    }
    this.phi = Math.max(0.24, Math.min(1.32, this.phi));

    const sinPhi = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sinPhi * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sinPhi * Math.cos(this.theta)
    );
    this.camera.lookAt(this.target);

    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      if (!this.firstFrameDone) {
        this.firstFrameDone = true;
        this.firstFrameCb?.();
      }
    }
  };

  // ── teardown ─────────────────────────────────────────────────────────────

  private clearWorld() {
    if (!this.worldGroup) return;
    const seen = new Set<unknown>();
    // Class-cache geometries are SHARED across rebuilds (module-level) —
    // never dispose them here.
    for (const [, v] of classGeoCache) seen.add(v.geo);
    this.worldGroup.traverse((obj) => {
      const node = obj as unknown as {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
        isSprite?: boolean;
      };
      if (node.geometry && !seen.has(node.geometry)) {
        seen.add(node.geometry);
        node.geometry.dispose();
      }
      const mats = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      for (const mat of mats) {
        const spriteMat = mat as THREE.SpriteMaterial;
        if (spriteMat.map && !seen.has(spriteMat.map)) {
          seen.add(spriteMat.map);
          spriteMat.map.dispose();
        }
        if (!seen.has(mat)) {
          seen.add(mat);
          mat.dispose();
        }
      }
    });
    this.scene.remove(this.worldGroup);
    this.worldGroup = null;
    this.cellRefs = [];
    this.raycastables = [];
    this.plots = [];
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    this.clearWorld();
    this.highlightRingGeo.dispose();
    this.highlightRingMat.dispose();
    this.renderer.dispose();
  }
}
