/**
 * Mainframe City — Root Sequence visual state derivation (pure, node-safe).
 *
 * GAME-SYSTEMS RULING (MAINFRAME_CITY_RTS_PLAN.md, Phase C–F note): the Root
 * Sequence is rendered ONLY from the authoritative goddess-countdown state
 * (`/api/goddess-countdown` + `game-global` Pusher events mirroring it).
 * `rootSequenceEligible` (all six goddesses owned) must NEVER start or
 * sustain a sequence on its own — the countdown is the single authority.
 *
 * Consequences encoded here:
 * - The sequence renders in a city only while the SERVER says a countdown is
 *   active AND its user IS that city's owner (raw username compare — DB
 *   values, never localized display names).
 * - Grace-resume restores the ORIGINAL startedAt (goddess-countdown.ts), so
 *   progress continuity after a steal-and-reacquire falls out of mirroring
 *   the payload — no client bookkeeping.
 * - Loss/abort: the server clears the countdown (or reassigns it), the query
 *   refetch/Pusher event flips `active`, and the visual state goes idle.
 *   The client never runs its own win timer.
 *
 * `nowSec` is injected (shared useNow clock at the call site) — no Date.now
 * inside, so this module stays deterministic for tests.
 */

/** Discrete visual phases — also the reduced-motion rendering vocabulary. */
export type RootSequencePhase = "stir" | "surge" | "brink";

/** Derived visual state for ONE city view. */
export type RootSequenceVisualState =
  | { active: false }
  | {
      active: true;
      /** 0..1 through the countdown window (clamped, never negative). */
      progress: number;
      phase: RootSequencePhase;
      /** Local mirror of the server deadline (unix seconds). */
      expiresAt: number;
      /** Local remaining seconds (≥0; hits 0 while the win is processed). */
      remainingSeconds: number;
      /**
       * Hold state (M1): the server window has EXPIRED but the win/cancel is
       * still being processed by the cron. The visuals hold brink instead of
       * collapsing to idle for up to one cron interval. Derived ONLY from
       * the payload's `resolving` flag — never inferred client-side.
       */
      resolving?: boolean;
    };

/** Minimal structural slice of the /api/goddess-countdown payload. */
export interface CountdownLike {
  active: boolean;
  username: string | null;
  startedAt: number;
  expiresAt: number;
  /** True while expired-but-unprocessed (additive server field, M1). */
  resolving?: boolean;
}

const STIR_MAX = 1 / 3;
const SURGE_MAX = 2 / 3;

/** Phase bucket for a clamped progress value. */
export function rootPhase(progress: number): RootSequencePhase {
  if (progress < STIR_MAX) return "stir";
  if (progress < SURGE_MAX) return "surge";
  return "brink";
}

/**
 * Derive the Root Sequence visual state for a city owned by
 * `ownerUsername`. `countdown` may be null/undefined (query not resolved) —
 * that is idle, never "assume running".
 */
export function rootSequenceFor(
  countdown: CountdownLike | null | undefined,
  ownerUsername: string,
  nowSec: number
): RootSequenceVisualState {
  if (
    !countdown ||
    !countdown.active ||
    !countdown.username ||
    countdown.username !== ownerUsername
  ) {
    // M1 hold: the payload went idle-shaped because the window expired, but
    // the server says the win is still resolving — HOLD brink visuals for
    // THIS owner instead of flashing to idle (up to one cron interval).
    if (
      countdown &&
      countdown.resolving &&
      countdown.username &&
      countdown.username === ownerUsername
    ) {
      return {
        active: true,
        progress: 1,
        phase: "brink",
        expiresAt: 0,
        remainingSeconds: 0,
        resolving: true,
      };
    }
    return { active: false };
  }
  const span = countdown.expiresAt - countdown.startedAt;
  // Degenerate window (bad data): render idle rather than divide by zero.
  if (!Number.isFinite(span) || span <= 0) return { active: false };
  const progress = Math.max(0, Math.min(1, (nowSec - countdown.startedAt) / span));
  return {
    active: true,
    progress,
    phase: rootPhase(progress),
    expiresAt: countdown.expiresAt,
    remainingSeconds: Math.max(0, countdown.expiresAt - nowSec),
  };
}

/**
 * Change-detection key: two states with the same key render IDENTICALLY, so
 * the shell only pushes to the imperative scene when the key flips. Progress
 * is quantized to 2% steps (≤ 50 scene redraws across a whole hour-long
 * sequence) plus the phase bucket and remaining-minute for HUD text.
 */
export function rootSequenceKey(state: RootSequenceVisualState): string {
  if (!state.active) return "idle";
  const step = Math.floor(state.progress * 50);
  const resolving = state.resolving ? ":r" : "";
  return `on:${state.phase}:${step}:${Math.ceil(state.remainingSeconds / 60)}${resolving}`;
}
