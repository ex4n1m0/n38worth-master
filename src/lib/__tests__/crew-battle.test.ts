import { describe, it, expect } from "vitest";
import {
  BANDS,
  LINEUP_SIZE,
  PRIZE_FROM_POT,
  DEFENSE_REWARD_FROM_POT,
  PRIZE_ELO_GATE,
  REPEAT_TARGET_COOLDOWN_MS,
  prizeEligible,
  bandOf,
  eloUpdate,
  expectedScore,
  simulateBattle,
  teamSynergy,
  type BattleCard,
} from "@/lib/crew-battle";

let idc = 1;
function card(f: number, t: number, p: "firewall" | "hardlock" | null = null): BattleCard {
  return { id: idc++, u: `c${idc - 1}`, f, t, p };
}
function lineup(...cards: BattleCard[]): BattleCard[] {
  return cards.slice(0, LINEUP_SIZE);
}

describe("bands", () => {
  it("maps Σ tiers to escalating bands with escalating fees", () => {
    for (let i = 1; i < BANDS.length; i++) {
      expect(BANDS[i].min).toBe(BANDS[i - 1].max);
      expect(BANDS[i].fee).toBeGreaterThan(BANDS[i - 1].fee);
    }
    expect(bandOf(lineup(card(0, 1), card(0, 1), card(0, 1), card(0, 1), card(0, 1))).index).toBe(0);
    expect(bandOf(lineup(card(0, 4), card(0, 4), card(0, 4), card(0, 4), card(0, 4))).index).toBe(0); // Σ20
    expect(bandOf(lineup(card(0, 5), card(0, 4), card(0, 4), card(0, 4), card(0, 4))).index).toBe(1); // Σ21
    expect(bandOf(lineup(card(0, 14), card(0, 14), card(0, 14), card(0, 14), card(0, 14))).index).toBe(3);
  });
});

describe("elo", () => {
  it("expected score is symmetric and bounded", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedScore(1400, 1000) + expectedScore(1000, 1400)).toBeCloseTo(1);
  });

  it("winner gains, loser loses, upsets move more", () => {
    const win = eloUpdate(1000, 1000, 1, 24);
    const loss = eloUpdate(1000, 1000, 0, 24);
    expect(win.delta).toBe(12);
    expect(loss.delta).toBe(-12);
    const upset = eloUpdate(800, 1200, 1, 24);
    expect(upset.delta).toBeGreaterThan(12);
    const expected = eloUpdate(1200, 800, 1, 24);
    expect(expected.delta).toBeLessThan(12);
    // rating floor
    expect(eloUpdate(105, 2000, 0, 24).rating).toBeGreaterThanOrEqual(100);
  });
});

describe("team synergies", () => {
  it("applies one passive per family presence", () => {
    const syn = teamSynergy([card(0, 5), card(2, 5), card(3, 5), card(4, 5), card(5, 5)]);
    expect(syn.healPerRound).toBe(2);
    expect(syn.atkMult).toBeCloseTo(1.2 * 1.1);
    expect(syn.hpMult).toBeCloseTo(1.2 * 1.1);
    expect(syn.critChance).toBe(0.15);
    expect(teamSynergy([card(1, 5)]).speedBonus).toBe(3);
    expect(teamSynergy([card(6, 5)])).toEqual({ atkMult: 1, hpMult: 1, healPerRound: 0, critChance: 0, speedBonus: 0 });
  });
});

describe("simulateBattle", () => {
  const strong = lineup(card(0, 14), card(1, 14), card(2, 14), card(3, 14), card(4, 14));
  const weak = lineup(card(6, 1), card(6, 1), card(6, 1), card(6, 1), card(6, 1));

  it("is deterministic given the seed and both sides' cards", () => {
    const a = simulateBattle(strong, weak, 42);
    const b = simulateBattle(strong, weak, 42);
    expect(b).toEqual(a);
  });

  it("a max crew obliterates a min crew on every seed", () => {
    for (const seed of [1, 7, 99, 123456, 2147483646]) {
      expect(simulateBattle(strong, weak, seed).winner).toBe("A");
    }
  });

  it("mirror matches favor the ATTACKER by first-strike (they paid the fee; deep HP ties still favor the defender)", () => {
    const mirrorA = lineup(card(0, 5), card(1, 5), card(2, 5), card(3, 5), card(4, 5));
    const mirrorB = lineup(card(0, 5), card(1, 5), card(2, 5), card(3, 5), card(4, 5));
    const r = simulateBattle(mirrorA, mirrorB, 3);
    expect(r.winner).toBe("A"); // attacker acts first on speed ties
  });

  it("terminates within the round cap and produces a sane log", () => {
    const r = simulateBattle(strong, weak, 5);
    expect(r.rounds).toBeLessThanOrEqual(30);
    expect(r.log.length).toBeGreaterThan(0);
    const dead = r.units.filter((u) => u.hp <= 0).length;
    if (r.winner === "A") expect(dead).toBe(5); // the weak side wiped
    expect(r.units.every((u) => u.hp <= u.maxHp)).toBe(true);
  });

  it("locked cards are tougher (bigger max HP)", () => {
    const locked = lineup(card(3, 10, "hardlock"), card(6, 1), card(6, 1), card(6, 1), card(6, 1));
    const plain = lineup(card(3, 10), card(6, 1), card(6, 1), card(6, 1), card(6, 1));
    const lockHp = simulateBattle(locked, plain, 1).units.find((u) => u.side === "A" && u.t === 10)!.maxHp;
    const plainHp = simulateBattle(plain, locked, 1).units.find((u) => u.side === "A" && u.t === 10)!.maxHp;
    expect(lockHp).toBeGreaterThan(plainHp);
  });

  it("economy: fee recycles to the pot; player rake 20%, pot net +0.1×fee, supply −0.1×fee", () => {
    expect(PRIZE_FROM_POT).toBe(1.6);
    expect(DEFENSE_REWARD_FROM_POT).toBe(0.2);
    // Player EV at 50% win: −1.0×fee + 0.8×fee = −0.2×fee.
    // Pot EV: +1.0×fee in, −0.9×fee out = +0.1×fee (self-funding, net sink).
  });

  it("Elo gate blocks prizes on one-sided matchups (anti alt-farming, F1)", () => {
    // Expected score by gap: 300→0.849 (pays), 400→0.909 (gated), 500→0.947.
    expect(prizeEligible(1000, 1000)).toBe(true);
    expect(prizeEligible(1300, 1000)).toBe(true);
    expect(prizeEligible(1400, 1000)).toBe(false);
    expect(prizeEligible(1500, 1000)).toBe(false);
    expect(prizeEligible(1000, 500)).toBe(false); // farming a weak rating pays nothing
    expect(REPEAT_TARGET_COOLDOWN_MS).toBe(60 * 60 * 1000);
    expect(PRIZE_ELO_GATE).toBe(0.9);
  });

  it("log is bounded (≤ 30 rounds × 13 entries)", () => {
    const mirror = lineup(card(0, 5), card(1, 5), card(2, 5), card(3, 5), card(4, 5));
    const r = simulateBattle(mirror, lineup(card(0, 6), card(1, 6), card(2, 6), card(3, 6), card(4, 6)), 9);
    expect(r.log.length).toBeLessThanOrEqual(30 * 13);
  });
});
