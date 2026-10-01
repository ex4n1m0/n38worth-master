/**
 * CREW JOBS — PvE heists on the Founders' banks (GAME_INTEGRATION_STUDY
 * §5C, v1 2026-10-01). The layer that finally makes cheap cards matter:
 * a job's gate is CREW COMPOSITION (owned cards by tier + family), not
 * wealth. Payouts come from the CREW POT — 20% of the existing boss-tax
 * flow, recycled into a prize pool (zero mint; bosses keep 80%).
 *
 * A run: pick 5 owned cards as a crew → the job's 3 steps resolve
 * server-side (seeded rolls vs crew power; steps favor a family, deed-locked
 * cards are "reliable" +1) → 0..3 successes map to FAIL / PARTIAL / CLEAN /
 * PERFECT payout multipliers, bounded by the pot. Entry burns a small fee
 * (sink); each job has a per-player cooldown.
 *
 * Boss display names come from display-names.ts (the Founders); job keys
 * are the raw goddess USERNAMES (DB keys — display-name indirection rule).
 */

import type { WorldBuilding } from "@/lib/city/map2d/layout";

export const CREW_SIZE = 5;
export const CREW_JOB_COOLDOWN_MS = 4 * 60 * 60 * 1000;
/** Entry fee (burned sink) as a fraction of the job's base payout. */
export const CREW_JOB_FEE_RATE = 0.02;
export const CREW_JOB_FEE_MIN = 10;
/** Pot floor below which jobs can't run (keeps the pool from draining dry). */
export const CREW_POT_FLOOR = 100;
/** One-time bootstrap so day-1 crews have something to heist (reviewed mint). */
export const CREW_POT_BOOTSTRAP = 100_000;
export const CREW_POT_SETTING_KEY = "crew_pot";

export type CrewOutcome = "fail" | "partial" | "clean" | "perfect";

export const OUTCOME_MULTIPLIER: Record<CrewOutcome, number> = {
  fail: 0,
  partial: 0.4,
  clean: 1.0,
  perfect: 1.6,
};

export interface CrewJobStep {
  /** Crew power needed at roll 1.0. */
  difficulty: number;
  /** Family index (map2d/families order) that gives +3 on this step. */
  favored: number;
}

export interface CrewJobDef {
  /** Raw goddess USERNAME (DB key) — the bank's Founder. */
  key: string;
  basePayout: number;
  /** Sum of the 5 crew tiers must reach this. */
  minCrewTiers: number;
  requiredFamilies: { f: number; min: number }[];
  steps: [CrewJobStep, CrewJobStep, CrewJobStep];
  titleEn: string;
  titleZh: string;
  flavorEn: string;
  flavorZh: string;
}

export const CREW_JOBS: readonly CrewJobDef[] = buildJobs();

/**
 * Step-difficulty calibration (review findings: hand-picked numbers made the
 * Architect job a GUARANTEED perfect; required families also STACK their +3
 * bonus — a ×2 requirement means +6 at the gate). Derived rule: a crew
 * exactly at the gate with the required families has power
 * `minTiers + 3 × (required count of the step's favored family)` on favored
 * steps and `minTiers` elsewhere. Difficulty for a step favoring family f:
 *   floor((minTiers + 3 × requiredCount(f)) / 1.2)   when f is required
 *   floor(minTiers / 1.2)                            otherwise
 * At the gate that lands P(favored step) at 50–75% (fails the 1.3 roll) and
 * plain steps at 25–50% — while a top crew (5×tier-14 = 70 power) is safe
 * on every step (pinned by tests).
 */
function calibratedDifficulty(minTiers: number, favored: number, requiredFamilies: { f: number; min: number }[]): number {
  const req = requiredFamilies.find((r) => r.f === favored);
  const gatePower = minTiers + 3 * (req?.min ?? 0);
  return Math.max(5, Math.floor((req ? gatePower : minTiers) / 1.2));
}

function buildJobs(): CrewJobDef[] {  const defs: Array<Omit<CrewJobDef, "steps"> & { favoredSteps: [number, number, number] }> = [
    {
      key: "Goddess of Wealth",
      basePayout: 2_000,
      minCrewTiers: 8,
      requiredFamilies: [{ f: 3, min: 1 }],
      favoredSteps: [3, 0, 3],
      titleEn: "The Banker's Vault",
      titleZh: "银行家的金库",
      flavorEn: "The oldest vault in the city. Brute force and a steady hand.",
      flavorZh: "城里最老的金库。蛮力加稳当的手。",
    },
    {
      key: "Goddess of Knowledge",
      basePayout: 4_000,
      minCrewTiers: 14,
      requiredFamilies: [
        { f: 0, min: 1 },
        { f: 5, min: 1 },
      ],
      favoredSteps: [5, 0, 5],
      titleEn: "The Surveyor's Archive",
      titleZh: "测量员的档案馆",
      flavorEn: "Every floor plan in the city, behind one very picky lock.",
      flavorZh: "全城的平面图，锁在一把极挑剔的锁后。",
    },
    {
      key: "Goddess of Fate",
      basePayout: 7_000,
      minCrewTiers: 20,
      requiredFamilies: [{ f: 3, min: 2 }],
      favoredSteps: [3, 4, 3],
      titleEn: "The Registrar's Strongroom",
      titleZh: "登记员的保险库",
      flavorEn: "Where every deed in the city is stamped — and guarded.",
      flavorZh: "城里每张契约的盖章处——也是重兵把守处。",
    },
    {
      key: "Goddess of Time",
      basePayout: 11_000,
      minCrewTiers: 27,
      requiredFamilies: [
        { f: 2, min: 1 },
        { f: 4, min: 1 },
      ],
      favoredSteps: [4, 2, 4],
      titleEn: "The Foreman's Time-Lock",
      titleZh: "工头的定时锁",
      flavorEn: "Opens for eleven minutes a day. You get four.",
      flavorZh: "每天只开十一分钟。你只有四分钟。",
    },
    {
      key: "Goddess of War",
      basePayout: 16_000,
      minCrewTiers: 34,
      requiredFamilies: [{ f: 1, min: 2 }],
      favoredSteps: [1, 3, 1],
      titleEn: "The Wrecker's Demolition Bond",
      titleZh: "破坏手的拆除债券库",
      flavorEn: "The most heavily insured vault money can buy.",
      flavorZh: "金钱能买到的保险最足的金库。",
    },
    {
      key: "Goddess",
      basePayout: 24_000,
      minCrewTiers: 42,
      requiredFamilies: [
        { f: 0, min: 1 },
        { f: 1, min: 1 },
        { f: 2, min: 1 },
        { f: 3, min: 1 },
        { f: 4, min: 1 },
      ],
      favoredSteps: [4, 2, 0],
      titleEn: "The Architect's Crown Vault",
      titleZh: "建筑师的皇冠金库",
      flavorEn: "All six trades, one crew, one shot. The city watches.",
      flavorZh: "六大行业齐聚一队，只此一击。全城瞩目。",
    },
  ];
  return defs.map((d) => {
    const { favoredSteps, ...rest } = d;
    return {
      ...rest,
      steps: favoredSteps.map((f) => ({
        difficulty: calibratedDifficulty(d.minCrewTiers, f, d.requiredFamilies),
        favored: f,
      })) as [CrewJobStep, CrewJobStep, CrewJobStep],
    };
  });
}

export const CREW_JOBS_BY_KEY: ReadonlyMap<string, CrewJobDef> = new Map(
  CREW_JOBS.map((j) => [j.key, j])
);

export function crewJobTitle(key: string, locale: "en" | "zh"): string {
  const def = CREW_JOBS_BY_KEY.get(key);
  if (!def) return key;
  return locale === "zh" ? def.titleZh : def.titleEn;
}

export function crewJobFlavor(key: string, locale: "en" | "zh"): string {
  const def = CREW_JOBS_BY_KEY.get(key);
  if (!def) return "";
  return locale === "zh" ? def.flavorZh : def.flavorEn;
}

// ── pure math (unit-tested) ──

/** A crew card: the world payload's building shape (id/tier/family/protection). */
export type CrewCard = Pick<WorldBuilding, "id" | "f" | "t" | "p">;

export function crewTierSum(crew: CrewCard[]): number {
  return crew.reduce((s, c) => s + c.t, 0);
}

/** Gate check — returns the first unmet requirement, or null when the crew qualifies. */
export function crewGateError(
  job: CrewJobDef,
  crew: CrewCard[]
): string | null {
  if (crew.length !== CREW_SIZE) return `Crew must be exactly ${CREW_SIZE} cards`;
  if (crewTierSum(crew) < job.minCrewTiers) {
    return `Crew tier total ${crewTierSum(crew)} < required ${job.minCrewTiers}`;
  }
  for (const req of job.requiredFamilies) {
    const have = crew.filter((c) => c.f === req.f).length;
    if (have < req.min) return `Requires ${req.min}× family ${req.f} (have ${have})`;
  }
  return null;
}

/** Crew power for one step: tiers + favored-family bonus + lock reliability. */
export function crewPowerForStep(crew: CrewCard[], step: CrewJobStep): number {
  return crew.reduce(
    (s, c) => s + c.t + (c.f === step.favored ? 3 : 0) + (c.p ? 1 : 0),
    0
  );
}

export interface StepOutcome {
  success: boolean;
  crewPower: number;
  needed: number; // difficulty × roll (what you had to beat)
}

/**
 * Resolve a full run. `rolls` = three uniform [0.7, 1.3] multipliers
 * (server crypto in production, injected in tests). A step succeeds when
 * crewPower ≥ difficulty × roll.
 */
export function resolveCrewRun(
  job: CrewJobDef,
  crew: CrewCard[],
  rolls: [number, number, number]
): { steps: StepOutcome[]; outcome: CrewOutcome; multiplier: number } {
  const steps = job.steps.map((step, i) => {
    const crewPower = crewPowerForStep(crew, step);
    const needed = Math.round(step.difficulty * rolls[i]);
    return { success: crewPower >= needed, crewPower, needed };
  });
  const successes = steps.filter((s) => s.success).length;
  const outcome: CrewOutcome =
    successes >= 3 ? "perfect" : successes === 2 ? "clean" : successes === 1 ? "partial" : "fail";
  return { steps, outcome, multiplier: OUTCOME_MULTIPLIER[outcome] };
}

export function crewJobFee(job: CrewJobDef): number {
  return Math.max(CREW_JOB_FEE_MIN, Math.floor(job.basePayout * CREW_JOB_FEE_RATE));
}

/** Payout for an outcome, bounded by what the pot can actually pay (the
 *  floor keeps the pool from draining to zero). */
export function crewJobPayout(job: CrewJobDef, outcome: CrewOutcome, potAvailable: number): number {
  const payable = Math.max(0, Math.floor(potAvailable - CREW_POT_FLOOR));
  return Math.min(Math.floor(job.basePayout * OUTCOME_MULTIPLIER[outcome]), payable);
}

/** Cooldown end for a job given the last run's completion time. */
export function cooldownEnd(lastRolledAtMs: number | null): number {
  return (lastRolledAtMs ?? 0) + CREW_JOB_COOLDOWN_MS;
}
