import { describe, it, expect } from "vitest";
import {
  AGENT_MIN_INTERVAL_S,
  RATE_PACK,
  UNIVERSAL_MAX,
  UNIVERSAL_WINDOW_S,
  agentRetryAfterSec,
  packRateValue,
  unpackRateValue,
  universalBlocked,
} from "@/lib/autopilot/pace";

describe("agent tier math (1 action / 10 s ruling)", () => {
  it("retry is the exact remaining interval", () => {
    const now = 1_000_000;
    expect(agentRetryAfterSec(now - 4, now)).toBe(6);
    expect(agentRetryAfterSec(now - 9, now)).toBe(1);
  });

  it("retry never drops below 1 s or exceeds the interval (clock-skew guard)", () => {
    expect(agentRetryAfterSec(1_000_005, 1_000_000)).toBe(AGENT_MIN_INTERVAL_S);
  });

  it("interval constant matches the ruling", () => {
    expect(AGENT_MIN_INTERVAL_S).toBe(10);
  });
});

describe("universal tier packing (single int32 row)", () => {
  const now = 6_000_037; // 37 s into window 100000
  const curWin = Math.floor(now / UNIVERSAL_WINDOW_S);

  it("packs and round-trips window + count", () => {
    const packed = packRateValue(curWin, 12);
    expect(unpackRateValue(packed)).toEqual({ win: curWin, cnt: 12 });
  });

  it("first claim (count 1) is not blocked", () => {
    expect(universalBlocked(packRateValue(curWin, 1), curWin)).toBe(false);
  });

  it("blocks when the returned count exceeds 30 in the current window", () => {
    expect(universalBlocked(packRateValue(curWin, UNIVERSAL_MAX), curWin)).toBe(false);
    expect(universalBlocked(packRateValue(curWin, UNIVERSAL_MAX + 1), curWin)).toBe(true);
    expect(universalBlocked(packRateValue(curWin, UNIVERSAL_MAX + 5), curWin)).toBe(true);
  });

  it("an old window is never blocking (rollover resets)", () => {
    expect(universalBlocked(packRateValue(curWin - 1, RATE_PACK - 1), curWin)).toBe(false);
  });

  it("count saturates at 39 without bleeding into the next window", () => {
    const saturated = packRateValue(curWin, 10_000);
    expect(unpackRateValue(saturated)).toEqual({ win: curWin, cnt: RATE_PACK - 1 });
    // Saturation must not increment win.
    expect(unpackRateValue(saturated).win).toBe(curWin);
  });

  it("packed values stay int32-safe for decades", () => {
    // minute-epoch in 2070 ≈ 5.3e7 → ×40 + 39 ≈ 2.1e9 < 2^31 − 1
    const year2070Win = 5_300_000;
    expect(packRateValue(year2070Win, RATE_PACK - 1)).toBeLessThan(2 ** 31 - 1);
  });
});
