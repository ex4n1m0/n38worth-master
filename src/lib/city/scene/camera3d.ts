/**
 * Mainframe City 3D — CameraState ↔ orthographic camera adapter (pure,
 * node-safe, no three.js import).
 *
 * The 3D renderer must REPRODUCE the 2:1 dimetric projection of
 * lib/city/scene/iso.ts EXACTLY, so the whole renderer-agnostic stack
 * (CameraState world-pixel camera, pickTile picking, culling rects, LOD
 * zoom bands, focus/target math in world px) keeps working unchanged.
 *
 * The equivalence (CITY_3D_ENGINE_STUDY.md §6, verified numerically):
 * an ORTHOGRAPHIC camera at yaw 45°, elevation 30° projects the ground
 * axes with screen slope sin(30°) = 0.5 and equal axis magnitudes — i.e.
 * the classic 128×64 (2:1) tile. Concretely, with the ground plane as
 * (x=u, y=up, z=v) and one tile spanning TILE_STEP per axis:
 *
 *   ground (u, 0, v) → screen ( (u − v)·cos45°, (u + v)·cos45°·sin30° )
 *
 * which for u = gx·TILE_STEP, v = gy·TILE_STEP is IDENTICALLY
 * iso.tileToScreen(gx, gy) = ((gx−gy)·64, (gx+gy)·32). The vitest suite
 * pins this parity property; if this module drifts from iso.ts the 3D
 * view and every pure consumer of world px disagree.
 *
 * Heights: 3D y is measured so 1 screen px of vertical rise = PIXEL_RISE
 * world units (world up projects to the screen plane at cos(30°)).
 */

import { TILE_H, TILE_W, screenToTile } from "./iso";
import type { CameraState, Viewport } from "./camera";

/** Dimetric rig angles — the constants that make the parity hold. */
export const ISO_YAW = Math.PI / 4;
export const ISO_ELEV = Math.PI / 6;

const COS_YAW = Math.cos(ISO_YAW); // √2/2
const SIN_ELEV = Math.sin(ISO_ELEV); // 0.5 — the 2:1 slope itself
const COS_ELEV = Math.cos(ISO_ELEV);

/** Ground-plane world-units step per tile along each axis. */
export const TILE_STEP = (TILE_W / 2) / COS_YAW; // 64·√2 ≈ 90.51
/** World-units height that reads as exactly 1 screen px of vertical rise. */
export const PIXEL_RISE = 1 / COS_ELEV; // ≈ 1.1547

/** Camera standoff distance (irrelevant to ortho framing; must clear near). */
export const CAM_DIST = 4096;
export const CAM_NEAR = 1;
export const CAM_FAR = CAM_DIST * 4;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Camera basis in world space (all unit vectors; right-handed). */
export interface CameraBasis3D {
  /** Unit vector from the look-at target TOWARD the camera position. */
  dir: Vec3;
  /** Screen-right axis (world x steps go screen-right). */
  right: Vec3;
  /** Screen-up axis. */
  up: Vec3;
}

/**
 * The one basis for the classic orientation. Kept a function (not a
 * constant) so a future free-orbit rig can generalize it without callers
 * changing shape. right = (sin yaw, 0, −cos yaw) = (√2/2, 0, −√2/2).
 */
export function cameraBasis(): CameraBasis3D {
  const dir: Vec3 = {
    x: COS_ELEV * COS_YAW,
    y: SIN_ELEV,
    z: COS_ELEV * COS_YAW,
  };
  const right: Vec3 = { x: Math.SQRT1_2, y: 0, z: -Math.SQRT1_2 };
  const up = cross(right, { x: -dir.x, y: -dir.y, z: -dir.z });
  return { dir, right, up };
}

/** Tile (integer or fractional) → ground-plane 3D point (y = 0). */
export function tileToGround(gx: number, gy: number): Vec3 {
  return { x: gx * TILE_STEP, y: 0, z: gy * TILE_STEP };
}

/** Ground-plane point → fractional tile coordinates. */
export function groundToTile(p: Vec3): { gx: number; gy: number } {
  return { gx: p.x / TILE_STEP, gy: p.z / TILE_STEP };
}

/**
 * World-px point (the CameraState plane) → ground-plane 3D point. This is
 * the bridge EVERYWHERE the renderer-agnostic code speaks world px (camera
 * focus targets, FX anchors): the same numbers address the 3D ground.
 */
export function worldPxToGround(wx: number, wy: number): Vec3 {
  const t = screenToTile(wx, wy);
  return tileToGround(t.x, t.y);
}

/** Ortho frustum half-extents (world units = screen px at zoom 1). */
export function orthoFrame(cam: CameraState, viewport: Viewport) {
  const halfW = Math.max(1, viewport.width / 2) / cam.zoom;
  const halfH = Math.max(1, viewport.height / 2) / cam.zoom;
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH };
}

/** Where the CameraState says the camera looks: the ground under (x, y). */
export function cameraPlacement(cam: CameraState): {
  position: Vec3;
  target: Vec3;
} {
  const target = worldPxToGround(cam.x, cam.y);
  const basis = cameraBasis();
  return {
    target,
    position: {
      x: target.x + basis.dir.x * CAM_DIST,
      y: target.y + basis.dir.y * CAM_DIST,
      z: target.z + basis.dir.z * CAM_DIST,
    },
  };
}

/**
 * Project a world 3D point to canvas CSS px — the pure reference the
 * parity test checks against iso/camera's 2D math, and the fallback the
 * DOM chip layer can use when the renderer isn't handy.
 */
export function projectToScreen(
  p: Vec3,
  cam: CameraState,
  viewport: Viewport
): { x: number; y: number } {
  const { target } = cameraPlacement(cam);
  const basis = cameraBasis();
  const dx = p.x - target.x;
  const dy = p.y - target.y;
  const dz = p.z - target.z;
  const right = dot({ x: dx, y: dy, z: dz }, basis.right);
  const up = dot({ x: dx, y: dy, z: dz }, basis.up);
  return {
    x: viewport.width / 2 + right * cam.zoom,
    y: viewport.height / 2 - up * cam.zoom,
  };
}

// Re-exported for consumers that reason in tile-pixel terms (ground plane
// sizing): full tile diamond footprint = TILE_W × TILE_H on screen.
export { TILE_W, TILE_H };
