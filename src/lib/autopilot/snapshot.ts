/**
 * Autopilot snapshot — assembles the turn context from the SAME public
 * endpoints the UI already uses (no new server surface, no duplicated
 * economy SQL). Everything the brain may act on arrives as an enumerated
 * candidate with a numeric id; usernames are display context ONLY and are
 * never valid command operands (prompt-injection defense, study §6.3).
 */

import { GODDESS_USERNAMES } from "@/lib/goddesses";
import type {
  AutopilotConfig,
  AutopilotSnapshot,
  BuyCandidateRow,
  ComboCandidateRow,
  OwnedCandidateRow,
} from "./types";

const GODDESS_SET = new Set(GODDESS_USERNAMES);
const MARKET_FETCH_LIMIT = 24;

interface OwnedPlayerRow {
  ownershipId: number;
  id: number;
  username: string;
  playerValue: number;
  profession?: string | null;
  blockSellUntil?: string | null;
}

interface MarketRow {
  id: number;
  username: string;
  playerValue: number;
  profession?: string | null;
  ownerName?: string | null;
  ownerCount?: number;
}

/** spendBudget = min(budgetPct × credits, credits − reserve) — pure. */
export function computeSpendBudget(credits: number, budgetPct: number, reservePct: number): number {
  const reserve = Math.floor((credits * Math.min(Math.max(reservePct, 0), 90)) / 100);
  const byPct = Math.floor((credits * Math.min(Math.max(budgetPct, 1), 100)) / 100);
  return Math.max(0, Math.min(byPct, credits - reserve));
}

/**
 * One card per distinct profession (highest value, preferring un-locked
 * cards) until 6 professions are covered — the sellable-combo heuristic.
 * Pure — tested.
 */
export function computeComboCandidate(owned: OwnedCandidateRow[]): ComboCandidateRow | null {
  const best = new Map<string, OwnedCandidateRow>();
  const isLocked = (row: OwnedCandidateRow) =>
    !!row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now();
  for (const row of owned) {
    if (!row.profession) continue;
    const current = best.get(row.profession);
    if (!current) {
      best.set(row.profession, row);
      continue;
    }
    // Prefer un-locked, then higher value.
    const aLocked = isLocked(row);
    const bLocked = isLocked(current);
    if (aLocked !== bLocked) {
      if (!aLocked) best.set(row.profession, row);
    } else if (row.value > current.value) {
      best.set(row.profession, row);
    }
  }
  if (best.size < 6) return null;
  const chosen = [...best.values()].slice(0, 6);
  const sumValue = chosen.reduce((s, c) => s + c.value, 0);
  return {
    playerIds: chosen.map((c) => c.playerId),
    sumValue,
    estimatedReward: sumValue * 10,
  };
}

function mapOwned(row: OwnedPlayerRow): OwnedCandidateRow {
  return {
    ownershipId: row.ownershipId,
    playerId: row.id,
    username: row.username,
    value: Number(row.playerValue ?? 0),
    profession: row.profession ?? null,
    lockedUntil: row.blockSellUntil ?? null,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

/**
 * Builds the brain's view of the game. Throws on transport errors — the
 * loop treats a failed snapshot as a skipped turn, never as game state.
 */
export async function buildAutopilotSnapshot(username: string, config: AutopilotConfig): Promise<AutopilotSnapshot> {
  const [me, limit, player, market, cooldowns] = await Promise.all([
    fetchJson("/api/me") as Promise<{ credits?: number; username?: string }>,
    fetchJson("/api/settings/ownership-limit") as Promise<{ limit?: number; currentOwned?: number }>,
    fetchJson(`/api/players/${encodeURIComponent(username)}`) as Promise<{ ownedPlayers?: OwnedPlayerRow[] }>,
    fetchJson(
      `/api/players?limit=${MARKET_FETCH_LIMIT}&sort=value&dir=asc&affordable=true`
    ) as Promise<{ players?: MarketRow[] }>,
    fetchJson("/api/game/bonus-cooldowns") as Promise<{ massHire?: { onCooldown?: boolean } }>,
  ]);

  const credits = Math.floor(Number(me?.credits ?? 0));
  const spendBudget = computeSpendBudget(credits, config.budgetPct, config.reservePct);
  const slotsRemaining = Math.max(0, Number(limit?.limit ?? 20) - Number(limit?.currentOwned ?? 0));

  const owned = (player?.ownedPlayers ?? []).map(mapOwned);
  const ownedProfessions = [...new Set(owned.map((o) => o.profession).filter((p): p is string => !!p))];

  const buyCandidates: BuyCandidateRow[] = (market?.players ?? [])
    .filter((r) => Number(r.playerValue) > 0 && Number(r.playerValue) <= spendBudget)
    .filter((r) => !GODDESS_SET.has(r.username))
    .slice(0, 14)
    .map((r) => ({
      targetId: r.id,
      username: r.username,
      profession: r.profession ?? null,
      value: Math.floor(Number(r.playerValue)),
      hasOwner: !!r.ownerName,
      ownerName: r.ownerName ?? null,
    }));

  const renovateCandidates = [...owned]
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const nowMs = Date.now();
  const lockCandidates = owned
    .filter((o) => !o.lockedUntil || new Date(o.lockedUntil).getTime() <= nowMs)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return {
    credits,
    spendBudget,
    slotsRemaining,
    ownedCount: owned.length,
    ownedProfessions,
    buyCandidates,
    renovateCandidates,
    lockCandidates,
    comboCandidate: computeComboCandidate(owned),
    massHireReady: cooldowns?.massHire?.onCooldown === false,
    generatedAt: nowMs,
  };
}
