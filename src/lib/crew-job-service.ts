import { randomInt } from "crypto";
import { db } from "@/db";
import { users, ownership, gameSettings, rewardHistory, crewJobRuns } from "@/db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { buildingTier, protectionState } from "@/lib/city/projection";
import { familyIndex } from "@/lib/city/map2d/families";
import {
  CREW_JOBS,
  CREW_JOBS_BY_KEY,
  CREW_JOB_COOLDOWN_MS,
  CREW_POT_BOOTSTRAP,
  CREW_POT_FLOOR,
  CREW_POT_SETTING_KEY,
  CREW_SIZE,
  crewGateError,
  crewJobFee,
  crewJobPayout,
  cooldownEnd,
  resolveCrewRun,
  type CrewCard,
} from "@/lib/crew-jobs";

/**
 * Crew Jobs service — pot management (game_settings, one-time bootstrap),
 * job listing with per-player cooldowns, and the run executor. The pot is
 * REAL money recycled from the boss-tax skim (never minted beyond the
 * one-time documented bootstrap); payouts can never exceed the pot minus
 * its floor.
 */

async function readPot(): Promise<number> {
  const [row] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, CREW_POT_SETTING_KEY));
  return Number(row?.value ?? 0);
}

/** One-time pot bootstrap (claim-first insert — never repeats). */
export async function ensurePotBootstrapped(): Promise<void> {
  await db
    .insert(gameSettings)
    .values({ settingKey: CREW_POT_SETTING_KEY, settingValue: CREW_POT_BOOTSTRAP })
    .onConflictDoNothing();
}

export async function getCrewPot(): Promise<number> {
  await ensurePotBootstrapped();
  return readPot();
}

export interface CrewJobView {
  key: string;
  basePayout: number;
  minCrewTiers: number;
  requiredFamilies: { f: number; min: number }[];
  steps: { difficulty: number; favored: number }[];
  fee: number;
  cooldownEndAt: number | null; // epoch ms
}

export async function getCrewJobViews(userId: number): Promise<{ pot: number; jobs: CrewJobView[]; runs: { jobKey: string; outcome: string; payout: number; fee: number; rolledAt: string }[] }> {
  const pot = await getCrewPot();
  const recentRuns = await db
    .select({
      jobKey: crewJobRuns.jobKey,
      outcome: crewJobRuns.outcome,
      payout: crewJobRuns.payout,
      fee: crewJobRuns.fee,
      rolledAt: crewJobRuns.rolledAt,
    })
    .from(crewJobRuns)
    .where(eq(crewJobRuns.userId, userId))
    .orderBy(desc(crewJobRuns.rolledAt))
    .limit(12);

  // Per-job latest run (cooldown truth — independent of the 12-row window).
  const lastRuns = await db
    .select({
      jobKey: crewJobRuns.jobKey,
      last: sql<string>`MAX(${crewJobRuns.rolledAt})`,
    })
    .from(crewJobRuns)
    .where(eq(crewJobRuns.userId, userId))
    .groupBy(crewJobRuns.jobKey);
  const lastByJob = new Map<string, number>();
  for (const r of lastRuns) {
    const ts = new Date(r.last).getTime();
    if (!Number.isNaN(ts)) lastByJob.set(r.jobKey, ts);
  }

  const now = Date.now();
  const jobs: CrewJobView[] = CREW_JOBS.map((j) => {
    const last = lastByJob.get(j.key) ?? null;
    const cd = cooldownEnd(last);
    return {
      key: j.key,
      basePayout: j.basePayout,
      minCrewTiers: j.minCrewTiers,
      requiredFamilies: j.requiredFamilies,
      steps: j.steps,
      fee: crewJobFee(j),
      cooldownEndAt: last != null && cd > now ? cd : null,
    };
  });

  return {
    pot,
    jobs,
    runs: recentRuns.map((r) => ({
      jobKey: r.jobKey,
      outcome: r.outcome,
      payout: Number(r.payout),
      fee: Number(r.fee),
      rolledAt: r.rolledAt.toISOString(),
    })),
  };
}

/** The player's crew-ready cards (id/tier/family/protection), tier-desc. */
export async function getCrewRoster(userId: number): Promise<(CrewCard & { u: string })[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      playerValue: users.playerValue,
      valueFloor: users.valueFloor,
      profession: users.profession,
      isNpc: users.isNpc,
      avatarUrl: users.avatarUrl,
      avatarCompleted: users.avatarCompleted,
      blockSellUntil: ownership.blockSellUntil,
      permBlockUntil: ownership.permBlockUntil,
    })
    .from(ownership)
    .innerJoin(users, eq(ownership.ownedId, users.id))
    .where(eq(ownership.ownerId, userId));
  const now = new Date();
  return rows
    .filter((r) => r.isNpc === 1 || (r.avatarUrl && r.avatarCompleted === 1))
    .map((r) => ({
      id: r.id,
      u: r.username,
      f: familyIndex(r.profession),
      t: buildingTier(Number(r.playerValue), Number(r.valueFloor ?? 1)),
      p: protectionState(
        {
          blockSellUntil: r.blockSellUntil ? r.blockSellUntil.toISOString() : null,
          permBlockUntil: r.permBlockUntil ? r.permBlockUntil.toISOString() : null,
        },
        now
      ),
    }))
    .sort((a, b) => b.t - a.t || a.id - b.id);
}

export interface CrewRunResult {
  success?: true;
  error?: string;
  steps?: { success: boolean; crewPower: number; needed: number }[];
  outcome?: string;
  payout?: number;
  fee?: number;
  potAfter?: number;
}

export async function runCrewJob(userId: number, jobKey: string, crewCardIds: number[]): Promise<CrewRunResult> {
  const job = CREW_JOBS_BY_KEY.get(jobKey);
  if (!job) return { error: "Unknown job" };
  if (!Array.isArray(crewCardIds) || crewCardIds.length !== CREW_SIZE) {
    return { error: `Crew must be exactly ${CREW_SIZE} cards` };
  }
  if (new Set(crewCardIds).size !== CREW_SIZE) return { error: "Crew cards must be distinct" };

  const pot = await getCrewPot();
  if (pot < CREW_POT_FLOOR + 1) return { error: "The crew pot is empty — taxes refill it over time" };

  // Cooldown: latest run of THIS job by THIS player.
  const [last] = await db
    .select({ rolledAt: crewJobRuns.rolledAt })
    .from(crewJobRuns)
    .where(and(eq(crewJobRuns.userId, userId), eq(crewJobRuns.jobKey, jobKey)))
    .orderBy(desc(crewJobRuns.rolledAt))
    .limit(1);
  if (last && Date.now() < cooldownEnd(last.rolledAt.getTime())) {
    return { error: "This bank's locks are still spinning — cooldown active" };
  }

  // Resolve the crew from OWNERSHIP (cards the player actually holds), with
  // server-computed tier/family/protection.
  const roster = await getCrewRoster(userId);
  const rosterById = new Map(roster.map((c) => [c.id, c]));
  const crew: CrewCard[] = [];
  for (const id of crewCardIds) {
    const card = rosterById.get(id);
    if (!card) return { error: "Crew includes a building you do not own" };
    crew.push(card);
  }
  const gateError = crewGateError(job, crew);
  if (gateError) return { error: gateError };

  // Fee (burned sink) — conditional deduction on balance.
  const fee = crewJobFee(job);
  const feePaid = await db
    .update(users)
    .set({ credits: sql`credits - ${fee}`, updatedAt: new Date() })
    .where(and(eq(users.id, userId), sql`credits >= ${fee}`))
    .returning({ id: users.id });
  if (feePaid.length === 0) return { error: `Entry fee is ${fee}¢ — not enough capital` };

  // Resolve (seeded server-side).
  const rolls = [0.7, 0.9, 1.1, 1.3];
  const rollOf = () => rolls[randomInt(rolls.length)];
  const run = resolveCrewRun(job, crew, [rollOf(), rollOf(), rollOf()]);

  // Payout from the pot — CAS: only pay what the pot still holds. `paid`
  // tracks the amount ACTUALLY credited (review blocker: the concurrent-
  // drain fallback must re-check its debit before crediting, and the audit
  // must record the paid amount, not the hoped-for one).
  let paid = crewJobPayout(job, run.outcome, pot);
  let potAfter = pot;
  if (paid > 0) {
    const debited = await db
      .update(gameSettings)
      .set({ settingValue: sql`${gameSettings.settingValue} - ${paid}`, updatedAt: new Date() })
      .where(
        and(
          eq(gameSettings.settingKey, CREW_POT_SETTING_KEY),
          sql`${gameSettings.settingValue} >= ${paid + CREW_POT_FLOOR}`
        )
      )
      .returning({ value: gameSettings.settingValue });
    if (debited.length === 0) {
      // Pot drained concurrently — retry ONCE at the reduced amount, and
      // credit only if that debit's conditional update actually landed.
      paid = crewJobPayout(job, run.outcome, await readPot());
      const retry = paid > 0
        ? await db
            .update(gameSettings)
            .set({ settingValue: sql`${gameSettings.settingValue} - ${paid}`, updatedAt: new Date() })
            .where(
              and(
                eq(gameSettings.settingKey, CREW_POT_SETTING_KEY),
                sql`${gameSettings.settingValue} >= ${paid + CREW_POT_FLOOR}`
              )
            )
            .returning({ value: gameSettings.settingValue })
        : [];
      if (retry.length === 0) {
        paid = 0;
        potAfter = await readPot();
      } else {
        potAfter = Number(retry[0].value);
      }
    } else {
      potAfter = Number(debited[0].value);
    }
    if (paid > 0) {
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${paid}, ${sql.raw(MAX_CREDITS_SQL)})`, updatedAt: new Date() })
        .where(eq(users.id, userId));
    }
  }

  try {
    await db.insert(crewJobRuns).values({
      userId,
      jobKey,
      outcome: run.outcome,
      payout: paid,
      fee,
      crewCardIds,
      details: JSON.stringify({ steps: run.steps, crewPower: crew.map((c) => c.t) }),
    });
  } catch (e) {
    // The fee was already burned and the resolution happened — losing this
    // row also loses the cooldown. Loud log; the run stands.
    console.error("Crew job run insert error (COOLDOWN LOST for this run):", e);
  }
  if (paid > 0) {
    try {
      await db.insert(rewardHistory).values({
        userId,
        type: "crew_job",
        amount: paid,
        details: JSON.stringify({ jobKey, outcome: run.outcome, crew: crewCardIds }),
      });
    } catch (e) {
      console.error("Crew job reward history error:", e);
    }
  }

  try {
    await pusher.trigger(`player-${userId}`, "crew-job-done", {
      jobKey,
      outcome: run.outcome,
      payout: paid,
    });
  } catch {
    /* best-effort */
  }

  return {
    success: true,
    steps: run.steps,
    outcome: run.outcome,
    payout: paid,
    fee,
    potAfter,
  };
}
