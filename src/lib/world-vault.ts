import { db } from "@/db";
import { gameSettings, gameHistory, rewardHistory, users } from "@/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { getPortfolioValue } from "@/lib/raid";

/**
 * THE WORLD VAULT — Foreclosure Day as an always-on rolling server event
 * (GAME_INTEGRATION_STUDY.md §5G, lean v1 2026-10-01).
 *
 * A server-wide vault with a shared damage pool: every acquire, renovate and
 * raid chips it (derived from EXISTING gameHistory rows — zero new writes on
 * the action path). When damage reaches the goal the vault BREAKS: every
 * contributor mints a flat participation payout, the top damage dealers get
 * a portfolio-scaled bonus, the whole thing re-arms at a higher goal, and a
 * `vault-broken` event fires on game-global. The first cooperative goal the
 * game has ever had.
 *
 * Damage sources are gameHistory event types with weights; the break is
 * processed lazily (status reads + an hourly cron backstop on
 * leaderboard-prizes, the revived prize payer) and claimed via a
 * compare-and-swap on fd_epoch_start so concurrent readers pay out exactly
 * once. All mints are bounded: flat payout × ≤500 participants + 0.1% of
 * three portfolios.
 */

export const VAULT_DAMAGE_WEIGHTS: Record<string, number> = {
  purchase: 1,
  pump: 1,
  raid: 2,
};
export const VAULT_BASE_GOAL = 600; // calibrated: ~1–3 active days to break
export const VAULT_GOAL_GROWTH = 1.6;
export const VAULT_PARTICIPATION_FLAT = 500;
export const VAULT_TOP_BONUS_RATE = 0.001; // 0.1% of portfolio
export const VAULT_TOP_BONUS_MIN = 100;
export const VAULT_TOP_MULTS = [3, 2, 1] as const;
export const VAULT_MAX_PARTICIPANTS = 500;
/** Minimum weighted damage to qualify for a payout — one 1-damage action
 *  must not turn the signup grant into a 500¢ harvest (review F3). */
export const VAULT_MIN_CONTRIBUTION_DAMAGE = 3;

const KEY_GOAL = "fd_goal";
const KEY_EPOCH_START = "fd_epoch_start";
const KEY_BREAKS = "fd_breaks";
const KEY_LAST_BREAK = "fd_last_break";

// ── settings helpers (same pattern as goddess-countdown) ──
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
    .values({ settingKey: key, settingValue: value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: value, updatedAt: new Date() },
    });
}

// ── pure helpers (unit-tested) ──

export interface DamageRow {
  actorId: number;
  eventType: string;
  count: number;
}

/** Aggregate weighted damage per actor (ties → lower actorId first). */
export function damageByActor(rows: DamageRow[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of rows) {
    const w = VAULT_DAMAGE_WEIGHTS[r.eventType] ?? 0;
    if (w <= 0 || r.count <= 0) continue;
    m.set(r.actorId, (m.get(r.actorId) ?? 0) + w * r.count);
  }
  return m;
}

export function totalDamage(rows: DamageRow[]): number {
  let t = 0;
  for (const r of rows) t += (VAULT_DAMAGE_WEIGHTS[r.eventType] ?? 0) * r.count;
  return t;
}

/** Ranked contributors (damage desc, actorId asc tiebreak). */
export function rankContributors(byActor: Map<number, number>): { actorId: number; damage: number }[] {
  return [...byActor.entries()]
    .map(([actorId, damage]) => ({ actorId, damage }))
    .sort((a, b) => b.damage - a.damage || a.actorId - b.actorId);
}

/** Next goal after a break (integer, monotonic growth). */
export function nextGoal(goal: number): number {
  return Math.max(VAULT_BASE_GOAL, Math.ceil(goal * VAULT_GOAL_GROWTH));
}

/**
 * The payout plan: flat participation for contributors with at least
 * VAULT_MIN_CONTRIBUTION_DAMAGE weighted damage, capped at MAX participants
 * (top damage first) + portfolio-scaled bonuses for the top 3 ("0.1% of
 * owned value" — the canonical expression omits the max(ownerCount,1)
 * factor, which under single-owner is 1 and only ever understates →
 * conservative for a mint). Pure — portfolios are inputs, fully testable.
 */
export function computePayouts(
  ranked: { actorId: number; damage: number }[],
  portfolioOf: (actorId: number) => number
): { actorId: number; amount: number; tier: "participation" | "top3" }[] {
  const participants = ranked
    .filter((p) => p.damage >= VAULT_MIN_CONTRIBUTION_DAMAGE)
    .slice(0, VAULT_MAX_PARTICIPANTS);
  const plan = new Map<number, { actorId: number; amount: number; tier: "participation" | "top3" }>();
  for (const p of participants) {
    plan.set(p.actorId, { actorId: p.actorId, amount: VAULT_PARTICIPATION_FLAT, tier: "participation" });
  }
  participants.slice(0, VAULT_TOP_MULTS.length).forEach((p, i) => {
    const bonus =
      Math.max(VAULT_TOP_BONUS_MIN, Math.floor(portfolioOf(p.actorId) * VAULT_TOP_BONUS_RATE)) *
      VAULT_TOP_MULTS[i];
    const row = plan.get(p.actorId);
    if (row) {
      row.amount += bonus;
      row.tier = "top3";
    }
  });
  return [...plan.values()];
}

// ── DB service ──

export interface WorldVaultStatus {
  goal: number;
  damage: number;
  progress: number; // 0..1
  breaks: number;
  lastBreakAt: number | null; // unix seconds
  epochStart: number; // unix seconds
  contributors: number;
}

async function fetchDamageRows(epochStartSec: number): Promise<DamageRow[]> {
  const rows = await db
    .select({
      actorId: gameHistory.actorId,
      eventType: gameHistory.eventType,
      count: sql<number>`COUNT(*)`,
    })
    .from(gameHistory)
    .where(
      and(
        sql`${gameHistory.createdAt} > to_timestamp(${epochStartSec})`,
        inArray(gameHistory.eventType, Object.keys(VAULT_DAMAGE_WEIGHTS))
      )
    )
    .groupBy(gameHistory.actorId, gameHistory.eventType);
  return rows
    .map((r) => ({ actorId: r.actorId, eventType: r.eventType, count: Number(r.count) }))
    .filter((r): r is DamageRow => r.actorId != null);
}

/** Current public status. Never mutates. */
export async function getVaultStatus(): Promise<WorldVaultStatus> {
  const goal = (await readSetting(KEY_GOAL)) ?? VAULT_BASE_GOAL;
  const epochStart = (await readSetting(KEY_EPOCH_START)) ?? Math.floor(Date.now() / 1000);
  const breaks = (await readSetting(KEY_BREAKS)) ?? 0;
  const lastBreakAt = await readSetting(KEY_LAST_BREAK);
  const rows = await fetchDamageRows(epochStart);
  const damage = totalDamage(rows);
  return {
    goal,
    damage: Math.min(damage, goal),
    progress: Math.min(1, damage / goal),
    breaks,
    lastBreakAt,
    epochStart,
    contributors: damageByActor(rows).size,
  };
}

/**
 * Lazy break processor — call from the status route and the hourly cron
 * backstop. Idempotent under concurrency via a CAS claim on fd_epoch_start:
 * only the caller whose UPDATE lands pays out.
 */
export async function maybeProcessBreak(): Promise<WorldVaultStatus | null> {
  // Bootstrap (review F1): the epoch row has no other writer — ensure it
  // exists FIRST or damage accrues against a drifting read-time window and
  // the vault can never break. onConflictDoNothing keeps concurrent cold
  // starts safe; the re-read adopts whichever row won.
  let epochStart = await readSetting(KEY_EPOCH_START);
  if (epochStart === null) {
    await db
      .insert(gameSettings)
      .values({
        settingKey: KEY_EPOCH_START,
        settingValue: Math.floor(Date.now() / 1000),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
    epochStart = (await readSetting(KEY_EPOCH_START)) ?? Math.floor(Date.now() / 1000);
  }
  const goal = (await readSetting(KEY_GOAL)) ?? VAULT_BASE_GOAL;
  const rows = await fetchDamageRows(epochStart);
  const damage = totalDamage(rows);
  if (damage < goal) return null;

  // CAS claim: move the epoch forward; a concurrent processor's conditional
  // update then matches zero rows and backs off.
  const claimed = await db
    .update(gameSettings)
    .set({ settingValue: sql`extract(epoch from now())::int`, updatedAt: new Date() })
    .where(and(eq(gameSettings.settingKey, KEY_EPOCH_START), eq(gameSettings.settingValue, epochStart)))
    .returning({ value: gameSettings.settingValue });
  if (claimed.length === 0) return null; // someone else broke it first

  try {
    let ranked = rankContributors(damageByActor(rows));

    // Ghost guard (review F4): quick-play accounts are deleted hourly while
    // their gameHistory rows persist, and rewardHistory.userId is a hard FK —
    // drop contributors whose account no longer exists BEFORE paying/auditing.
    const contributorIds = ranked.map((r) => r.actorId);
    if (contributorIds.length > 0) {
      const alive = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, contributorIds));
      const aliveSet = new Set(alive.map((a) => a.id));
      ranked = ranked.filter((r) => aliveSet.has(r.actorId));
    }

    // Resolve portfolios for the top rows first (bounded: ≤3 queries), then
    // build the final plan (pure, unit-tested split).
    const portfolioCache = new Map<number, number>();
    for (const p of ranked.slice(0, VAULT_TOP_MULTS.length)) {
      portfolioCache.set(p.actorId, await getPortfolioValue(p.actorId));
    }
    const finalPlan = computePayouts(ranked, (actorId) => portfolioCache.get(actorId) ?? 0);

    // Batch payout (review F5): one UPDATE for the flat portion (IN-chunked),
    // individual UPDATEs only for the ≤3 top-bonus top-ups. Reads hoisted out
    // of loops — a break must fit comfortably inside a 60s function.
    const flatIds = finalPlan.map((p) => p.actorId);
    for (let i = 0; i < flatIds.length; i += 100) {
      const chunk = flatIds.slice(i, i + 100);
      await db
        .update(users)
        .set({
          credits: sql`LEAST(credits + ${VAULT_PARTICIPATION_FLAT}, ${sql.raw(MAX_CREDITS_SQL)})`,
          updatedAt: new Date(),
        })
        .where(inArray(users.id, chunk));
    }
    const breaksBefore = (await readSetting(KEY_BREAKS)) ?? 0;
    for (const payout of finalPlan) {
      const bonus = payout.amount - VAULT_PARTICIPATION_FLAT;
      if (payout.tier !== "top3" || bonus <= 0) continue;
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${bonus}, ${sql.raw(MAX_CREDITS_SQL)})`, updatedAt: new Date() })
        .where(eq(users.id, payout.actorId));
    }

    if (finalPlan.length > 0) {
      try {
        await db.insert(rewardHistory).values(
          finalPlan.map((payout) => ({
            userId: payout.actorId,
            type: "world_vault",
            amount: payout.amount,
            details: JSON.stringify({ damage, goal, tier: payout.tier, breaks: breaksBefore }),
          }))
        );
      } catch (e) {
        console.error("World vault reward history error:", e);
      }
    }

    const newGoal = nextGoal(goal);
    await writeSetting(KEY_GOAL, newGoal);
    await writeSetting(KEY_BREAKS, breaksBefore + 1);
    await writeSetting(KEY_LAST_BREAK, Math.floor(Date.now() / 1000));

    try {
      await pusher.trigger("game-global", "vault-broken", {
        goal: newGoal,
        damage,
        contributors: ranked.length,
      });
    } catch (e) {
      console.error("World vault pusher error:", e);
    }
    console.log(`[world-vault] BROKEN: damage=${damage} goal=${goal} contributors=${ranked.length} next=${newGoal}`);

    return {
      goal: newGoal,
      damage: 0,
      progress: 0,
      breaks: breaksBefore + 1,
      lastBreakAt: Math.floor(Date.now() / 1000),
      epochStart: Math.floor(Date.now() / 1000),
      contributors: 0,
    };
  } catch (error) {
    console.error("World vault break processing error (vault stays claimed; payouts may be partial):", error);
    return null;
  }
}
