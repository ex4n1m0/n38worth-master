/**
 * Mainframe City day/night clock (PURE — no Pixi, unit-testable).
 *
 * One real-world hour = one game day (2026-09-28 user ruling): 30 real
 * minutes of day, 30 of night. The game hour is the fraction of the current
 * real hour × 24, so every real hour starts at game 00:00 — :15–:45 real is
 * daytime (game 06:00–18:00), :45–:15 is night. Dawn/dusk ramp over ±1 game
 * hour (2.5 real minutes) so the scene EASES between ambiences instead of
 * snapping. CityScene samples daylightAt(Date.now()) on a slow interval and
 * tweens the sky/wash visuals toward it (see CityScene.applyDaylight).
 */

/** One real hour = one full game day (24 game hours). */
export const REAL_HOUR_MS = 3_600_000;

/** Game hour (0..24) at a wall-clock timestamp. */
export function gameHourAt(now: number): number {
  return ((now % REAL_HOUR_MS) / REAL_HOUR_MS) * 24;
}

/**
 * Daylight factor 0 (full night) .. 1 (full day) at a wall-clock timestamp.
 * Night is the game's default dark ambience; day brightens floor + buildings
 * and swaps the sky to blue.
 */
export function daylightAt(now: number): number {
  const h = gameHourAt(now);
  if (h <= 5 || h >= 19) return 0;
  if (h >= 7 && h <= 17) return 1;
  return h < 7 ? (h - 5) / 2 : (19 - h) / 2;
}
