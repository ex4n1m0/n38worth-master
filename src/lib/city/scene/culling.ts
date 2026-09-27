/**
 * Mainframe City — viewport culling math (pure, node-safe, no Pixi).
 *
 * Bounded rendering at scale (RTS plan §Phase D): with hundreds of sprites,
 * district/close LOD pays for off-screen draw calls. Culling computes the
 * camera's visible WORLD rect once per camera-settle / sync (never per
 * frame) and hides every sprite whose tile + body height falls outside it.
 *
 * CULLING vs LOD HIDING (integration decision): BuildingSprite.setLod only
 * toggles the windows/identity SUBLAYERS — it never hides a whole sprite —
 * so culling owns `sprite.visible` exclusively (via BuildingSprite.setCulled)
 * and the two systems can never fight. If a future LOD band ever hides whole
 * sprites, give it its own reason bit next to `cullHidden` in BuildingSprite.
 *
 * All helpers are pure so the vitest suite can pin the rect math.
 */

import { screenToWorld, type CameraState, type Viewport } from "./camera";

/** Axis-aligned visible world rect (unscaled world px). */
export interface CullRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Slack kept on every side of the viewport (fraction of screen size, mapped
 * into world px at the current zoom) so sprites gliding in/out at the fringes
 * never pop — and so the rect stays valid for one settle→next-settle span
 * of camera travel.
 */
export const CULL_MARGIN = 0.15;

/**
 * The world-pixel rect visible through the viewport at `camera`, expanded by
 * `margin` (fraction of the viewport per side, converted to world px). The
 * world container transform is axis-aligned (pan + zoom only, no rotation),
 * so mapping the two screen corners is exact.
 */
export function visibleWorldRect(
  camera: CameraState,
  viewport: Viewport,
  margin: number = CULL_MARGIN
): CullRect {
  const a = screenToWorld(camera, viewport, 0, 0);
  const b = screenToWorld(camera, viewport, viewport.width, viewport.height);
  const slackX = (margin * viewport.width) / camera.zoom;
  const slackY = (margin * viewport.height) / camera.zoom;
  return {
    minX: Math.min(a.x, b.x) - slackX,
    maxX: Math.max(a.x, b.x) + slackX,
    minY: Math.min(a.y, b.y) - slackY,
    maxY: Math.max(a.y, b.y) + slackY,
  };
}

/**
 * Whether a world point with an optional UPWARD body extent (`upMargin`,
 * iso buildings rise in −y from their tile center) and horizontal half-width
 * (`halfW`, the platform diamond) can intersect the rect. Conservative by
 * design: better to keep a borderline sprite than to hide a visible one.
 */
export function pointVisible(
  rect: CullRect,
  wx: number,
  wy: number,
  upMargin = 0,
  halfW = 0
): boolean {
  return (
    wx >= rect.minX - halfW &&
    wx <= rect.maxX + halfW &&
    wy >= rect.minY - upMargin &&
    wy <= rect.maxY
  );
}
