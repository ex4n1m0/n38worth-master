/**
 * Builtin free AI tier — SERVER-SIDE DeepSeek proxy (2026-10-03).
 *
 * The player's browser never sees the n38worth DeepSeek key: it lives in the
 * AUTOPILOT_BUILTIN_API_KEY env var (Vercel/server only) and is attached
 * here, inside the server. The client sends its game SNAPSHOT (not a free
 * prompt): the system prompt is server-owned, the model name and base URL
 * are fixed constants, and every response is still validated against the
 * snapshot client-side (brain.ts) — this proxy is not a general relay.
 *
 * Three fences bound the spend (all CAS claims over game_settings, the
 * guard.ts house style — neon-http has no transactions):
 *   1. per-user pace: one call / 10 s (preview-button spam guard)
 *   2. per-user daily cap (default 100 turns/day)
 *   3. global daily cap (default 2000 calls/day — the wallet breaker)
 *
 * Unlike guardGameAction (fail OPEN — gameplay must never lock up), these
 * claims fail CLOSED: a guard outage must not open the wallet.
 */

import { db } from "@/db";
import { gameSettings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { AUTOPILOT_TURN_MAX_ACTIONS } from "./types";
import type {
  AutopilotSnapshot,
  BuyCandidateRow,
  ComboCandidateRow,
  OwnedCandidateRow,
  TurnMemoryEntry,
} from "./types";
import { parsePlanText } from "./brain";

// ── Fixed provider facts (never client-overridable) ──

export const BUILTIN_BASE_URL = "https://api.deepseek.com/v1";
export const BUILTIN_MODEL_FALLBACK = "deepseek-flash"; // user ruling 2026-10-03
export const BUILTIN_MIN_INTERVAL_S = 10;
export const BUILTIN_USER_DAILY_DEFAULT = 100;
export const BUILTIN_GLOBAL_DAILY_DEFAULT = 2_000;
export const BUILTIN_MAX_TOKENS = 900;
export const BUILTIN_FETCH_TIMEOUT_MS = 20_000;

/** day×1000 + count — int32-safe for epoch-days until ~year 5800. */
const USER_DAY_PACK = 1_000;
const USER_CNT_MAX = 999;
/** day×10000 + count — int32-safe for epoch-days until ~year 7800. */
const GLOBAL_DAY_PACK = 10_000;
const GLOBAL_CNT_MAX = 9_999;

const DAY_S = 86_400;

export function builtinApiKey(): string {
  return (process.env.AUTOPILOT_BUILTIN_API_KEY ?? "").trim();
}

export function builtinModel(): string {
  return (process.env.AUTOPILOT_BUILTIN_MODEL ?? "").trim() || BUILTIN_MODEL_FALLBACK;
}

function userDailyLimit(): number {
  const raw = Number(process.env.AUTOPILOT_BUILTIN_USER_DAILY);
  // Clamped to the pack saturation — a higher env value would silently
  // disable the fence (count saturates below it, security-review P3).
  const limit = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : BUILTIN_USER_DAILY_DEFAULT;
  return Math.min(limit, USER_CNT_MAX);
}

function globalDailyLimit(): number {
  const raw = Number(process.env.AUTOPILOT_BUILTIN_GLOBAL_DAILY);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : BUILTIN_GLOBAL_DAILY_DEFAULT;
  return Math.min(limit, GLOBAL_CNT_MAX);
}

// ── Pure daily-counter math (unit-tested) ──

export function dayIndexOf(nowSec: number): number {
  return Math.max(0, Math.floor(nowSec / DAY_S));
}

export function packDaily(day: number, cnt: number, pack: number, cntMax: number): number {
  const safeDay = Math.max(0, Math.floor(day));
  const safeCnt = Math.min(Math.max(1, Math.floor(cnt)), cntMax);
  return safeDay * pack + safeCnt;
}

export function unpackDaily(value: number, pack: number): { day: number; cnt: number } {
  const v = Math.max(0, Math.floor(value));
  return { day: Math.floor(v / pack), cnt: v % pack };
}

/** True when the ALREADY-INCREMENTED count exceeds today's limit. */
export function dailyBlocked(packedValue: number, curDay: number, limit: number, pack: number): boolean {
  const { day, cnt } = unpackDaily(packedValue, pack);
  return day === curDay && cnt > limit;
}

/** Seconds until the daily counter rolls to a fresh UTC day. */
export function dailyResetInSec(nowSec: number): number {
  return DAY_S - (nowSec % DAY_S);
}

// ── Payload validation (pure — the snapshot is untrusted client input) ──

export const BRAIN_MAX_CANDIDATES = 200;
export const BRAIN_MAX_MEMORY = 10;
export const BRAIN_MEMORY_SUMMARY_MAX = 300;
/** Legit snapshots build ~1k-token (~4 KB) prompts; 20k chars is 5× headroom. */
export const BUILTIN_PROMPT_MAX_CHARS = 20_000;
/** DB usernames are varchar(30) — 64 is generous headroom for candidate text. */
const BRAIN_STR_MAX = 64;
const BRAIN_BODY_MAX_BYTES = 200_000;

export interface BrainPayload {
  ping: boolean;
  snapshot: AutopilotSnapshot | null;
  memory: TurnMemoryEntry[];
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v.slice(0, BRAIN_STR_MAX) : null;
}

/**
 * Rebuilds a candidate row into its typed shape — unknown fields are dropped
 * BY CONSTRUCTION and every string is length-capped, so a hostile snapshot
 * cannot smuggle a 100 KB "username" into the prompt (security-review P1).
 */
function clampBuyRow(r: unknown): BuyCandidateRow | null {
  if (!r || typeof r !== "object") return null;
  const c = r as Record<string, unknown>;
  if (!isFiniteNum(c.targetId) || !isFiniteNum(c.value)) return null;
  return {
    targetId: c.targetId,
    username: str(c.username) ?? "",
    profession: str(c.profession),
    value: c.value,
    hasOwner: c.hasOwner === true,
    ownerName: str(c.ownerName),
  };
}

function clampOwnedRow(r: unknown): OwnedCandidateRow | null {
  if (!r || typeof r !== "object") return null;
  const c = r as Record<string, unknown>;
  if (!isFiniteNum(c.ownershipId) || !isFiniteNum(c.playerId) || !isFiniteNum(c.value)) return null;
  return {
    ownershipId: c.ownershipId,
    playerId: c.playerId,
    username: str(c.username) ?? "",
    value: c.value,
    profession: str(c.profession),
    lockedUntil: str(c.lockedUntil),
  };
}

function clampCombo(r: unknown): ComboCandidateRow | null {
  if (!r || typeof r !== "object") return null;
  const c = r as Record<string, unknown>;
  const ids = Array.isArray(c.playerIds)
    ? c.playerIds.filter(isFiniteNum).slice(0, 8)
    : [];
  if (ids.length === 0 || !isFiniteNum(c.sumValue) || !isFiniteNum(c.estimatedReward)) return null;
  return { playerIds: ids, sumValue: c.sumValue, estimatedReward: c.estimatedReward };
}

function clampRows<T>(rows: unknown, max: number, clampRow: (r: unknown) => T | null): T[] {
  if (!Array.isArray(rows)) return [];
  const out: T[] = [];
  for (const r of rows) {
    const clamped = clampRow(r);
    if (clamped) out.push(clamped);
    if (out.length >= max) break;
  }
  return out;
}

function clampMemory(rows: unknown): TurnMemoryEntry[] {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, BRAIN_MAX_MEMORY).map((r) => {
    const m = r as Partial<TurnMemoryEntry>;
    return {
      at: isFiniteNum(m.at) ? m.at : 0,
      summary: typeof m.summary === "string" ? m.summary.slice(0, BRAIN_MEMORY_SUMMARY_MAX) : "",
    };
  });
}

function clampSnapshot(raw: unknown): AutopilotSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<AutopilotSnapshot>;
  if (
    !isFiniteNum(s.credits) ||
    !isFiniteNum(s.spendBudget) ||
    !isFiniteNum(s.slotsRemaining) ||
    !isFiniteNum(s.ownedCount) ||
    !Array.isArray(s.ownedProfessions)
  ) {
    return null;
  }
  return {
    credits: s.credits,
    spendBudget: s.spendBudget,
    slotsRemaining: s.slotsRemaining,
    ownedCount: s.ownedCount,
    ownedProfessions: s.ownedProfessions
      .filter((p): p is string => typeof p === "string")
      .slice(0, 20)
      .map((p) => p.slice(0, 40)),
    buyCandidates: clampRows(s.buyCandidates, BRAIN_MAX_CANDIDATES, clampBuyRow),
    renovateCandidates: clampRows(s.renovateCandidates, BRAIN_MAX_CANDIDATES, clampOwnedRow),
    lockCandidates: clampRows(s.lockCandidates, BRAIN_MAX_CANDIDATES, clampOwnedRow),
    comboCandidate: clampCombo(s.comboCandidate),
    massHireReady: s.massHireReady === true,
    generatedAt: isFiniteNum(s.generatedAt) ? s.generatedAt : 0,
  };
}

/** Never throws — malformed bodies become a ping-less null snapshot (400 upstream). */
export function parseBrainPayload(rawBody: string | null): BrainPayload | null {
  if (!rawBody || rawBody.length > BRAIN_BODY_MAX_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const b = body as { ping?: unknown; snapshot?: unknown; memory?: unknown };
  if (b.ping === true) return { ping: true, snapshot: null, memory: [] };
  const snapshot = clampSnapshot(b.snapshot);
  if (!snapshot) return null;
  return { ping: false, snapshot, memory: clampMemory(b.memory) };
}

/** Final prompt-size gate: bounds input tokens even if every field passed clamping. */
export function promptWithinBudget(system: string, user: string): boolean {
  return system.length <= 2_000 && user.length <= BUILTIN_PROMPT_MAX_CHARS;
}

/**
 * Pares the model's raw output to the strict plan JSON before it is returned
 * (security-review P2): the client re-parses anyway, so returning raw model
 * prose would only enable bounded free-text generation for direct callers.
 * Returns null when the output is not a plan object (→ 502 upstream).
 */
export function pareBuiltinContent(raw: string): string | null {
  const plan = parsePlanText(raw);
  if (!plan) return null;
  const pared = {
    actions: Array.isArray(plan.actions) ? plan.actions.slice(0, AUTOPILOT_TURN_MAX_ACTIONS) : [],
    note: typeof plan.note === "string" ? plan.note.slice(0, 300) : undefined,
  };
  return JSON.stringify(pared);
}

// ── CAS claims over game_settings (setting_key is varchar(50)) ──

export type BuiltinClaim =
  | { allowed: true }
  | { allowed: false; code: string; error: string; retryAfterSec?: number };

async function readSetting(key: string): Promise<number | null> {
  const [row] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, key))
    .limit(1);
  return row ? Number(row.value) : null;
}

/** Fence 1: one call per BUILTIN_MIN_INTERVAL_S (claimAgentSlot pattern). */
async function claimInterval(userId: number, nowSec: number): Promise<number | null> {
  const key = `auto_brain_ts_${userId}`;
  const claimed = await db.execute(sql`
    UPDATE game_settings
    SET setting_value = ${nowSec}, updated_at = NOW()
    WHERE setting_key = ${key} AND setting_value <= ${nowSec - BUILTIN_MIN_INTERVAL_S}
    RETURNING setting_value
  `);
  if (claimed.rows.length > 0) return null;
  const inserted = await db.execute(sql`
    INSERT INTO game_settings (setting_key, setting_value, updated_at)
    VALUES (${key}, 0, NOW())
    ON CONFLICT (setting_key) DO NOTHING
    RETURNING setting_key
  `);
  if (inserted.rows.length > 0) {
    await db.execute(sql`
      UPDATE game_settings SET setting_value = ${nowSec}, updated_at = NOW()
      WHERE setting_key = ${key} AND setting_value = 0
    `);
    return null;
  }
  const last = (await readSetting(key)) ?? nowSec;
  return Math.max(1, BUILTIN_MIN_INTERVAL_S - (nowSec - last));
}

/** Packed day+count single-statement upsert (claimUniversalSlot pattern). */
async function claimDailyCounter(
  settingKey: string,
  nowSec: number,
  pack: number,
  cntMax: number
): Promise<number> {
  const curDay = dayIndexOf(nowSec);
  const first = packDaily(curDay, 1, pack, cntMax);
  const saturation = packDaily(curDay, cntMax, pack, cntMax);
  const rows = await db.execute(sql`
    INSERT INTO game_settings (setting_key, setting_value, updated_at)
    VALUES (${settingKey}, ${first}, NOW())
    ON CONFLICT (setting_key) DO UPDATE SET
      setting_value = CASE
        WHEN game_settings.setting_value / ${pack} < ${curDay}
          THEN ${first}
        ELSE LEAST(game_settings.setting_value + 1, ${saturation})
      END,
      updated_at = NOW()
    RETURNING setting_value
  `);
  return rows.rows.length > 0 ? Number(rows.rows[0].setting_value) : first;
}

/**
 * All three fences in order. Fail CLOSED on DB errors (money route).
 * The daily counters are incremented BEFORE the provider call — a failed
 * call still consumes one credit (simple + race-safe; documented).
 */
export async function claimBuiltinBrainCall(userId: number): Promise<BuiltinClaim> {
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    const intervalRetry = await claimInterval(userId, nowSec);
    if (intervalRetry !== null) {
      return {
        allowed: false,
        code: "builtin-pace",
        error: "Free AI pace limit — one call per 10 seconds.",
        retryAfterSec: intervalRetry,
      };
    }

    const curDay = dayIndexOf(nowSec);
    const userPacked = await claimDailyCounter(
      `auto_brain_user_${userId}`,
      nowSec,
      USER_DAY_PACK,
      USER_CNT_MAX
    );
    if (dailyBlocked(userPacked, curDay, userDailyLimit(), USER_DAY_PACK)) {
      return {
        allowed: false,
        code: "builtin-user-limit",
        error: "Free AI daily limit reached — add your own API key to keep going.",
        retryAfterSec: dailyResetInSec(nowSec),
      };
    }

    const globalPacked = await claimDailyCounter(
      "auto_brain_global",
      nowSec,
      GLOBAL_DAY_PACK,
      GLOBAL_CNT_MAX
    );
    if (dailyBlocked(globalPacked, curDay, globalDailyLimit(), GLOBAL_DAY_PACK)) {
      return {
        allowed: false,
        code: "builtin-global-limit",
        error: "Free AI is paused for today — add your own API key to keep going.",
        retryAfterSec: dailyResetInSec(nowSec),
      };
    }

    return { allowed: true };
  } catch (err) {
    console.error("Builtin brain claim failed (fail closed):", err);
    return { allowed: false, code: "builtin-unavailable", error: "Free AI is unavailable right now." };
  }
}

/** The autopilot feature kill switch (same row /api/autopilot/enabled reads). */
export async function autopilotFlagEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, "autopilot_enabled"))
    .limit(1);
  return row ? Number(row.value) === 1 : false;
}

// ── The provider call (server-only key) ──

export interface BuiltinModelResult {
  ok: boolean;
  content?: string;
  usage?: { in: number; out: number };
  error?: string;
}

export async function callBuiltinModel(
  system: string,
  user: string,
  maxTokens: number
): Promise<BuiltinModelResult> {
  const apiKey = builtinApiKey();
  if (!apiKey) return { ok: false, error: "Builtin AI is not configured on the server." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BUILTIN_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BUILTIN_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: builtinModel(),
        // DeepSeek thinking mode returns prose before the JSON — disable it
        // (same note as providers.ts / agent/llm.ts).
        thinking: { type: "disabled" },
        temperature: 0.3,
        max_tokens: Math.min(Math.max(Math.floor(maxTokens), 1), BUILTIN_MAX_TOKENS),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Full upstream detail stays in server logs only (security-review P3).
      console.error(`Builtin DeepSeek HTTP ${res.status}:${text.slice(0, 400)}`);
      return { ok: false, error: "Builtin AI call failed." };
    }
    const data: unknown = await res.json();
    const d = data as { choices?: { message?: { content?: string } }[]; usage?: Record<string, unknown> };
    const content = d.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: "Empty model response" };
    const usage = d.usage ?? {};
    return {
      ok: true,
      content,
      usage: {
        in: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0,
        out: typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  } finally {
    clearTimeout(timer);
  }
}
