/**
 * CREW BATTLES — the async auto-battler over the collection
 * (GAME_INTEGRATION_STUDY §5D, v1 2026-10-02).
 *
 * Attack another player's SAVED LINEUP GHOST asynchronously — no lockstep,
 * no realtime server. Combat is a deterministic simulation given
 * (attacker cards, defender cards, seed); professions are team synergies;
 * the card's city TIER is its combat power (one ladder everywhere).
 *
 * Economy: the entry fee is recycled INTO the Crew Pot (see F2 ruling
 * below); the winner's prize (1.6×fee) and a smaller successful-defense
 * reward (0.2×fee) come OUT of the pot — never minted. At 50% win rate the
 * player nets −0.2×fee (a 20% rake), the pot nets +0.1×fee, and the money
 * supply shrinks by 0.1×fee per battle: battles are self-funding and still
 * a net sink, so they never starve crew jobs. Bands (Σ lineup tiers) keep
 * fights inside your weight class, so cheap-card crews have their own meta.
 */

import type { Protection } from "@/lib/city/map2d/layout";

export interface BattleCard {
  id: number;
  u: string;
  f: number; // family 0..6
  t: number; // tier 1..14
  p: Protection;
}

// ── bands & economy ──

export interface Band {
  index: number;
  min: number; // inclusive Σ tiers
  max: number; // exclusive (Infinity for the top band)
  fee: number;
}

export const BANDS: readonly Band[] = [
  { index: 0, min: 5, max: 21, fee: 100 },
  { index: 1, min: 21, max: 36, fee: 250 },
  { index: 2, min: 36, max: 51, fee: 500 },
  { index: 3, min: 51, max: Infinity, fee: 1000 },
];

export const LINEUP_SIZE = 5;
export const PRIZE_FROM_POT = 1.6; // × fee on a win (pot-funded, never minted)
export const DEFENSE_REWARD_FROM_POT = 0.2; // × fee to a successful defender
export const ATTACK_COOLDOWN_MS = 60 * 1000;
/** Re-attacking the SAME defender is blocked for this long (anti-farming). */
export const REPEAT_TARGET_COOLDOWN_MS = 60 * 60 * 1000;
/**
 * One-sided matches pay NO prize: if the attacker's expected score vs the
 * defender's Elo exceeds this, the win is treated as a sparring match
 * (anti alt-farming — repeatedly feeding a weak alt stops paying).
 */
export const PRIZE_ELO_GATE = 0.9;

/** Is this matchup competitive enough to pay a prize? */
export function prizeEligible(attackerRating: number, defenderRating: number): boolean {
  return expectedScore(attackerRating, defenderRating) <= PRIZE_ELO_GATE;
}

/** Band for a lineup's Σ tiers (minimum band for a legal 5-card lineup). */
export function bandOf(lineup: BattleCard[]): Band {
  const sum = lineup.reduce((s, c) => s + c.t, 0);
  const b = BANDS.find((x) => sum >= x.min && sum < x.max) ?? BANDS[BANDS.length - 1];
  return b;
}

// ── Elo (pure) ──

export const ELO_K_ATTACKER = 24;
export const ELO_K_DEFENDER = 12;
export const ELO_BASE = 1000;

export function expectedScore(mine: number, theirs: number): number {
  return 1 / (1 + Math.pow(10, (theirs - mine) / 400));
}

export function eloUpdate(
  mine: number,
  theirs: number,
  score: 0 | 0.5 | 1,
  k: number
): { rating: number; delta: number } {
  const delta = Math.round(k * (score - expectedScore(mine, theirs)));
  return { rating: Math.max(100, mine + delta), delta };
}

// ── combat simulation (pure, deterministic given seed) ──

/** mulberry32 — tiny deterministic PRNG for the sim (seeded server-side). */
function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TeamSynergy {
  atkMult: number;
  hpMult: number;
  healPerRound: number;
  critChance: number;
  speedBonus: number;
}

/** Team passives by family presence (the 6 trades + unassigned = none). */
export function teamSynergy(lineup: BattleCard[]): TeamSynergy {
  const has = (f: number) => lineup.some((c) => c.f === f);
  const s: TeamSynergy = { atkMult: 1, hpMult: 1, healPerRound: 0, critChance: 0, speedBonus: 0 };
  if (has(0)) s.healPerRound = 2; // Notary: crew repairs 2 HP per round
  if (has(1)) s.speedBonus = 3; // Auctioneer: inside info — first strikes
  if (has(2)) s.atkMult = 1.2; // Renovator: +20% attack
  if (has(3)) s.hpMult = 1.2; // Vault Keeper: +20% HP
  if (has(4)) {
    s.atkMult *= 1.1; // City Planner: +10% both
    s.hpMult *= 1.1;
  }
  if (has(5)) s.critChance = 0.15; // Prospector: 15% ×2 crits
  return s;
}

export interface BattleUnitState {
  id: number;
  u: string;
  f: number;
  t: number;
  side: "A" | "D";
  hp: number;
  maxHp: number;
}

export type BattleLogEntry =
  | { kind: "hit"; side: "A" | "D"; unit: string; target: string; dmg: number; hpAfter: number }
  | { kind: "crit"; side: "A" | "D"; unit: string; target: string; dmg: number; hpAfter: number }
  | { kind: "heal"; side: "A" | "D"; amount: number }
  | { kind: "round"; n: number };

export interface BattleResult {
  winner: "A" | "D"; // ties go to the DEFENDER ("the vault held")
  rounds: number;
  log: BattleLogEntry[];
  units: BattleUnitState[]; // final state (hp 0 = dead)
}

const MAX_ROUNDS = 30;

export function simulateBattle(
  attacker: BattleCard[],
  defender: BattleCard[],
  seed: number
): BattleResult {
  const rand = rng32(seed);
  const makeUnits = (lineup: BattleCard[], side: "A" | "D"): BattleUnitState[] => {
    const syn = teamSynergy(lineup);
    return lineup.map((c) => {
      const lockBonus = c.p ? 1.1 : 1; // deed-locked = reliable hull
      const maxHp = Math.max(1, Math.round((18 + c.t * 5) * syn.hpMult * lockBonus));
      return {
        id: c.id,
        u: c.u,
        f: c.f,
        t: c.t,
        side,
        hp: maxHp,
        maxHp,
      };
    });
  };
  const units = [...makeUnits(attacker, "A"), ...makeUnits(defender, "D")];
  const alive = (side: "A" | "D") => units.filter((x) => x.side === side && x.hp > 0);
  const log: BattleLogEntry[] = [];
  const synA = teamSynergy(attacker);
  const synD = teamSynergy(defender);
  const synOf = (side: "A" | "D") => (side === "A" ? synA : synD);
  const speed = (x: BattleUnitState) => x.t + synOf(x.side).speedBonus;

  let round = 0;
  while (round < MAX_ROUNDS && alive("A").length > 0 && alive("D").length > 0) {
    round++;
    log.push({ kind: "round", n: round });
    // Round-start repairs (Notary synergy).
    for (const side of ["A", "D"] as const) {
      const syn = synOf(side);
      if (syn.healPerRound > 0) {
        let healed = false;
        for (const u of alive(side)) {
          const before = u.hp;
          u.hp = Math.min(u.maxHp, u.hp + syn.healPerRound);
          if (u.hp > before) healed = true;
        }
        if (healed) log.push({ kind: "heal", side, amount: syn.healPerRound });
      }
    }
    // Act in speed order (ties: attacker first, then unit id).
    const order = units
      .filter((x) => x.hp > 0)
      .sort(
        (a, b) =>
          speed(b) - speed(a) ||
          (a.side === b.side ? a.id - b.id : a.side === "A" ? -1 : 1)
      );
    for (const actor of order) {
      if (actor.hp <= 0) continue; // died earlier this round
      const foes = alive(actor.side === "A" ? "D" : "A");
      if (foes.length === 0) break;
      const target = foes[0];
      const syn = synOf(actor.side);
      const baseAtk = 4 + actor.t * 2;
      const atk = baseAtk * syn.atkMult;
      const crit = rand() < syn.critChance;
      const variance = 0.85 + rand() * 0.3;
      const dmg = Math.max(1, Math.round(atk * variance * (crit ? 2 : 1)));
      target.hp = Math.max(0, target.hp - dmg);
      log.push({
        kind: crit ? "crit" : "hit",
        side: actor.side,
        unit: actor.u,
        target: target.u,
        dmg,
        hpAfter: target.hp,
      });
    }
  }

  const aAlive = alive("A");
  const dAlive = alive("D");
  let winner: "A" | "D";
  if (aAlive.length === 0 && dAlive.length === 0) winner = "D";
  else if (aAlive.length === 0) winner = "D";
  else if (dAlive.length === 0) winner = "A";
  else {
    // Round cap: surviving HP totals decide; a tie favors the defender.
    const aHp = aAlive.reduce((s, x) => s + x.hp, 0);
    const dHp = dAlive.reduce((s, x) => s + x.hp, 0);
    winner = aHp > dHp ? "A" : "D";
  }

  return { winner, rounds: round, log, units };
}
