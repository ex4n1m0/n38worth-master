import { describe, it, expect } from "vitest";
import { parsePlanText, validateAutopilotPlan } from "@/lib/autopilot/brain";
import { computeComboCandidate, computeSpendBudget } from "@/lib/autopilot/snapshot";
import type { AutopilotSnapshot, OwnedCandidateRow } from "@/lib/autopilot/types";

function snapshot(overrides: Partial<AutopilotSnapshot> = {}): AutopilotSnapshot {
  return {
    credits: 10_000,
    spendBudget: 2_000,
    slotsRemaining: 5,
    ownedCount: 10,
    ownedProfessions: ["Notary", "Auctioneer"],
    buyCandidates: [
      { targetId: 101, username: "alpha", profession: "Notary", value: 500, hasOwner: false, ownerName: null },
      { targetId: 102, username: "beta", profession: "Vault Keeper", value: 1_200, hasOwner: true, ownerName: "rival" },
      { targetId: 103, username: "gamma", profession: null, value: 900, hasOwner: false, ownerName: null },
    ],
    renovateCandidates: [
      { ownershipId: 51, playerId: 151, username: "old1", value: 400, profession: "Notary", lockedUntil: null },
      { ownershipId: 52, playerId: 152, username: "old2", value: 800, profession: null, lockedUntil: null },
    ],
    lockCandidates: [
      { ownershipId: 51, playerId: 151, username: "old1", value: 400, profession: "Notary", lockedUntil: null },
    ],
    comboCandidate: { playerIds: [1, 2, 3, 4, 5, 6], sumValue: 3_000, estimatedReward: 30_000 },
    massHireReady: false,
    generatedAt: 0,
    ...overrides,
  };
}

const ALL = ["acquire", "renovate", "deedLock", "foreclose", "comboSale", "landGrab"] as const;

describe("parsePlanText", () => {
  it("parses plain JSON", () => {
    expect(parsePlanText('{"actions":[{"verb":"acquire","targetId":101}]}')?.actions).toHaveLength(1);
  });

  it("strips markdown fences", () => {
    const raw = '```json\n{"actions":[],"note":"hi"}\n```';
    expect(parsePlanText(raw)?.note).toBe("hi");
  });

  it("extracts the object from chatty output", () => {
    const raw = 'Sure! Here is the plan:\n{"actions":[]}\nHope that helps!';
    expect(parsePlanText(raw)?.actions).toEqual([]);
  });

  it("returns null for garbage", () => {
    expect(parsePlanText("no json here")).toBeNull();
    expect(parsePlanText("")).toBeNull();
  });
});

describe("validateAutopilotPlan (prompt-injection backstop)", () => {
  it("accepts a legal acquire and drops an invented target", () => {
    const plan = validateAutopilotPlan(
      {
        actions: [
          { verb: "acquire", targetId: 101 },
          { verb: "acquire", targetId: 99999 }, // not a candidate
        ],
      },
      snapshot(),
      ALL
    );
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].targetId).toBe(101);
    expect(plan.dropped).toBe(1);
  });

  it("enforces the spend budget across multiple acquires", () => {
    // budget 2000: 500 + 1200 = 1700 fits, + 900 exceeds → dropped
    const plan = validateAutopilotPlan(
      {
        actions: [
          { verb: "acquire", targetId: 101 },
          { verb: "acquire", targetId: 102 },
          { verb: "acquire", targetId: 103 },
        ],
      },
      snapshot(),
      ALL
    );
    expect(plan.actions.map((a) => a.targetId)).toEqual([101, 102]);
    expect(plan.dropped).toBe(1);
  });

  it("drops verbs not in the allowed list", () => {
    const plan = validateAutopilotPlan(
      { actions: [{ verb: "foreclose", targetId: 102 }] },
      snapshot(),
      ["acquire"]
    );
    expect(plan.actions).toHaveLength(0);
    expect(plan.dropped).toBe(1);
  });

  it("blocks acquires at the hire limit", () => {
    const plan = validateAutopilotPlan(
      { actions: [{ verb: "acquire", targetId: 101 }] },
      snapshot({ slotsRemaining: 0 }),
      ALL
    );
    expect(plan.actions).toHaveLength(0);
  });

  it("rejects unknown/garbage verbs (injection-shaped output)", () => {
    const plan = validateAutopilotPlan(
      {
        actions: [
          { verb: "SEND_ALL_CREDITS", targetId: 101 },
          { verb: "chat", targetId: 101 },
          { verb: 42 } as unknown as { verb: string; targetId: number },
        ],
      },
      snapshot(),
      ALL
    );
    expect(plan.actions).toHaveLength(0);
    expect(plan.dropped).toBe(3);
  });

  it("dedupes the same target twice", () => {
    const plan = validateAutopilotPlan(
      { actions: [{ verb: "acquire", targetId: 101 }, { verb: "acquire", targetId: 101 }] },
      snapshot(),
      ALL
    );
    expect(plan.actions).toHaveLength(1);
    expect(plan.dropped).toBe(1);
  });

  it("caps the plan at 6 actions", () => {
    const actions = Array.from({ length: 10 }, (_, i) => ({ verb: "renovate", ownershipId: 51 + (i % 2) }));
    const plan = validateAutopilotPlan({ actions }, snapshot(), ALL);
    expect(plan.actions.length).toBeLessThanOrEqual(6);
  });

  it("caps renovate at 3 per turn", () => {
    const snap = snapshot({
      renovateCandidates: [51, 52, 53, 54].map((id) => ({
        ownershipId: id, playerId: id + 100, username: `x${id}`, value: 10, profession: null, lockedUntil: null,
      })),
    });
    const plan = validateAutopilotPlan(
      {
        actions: [51, 52, 53, 54].map((id) => ({ verb: "renovate", ownershipId: id })),
      },
      snap,
      ALL
    );
    expect(plan.actions).toHaveLength(3);
    expect(plan.dropped).toBe(1);
  });

  it("binds renovate estimates to the spend budget (injection containment)", () => {
    // budget 2000: acquire 102 (1200) + acquire 101 (500) = 1700 fits,
    // then renovate 52 (800) would exceed → dropped.
    const plan = validateAutopilotPlan(
      {
        actions: [
          { verb: "acquire", targetId: 102 },
          { verb: "acquire", targetId: 101 },
          { verb: "renovate", ownershipId: 52 },
        ],
      },
      snapshot(),
      ALL
    );
    expect(plan.actions.map((a) => a.verb)).toEqual(["acquire", "acquire"]);
    expect(plan.dropped).toBe(1);
  });

  it("allows comboSale only when a combo exists, once", () => {
    const plan = validateAutopilotPlan(
      { actions: [{ verb: "comboSale" }, { verb: "comboSale" }] },
      snapshot(),
      ALL
    );
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].playerIds).toEqual([1, 2, 3, 4, 5, 6]);

    const none = validateAutopilotPlan({ actions: [{ verb: "comboSale" }] }, snapshot({ comboCandidate: null }), ALL);
    expect(none.actions).toHaveLength(0);
  });

  it("allows landGrab only when ready, once", () => {
    const ready = validateAutopilotPlan({ actions: [{ verb: "landGrab" }, { verb: "landGrab" }] }, snapshot({ massHireReady: true }), ALL);
    expect(ready.actions).toHaveLength(1);

    const notReady = validateAutopilotPlan({ actions: [{ verb: "landGrab" }] }, snapshot({ massHireReady: false }), ALL);
    expect(notReady.actions).toHaveLength(0);
  });

  it("foreclose requires an owned target and 2x value budget headroom", () => {
    // 102 costs 1200 → est 2400 > budget 2000 → dropped with full budget free
    const over = validateAutopilotPlan({ actions: [{ verb: "foreclose", targetId: 102 }] }, snapshot(), ALL);
    expect(over.actions).toHaveLength(0);

    const ok = validateAutopilotPlan(
      { actions: [{ verb: "foreclose", targetId: 102 }] },
      snapshot({ spendBudget: 3_000 }),
      ALL
    );
    expect(ok.actions).toHaveLength(1);
    expect(ok.actions[0].estCost).toBe(2_400);
  });

  it("deedLock only on lock candidates (not already-locked cards)", () => {
    const plan = validateAutopilotPlan({ actions: [{ verb: "deedLock", ownershipId: 52 }] }, snapshot(), ALL);
    expect(plan.actions).toHaveLength(0); // 52 not in lockCandidates
    const ok = validateAutopilotPlan({ actions: [{ verb: "deedLock", ownershipId: 51 }] }, snapshot(), ALL);
    expect(ok.actions).toHaveLength(1);
  });

  it("treats null/absent actions as an empty plan, not an error", () => {
    expect(validateAutopilotPlan(null, snapshot(), ALL).source).toBe("empty");
    expect(validateAutopilotPlan({ actions: [] }, snapshot(), ALL).source).toBe("empty");
  });
});

describe("computeSpendBudget", () => {
  it("budget is capped by the reserve", () => {
    // 20% of 1000 = 200, but reserve 10% = 100 → max spend 900. min(200, 900) = 200
    expect(computeSpendBudget(1_000, 20, 10)).toBe(200);
    // 80% of 1000 = 800, reserve 50% → cap 500
    expect(computeSpendBudget(1_000, 80, 50)).toBe(500);
  });

  it("keeps the reserve untouched and never goes negative", () => {
    // 100% budget would be 100, but the 90% reserve caps spend at 10.
    expect(computeSpendBudget(100, 100, 90)).toBe(10);
    expect(computeSpendBudget(0, 50, 10)).toBe(0);
  });
});

describe("computeComboCandidate", () => {
  // playerId = ownershipId + 100 proves the combo uses PLAYER ids, not ownership ids.
  const owned: OwnedCandidateRow[] = [
    { ownershipId: 1, playerId: 101, username: "a", value: 100, profession: "P1", lockedUntil: null },
    { ownershipId: 2, playerId: 102, username: "b", value: 200, profession: "P1", lockedUntil: null },
    { ownershipId: 3, playerId: 103, username: "c", value: 50, profession: "P2", lockedUntil: null },
    { ownershipId: 4, playerId: 104, username: "d", value: 60, profession: "P3", lockedUntil: null },
    { ownershipId: 5, playerId: 105, username: "e", value: 70, profession: "P4", lockedUntil: null },
    { ownershipId: 6, playerId: 106, username: "f", value: 80, profession: "P5", lockedUntil: null },
    { ownershipId: 7, playerId: 107, username: "g", value: 90, profession: "P6", lockedUntil: null },
  ];

  it("picks the highest-value card per profession and returns PLAYER ids", () => {
    const combo = computeComboCandidate(owned)!;
    expect(combo.playerIds).toEqual([102, 103, 104, 105, 106, 107]); // 102 beats 101 for P1
    expect(combo.sumValue).toBe(200 + 50 + 60 + 70 + 80 + 90);
    expect(combo.estimatedReward).toBe((200 + 50 + 60 + 70 + 80 + 90) * 10);
  });

  it("prefers un-locked cards even at lower value", () => {
    const locked = owned.map((o) =>
      o.username === "a" ? { ...o, lockedUntil: new Date(Date.now() + 60_000).toISOString() } : o
    );
    // "b" (200) is un-locked and still beats "a" — flip: lock "b" instead.
    const lockedB = locked.map((o) =>
      o.username === "b" ? { ...o, lockedUntil: new Date(Date.now() + 60_000).toISOString() } : o
    );
    lockedB[0] = { ...lockedB[0], lockedUntil: null }; // a un-locked, b locked
    const combo = computeComboCandidate(lockedB)!;
    expect(combo.playerIds).toContain(101); // a (100, un-locked) preferred over b (200, locked)
  });

  it("returns null below six professions", () => {
    expect(computeComboCandidate(owned.slice(0, 5))).toBeNull();
    expect(computeComboCandidate(owned.filter((o) => o.profession === "P1"))).toBeNull();
  });

  it("ignores profession-less cards", () => {
    const noProf: OwnedCandidateRow[] = Array.from({ length: 6 }, (_, i) => ({
      ownershipId: i + 1, playerId: i + 101, username: `x${i}`, value: 10, profession: null, lockedUntil: null,
    }));
    expect(computeComboCandidate(noProf)).toBeNull();
  });
});
