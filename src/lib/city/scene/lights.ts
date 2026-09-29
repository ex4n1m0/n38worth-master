/**
 * Mainframe City — building light-effect timing (pure math, client-safe).
 *
 * The animated-light vocabulary for the procedural buildings (2026-09-29):
 * strobing rooftop beacons (seeded red/white), breathing halos, the grand
 * energy ascent, window-occupancy churn (two drifting dim channels over the
 * lit pane mosaic) and the civic edge data-pulse. Everything is
 * ALPHA/POSITION-only on prebuilt geometry — the scene never redraws
 * Graphics per frame; a quantized clock (~LIGHT_STEP_MS) samples these
 * curves and requests one render (same policy as the daylight ramps). All
 * phases derive from the cardId seed so the skyline blinks desynchronized
 * instead of flashing in unison. Reduced-motion callers simply never
 * sample: sprites keep their static initial alphas.
 */

/** Animation step — matches the daylight ramp quantization (4 fps). */
export const LIGHT_STEP_MS = 250;

/** Beacon double-strobe cycle (aircraft warning light: flash-flash-pause). */
const BEACON_CYCLE_MS = 2600;
/** Halo breathing cycle (slow architectural glow). */
const BREATH_CYCLE_MS = 5200;
/** Grand-league energy ascent cycle (a light dot riding up the megaform). */
const RISE_CYCLE_MS = 1900;
/**
 * Window-occupancy churn (2026-09-29 "more light animation"): the lit pane
 * mosaic splits into two seeded channels; each channel slowly dims and
 * returns out of phase, so the lit set VISIBLY changes over ~half a minute
 * — floors switching off for the night, others coming on. Long, different
 * periods per channel keep the pattern drifting (never a metronome).
 */
const FLICKER_CYCLE_MS = 17000;
const FLICKER_CYCLE_B_MS = 23000;
/** Edge data-pulse cycle (a light dot riding DOWN a tower's side). */
const EDGE_CYCLE_MS = 3400;

/** Integer seeds spread phases across the skyline (coprime strides). */
const BEACON_STRIDE = 997;
const BREATH_STRIDE = 613;
const RISE_STRIDE = 331;
const FLICKER_STRIDE = 419;
const EDGE_STRIDE = 251;

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

/**
 * One window channel's occupancy multiplier 0..1 — mostly bright (1) with a
 * slow seeded dip toward `floor` (a share of the lit panes going dark for a
 * few seconds, then back). Cosine-ramped so the 250 ms sampling cadence
 * never pops; the two channels use different periods + seeds, so the dip
 * windows walk across the skyline instead of flashing in unison.
 */
export function windowFlickerAt(
  tMs: number,
  seed: number,
  channel: 0 | 1
): number {
  const cycle = channel === 0 ? FLICKER_CYCLE_MS : FLICKER_CYCLE_B_MS;
  const p = (((tMs + seed * FLICKER_STRIDE * (channel + 2)) % cycle) + cycle) % cycle / cycle;
  // Seeded dip depth + width (stable per building, varied across the city).
  const depth = 0.3 + ((seed * 2654435761) >>> 16) % 26 / 100; // 0.30..0.55
  const width = 0.16 + ((seed * 40503) >>> 16) % 10 / 100; // 0.16..0.25
  // Cosine bump centered at p = 0.5: 0 outside the window, 1 at the center.
  const d = Math.abs(p - 0.5) / (width / 2);
  const bump = d >= 1 ? 0 : 0.5 - 0.5 * Math.cos(Math.PI * (1 - d));
  return 1 - depth * bump;
}

/**
 * Edge data-pulse progress 0..1 — a light dot descending a tower's side
 * (the civic league's counterpart to the grand rise dot; reads as data /
 * elevator traffic). Fades at both ends; callers map progress to their own
 * y range and keep the dot's x fixed on the building edge.
 */
export function edgePulseAt(tMs: number, seed: number): { progress: number; alpha: number } {
  const p = (((tMs + seed * EDGE_STRIDE) % EDGE_CYCLE_MS) + EDGE_CYCLE_MS) % EDGE_CYCLE_MS / EDGE_CYCLE_MS;
  const alpha = p < 0.1 || p > 0.9 ? 0.1 : 0.9;
  return { progress: p, alpha };
}
