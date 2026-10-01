import { describe, it, expect } from "vitest";
import {
  damageByActor,
  totalDamage,
  rankContributors,
  nextGoal,
  computePayouts,
  VAULT_BASE_GOAL,
  VAULT_MAX_PARTICIPANTS,
  VAULT_MIN_CONTRIBUTION_DAMAGE,
  VAULT_PARTICIPATION_FLAT,
  VAULT_TOP_BONUS_MIN,
} from "@/lib/world-vault";

describe("world vault damage", () => {
  const rows = [
    { actorId: 1, eventType: "purchase", count: 10 },
    { actorId: 1, eventType: "pump", count: 5 },
    { actorId: 2, eventType: "raid", count: 3 }, // weight 2 → 6
    { actorId: 3, eventType: "login", count: 100 }, // not a damage source
  ];

  it("weights purchase/pump at 1 and raid at 2; ignores other events", () => {
    expect(totalDamage(rows)).toBe(10 + 5 + 6);
    const by = damageByActor(rows);
    expect(by.get(1)).toBe(15);
    expect(by.get(2)).toBe(6);
    expect(by.has(3)).toBe(false);
  });

  it("ranks contributors by damage desc with deterministic tiebreak", () => {
    const ranked = rankContributors(damageByActor(rows));
    expect(ranked.map((r) => r.actorId)).toEqual([1, 2]);
    const tie = rankContributors(new Map([[7, 50], [3, 50], [9, 99]]));
    expect(tie.map((r) => r.actorId)).toEqual([9, 3, 7]);
  });

  it("grows the goal monotonically from the base", () => {
    expect(nextGoal(VAULT_BASE_GOAL)).toBe(960);
    expect(nextGoal(1)).toBe(VAULT_BASE_GOAL); // never shrinks below base
    expect(nextGoal(960)).toBeGreaterThan(960);
  });
});

describe("world vault payouts", () => {
  it("pays flat participation to everyone plus portfolio bonuses to the top 3", () => {
    const ranked = [
      { actorId: 1, damage: 100 },
      { actorId: 2, damage: 80 },
      { actorId: 3, damage: 60 },
      { actorId: 4, damage: 10 },
    ];
    const plan = computePayouts(ranked, (id) => (id === 1 ? 1_000_000 : 10_000));
    const by = new Map(plan.map((p) => [p.actorId, p]));
    // #1: 500 flat + max(100, 0.1% of 1M = 1000) × 3
    expect(by.get(1)!.tier).toBe("top3");
    expect(by.get(1)!.amount).toBe(VAULT_PARTICIPATION_FLAT + 1000 * 3);
    // #2: 500 + max(100, 10) × 2 = 500 + 200
    expect(by.get(2)!.amount).toBe(VAULT_PARTICIPATION_FLAT + VAULT_TOP_BONUS_MIN * 2);
    expect(by.get(3)!.amount).toBe(VAULT_PARTICIPATION_FLAT + VAULT_TOP_BONUS_MIN);
    // #4: flat only
    expect(by.get(4)!.tier).toBe("participation");
    expect(by.get(4)!.amount).toBe(VAULT_PARTICIPATION_FLAT);
    expect(plan.length).toBe(4);
  });

  it("caps participants at the documented bound", () => {
    const ranked = Array.from({ length: VAULT_MAX_PARTICIPANTS + 50 }, (_, i) => ({
      actorId: i + 1,
      damage: VAULT_MAX_PARTICIPANTS + 50 - i,
    }));
    const plan = computePayouts(ranked, () => 0);
    expect(plan.length).toBe(VAULT_MAX_PARTICIPANTS);
    // the TOP damage dealers survive the cap, the tail does not
    expect(plan.some((p) => p.actorId === 1)).toBe(true);
    expect(plan.some((p) => p.actorId === VAULT_MAX_PARTICIPANTS + 50)).toBe(false);
  });

  it("requires minimum damage to qualify (signup-grant farming gate, review F3)", () => {
    const ranked = [
      { actorId: 1, damage: 1 }, // below gate — excluded
      { actorId: 2, damage: VAULT_MIN_CONTRIBUTION_DAMAGE - 1 }, // excluded
      { actorId: 3, damage: VAULT_MIN_CONTRIBUTION_DAMAGE }, // qualifies
      { actorId: 4, damage: 50 }, // qualifies, top-1
    ];
    const plan = computePayouts(ranked, () => 0);
    const ids = plan.map((p) => p.actorId);
    expect(ids).toContain(3);
    expect(ids).toContain(4);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
  });

  it("floors fractional portfolio bonuses to integers via the minimum", () => {
    // 1,999¢ portfolio → 0.1% = 1.99 → floor 1 → clamped up to the 100 min.
    const plan = computePayouts([{ actorId: 9, damage: 10 }], () => 1_999);
    expect(plan[0]!.amount).toBe(VAULT_PARTICIPATION_FLAT + VAULT_TOP_BONUS_MIN * 3);
  });

  it("handles an empty contribution list", () => {
    expect(computePayouts([], () => 1e12)).toEqual([]);
  });
});
