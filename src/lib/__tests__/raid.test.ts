import { describe, it, expect } from "vitest";
import {
  accrueRaidCharges,
  resolveRaid,
  raidEntryBurn,
  shouldGrantRevenge,
  RAID_CHARGE_CAP,
  RAID_CHARGE_INTERVAL_MS,
  RAID_ENTRY_BURN_MIN,
  RAID_LOCK_MULTIPLIERS,
  RAID_POOL_MAX,
  RAID_POOL_MIN,
  RAID_VICTIM_CREDIT_FLOOR,
  RAID_VICTIM_LOOT_CAP_MULT,
  REVENGE_GRANT_COOLDOWN_MS,
} from "@/lib/raid";
import {
  bountyListingFee,
  BOUNTY_LISTING_FEE_RATE,
  BOUNTY_MIN_REWARD,
  isBountyType,
} from "@/lib/bounties";

const T0 = 1_000_000_000_000; // arbitrary fixed epoch ms
const INTERVAL = RAID_CHARGE_INTERVAL_MS;

describe("accrueRaidCharges", () => {
  it("grants nothing before the first interval elapses", () => {
    const out = accrueRaidCharges({ charges: 0, nextChargeAt: T0 + INTERVAL }, T0);
    expect(out.charges).toBe(0);
    expect(out.nextChargeAt).toBe(T0 + INTERVAL);
  });

  it("grants exactly one charge after one interval (minus a tick)", () => {
    // nextChargeAt = T0 means charge #1 is already DUE at T0; a read one ms
    // before T0 + INTERVAL banks exactly that one and schedules #2 at T0+INTERVAL.
    const out = accrueRaidCharges({ charges: 0, nextChargeAt: T0 }, T0 + INTERVAL - 1);
    expect(out.charges).toBe(1);
    expect(out.nextChargeAt).toBe(T0 + INTERVAL);
  });

  it("banks multiple elapsed intervals in one read", () => {
    const out = accrueRaidCharges({ charges: 0, nextChargeAt: T0 }, T0 + 3 * INTERVAL + 1000);
    expect(out.charges).toBe(3);
  });

  it("never exceeds the cap", () => {
    const out = accrueRaidCharges({ charges: 0, nextChargeAt: T0 }, T0 + 100 * INTERVAL);
    expect(out.charges).toBe(RAID_CHARGE_CAP);
  });

  it("pauses the clock at the cap (spending from full waits a full interval)", () => {
    const full = accrueRaidCharges({ charges: 0, nextChargeAt: T0 }, T0 + 100 * INTERVAL);
    expect(full.charges).toBe(RAID_CHARGE_CAP);
    // Cap → next charge scheduled a full interval from NOW, not from the stale due date.
    expect(full.nextChargeAt).toBe(T0 + 100 * INTERVAL + INTERVAL);
  });

  it("does not lose a partially-elapsed timer when below cap", () => {
    // Charge due at T0 granted; the NEXT one (due T0 + INTERVAL) is still
    // 7.5h out at `now`, so the clock keeps ticking toward it unchanged.
    const now = T0 + 30 * 60 * 1000;
    const out = accrueRaidCharges({ charges: 1, nextChargeAt: T0 }, now);
    expect(out.charges).toBe(2);
    expect(out.nextChargeAt).toBe(T0 + INTERVAL);
  });
});

describe("resolveRaid", () => {
  const base = {
    attackerPortfolio: 1_000_000,
    victimCredits: 500_000,
    victimHasActiveLocks: false,
  };
  // pool = 0.5% of 1M = 5000; victim = 1% of 500k = 5000 (≤ 3× pool).

  it("maps locks cracked to the multiplier table and floors loot", () => {
    for (let cracked = 0; cracked <= 3; cracked++) {
      const rolls = [cracked >= 1, cracked >= 2, cracked >= 3];
      const out = resolveRaid({ ...base, rolls });
      expect(out.locksCracked).toBe(cracked);
      expect(out.multiplier).toBe(RAID_LOCK_MULTIPLIERS[cracked]);
      expect(out.loot).toBe(Math.floor((out.poolCredits + out.victimCredits) * out.multiplier));
    }
  });

  it("splits loot into a minted pool and a victim share", () => {
    const out = resolveRaid({ ...base, rolls: [true, true, true] });
    expect(out.poolCredits).toBe(5000);
    expect(out.victimCredits).toBe(5000);
    expect(out.loot).toBe(14000);
  });

  it("shields half the victim share when the victim runs deed locks", () => {
    const out = resolveRaid({ ...base, victimHasActiveLocks: true, rolls: [true, false, false] });
    expect(out.victimCredits).toBe(2500);
  });

  it("never steals from a victim below the credit floor", () => {
    const out = resolveRaid({
      ...base,
      victimCredits: RAID_VICTIM_CREDIT_FLOOR - 1,
      rolls: [true, true, true],
    });
    expect(out.victimCredits).toBe(0);
    // Pool still pays — raids always yield at least the pool.
    expect(out.loot).toBe(Math.floor(5000 * 1.4));
  });

  it("keeps a minimum pool for empty portfolios and caps the pool for whales", () => {
    const empty = resolveRaid({ ...base, attackerPortfolio: 0, rolls: [true, false, false] });
    expect(empty.poolCredits).toBe(RAID_POOL_MIN);

    const whale = resolveRaid({ ...base, attackerPortfolio: 1e15, rolls: [true, false, false] });
    expect(whale.poolCredits).toBe(RAID_POOL_MAX);
  });

  it("caps the victim share at a multiple of the pool", () => {
    // Tiny portfolio → tiny pool → victim share clamped to 3× pool.
    const out = resolveRaid({
      attackerPortfolio: 1000, // pool = max(5, 100 floor) = 100
      victimCredits: 100_000_000,
      victimHasActiveLocks: false,
      rolls: [true, true, true],
    });
    expect(out.victimCredits).toBe(RAID_VICTIM_LOOT_CAP_MULT * 100);
  });

  it("guarantees loot on a total whiff (pool × 0.2)", () => {
    const out = resolveRaid({ ...base, rolls: [false, false, false] });
    expect(out.loot).toBe(Math.floor((5000 + 5000) * 0.2));
    expect(out.loot).toBeGreaterThan(0);
  });
});

describe("raidEntryBurn", () => {
  it("burns 2% of the pool with a 10¢ minimum (sink on every raid)", () => {
    expect(raidEntryBurn(100)).toBe(Math.max(RAID_ENTRY_BURN_MIN, 2));
    expect(raidEntryBurn(5000)).toBe(100);
    expect(raidEntryBurn(1e9)).toBe(2e7);
  });
});

describe("shouldGrantRevenge (anti multi-account cycling)", () => {
  const NOW = 2_000_000_000_000;

  it("never grants revenge when the victim lost nothing (pool-only raids feed no cycle)", () => {
    expect(shouldGrantRevenge(0, null, NOW)).toBe(false);
  });

  it("grants the first revenge after a real loss", () => {
    expect(shouldGrantRevenge(500, null, NOW)).toBe(true);
  });

  it("refuses a second revenge inside the cooldown window", () => {
    expect(shouldGrantRevenge(500, NOW - REVENGE_GRANT_COOLDOWN_MS + 1000, NOW)).toBe(false);
  });

  it("grants again once the cooldown has fully elapsed", () => {
    expect(shouldGrantRevenge(500, NOW - REVENGE_GRANT_COOLDOWN_MS, NOW)).toBe(true);
  });
});

describe("bounty fee rules", () => {
  it("burns a 2% listing fee with a 1¢ minimum", () => {
    expect(bountyListingFee(1000)).toBe(20);
    expect(bountyListingFee(BOUNTY_MIN_REWARD)).toBe(Math.max(1, Math.floor(BOUNTY_MIN_REWARD * BOUNTY_LISTING_FEE_RATE)));
    expect(bountyListingFee(10)).toBe(1);
  });

  it("validates bounty types", () => {
    expect(isBountyType("foreclose")).toBe(true);
    expect(isBountyType("deliver")).toBe(true);
    expect(isBountyType("steal")).toBe(false);
    expect(isBountyType(undefined)).toBe(false);
  });
});
