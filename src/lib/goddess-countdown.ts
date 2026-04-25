/**
 * Goddess Countdown helper functions.
 *
 * Manages the countdown state stored in game_settings:
 * - goddess_countdown_user_id: The user ID of the challenger (0 = no active countdown)
 * - goddess_countdown_start: Unix timestamp (seconds) when countdown began
 * - goddess_countdown_duration_minutes: Configurable default duration (default 60)
 * - goddess_countdown_duration_snapshot: Snapshot of the duration at countdown start
 *   (prevents retroactive expiry shifts when an admin changes the global duration mid-run)
 * - goddess_countdown_last_processed_start: Epoch of the last countdown start for which
 *   a win was processed (idempotency guard against duplicate reset processing)
 */

import { db } from "@/db";
import { gameSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

const COUNTDOWN_USER_KEY = "goddess_countdown_user_id";
const COUNTDOWN_START_KEY = "goddess_countdown_start";
const COUNTDOWN_DURATION_KEY = "goddess_countdown_duration_minutes";
const COUNTDOWN_DURATION_SNAPSHOT_KEY = "goddess_countdown_duration_snapshot";
const COUNTDOWN_LAST_PROCESSED_KEY = "goddess_countdown_last_processed_start";
// Grace-window keys — allow a user whose countdown was just cancelled (because
// someone briefly stole a goddess from them) to RESUME that same countdown
// if they reacquire all 5 goddesses within GRACE_SECONDS. Without this, every
// brief NPC/human trade of a cheap goddess (Inanna is $1k) resets the timer.
const COUNTDOWN_GRACE_USER_KEY = "goddess_countdown_grace_user_id";
const COUNTDOWN_GRACE_PREV_START_KEY = "goddess_countdown_grace_prev_start";
const COUNTDOWN_GRACE_PREV_DURATION_KEY = "goddess_countdown_grace_prev_duration";
const COUNTDOWN_GRACE_EXPIRES_KEY = "goddess_countdown_grace_expires_at";
const DEFAULT_DURATION_MINUTES = 60;
const GRACE_SECONDS = 120; // 2 minutes


export interface CountdownState {
  active: boolean;
  userId: number;
  startedAt: number; // unix timestamp seconds
  durationMinutes: number;
  expiresAt: number; // unix timestamp seconds
  remainingSeconds: number;
}

async function readSetting(key: string): Promise<number | null> {
  try {
    const [row] = await db
      .select({ value: gameSettings.settingValue })
      .from(gameSettings)
      .where(eq(gameSettings.settingKey, key));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function writeSetting(key: string, value: number): Promise<void> {
  await db
    .insert(gameSettings)
    .values({
      settingKey: key,
      settingValue: value,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: {
        settingValue: value,
        updatedAt: new Date(),
      },
    });
}

/** Get the configured default countdown duration (minutes) */
async function getDefaultDurationMinutes(): Promise<number> {
  const v = await readSetting(COUNTDOWN_DURATION_KEY);
  return v ?? DEFAULT_DURATION_MINUTES;
}

/** Get the current countdown state (uses snapshot duration if present) */
export async function getCountdownState(): Promise<CountdownState> {
  const userId = (await readSetting(COUNTDOWN_USER_KEY)) ?? 0;
  const startedAt = (await readSetting(COUNTDOWN_START_KEY)) ?? 0;
  const snapshot = await readSetting(COUNTDOWN_DURATION_SNAPSHOT_KEY);
  const defaultDuration = await getDefaultDurationMinutes();
  const durationMinutes = snapshot && snapshot > 0 ? snapshot : defaultDuration;

  if (userId === 0 || startedAt === 0) {
    return {
      active: false,
      userId: 0,
      startedAt: 0,
      durationMinutes,
      expiresAt: 0,
      remainingSeconds: 0,
    };
  }

  const expiresAt = startedAt + durationMinutes * 60;
  const now = Math.floor(Date.now() / 1000);
  const remainingSeconds = Math.max(0, expiresAt - now);

  return {
    active: remainingSeconds > 0,
    userId,
    startedAt,
    durationMinutes,
    expiresAt,
    remainingSeconds,
  };
}

/**
 * Start a new countdown for a user.
 *
 * Grace-window behavior: if this same user had their countdown cancelled
 * within GRACE_SECONDS ago (e.g. a goddess was stolen and re-acquired
 * quickly), we RESUME the prior startedAt/duration instead of starting over.
 * This prevents trivially cheap goddess trades (Inanna is $1k) from resetting
 * the hour-long timer indefinitely.
 */
export async function startCountdown(userId: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const defaultDuration = await getDefaultDurationMinutes();

  // Check for an active grace record for THIS user.
  const graceUserId = (await readSetting(COUNTDOWN_GRACE_USER_KEY)) ?? 0;
  const graceExpires = (await readSetting(COUNTDOWN_GRACE_EXPIRES_KEY)) ?? 0;
  const gracePrevStart = (await readSetting(COUNTDOWN_GRACE_PREV_START_KEY)) ?? 0;
  const gracePrevDuration =
    (await readSetting(COUNTDOWN_GRACE_PREV_DURATION_KEY)) ?? 0;

  if (
    graceUserId === userId &&
    graceExpires > 0 &&
    now <= graceExpires &&
    gracePrevStart > 0 &&
    gracePrevDuration > 0
  ) {
    // Resume the prior countdown. If the resumed countdown would already be
    // expired, the cron will pick that up on the next tick and process the win.
    await writeSetting(COUNTDOWN_USER_KEY, userId);
    await writeSetting(COUNTDOWN_START_KEY, gracePrevStart);
    await writeSetting(COUNTDOWN_DURATION_SNAPSHOT_KEY, gracePrevDuration);
    // Consume the grace record.
    await writeSetting(COUNTDOWN_GRACE_USER_KEY, 0);
    await writeSetting(COUNTDOWN_GRACE_PREV_START_KEY, 0);
    await writeSetting(COUNTDOWN_GRACE_PREV_DURATION_KEY, 0);
    await writeSetting(COUNTDOWN_GRACE_EXPIRES_KEY, 0);
    return;
  }

  // Fresh start.
  await writeSetting(COUNTDOWN_USER_KEY, userId);
  await writeSetting(COUNTDOWN_START_KEY, now);
  await writeSetting(COUNTDOWN_DURATION_SNAPSHOT_KEY, defaultDuration);
  // Any stale grace record for a different user is irrelevant; leave it alone
  // (it will expire on its own). If it was for THIS user but we took the fresh
  // path above (expired), it's also fine to leave — readers gate on graceExpires.
}

/**
 * Clear the active countdown.
 *
 * If `recordGraceFor` is provided and the countdown being cleared was for that
 * user, we record a grace window so that a rapid re-acquisition by the same
 * user resumes the prior countdown instead of starting a new one.
 */
export async function clearCountdown(recordGraceFor?: {
  userId: number;
  startedAt: number;
  durationMinutes: number;
}): Promise<void> {
  if (recordGraceFor && recordGraceFor.userId > 0 && recordGraceFor.startedAt > 0) {
    const now = Math.floor(Date.now() / 1000);
    await writeSetting(COUNTDOWN_GRACE_USER_KEY, recordGraceFor.userId);
    await writeSetting(COUNTDOWN_GRACE_PREV_START_KEY, recordGraceFor.startedAt);
    await writeSetting(
      COUNTDOWN_GRACE_PREV_DURATION_KEY,
      recordGraceFor.durationMinutes
    );
    await writeSetting(COUNTDOWN_GRACE_EXPIRES_KEY, now + GRACE_SECONDS);
  }

  await writeSetting(COUNTDOWN_USER_KEY, 0);
  await writeSetting(COUNTDOWN_START_KEY, 0);
  await writeSetting(COUNTDOWN_DURATION_SNAPSHOT_KEY, 0);
}


/** Check if countdown has expired (returns true if time is up) */
export async function isCountdownExpired(): Promise<boolean> {
  const state = await getCountdownState();
  return state.userId !== 0 && state.startedAt !== 0 && state.remainingSeconds === 0;
}

/**
 * Idempotency guard: returns the last countdown start epoch that has already
 * been processed to a win, or 0 if none.
 */
export async function getLastProcessedCountdownStart(): Promise<number> {
  return (await readSetting(COUNTDOWN_LAST_PROCESSED_KEY)) ?? 0;
}

/** Mark a countdown start epoch as processed (prevents duplicate wins) */
export async function markCountdownProcessed(startedAt: number): Promise<void> {
  await writeSetting(COUNTDOWN_LAST_PROCESSED_KEY, startedAt);
}
