/**
 * Mainframe City — motion policy (pure, node-safe).
 *
 * One place decides every duration/easing the world uses. Under
 * prefers-reduced-motion ALL durations collapse to 0 and the camera snaps
 * (RTS plan §D1: "prefers-reduced-motion → camera snaps, FX collapse to
 * one-frame state swaps"). The React shell resolves the media query and
 * pushes the flag into the store; the scene asks this module for policy.
 */

export interface MotionPolicy {
  /** True when the user prefers reduced motion. */
  reduced: boolean;
  /** Camera moves jump to the target instead of gliding. */
  cameraSnap: boolean;
  /** Construct (hire) rise-in duration, ms. */
  constructMs: number;
  /** Loss (poach/discard) collapse duration, ms. */
  lossMs: number;
  /** Tier-up pulse duration, ms. */
  tierUpMs: number;
  /** Camera glide duration, ms. */
  cameraMs: number;
  /** LOD-swap alpha crossfade (aggregate skyline / sprite detail), ms. */
  lodFadeMs: number;
}

export const MOTION_FULL: MotionPolicy = {
  reduced: false,
  cameraSnap: false,
  constructMs: 400,
  lossMs: 320,
  tierUpMs: 480,
  cameraMs: 260,
  lodFadeMs: 180,
};

export const MOTION_REDUCED: MotionPolicy = {
  reduced: true,
  cameraSnap: true,
  constructMs: 0,
  lossMs: 0,
  tierUpMs: 0,
  cameraMs: 0,
  lodFadeMs: 0,
};

/** Policy for a reduced-motion preference flag. */
export function resolveMotion(prefersReducedMotion: boolean): MotionPolicy {
  return prefersReducedMotion ? MOTION_REDUCED : MOTION_FULL;
}

export function clamp01(t: number): number {
  if (Number.isNaN(t)) return 0;
  return Math.min(1, Math.max(0, t));
}

/** Ease-out cubic — the only easing the world needs (calm, no overshoot). */
export function easeOutCubic(t: number): number {
  const k = clamp01(t);
  return 1 - Math.pow(1 - k, 3);
}

/**
 * Progress fraction for a one-shot animation. Returns 1 (finished) when the
 * duration is 0 — which also covers the reduced-motion collapse, turning
 * every FX into a single terminal state swap.
 */
export function animationProgress(
  elapsedMs: number,
  durationMs: number
): number {
  if (durationMs <= 0) return 1;
  return clamp01(elapsedMs / durationMs);
}
