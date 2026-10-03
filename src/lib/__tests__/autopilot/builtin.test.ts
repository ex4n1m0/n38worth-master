import { describe, it, expect, vi, afterEach } from "vitest";
import {
  BRAIN_MAX_CANDIDATES,
  BRAIN_MAX_MEMORY,
  BRAIN_MEMORY_SUMMARY_MAX,
  BUILTIN_GLOBAL_DAILY_DEFAULT,
  BUILTIN_MODEL_FALLBACK,
  BUILTIN_PROMPT_MAX_CHARS,
  BUILTIN_USER_DAILY_DEFAULT,
  dailyBlocked,
  dailyResetInSec,
  dayIndexOf,
  packDaily,
  pareBuiltinContent,
  parseBrainPayload,
  promptWithinBudget,
  unpackDaily,
} from "@/lib/autopilot/builtin";
import { buildAutopilotMessages } from "@/lib/autopilot/brain";
import { builtinErrorMessage, callAutopilotModel } from "@/lib/autopilot/providers";
import type { AutopilotSnapshot } from "@/lib/autopilot/types";

const USER_PACK = 1_000;
const USER_CNT_MAX = 999;
const GLOBAL_PACK = 10_000;
const GLOBAL_CNT_MAX = 9_999;

describe("builtin daily-counter packing", () => {
  it("round-trips day + count", () => {
    const day = dayIndexOf(1_760_000_000); // ~2025-10
    const packed = packDaily(day, 42, USER_PACK, USER_CNT_MAX);
    expect(unpackDaily(packed, USER_PACK)).toEqual({ day, cnt: 42 });
  });

  it("saturates the count instead of rolling into the next day", () => {
    const day = 20_000;
    const packed = packDaily(day, USER_CNT_MAX + 500, USER_PACK, USER_CNT_MAX);
    expect(unpackDaily(packed, USER_PACK)).toEqual({ day, cnt: USER_CNT_MAX });
  });

  it("stays under int32 for the global pack at realistic day indices", () => {
    const packed = packDaily(30_000, GLOBAL_CNT_MAX, GLOBAL_PACK, GLOBAL_CNT_MAX);
    expect(packed).toBeLessThan(2 ** 31);
  });

  it("blocks only when TODAY's count exceeds the limit", () => {
    const day = 20_719;
    // exactly the limit → allowed; one over → blocked; yesterday's count → allowed
    expect(dailyBlocked(packDaily(day, 100, USER_PACK, USER_CNT_MAX), day, 100, USER_PACK)).toBe(false);
    expect(dailyBlocked(packDaily(day, 101, USER_PACK, USER_CNT_MAX), day, 100, USER_PACK)).toBe(true);
    expect(dailyBlocked(packDaily(day - 1, USER_CNT_MAX, USER_PACK, USER_CNT_MAX), day, 100, USER_PACK)).toBe(false);
  });

  it("reset hint is within (0, 86400]", () => {
    expect(dailyResetInSec(0)).toBe(86_400);
    expect(dailyResetInSec(86_399)).toBe(1);
    expect(dailyResetInSec(90)).toBeGreaterThan(0);
  });

  it("defaults match the wallet-fence ruling", () => {
    expect(BUILTIN_USER_DAILY_DEFAULT).toBe(100);
    expect(BUILTIN_GLOBAL_DAILY_DEFAULT).toBe(2_000);
    expect(BUILTIN_MODEL_FALLBACK).toBe("deepseek-flash");
  });
});

function snapshotFixture(): AutopilotSnapshot {
  return {
    credits: 5_000,
    spendBudget: 1_000,
    slotsRemaining: 10,
    ownedCount: 5,
    ownedProfessions: ["Notary"],
    buyCandidates: [
      { targetId: 1, username: "a", profession: null, value: 100, hasOwner: false, ownerName: null },
    ],
    renovateCandidates: [],
    lockCandidates: [],
    comboCandidate: null,
    massHireReady: false,
    generatedAt: Date.now(),
  };
}

describe("parseBrainPayload (untrusted client input)", () => {
  it("rejects garbage, oversized bodies, and keyless snapshots", () => {
    expect(parseBrainPayload(null)).toBeNull();
    expect(parseBrainPayload("not json")).toBeNull();
    expect(parseBrainPayload('"a string"')).toBeNull();
    expect(parseBrainPayload(JSON.stringify({ memory: [] }))).toBeNull(); // no snapshot
    expect(parseBrainPayload("x".repeat(200_001))).toBeNull();
    expect(
      parseBrainPayload(JSON.stringify({ snapshot: { credits: "rich" } }))
    ).toBeNull();
  });

  it("ping mode skips the snapshot entirely", () => {
    expect(parseBrainPayload('{"ping":true}')).toEqual({ ping: true, snapshot: null, memory: [] });
  });

  it("keeps a valid snapshot and clamps abusive dimensions", () => {
    const snapshot = snapshotFixture();
    const many = Array.from({ length: BRAIN_MAX_CANDIDATES + 50 }, (_, i) => ({
      targetId: i,
      username: "u",
      profession: null,
      value: 1,
      hasOwner: false,
      ownerName: null,
    }));
    const memory = Array.from({ length: BRAIN_MAX_MEMORY + 5 }, (_, i) => ({
      at: i,
      summary: "s".repeat(BRAIN_MEMORY_SUMMARY_MAX + 50),
    }));
    const parsed = parseBrainPayload(JSON.stringify({ snapshot: { ...snapshot, buyCandidates: many }, memory }));
    expect(parsed).not.toBeNull();
    expect(parsed!.snapshot!.buyCandidates).toHaveLength(BRAIN_MAX_CANDIDATES);
    expect(parsed!.memory).toHaveLength(BRAIN_MAX_MEMORY);
    expect(parsed!.memory[0].summary).toHaveLength(BRAIN_MEMORY_SUMMARY_MAX);
    expect(parsed!.snapshot!.massHireReady).toBe(false); // non-true coerces to false
  });

  it("truncates hostile strings and drops junk rows (security-review P1)", () => {
    const snapshot = snapshotFixture();
    const parsed = parseBrainPayload(
      JSON.stringify({
        snapshot: {
          ...snapshot,
          buyCandidates: [
            { targetId: 1, username: "A".repeat(150_000), value: 5, smuggled: "X".repeat(5_000) },
            { username: "no id — dropped" },
            { targetId: 2, value: 7 },
          ],
          comboCandidate: { garbage: true },
        },
      })
    );
    expect(parsed).not.toBeNull();
    const buys = parsed!.snapshot!.buyCandidates;
    expect(buys).toHaveLength(2);
    expect(buys[0].username).toHaveLength(64); // 150 KB "username" truncated
    expect(JSON.stringify(buys[0])).not.toContain("smuggled"); // unknown fields dropped
    expect(buys[1].username).toBe("");
    expect(parsed!.snapshot!.comboCandidate).toBeNull();
  });

  it("bounds the built prompt (input-token fence)", () => {
    const messages = buildAutopilotMessages(snapshotFixture(), []);
    expect(messages.user.length).toBeLessThan(BUILTIN_PROMPT_MAX_CHARS);
    expect(promptWithinBudget(messages.system, messages.user)).toBe(true);
    expect(promptWithinBudget("s", "x".repeat(BUILTIN_PROMPT_MAX_CHARS + 1))).toBe(false);
    expect(promptWithinBudget("s".repeat(2_001), "u")).toBe(false);
  });

  it("pareBuiltinContent returns strict pared plan JSON only (security-review P2)", () => {
    const plan = pareBuiltinContent(
      'Sure! Here is my plan: {"actions":' +
        JSON.stringify(
          Array.from({ length: 10 }, (_, i) => ({ verb: "renovate", ownershipId: i }))
        ) +
        ',"note":"' + "n".repeat(500) + '"}'
    );
    expect(plan).not.toBeNull();
    const parsed = JSON.parse(plan!);
    expect(parsed.actions).toHaveLength(6); // AUTOPILOT_TURN_MAX_ACTIONS
    expect(parsed.note).toHaveLength(300);
    expect(pareBuiltinContent("no json here at all")).toBeNull();
    expect(pareBuiltinContent('{"note":"empty is fine"}')).toContain('"actions":[]');
  });
});

describe("client builtin routing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("provider=builtin POSTs the snapshot to the proxy without any API key", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return new Response(
        JSON.stringify({ ok: true, content: '{"actions":[]}', usage: { in: 10, out: 5 } }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await callAutopilotModel({
      provider: "builtin",
      baseUrl: "",
      model: "",
      apiKey: "", // no key — must still work
      system: "s",
      user: "u",
      snapshot: snapshotFixture(),
      memory: [],
    });
    expect(res.ok).toBe(true);
    expect(res.content).toBe('{"actions":[]}');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/autopilot/brain");
    const body = JSON.parse(init!.body as string);
    expect(body.snapshot.credits).toBe(5_000);
    expect(body.ping).toBeUndefined();
    expect(JSON.stringify(init!.headers)).not.toContain("Authorization");
  });

  it("without a snapshot it sends a ping (connection test path)", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return new Response(JSON.stringify({ ok: true, content: '{"ok":true}' }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await callAutopilotModel({
      provider: "builtin",
      baseUrl: "",
      model: "",
      apiKey: "",
      system: "s",
      user: "u",
    });
    expect(res.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.ping).toBe(true);
  });

  it("maps the daily-limit code to the bring-your-own-key message", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ ok: false, code: "builtin-user-limit", error: "server text" }),
          { status: 429 }
        )
    );
    const res = await callAutopilotModel({
      provider: "builtin",
      baseUrl: "",
      model: "",
      apiKey: "",
      system: "s",
      user: "u",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("daily limit");
  });

  it("error mapper covers every machine code the route can emit", () => {
    const codes = [
      "builtin-pace",
      "builtin-user-limit",
      "builtin-global-limit",
      "builtin-disabled",
      "builtin-unconfigured",
      "builtin-unavailable",
    ];
    for (const code of codes) {
      expect(builtinErrorMessage(429, code, "ignored")).not.toBe("ignored");
    }
    expect(builtinErrorMessage(500, undefined, "fallback text")).toBe("fallback text");
    expect(builtinErrorMessage(500, undefined, undefined)).toBe("HTTP 500");
  });

  it("non-builtin providers still require a key", async () => {
    const res = await callAutopilotModel({
      provider: "openai",
      baseUrl: "",
      model: "",
      apiKey: "",
      system: "s",
      user: "u",
    });
    expect(res).toEqual({ ok: false, error: "No API key saved" });
  });
});
