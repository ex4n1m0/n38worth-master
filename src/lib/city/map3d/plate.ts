/**
 * map3d PLATE — static 3D catalog shots (/catalog, 2026-10-02).
 *
 * ONE module-singleton offscreen WebGLRenderer that photographs one subject
 * at a time into the caller's 2D canvas. Subjects are built by the SAME
 * exported engine builders the world map uses (artClassGeometry /
 * buildHqObject / buildMonumentObject / buildPropObject) under the same
 * lighting + paper-ground language, so a catalog plate can never drift from
 * the live 3D view — if they disagree, one of them is buggy.
 *
 * This module is only ever reached through a dynamic import (three.js stays
 * out of the default bundle), and it fails soft: no WebGL → the caller's
 * onSettled(false) lets React show the localized fallback.
 */

import * as THREE from "three";
import {
  artClassGeometry,
  buildHqObject,
  buildMonumentObject,
  buildPropObject,
  buildProtectionRing,
  diamondGeometry,
  GRID_INK,
  PAPER_BG,
  PAPER_GROUND,
  seedOfString,
} from "./engine";

export type PlateSubject =
  | { kind: "building"; familyIndex: number; tier: number; protection?: "firewall" | "hardlock" }
  | { kind: "hq"; stage: number; family: string | null }
  | { kind: "monument"; canonical: number }
  | { kind: "prop"; prop: string };

interface Shot {
  subject: PlateSubject;
  canvas: HTMLCanvasElement;
  size: number;
  onSettled?: (ok: boolean) => void;
}

let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
const queue: Shot[] = [];
let pumping = false;

/** Camera direction of the world view's default orbit (theta π/4, phi 1.0). */
const VIEW_DIR = new THREE.Vector3(
  Math.sin(1.0) * Math.sin(Math.PI / 4),
  Math.cos(1.0),
  Math.sin(1.0) * Math.cos(Math.PI / 4)
).normalize();

/** Queue one shot. Shots render in time-budgeted batches (~8ms/frame) so a
 *  full catalog page (~114 plates) fills in progressively without freezing
 *  the main thread. */
export function renderPlate(
  subject: PlateSubject,
  canvas: HTMLCanvasElement,
  size: number,
  onSettled?: (ok: boolean) => void
): void {
  queue.push({ subject, canvas, size, onSettled });
  if (failed) {
    flushFailed();
    return;
  }
  if (pumping) return;
  if (!ensureRenderer()) {
    flushFailed();
    return;
  }
  pumping = true;
  step();
}

function flushFailed(): void {
  while (queue.length) queue.shift()!.onSettled?.(false);
}

function ensureRenderer(): boolean {
  if (renderer) return true;
  if (failed) return false;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  } catch (err) {
    console.error("3D catalog plate renderer unavailable", err);
    failed = true;
    return false;
  }
  return true;
}

function step(): void {
  if (!renderer) {
    // disposed mid-pump — fail whatever is left and stop
    pumping = false;
    flushFailed();
    return;
  }
  const start = performance.now();
  while (queue.length && performance.now() - start < 8) {
    const shot = queue.shift()!;
    let ok = false;
    try {
      ok = renderOne(shot);
    } catch {
      ok = false;
    }
    if (!ok) drawFallback(shot.canvas, shot.size);
    shot.onSettled?.(ok);
  }
  if (queue.length > 0) {
    // setTimeout (not rAF): keeps rendering even when the tab/pane is hidden
    // (rAF stalls entirely in background panes).
    setTimeout(() => {
      if (queue.length > 0) step();
      else pumping = false;
    }, 16);
  } else {
    pumping = false;
  }
}

/** Build the subject Object3D. Returns the group + whether its geometries
 *  are FRESH (must be disposed) — building classes come from the shared
 *  module cache and must never be disposed here. */
function buildSubject(subject: PlateSubject): {
  group: THREE.Object3D;
  fresh: boolean;
} | null {
  switch (subject.kind) {
    case "building": {
      const cls = artClassGeometry(subject.familyIndex, subject.tier);
      if (!cls || cls.geo.attributes.position.count === 0) return null;
      const mesh = new THREE.Mesh(
        cls.geo,
        new THREE.MeshLambertMaterial({ vertexColors: true })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const g = new THREE.Group();
      g.add(mesh);
      if (subject.protection) g.add(buildProtectionRing(subject.protection));
      return { group: g, fresh: subject.protection != null };
    }
    case "hq": {
      const g = buildHqObject(subject.stage, subject.family, seedOfString("catalog"));
      return { group: g, fresh: true };
    }
    case "monument": {
      const g = buildMonumentObject(subject.canonical);
      return { group: g, fresh: true };
    }
    case "prop": {
      const g = buildPropObject(subject.prop);
      return { group: g, fresh: true };
    }
  }
}

function renderOne(shot: Shot): boolean {
  const r = renderer;
  if (!r) return false;
  const built = buildSubject(shot.subject);
  if (!built) return false;
  const { group, fresh } = built;

  // Frame on the subject alone (before ground/pad enter the scene).
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) {
    disposeGroup(group, fresh);
    return false;
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(0.2, sphere.radius);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER_BG);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c2, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.copy(sphere.center).add(new THREE.Vector3(radius * 1.2, radius * 2.2, radius * 0.8));
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  const shadowSpan = radius * 2.2;
  sun.shadow.camera.left = -shadowSpan;
  sun.shadow.camera.right = shadowSpan;
  sun.shadow.camera.top = shadowSpan;
  sun.shadow.camera.bottom = -shadowSpan;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = radius * 8;
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.copy(sphere.center);
  scene.add(sun);
  scene.add(sun.target);

  // Blueprint ground: paper plane + faint drafting grid + the plot pad.
  const groundSize = Math.max(6, radius * 4);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: PAPER_GROUND })
  );
  ground.position.set(sphere.center.x, 0, sphere.center.z);
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(groundSize, 8, GRID_INK, GRID_INK);
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.16;
  grid.position.set(sphere.center.x, 0.01, sphere.center.z);
  scene.add(grid);
  const pad = new THREE.Mesh(
    diamondGeometry(sphere.center.x, sphere.center.z, Math.max(1.2, radius * 1.15)),
    new THREE.MeshBasicMaterial({ color: "#EAE4D3", transparent: true, opacity: 0.9 })
  );
  pad.position.y = 0.02;
  scene.add(pad);
  scene.add(group);

  const fovDeg = 30;
  const fov = (fovDeg * Math.PI) / 180;
  const dist = (radius / Math.sin(fov / 2)) * 1.1;
  const camera = new THREE.PerspectiveCamera(
    fovDeg,
    1,
    Math.max(0.1, dist - radius - 1),
    dist + radius + 20
  );
  camera.position.copy(sphere.center).addScaledVector(VIEW_DIR, dist);
  camera.lookAt(sphere.center);

  // Size the target canvas (CSS px × dpr) and photograph the GL buffer.
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.max(48, Math.round(shot.size));
  shot.canvas.width = Math.round(px * dpr);
  shot.canvas.height = Math.round(px * dpr);
  shot.canvas.style.width = `${px}px`;
  shot.canvas.style.height = `${px}px`;
  r.setPixelRatio(dpr);
  r.setSize(px, px, false);
  r.render(scene, camera);
  const ctx = shot.canvas.getContext("2d");
  if (!ctx) {
    disposeScene(ground, grid, pad, group, fresh);
    return false;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.drawImage(r.domElement, 0, 0, px, px);

  disposeScene(ground, grid, pad, group, fresh);
  return true;
}

function disposeGroup(group: THREE.Object3D, fresh: boolean): void {
  group.traverse((obj) => {
    const node = obj as unknown as {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (node.geometry && fresh) node.geometry.dispose();
    const mats = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const m of mats) m.dispose();
  });
}

function disposeScene(
  ground: THREE.Mesh,
  grid: THREE.GridHelper,
  pad: THREE.Mesh,
  group: THREE.Object3D,
  fresh: boolean
): void {
  ground.geometry.dispose();
  (ground.material as THREE.Material).dispose();
  grid.geometry.dispose();
  (grid.material as THREE.Material).dispose();
  pad.geometry.dispose();
  (pad.material as THREE.Material).dispose();
  disposeGroup(group, fresh);
}

function drawFallback(canvas: HTMLCanvasElement, size: number): void {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = PAPER_BG;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#9FB4C4";
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = 0; x <= size; x += 16) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
  }
  for (let y = 0; y <= size; y += 16) {
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Drop the GL context (tests / hot reload). */
export function disposePlateRenderer(): void {
  renderer?.dispose();
  renderer = null;
  failed = false;
  pumping = false;
  queue.length = 0;
}
