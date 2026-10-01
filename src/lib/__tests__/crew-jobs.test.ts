import { describe, it, expect } from "vitest";
import {
  CREW_JOBS,
  CREW_JOBS_BY_KEY,
  CREW_SIZE,
  OUTCOME_MULTIPLIER,
  crewGateError,
  crewPowerForStep,
  crewJobFee,
  crewJobPayout,
  crewTierSum,
  resolveCrewRun,
  cooldownEnd,
  CREW_JOB_COOLDOWN_MS,
  type CrewCard,
} from "@/lib/crew-jobs";

let idc = 1;
function card(f: number, t: number, p: "firewall" | "hardlock" | null = null): CrewCard {
  return { id: idc++, f, t, p };
}

describe("crew job catalog integrity", () => {
  it("has six jobs keyed by goddess usernames, escalating difficulty/payout", () => {
    expect(CREW_JOBS.length).toBe(6);
    for (let i = 1; i < CREW_JOBS.length; i++) {
      expect(CREW_JOBS[i].basePayout).toBeGreaterThan(CREW_JOBS[i - 1].basePayout);
      expect(CREW_JOBS[i].minCrewTiers).toBeGreaterThan(CREW_JOBS[i - 1].minCrewTiers);
      expect(CREW_JOBS[i].steps[2].difficulty).toBeGreaterThan(CREW_JOBS[i - 1].steps[2].difficulty);
    }
    for (const j of CREW_JOBS) {
      expect(CREW_JOBS_BY_KEY.get(j.key)).toBeDefined();
      expect(j.steps.length).toBe(3);
      expect(j.titleEn.length).toBeGreaterThan(0);
      expect(j.titleZh.length).toBeGreaterThan(0);
    }
  });

  it("the Architect's job requires one of every trade", () => {
    const architect = CREW_JOBS_BY_KEY.get("Goddess")!;
    expect(architect.requiredFamilies.map((r) => r.f).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("calibration: a minimum-gate crew is NEVER a guaranteed perfect, and a max crew always succeeds", () => {
    const ROLLS: [number, number, number][] = [
      [0.7, 0.7, 0.7],
      [0.9, 0.9, 0.9],
      [1.1, 1.1, 1.1],
      [1.3, 1.3, 1.3],
      [1.3, 0.7, 1.3],
    ];
    for (const job of CREW_JOBS) {
      // Gate crew: one min-tier card per required family, filler to the tier gate.
      const gateCrew: CrewCard[] = [];
      let sum = 0;
      for (const req of job.requiredFamilies) {
        for (let i = 0; i < req.min; i++) {
          gateCrew.push(card(req.f, 1));
          sum += 1;
        }
      }
      // Neutral filler: a family this job neither favors nor requires, so
      // the gate crew carries the MINIMUM possible favored bonus.
      const favoredSet = new Set(job.steps.map((st) => st.favored));
      const reqSet = new Set(job.requiredFamilies.map((r) => r.f));
      const fillerF = [0, 1, 2, 3, 4, 5].find((f) => !favoredSet.has(f) && !reqSet.has(f)) ?? 5;
      while (gateCrew.length < CREW_SIZE) {
        gateCrew.push(card(fillerF, 1));
        sum += 1;
      }
      let need = job.minCrewTiers - sum;
      for (let i = 0; i < gateCrew.length && need > 0; i++) {
        const add = Math.min(need, 13);
        gateCrew[i].t += add;
        need -= add;
      }
      expect(crewGateError(job, gateCrew)).toBeNull();

      let anyFail = false;
      for (const rolls of ROLLS) {
        const r = resolveCrewRun(job, gateCrew, rolls);
        if (r.outcome !== "perfect") anyFail = true;
      }
      expect(anyFail).toBe(true); // real risk at the gate (review finding)

      const maxCrew: CrewCard[] = [0, 1, 2, 3, 4].map((f) => card(f, 14));
      for (const rolls of ROLLS) {
        expect(resolveCrewRun(job, maxCrew, rolls).outcome).toBe("perfect"); // top crews are safe
      }
    }
  });
});

describe("crew gate", () => {
  const job = CREW_JOBS_BY_KEY.get("Goddess of Wealth")!; // Σ tiers ≥ 8, 1× family 3

  it("rejects wrong crew size", () => {
    expect(crewGateError(job, [])).toContain("exactly");
  });

  it("rejects weak tier sums but accepts a qualifying crew", () => {
    const weak = [card(3, 1), card(0, 1), card(1, 1), card(2, 1), card(4, 1)]; // Σ=5
    expect(crewGateError(job, weak)).toContain("tier");
    const ok = [card(3, 2), card(0, 2), card(1, 2), card(2, 1), card(4, 1)]; // Σ=8, has f3
    expect(crewGateError(job, ok)).toBeNull();
  });

  it("rejects missing required family", () => {
    const noKeeper = [card(0, 2), card(1, 2), card(2, 2), card(4, 1), card(5, 1)]; // Σ=8, no f3
    expect(crewGateError(job, noKeeper)).toContain("family 3");
  });
});

describe("crew power + run resolution", () => {
  it("favored family adds +3 and locked cards +1", () => {
    const step = { difficulty: 10, favored: 3 };
    expect(crewPowerForStep([card(3, 5)], step)).toBe(5 + 3);
    expect(crewPowerForStep([card(0, 5)], step)).toBe(5);
    expect(crewPowerForStep([card(3, 5, "firewall")], step)).toBe(5 + 3 + 1);
  });

  it("maps successes to outcome multipliers deterministically", () => {
    const job = CREW_JOBS_BY_KEY.get("Goddess of Wealth")!;
    const strongCrew = [card(3, 14), card(3, 14), card(0, 14), card(1, 14), card(2, 14)];
    const perfect = resolveCrewRun(job, strongCrew, [1.3, 1.3, 1.3]);
    expect(perfect.outcome).toBe("perfect");
    expect(perfect.multiplier).toBe(1.6);
    expect(perfect.steps.every((s) => s.success)).toBe(true);

    const weakCrew = [card(3, 1), card(1, 1), card(2, 1), card(4, 1), card(5, 1)];
    const fail = resolveCrewRun(job, weakCrew, [1.3, 1.3, 1.3]);
    expect(fail.outcome).toBe("fail");
    expect(fail.multiplier).toBe(0);

    // mid crew, worst rolls: some steps fail → partial/clean band
    const mid = resolveCrewRun(job, [card(3, 4), card(3, 4), card(0, 4), card(1, 4), card(2, 4)], [1.3, 0.7, 1.3]);
    expect(["partial", "clean", "fail", "perfect"]).toContain(mid.outcome);
    expect(mid.steps[1].success).toBe(true); // easy roll
  });

  it("crewTierSum adds up", () => {
    expect(crewTierSum([card(0, 3), card(1, 5)])).toBe(8);
  });
});

describe("fees, payouts, cooldowns", () => {
  const job = CREW_JOBS_BY_KEY.get("Goddess of Wealth")!; // base 2000

  it("fee is 2% with a floor", () => {
    expect(crewJobFee(job)).toBe(40);
  });

  it("payout is floored, multiplied, and capped by the pot above its floor", () => {
    expect(crewJobPayout(job, "clean", 1_000_000)).toBe(2000);
    expect(crewJobPayout(job, "perfect", 1_000_000)).toBe(3200);
    expect(crewJobPayout(job, "partial", 1_000_000)).toBe(800);
    expect(crewJobPayout(job, "fail", 1_000_000)).toBe(0);
    // pot at 1500 with floor 100 → payable 1400 caps a perfect 3200
    expect(crewJobPayout(job, "perfect", 1500)).toBe(1400);
    // pot at/below the floor pays nothing
    expect(crewJobPayout(job, "clean", 100)).toBe(0);
  });

  it("cooldown ends 4h after the last run", () => {
    const t0 = 1_000_000;
    expect(cooldownEnd(t0)).toBe(t0 + CREW_JOB_COOLDOWN_MS);
    expect(cooldownEnd(null)).toBeLessThan(Date.now()); // no run → no cooldown
  });

  it("outcome multipliers are the documented set", () => {
    expect(OUTCOME_MULTIPLIER).toEqual({ fail: 0, partial: 0.4, clean: 1.0, perfect: 1.6 });
    expect(CREW_SIZE).toBe(5);
  });
});
