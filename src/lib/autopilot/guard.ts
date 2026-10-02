/**
 * Autopilot server-side guards (PLAYER_AI_STUDY §7.5, rulings 2026-10-03).
 *
 * Two tiers, both per-PLAYER-ACCOUNT (never per-IP):
 *  - UNIVERSAL: 30 game actions / minute for everyone (fixed-minute
 *    window). Sits at the measured p95 of human pacing — an anti-flood
 *    bound, not a bot detector.
 *  - DECLARED AUTOMATION: requests carrying `x-n38-via: autopilot` are
 *    limited to ONE ACTION PER 10 SECONDS. The official autopilot declares
 *    itself, so it gets the stricter policy; undeclared scripts still hit
 *    the universal ceiling. The header is trivially strippable — it can
 *    only ever make limits STRICTER, never bypass anything.
 *
 * ATOMICITY: every claim is a SINGLE conditional statement over one
 * game_settings row (neon-http has no transactions; single statements are
 * atomic — the raid-charge CAS house style). Concurrent racing requests
 * serialize on the row and lose: the agent tier's UPDATE only matches a
 * timestamp ≥10 s old, and the universal tier is one packed upsert whose
 * returned value decides. Only the very first claim of a key has a tiny
 * insert-then-update window (see claimAgent).
 *
 * Guard failures (DB outage) fail OPEN — a guard bug must never lock
 * players out of the game; the per-feature cooldowns and the cores'
 * affordability checks still bound everything.
 */

import { NextResponse } from "next/server";
import { db } from "@/db";
import { gameSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { gameHistory } from "@/db/schema";
import {
  AGENT_MIN_INTERVAL_S,
  RATE_PACK,
  UNIVERSAL_WINDOW_S,
  agentRetryAfterSec,
  packRateValue,
  universalBlocked,
} from "./pace";

export {
  AGENT_MIN_INTERVAL_S,
  UNIVERSAL_WINDOW_S,
  UNIVERSAL_MAX,
  RATE_PACK,
  agentRetryAfterSec,
  packRateValue,
  unpackRateValue,
  universalBlocked,
} from "./pace";

export const VIA_HEADER = "x-n38-via";
export const VIA_VALUE = "autopilot";

export function isAutopilotVia(req: Request): boolean {
  return req.headers.get(VIA_HEADER)?.trim().toLowerCase() === VIA_VALUE;
}

async function readSettingValue(key: string): Promise<number | null> {
  const [row] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, key))
    .limit(1);
  return row ? Number(row.value) : null;
}

/**
 * Agent-tier claim — atomic conditional UPDATE of the last-declared-action
 * epoch. Returns null when allowed (slot claimed), or the retry seconds.
 */
async function claimAgentSlot(userId: number, nowSec: number): Promise<number | null> {
  const key = `auto_last_${userId}`;

  const claimed = await db.execute(sql`
    UPDATE game_settings
    SET setting_value = ${nowSec}, updated_at = NOW()
    WHERE setting_key = ${key} AND setting_value <= ${nowSec - AGENT_MIN_INTERVAL_S}
    RETURNING setting_value
  `);
  if (claimed.rows.length > 0) return null;

  // No row yet (or raced on creation): first-claim insert, then stamp it.
  const inserted = await db.execute(sql`
    INSERT INTO game_settings (setting_key, setting_value, updated_at)
    VALUES (${key}, 0, NOW())
    ON CONFLICT (setting_key) DO NOTHING
    RETURNING setting_key
  `);
  if (inserted.rows.length > 0) {
    // We created the row with 0 ("never") — record our own timestamp. A
    // concurrent first-claim can slip through this one-time window; every
    // later claim is a single atomic conditional UPDATE.
    await db.execute(sql`
      UPDATE game_settings SET setting_value = ${nowSec}, updated_at = NOW()
      WHERE setting_key = ${key} AND setting_value = 0
    `);
    return null;
  }

  const last = await readSettingValue(key);
  return agentRetryAfterSec(last ?? nowSec, nowSec);
}

/**
 * Universal-tier claim — ONE packed upsert (win × 40 + count). The
 * RETURNING value is the post-increment count; blocked when it exceeds 30
 * in the current window. Saturation at 39 keeps racing floods from rolling
 * the count into the next window.
 */
async function claimUniversalSlot(userId: number, nowSec: number): Promise<number | null> {
  const key = `rate_${userId}`;
  const curWin = Math.floor(nowSec / UNIVERSAL_WINDOW_S);
  const firstClaim = packRateValue(curWin, 1);
  const saturation = packRateValue(curWin, RATE_PACK - 1);

  const rows = await db.execute(sql`
    INSERT INTO game_settings (setting_key, setting_value, updated_at)
    VALUES (${key}, ${firstClaim}, NOW())
    ON CONFLICT (setting_key) DO UPDATE SET
      setting_value = CASE
        WHEN game_settings.setting_value / ${RATE_PACK} < ${curWin}
          THEN ${firstClaim}
        ELSE LEAST(game_settings.setting_value + 1, ${saturation})
      END,
      updated_at = NOW()
    RETURNING setting_value
  `);

  const value = rows.rows.length > 0 ? Number(rows.rows[0].setting_value) : firstClaim;
  if (universalBlocked(value, curWin)) {
    return Math.max(1, UNIVERSAL_WINDOW_S - (nowSec % UNIVERSAL_WINDOW_S));
  }
  return null;
}

export type GuardOutcome =
  | { blocked: false; viaAutopilot: boolean }
  | { blocked: true; response: NextResponse };

function rateResponse(error: string, retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.floor(retryAfterSec))) } }
  );
}

/**
 * Route-level guard for player-action POSTs. Returns a 429 NextResponse
 * when throttled (with Retry-After), else whether the request declared
 * itself as autopilot.
 */
export async function guardGameAction(req: Request, userId: number): Promise<GuardOutcome> {
  const viaAutopilot = isAutopilotVia(req);
  const nowSec = Math.floor(Date.now() / 1000);

  try {
    if (viaAutopilot) {
      const agentRetry = await claimAgentSlot(userId, nowSec);
      if (agentRetry !== null) {
        return {
          blocked: true,
          response: rateResponse("Autopilot pace limit — one action per 10 seconds.", agentRetry),
        };
      }
    }

    const universalRetry = await claimUniversalSlot(userId, nowSec);
    if (universalRetry !== null) {
      return {
        blocked: true,
        response: rateResponse("Slow down — too many actions this minute.", universalRetry),
      };
    }

    return { blocked: false, viaAutopilot };
  } catch (err) {
    // Fail open: a guard outage must never break the action route itself.
    console.error("Action rate guard failed:", err);
    return { blocked: false, viaAutopilot };
  }
}

/**
 * Transparency stamp (study §7.4): a lightweight `autopilot_action` audit
 * row per successful declared action — the agent_action precedent from the
 * goddess runner. Advisory only (the header is self-declared; actorId is
 * always the session user). Best-effort: never fails the action.
 */
export async function noteAutopilotAction(
  userId: number,
  verb: string,
  target?: { id?: number; username?: string }
): Promise<void> {
  try {
    await db.insert(gameHistory).values({
      eventType: "autopilot_action",
      actorId: userId,
      targetId: target?.id ?? null,
      targetUsername: target?.username ?? null,
      details: JSON.stringify({ verb, via: "autopilot" }),
    });
  } catch (err) {
    console.error("Autopilot audit row failed:", err);
  }
}
