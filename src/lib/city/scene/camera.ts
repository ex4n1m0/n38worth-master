/**
 * Mainframe City — camera math (pure, node-safe, no Pixi).
 *
 * The camera is the WORLD PIXEL at the viewport center plus a zoom factor.
 * `x`/`y`/`zoom` are the only state; every transform (zoom at cursor,
 * reset-to-HQ, lerp-or-snap) is a pure function so the vitest suite can pin
 * the behaviour without a canvas.
 *
 * FREE CAMERA (2026-09-28 user ruling): panning is UNBOUNDED (drag/keys can
 * travel arbitrarily far in every direction — the void is infinite) and zoom
 * has no practical lower bound (ZOOM_MIN is a sub-pixel epsilon that only
 * guards degenerate math, not a framing decision). Only the upper zoom bound
 * remains a real limit. The removed pan-bounds clamp used to park the camera
 * on the world center once the viewport outgrew the city; the home framing
 * and fit helpers now just center, with no clamping pass.
 *
 * Zoom ceiling feeds the LOD bands in lod.ts (world/district/close); the
 * world band extends downward without limit.
 */

/** Sub-pixel floor only — the city may shrink to a dot, never to 0/NaN. */
export const ZOOM_MIN = 0.001;
export const ZOOM_MAX = 2.5;
export const ZOOM_DEFAULT = 1;

export interface CameraState {
  /** World-pixel x at the viewport center. */
  x: number;
  /** World-pixel y at the viewport center. */
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function clampZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Clamp a camera's zoom; x/y pass through untouched (free pan). */
export function clampCamera(camera: CameraState): CameraState {
  return { x: camera.x, y: camera.y, zoom: clampZoom(camera.zoom) };
}

/** Screen (canvas CSS px) → world px. */
export function screenToWorld(
  camera: CameraState,
  viewport: Viewport,
  sx: number,
  sy: number
): { x: number; y: number } {
  return {
    x: camera.x + (sx - viewport.width / 2) / camera.zoom,
    y: camera.y + (sy - viewport.height / 2) / camera.zoom,
  };
}

/** World px → screen (canvas CSS px). */
export function worldToScreen(
  camera: CameraState,
  viewport: Viewport,
  wx: number,
  wy: number
): { x: number; y: number } {
  return {
    x: (wx - camera.x) * camera.zoom + viewport.width / 2,
    y: (wy - camera.y) * camera.zoom + viewport.height / 2,
  };
}

/**
 * Zoom keeping the world point under (sx, sy) anchored (cursor-anchored
 * wheel zoom / pinch). Pure: clamps zoom in one pass; pan stays free.
 */
export function zoomAt(
  camera: CameraState,
  viewport: Viewport,
  sx: number,
  sy: number,
  nextZoom: number
): CameraState {
  const anchored = screenToWorld(camera, viewport, sx, sy);
  const zoom = clampZoom(nextZoom);
  return clampCamera({
    zoom,
    x: anchored.x - (sx - viewport.width / 2) / zoom,
    y: anchored.y - (sy - viewport.height / 2) / zoom,
  });
}

/** Pan by a screen-space delta (drag) — unbounded. */
export function panBy(
  camera: CameraState,
  dxScreen: number,
  dyScreen: number
): CameraState {
  return clampCamera({
    ...camera,
    x: camera.x - dxScreen / camera.zoom,
    y: camera.y - dyScreen / camera.zoom,
  });
}

/**
 * Reset target: center on the HQ (sector 0 center) at the default zoom.
 * `zoom` overrides for a calmer "home" framing (e.g. district LOD).
 */
export function resetCamera(
  target: { x: number; y: number },
  zoom: number = ZOOM_DEFAULT
): CameraState {
  return { x: target.x, y: target.y, zoom: clampZoom(zoom) };
}

/** Breathing margin kept around the content when fitting (fraction of viewport). */
export const FIT_MARGIN = 0.92;

/**
 * Zoom ceiling for CONTENT-fit framing (initial view + Reset): high enough
 * to reach the close-LOD band (name chips) for compact cities, low enough
 * that a Boot-Sector starter city doesn't fill the entire screen.
 */
export const FIT_CONTENT_MAX_ZOOM = 1.4;

/**
 * Fit-to-view framing (initial camera + Reset): center the CONTENT bounding
 * box in the viewport at the largest zoom (≤ maxZoom) that still shows all of
 * it. Orientation-agnostic — it measures the viewport, so portrait and
 * landscape both center instead of clipping one edge. When the content
 * cannot fit even near the zoom floor it still centers (free camera — no
 * clamping pass), which is exactly the "centered, clipped symmetrically"
 * fallback we want.
 */
export function fitCameraToBounds(
  world: { minX: number; minY: number; maxX: number; maxY: number },
  viewport: Viewport,
  maxZoom: number = ZOOM_DEFAULT
): CameraState {
  const cx = (world.minX + world.maxX) / 2;
  const cy = (world.minY + world.maxY) / 2;
  const bw = Math.max(1, world.maxX - world.minX);
  const bh = Math.max(1, world.maxY - world.minY);
  const fit = Math.min(
    (viewport.width * FIT_MARGIN) / bw,
    (viewport.height * FIT_MARGIN) / bh
  );
  const zoom = clampZoom(Math.min(maxZoom, fit));
  return { x: cx, y: cy, zoom };
}

/**
 * Lerp-or-snap approach step. `snap` (reduced-motion policy) jumps straight
 * to the target; otherwise move `t` (0..1, already eased) toward it.
 */
export function approachCamera(
  current: CameraState,
  target: CameraState,
  t: number,
  snap: boolean
): { camera: CameraState; done: boolean } {
  if (snap || t >= 1) return { camera: target, done: true };
  const k = Math.min(1, Math.max(0, t));
  return {
    camera: {
      x: current.x + (target.x - current.x) * k,
      y: current.y + (target.y - current.y) * k,
      zoom: current.zoom + (target.zoom - current.zoom) * k,
    },
    done: false,
  };
}
