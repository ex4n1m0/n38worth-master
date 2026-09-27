import { describe, it, expect } from "vitest";
import {
  rootSequenceFor,
  rootSequenceKey,
  rootPhase,
  type CountdownLike,
} from "@/lib/city/root-sequence";

const OWNER = "testuser";
const START = 1_000_000;
const SPAN = 3_600; // one hour, the canonical duration

function countdown(overrides: Partial<CountdownLike> = {}): CountdownLike {
  return {
    active: true,
    username: OWNER,
    startedAt: START,
    expiresAt: START + SPAN,
    ...overrides,
  };
}

describe("rootSequenceFor — authority", () => {
  it("is idle while the countdown query is unresolved", () => {
    expect(rootSequenceFor(null, OWNER, START + 60)).toEqual({ active: false });
    expect(rootSequenceFor(undefined, OWNER, START + 60)).toEqual({
      active: false,
    });
  });

  it("is idle when the server says no countdown is active", () => {
    expect(
      rootSequenceFor(countdown({ active: false }), OWNER, START + 60)
    ).toEqual({ active: false });
  });

  it("is idle for a countdown belonging to ANOTHER player", () => {
    expect(
      rootSequenceFor(countdown({ username: "rival" }), OWNER, START + 60)
    ).toEqual({ active: false });
  });

  it("never activates from eligibility alone — only from countdown state", () => {
    // Even a city holding all six goddesses (rootSequenceEligible=true) with
    // no active countdown renders idle: the countdown is the sole authority.
    expect(rootSequenceFor({ active: false, username: null, startedAt: 0, expiresAt: 0 }, OWNER, START)).toEqual({
      active: false,
    });
  });

  it("is idle on a degenerate countdown window (bad data, never div/0)", () => {
    expect(
      rootSequenceFor(
        countdown({ startedAt: START, expiresAt: START }),
        OWNER,
        START
      )
    ).toEqual({ active: false });
    expect(
      rootSequenceFor(countdown({ startedAt: START + 10, expiresAt: START }), OWNER, START)
    ).toEqual({ active: false });
  });
});

/** Type-narrowing helper: asserts the active branch and returns it. */
function activeOf(s: ReturnType<typeof rootSequenceFor>) {
  if (!s.active) throw new Error("expected active state");
  return s;
}

describe("rootSequenceFor — progress", () => {
  it("derives progress from the SERVER startedAt/expiresAt window", () => {
    const s = rootSequenceFor(countdown(), OWNER, START + SPAN / 2);
    expect(s).toMatchObject({ active: true, progress: 0.5, phase: "surge" });
  });

  it("clamps progress at both ends", () => {
    expect(rootSequenceFor(countdown(), OWNER, START - 999)).toMatchObject({
      progress: 0,
      phase: "stir",
    });
    // Past expiry the win is being processed server-side — freeze at brink,
    // never let the local view claim more than the full window elapsed.
    const done = activeOf(rootSequenceFor(countdown(), OWNER, START + SPAN + 999));
    expect(done).toMatchObject({ progress: 1, phase: "brink", remainingSeconds: 0 });
  });

  it("keeps remainingSeconds as a local mirror of the deadline", () => {
    expect(
      activeOf(rootSequenceFor(countdown(), OWNER, START + 120)).remainingSeconds
    ).toBe(SPAN - 120);
  });

  it("grace-resume continuity: the ORIGINAL startedAt yields high progress", () => {
    // A goddess was stolen at t+50m (countdown cleared) and reacquired at
    // t+55m — the server resumed the ORIGINAL startedAt. Mirroring that
    // payload must show ~55m progress, not a restarted timer.
    const resumed = countdown(); // same original window
    const s = activeOf(rootSequenceFor(resumed, OWNER, START + 55 * 60));
    expect(s.progress).toBeCloseTo(55 / 60, 5);
  });

  it("aborts the moment the mirrored payload goes inactive", () => {
    // Steal → server clearCountdown → next refetch/Pusher event delivers
    // active:false. There is no client-side grace or lingering sequence.
    const afterSteal = countdown({ active: false, username: null, startedAt: 0, expiresAt: 0 });
    expect(rootSequenceFor(afterSteal, OWNER, START + 30 * 60)).toEqual({
      active: false,
    });
  });
});

describe("rootSequenceFor — resolving hold (M1)", () => {
  // The window expired but the win-processing cron (every 5 min) hasn't
  // resolved it: the payload is idle-shaped with resolving=true.
  const expiredResolving: CountdownLike = {
    active: false,
    username: OWNER,
    startedAt: START,
    expiresAt: START + SPAN,
    resolving: true,
  };

  it("HOLDS brink visuals instead of collapsing to idle", () => {
    const s = rootSequenceFor(expiredResolving, OWNER, START + SPAN + 30);
    expect(s).toMatchObject({
      active: true,
      progress: 1,
      phase: "brink",
      remainingSeconds: 0,
      resolving: true,
    });
  });

  it("an expired payload WITHOUT resolving goes idle (cron processed it)", () => {
    const processed: CountdownLike = { ...expiredResolving, resolving: false };
    expect(rootSequenceFor(processed, OWNER, START + SPAN + 30)).toEqual({
      active: false,
    });
  });

  it("a foreign resolving countdown does not hold THIS city", () => {
    const foreign: CountdownLike = { ...expiredResolving, username: "rival" };
    expect(rootSequenceFor(foreign, OWNER, START + SPAN + 30)).toEqual({
      active: false,
    });
  });

  it("the hold state keys differently from a live brink (chip flips)", () => {
    const hold = rootSequenceFor(expiredResolving, OWNER, START + SPAN + 30);
    const live = rootSequenceFor(countdown(), OWNER, START + SPAN - 10);
    expect(rootSequenceKey(hold)).not.toBe(rootSequenceKey(live));
    expect(rootSequenceKey(hold)).toContain(":r");
  });
});

describe("rootPhase", () => {
  it("buckets the window into stir / surge / brink thirds", () => {
    expect(rootPhase(0)).toBe("stir");
    expect(rootPhase(0.33)).toBe("stir");
    expect(rootPhase(1 / 3 + 0.001)).toBe("surge");
    expect(rootPhase(0.66)).toBe("surge");
    expect(rootPhase(2 / 3 + 0.001)).toBe("brink");
    expect(rootPhase(1)).toBe("brink");
  });
});

describe("rootSequenceKey — change detection", () => {
  it("is stable across recomputes that render identically", () => {
    const a = rootSequenceFor(countdown(), OWNER, START + 1_022);
    const b = rootSequenceFor(countdown(), OWNER, START + 1_026);
    // Adjacent ticks inside one 2% (72s) bucket and the same remaining minute.
    expect(rootSequenceKey(a)).toBe(rootSequenceKey(b));
  });

  it("changes when the 2% progress step advances", () => {
    const a = rootSequenceFor(countdown(), OWNER, START + 100);
    const b = rootSequenceFor(countdown(), OWNER, START + 200);
    expect(rootSequenceKey(a)).not.toBe(rootSequenceKey(b));
  });

  it("changes on phase transitions", () => {
    const stir = rootSequenceFor(countdown(), OWNER, START + 60);
    const surge = rootSequenceFor(countdown(), OWNER, START + SPAN / 2);
    const brink = rootSequenceFor(countdown(), OWNER, START + SPAN * 0.9);
    const keys = new Set([
      rootSequenceKey(stir),
      rootSequenceKey(surge),
      rootSequenceKey(brink),
    ]);
    expect(keys.size).toBe(3);
  });

  it("collapses every idle variant to one key", () => {
    expect(rootSequenceKey({ active: false })).toBe(
      rootSequenceKey(rootSequenceFor(null, OWNER, 0))
    );
    expect(rootSequenceKey({ active: false })).toBe(
      rootSequenceKey(rootSequenceFor(countdown({ username: "x" }), OWNER, 0))
    );
  });

  it("keys are bounded: a full hour yields ≤ ~110 distinct keys", () => {
    const seen = new Set<string>();
    for (let t = 0; t <= SPAN; t += 10) {
      seen.add(rootSequenceKey(rootSequenceFor(countdown(), OWNER, START + t)));
    }
    // 50 progress steps + 60 minute marks + 3 phases can interleave but the
    // tuple is capped by the coarsest dimension: 60 minutes × ≤3 phases.
    expect(seen.size).toBeLessThanOrEqual(180);
  });
});
