/**
 * Pure pace math for the autopilot rate guard (unit-tested; no DB).
 * Must stay in sync with the rulings in PLAYER_AI_STUDY.md §7.5:
 *   - declared automation: ONE ACTION PER 10 SECONDS (2026-10-03)
 *   - universal per-player ceiling: 30 actions / minute (2026-10-03)
 *
 * The universal tier stores window+count PACKED in ONE int32 setting_value
 * (win × 40 + count, count saturated at 39) so the whole claim is a single
 * atomic upsert — game_settings.setting_value is a 32-bit integer, so
 * packing with ×40 keeps the value under 2^31 until the 2070s.
 */

export const UNIVERSAL_WINDOW_S = 60;
export const UNIVERSAL_MAX = 30;
export const AGENT_MIN_INTERVAL_S = 10;
export const RATE_PACK = 40;

/** win × 40 + count (count clamped to [1, 39] — 39 is the saturation cap). */
export function packRateValue(win: number, cnt: number): number {
  const safeWin = Math.max(0, Math.floor(win));
  const safeCnt = Math.min(Math.max(Math.floor(cnt), 1), RATE_PACK - 1);
  return safeWin * RATE_PACK + safeCnt;
}

export function unpackRateValue(value: number): { win: number; cnt: number } {
  const v = Math.max(0, Math.floor(value));
  return { win: Math.floor(v / RATE_PACK), cnt: v % RATE_PACK };
}

/** Retry hint after a failed agent-tier claim (clamped to [1, 10] s — clock-skew safe). */
export function agentRetryAfterSec(lastSec: number, nowSec: number): number {
  const raw = AGENT_MIN_INTERVAL_S - (nowSec - lastSec);
  return Math.min(AGENT_MIN_INTERVAL_S, Math.max(1, raw));
}

/** Blocked when the returned (already-incremented) count exceeds 30 in the current window. */
export function universalBlocked(packedValue: number, curWin: number): boolean {
  const { win, cnt } = unpackRateValue(packedValue);
  return win === curWin && cnt > UNIVERSAL_MAX;
}
