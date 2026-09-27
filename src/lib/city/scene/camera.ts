/**
 * Mainframe City — camera math (pure, node-safe, no Pixi).
 *
 * The camera is the WORLD PIXEL at the viewport center plus a zoom factor.
 * `x`/`y`/`zoom` are the only state; every transform (pan clamping, zoom at
 * cursor, reset-to-HQ, lerp-or-snap) is a pure function so the vitest suite
 * can pin the clamp and anchor behaviour without a canvas.
 *
 * Zoom band [0.32, 2.5] feeds the LOD bands in lod.ts (world/district/
 * close). 0.32 (not 0.5) so narrow phone viewports — whose canvas host is
 * further inset by page padding — can fit the full landmark ring including
 * monument art at the home framing (CityScene.homeCamera).
 */

export const ZOOM_MIN = 0.32;
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

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function clampZoom(zoom: number): number {
  if (Number.isNaN(zoom)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

function clampRange(value: number, min: number, max: number): number {
  // Degenerate (inverted) range → snap to its midpoint instead of a bound.
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

/**
 * The range the camera CENTER may occupy so the visible rect stays inside
 * `world`. When the viewport (at this zoom) is larger than the world, the
 * range collapses to the world center (camera parks, no rubber-banding).
 */
export function cameraPanBounds(
  world: WorldBounds,
  viewport: Viewport,
  zoom: number
): WorldBounds {
  const halfW = viewport.width / (2 * zoom);
  const halfH = viewport.height / (2 * zoom);
  return {
    minX: world.minX + halfW,
    maxX: world.maxX - halfW,
    minY: world.minY + halfH,
    maxY: world.maxY - halfH,
  };
}

/** Clamp a camera into its pan bounds (keeps zoom as-is, clamped). */
export function clampCamera(
  camera: CameraState,
  world: WorldBounds,
  viewport: Viewport
): CameraState {
  const zoom = clampZoom(camera.zoom);
  const b = cameraPanBounds(world, viewport, zoom);
  return {
    zoom,
    x: clampRange(camera.x, b.minX, b.maxX),
    y: clampRange(camera.y, b.minY, b.maxY),
  };
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
 * wheel zoom / pinch). Pure: clamps zoom + pan bounds in one pass.
 */
export function zoomAt(
  camera: CameraState,
  world: WorldBounds,
  viewport: Viewport,
  sx: number,
  sy: number,
  nextZoom: number
): CameraState {
  const anchored = screenToWorld(camera, viewport, sx, sy);
  const zoom = clampZoom(nextZoom);
  return clampCamera(
    {
      zoom,
      x: anchored.x - (sx - viewport.width / 2) / zoom,
      y: anchored.y - (sy - viewport.height / 2) / zoom,
    },
    world,
    viewport
  );
}

/** Pan by a screen-space delta (drag), clamped into the pan bounds. */
export function panBy(
  camera: CameraState,
  world: WorldBounds,
  viewport: Viewport,
  dxScreen: number,
  dyScreen: number
): CameraState {
  return clampCamera(
    {
      ...camera,
      x: camera.x - dxScreen / camera.zoom,
      y: camera.y - dyScreen / camera.zoom,
    },
    world,
    viewport
  );
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
 * it, clamped into the zoom band. Orientation-agnostic — it measures the
 * viewport, so portrait and landscape both center instead of clipping one
 * edge. When the content cannot fit even at ZOOM_MIN, clampCamera parks the
 * camera on the bounds center (degenerate pan range → midpoint), which is
 * exactly the "centered, clipped symmetrically" fallback we want.
 */
export function fitCameraToBounds(
  world: WorldBounds,
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
  return clampCamera({ x: cx, y: cy, zoom }, world, viewport);
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
