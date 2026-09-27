import { describe, it, expect } from "vitest";
import {
  MAX_PLAYER_VALUE,
  MAX_PLAYER_VALUE_SQL,
  MAX_CREDITS,
  MAX_CREDITS_SQL,
  capPlayerValue,
  capCredits,
  safePortfolioValue,
  safeReward,
  safeRewardFractional,
} from "@/lib/safeguards";

describe("cap constants", () => {
  it("MAX_PLAYER_VALUE is 1e12 and its SQL literal matches", () => {
    expect(MAX_PLAYER_VALUE).toBe(1_000_000_000_000);
    expect(MAX_PLAYER_VALUE_SQL).toBe(String(MAX_PLAYER_VALUE));
  });

  it("MAX_CREDITS is MAX_SAFE_INTEGER and its SQL literal matches", () => {
    expect(MAX_CREDITS).toBe(Number.MAX_SAFE_INTEGER);
    expect(MAX_CREDITS_SQL).toBe(String(MAX_CREDITS));
  });
});

describe("capPlayerValue", () => {
  it("clamps values above MAX_PLAYER_VALUE", () => {
    expect(capPlayerValue(MAX_PLAYER_VALUE + 1)).toBe(MAX_PLAYER_VALUE);
  });

  it("never returns below 1", () => {
    expect(capPlayerValue(0)).toBe(1);
    expect(capPlayerValue(-500)).toBe(1);
  });

  it("maps non-finite input to 1 (corrupt growth floors to minimum value)", () => {
    expect(capPlayerValue(NaN)).toBe(1);
    expect(capPlayerValue(Infinity)).toBe(1);
  });

  it("passes through in-range values unchanged", () => {
    expect(capPlayerValue(1)).toBe(1);
    expect(capPlayerValue(42.5)).toBe(42.5);
    expect(capPlayerValue(MAX_PLAYER_VALUE)).toBe(MAX_PLAYER_VALUE);
  });
});

describe("capCredits", () => {
  it("clamps to MAX_CREDITS", () => {
    expect(capCredits(MAX_CREDITS + 1)).toBe(MAX_CREDITS);
  });

  it("maps non-finite input to 0 (corrupt balance resets, never clamps up)", () => {
    expect(capCredits(NaN)).toBe(0);
    expect(capCredits(Infinity)).toBe(0);
  });

  it("passes through finite values including negatives unchanged", () => {
    expect(capCredits(0)).toBe(0);
    expect(capCredits(123.45)).toBe(123.45);
    expect(capCredits(-10)).toBe(-10);
  });
});

describe("safePortfolioValue", () => {
  it("excludes the player's OWN card value (portfolio = what you OWN)", () => {
    const withoutOwn = safePortfolioValue(0, 500, 3);
    const withOwn = safePortfolioValue(1e12, 500, 3);
    expect(withOwn).toBe(withoutOwn);
  });

  it("treats ownerCount 0 as 1", () => {
    expect(safePortfolioValue(0, 700, 0)).toBe(700);
    expect(safePortfolioValue(0, 700, 1)).toBe(700);
  });

  it("multiplies owned value by ownerCount exactly at BigInt scale", () => {
    // 1e12 * 1000 = 1e15 — far beyond double-precise integer math in some
    // toolchains but exact via BigInt
    expect(safePortfolioValue(0, 1e12, 1000)).toBe(1e15);
  });

  it("caps the result at MAX_SAFE_INTEGER", () => {
    expect(safePortfolioValue(0, 1e12, 1e6)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("KNOWN GAP: all-NaN input propagates NaN through the catch fallback", () => {
    // safePortfolioValue's fallback does not sanitize non-finite input, so
    // NaN ownedValue yields NaN rather than a finite number. Real call sites
    // pass DB-derived finite values; tracked as a hardening candidate, not
    // changed here (production behavior must not shift under tests).
    expect(Number.isNaN(safePortfolioValue(NaN, NaN, NaN))).toBe(true);
  });
});

describe("safeReward", () => {
  it("floors to whole credits", () => {
    expect(safeReward(999, 0.01)).toBe(9);
  });

  it("computes basis-point percentages exactly", () => {
    expect(safeReward(10_000, 0.01)).toBe(100);
    expect(safeReward(123_456, 0.005)).toBe(617); // 617.28 → 617
  });

  it("caps at MAX_CREDITS", () => {
    expect(safeReward(1e16, 1)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("safeRewardFractional", () => {
  it("pays the exact fraction instead of flooring", () => {
    expect(safeRewardFractional(999, 0.01)).toBe(9.99);
  });

  it("returns 0 for zero/negative/non-finite portfolios", () => {
    expect(safeRewardFractional(0, 0.01)).toBe(0);
    expect(safeRewardFractional(-5, 0.01)).toBe(0);
    expect(safeRewardFractional(NaN, 0.01)).toBe(0);
  });

  it("caps at MAX_CREDITS", () => {
    expect(safeRewardFractional(1e16, 1)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
