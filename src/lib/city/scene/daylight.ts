/**
 * Mainframe City day/night clock (PURE — no Pixi, unit-testable).
 *
 * One real-world hour = one game day (2026-09-28 user ruling): 30 real
 * minutes of day, 30 of night. The game hour is the fraction of the current
 * real hour × 24, so every real hour starts at game 00:00 — :15–:45 real is
 * daytime (game 06:00–18:00), :45–:15 is night. Dawn/dusk ramp over ±1 game
 * hour (2.5 real minutes). CityScene sleeps through the steady plateaus,
 * wakes at the ramp boundaries (nextDaylightBoundaryAt) and then tracks
 * daylightAt CONTINUOUSLY per frame through the ramp — the sky drifts
 * smoothly the whole transition (no sampled steps), so you feel time pass.
 * gameClockAt backs the in-game clock chip (24 game seconds per real second).
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

/** Game-clock time of day at a wall-clock timestamp (24 game seconds per
 *  real second — the seconds visibly race, which is the point). */
export function gameClockAt(now: number): {
  h: number;
  m: number;
  s: number;
} {
  const gameSeconds = ((now % REAL_HOUR_MS) / REAL_HOUR_MS) * 86400;
  const total = Math.floor(gameSeconds);
  return {
    h: Math.floor(total / 3600) % 24,
    m: Math.floor(total / 60) % 60,
    s: total % 60,
  };
}

/**
 * Next wall-clock timestamp at which daylightAt CHANGES (a ramp boundary:
 * dawn start 05:00, dusk start 17:00). Returns `now` when already inside a
 * ramp (the caller should track continuously). CityScene uses this to sleep
 * through the steady day/night plateaus and wake exactly for the transitions
 * — zero idle cost, frame-continuous drift while a ramp runs.
 */
export function nextDaylightBoundaryAt(now: number): number {
  const hourStart = now - (now % REAL_HOUR_MS);
  const atGame = (h: number) => hourStart + (h / 24) * REAL_HOUR_MS;
  const h = gameHourAt(now);
  if (h < 5) return atGame(5);
  if (h < 7) return now; // inside dawn ramp
  if (h < 17) return atGame(17);
  if (h < 19) return now; // inside dusk ramp
  return atGame(5) + REAL_HOUR_MS; // night → next hour's dawn
}

/** Lit-window floor at full day — glass still catches light faintly. */
export const FACADE_GLOW_DAY = 0.15;

/**
 * Facade window-glow factor for a daylight value (engine-audit §3.1): night
 * keeps the full seeded window bloom, full day dims lit windows to a glass
 * sheen so day/night read instantly apart (classic iso-city-builder night
 * behavior — lights ON at night, architecture by day). Alpha-only; the dark
 * window insets stay constant so facades never go flat.
 */
export function facadeGlowAt(daylight: number): number {
  const v = Math.max(0, Math.min(1, daylight));
  return 1 - (1 - FACADE_GLOW_DAY) * v;
}
