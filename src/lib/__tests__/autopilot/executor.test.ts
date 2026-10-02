import { describe, it, expect, vi, afterEach } from "vitest";
import { ACTION_ROUTES, executeAutopilotPlan } from "@/lib/autopilot/executor";
import type { AutopilotPlan, ValidatedAutopilotAction } from "@/lib/autopilot/types";

function plan(actions: ValidatedAutopilotAction[]): AutopilotPlan {
  return { actions, dropped: 0, source: "llm" };
}

const okFetch = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
const errFetch = vi.fn(async () => new Response(JSON.stringify({ error: "Too poor" }), { status: 400 }));
const rateFetch = vi.fn(async () => new Response(JSON.stringify({ error: "Slow down" }), { status: 429 }));
const authFetch = vi.fn(async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ACTION_ROUTES whitelist", () => {
  it("is frozen and covers exactly the six game verbs", () => {
    expect(Object.isFrozen(ACTION_ROUTES)).toBe(true);
    expect(Object.keys(ACTION_ROUTES).sort()).toEqual([
      "acquire",
      "comboSale",
      "deedLock",
      "foreclose",
      "landGrab",
      "renovate",
    ]);
  });

  it("cannot grow at runtime (frozen)", () => {
    expect(() => {
      (ACTION_ROUTES as Record<string, unknown>).chat = () => ({ path: "/api/chat/send", body: {} });
    }).toThrow();
  });

  it("acquire posts the purchase route with the 1-hour lease", () => {
    const route = ACTION_ROUTES.acquire({ verb: "acquire", targetId: 7, estCost: 0 });
    expect(route.path).toBe("/api/game/purchase");
    expect(route.body).toEqual({ targetId: 7, blockDurationHours: 1 });
  });
});

describe("executeAutopilotPlan", () => {
  it("executes all actions and reports ok", async () => {
    vi.stubGlobal("fetch", okFetch);
    const outcome = await executeAutopilotPlan(
      plan([
        { verb: "acquire", targetId: 1, estCost: 10 },
        { verb: "renovate", ownershipId: 2, estCost: 0 },
      ]),
      { actionGapMs: 0 }
    );
    expect(outcome.stopped).toBeUndefined();
    expect(outcome.results).toHaveLength(2);
    expect(outcome.results.every((r) => r.ok)).toBe(true);
  });

  it("sends the x-n38-via declaration header on every request", async () => {
    vi.stubGlobal("fetch", okFetch);
    await executeAutopilotPlan(plan([{ verb: "landGrab", estCost: 0 }]), { actionGapMs: 0 });
    const [, init] = (okFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>)["x-n38-via"]).toBe("autopilot");
  });

  it("stops the whole turn on the first 429", async () => {
    vi.stubGlobal("fetch", rateFetch);
    const outcome = await executeAutopilotPlan(
      plan([
        { verb: "acquire", targetId: 1, estCost: 0 },
        { verb: "acquire", targetId: 2, estCost: 0 },
        { verb: "acquire", targetId: 3, estCost: 0 },
      ]),
      { actionGapMs: 0 }
    );
    expect(outcome.stopped).toBe("rate");
    expect(outcome.results).toHaveLength(1);
  });

  it("stops and flags auth on 401 (session gone → caller disarms)", async () => {
    vi.stubGlobal("fetch", authFetch);
    const outcome = await executeAutopilotPlan(plan([{ verb: "acquire", targetId: 1, estCost: 0 }]), {
      actionGapMs: 0,
    });
    expect(outcome.stopped).toBe("auth");
    expect(outcome.results[0].ok).toBe(false);
  });

  it("stops after 3 consecutive failures", async () => {
    vi.stubGlobal("fetch", errFetch);
    const outcome = await executeAutopilotPlan(
      plan([
        { verb: "acquire", targetId: 1, estCost: 0 },
        { verb: "acquire", targetId: 2, estCost: 0 },
        { verb: "acquire", targetId: 3, estCost: 0 },
        { verb: "acquire", targetId: 4, estCost: 0 },
      ]),
      { actionGapMs: 0 }
    );
    expect(outcome.stopped).toBe("failures");
    expect(outcome.results).toHaveLength(3);
    expect(outcome.results.every((r) => !r.ok)).toBe(true);
  });

  it("failure counter resets after a success", async () => {
    let calls = 0;
    const mixed = vi.fn(async () => {
      calls++;
      if (calls === 2) return new Response(JSON.stringify({ error: "nope" }), { status: 400 });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", mixed);
    const outcome = await executeAutopilotPlan(
      plan([
        { verb: "acquire", targetId: 1, estCost: 0 },
        { verb: "acquire", targetId: 2, estCost: 0 },
        { verb: "acquire", targetId: 3, estCost: 0 },
      ]),
      { actionGapMs: 0 }
    );
    expect(outcome.stopped).toBeUndefined();
    expect(outcome.results.map((r) => r.ok)).toEqual([true, false, true]);
  });

  it("honors shouldStop before any action runs", async () => {
    vi.stubGlobal("fetch", okFetch);
    const outcome = await executeAutopilotPlan(
      plan([
        { verb: "acquire", targetId: 1, estCost: 0 },
        { verb: "acquire", targetId: 2, estCost: 0 },
      ]),
      { actionGapMs: 0, shouldStop: () => true }
    );
    expect(outcome.stopped).toBe("manual");
    expect(outcome.results).toHaveLength(0);
    expect(okFetch).not.toHaveBeenCalled();
  });

  it("network exceptions count as failures, not crashes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      })
    );
    const outcome = await executeAutopilotPlan(plan([{ verb: "renovate", ownershipId: 1, estCost: 0 }]), {
      actionGapMs: 0,
    });
    expect(outcome.results[0].ok).toBe(false);
    expect(outcome.results[0].error).toBe("boom");
  });
});
