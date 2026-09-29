/**
 * Mainframe City — building light-effect timing (pure math, client-safe).
 *
 * The animated-light vocabulary for the procedural buildings (2026-09-29):
 * everything is ALPHA/POSITION-only on prebuilt geometry — the scene never
 * redraws Graphics per frame; a quantized clock (~LIGHT_STEP_MS) samples
 * these curves and requests one render (same policy as the daylight ramps).
 * All phases derive from the cardId seed so the skyline blinks
 * desynchronized instead of flashing in unison. Reduced-motion callers
 * simply never sample: sprites keep their static initial alphas.
 */

/** Animation step — matches the daylight ramp quantization (4 fps). */
export const LIGHT_STEP_MS = 250;

/** Beacon double-strobe cycle (aircraft warning light: flash-flash-pause). */
const BEACON_CYCLE_MS = 2600;
/** Halo breathing cycle (slow architectural glow). */
const BREATH_CYCLE_MS = 5200;
/** Grand-league energy ascent cycle (a light dot riding up the megaform). */
const RISE_CYCLE_MS = 1900;

/** Integer seeds spread phases across the skyline (coprime strides). */
const BEACON_STRIDE = 997;
const BREATH_STRIDE = 613;
const RISE_STRIDE = 331;

/**
 * Beacon intensity 0..1 at time t for a seeded building — a double strobe
 * (on ~600 ms, off ~700 ms, on ~600 ms, long pause) that stays legible at
 * the 250 ms sampling cadence and never goes fully dark (floor 0.12 so the
 * lamp stays visible between flashes).
 */
export function beaconStrobeAt(tMs: number, seed: number): number {
  const p = (((tMs + seed * BEACON_STRIDE) % BEACON_CYCLE_MS) + BEACON_CYCLE_MS) % BEACON_CYCLE_MS / BEACON_CYCLE_MS;
  const on = p < 0.23 || (p >= 0.5 && p < 0.73);
  return on ? 1 : 0.12;
}

/**
 * Halo ring intensity 0..1 — a slow cosine breath (~5.2 s) between a faint
 * idle glow and a visible pulse. Symmetric rise/fall reads as architectural
 * lighting, not a warning flash.
 */
export function haloBreathAt(tMs: number, seed: number): number {
  const p = (((tMs + seed * BREATH_STRIDE) % BREATH_CYCLE_MS) + BREATH_CYCLE_MS) % BREATH_CYCLE_MS / BREATH_CYCLE_MS;
  return 0.18 + 0.3 * (0.5 - 0.5 * Math.cos(p * Math.PI * 2));
}

/**
 * Grand-league energy ascent progress 0..1 — a light dot riding from the
 * upper body to the crown tip. Fades at both ends so it launches and lands
 * softly; callers map progress to the y range of their megaform.
 */
export function spireRiseAt(tMs: number, seed: number): { progress: number; alpha: number } {
  const p = (((tMs + seed * RISE_STRIDE) % RISE_CYCLE_MS) + RISE_CYCLE_MS) % RISE_CYCLE_MS / RISE_CYCLE_MS;
  const alpha = p < 0.12 || p > 0.88 ? 0.15 : 0.85;
  return { progress: p, alpha };
}
