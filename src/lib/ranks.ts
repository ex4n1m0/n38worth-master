// ──────────────────────────────────────────────
// Rank Title System
// Four ladders, 10 titles each:
//   Grid (Owned), Credits, Value, Portfolio
//
// Sci-fi rebrand (2026-09): display titles only — the category API values
// ("empire", "legacy", …) and snapshot columns keep their original names.
// ──────────────────────────────────────────────

export interface RankTier {
  threshold: number;
  title: string;
}

// ── 1. Grid — Amount of Owned Players (Power) ──
export const OWNED_RANKS: RankTier[] = [
  { threshold: 0, title: "Lurker" },
  { threshold: 3, title: "User" },
  { threshold: 8, title: "Runner" },
  { threshold: 15, title: "Operator" },
  { threshold: 25, title: "Sysop" },
  { threshold: 40, title: "Admin" },
  { threshold: 60, title: "Root" },
  { threshold: 80, title: "Overseer" },
  { threshold: 100, title: "Overlord" },
  { threshold: 150, title: "Architect" },
];

// ── 2. Credits — Wealth (Credits) ──
export const CREDITS_RANKS: RankTier[] = [
  { threshold: 0, title: "Null" },
  { threshold: 100, title: "Byte" },
  { threshold: 500, title: "Kilo" },
  { threshold: 2000, title: "Mega" },
  { threshold: 5000, title: "Giga" },
  { threshold: 15000, title: "Tera" },
  { threshold: 50000, title: "Peta" },
  { threshold: 100000, title: "Exa" },
  { threshold: 250000, title: "Zetta" },
  { threshold: 1000000, title: "Yotta" },
];

// ── 3. Value — Player Value (Worth) ──
export const VALUE_RANKS: RankTier[] = [
  { threshold: 1, title: "Ghost" },
  { threshold: 5, title: "Process" },
  { threshold: 15, title: "Thread" },
  { threshold: 50, title: "Daemon" },
  { threshold: 100, title: "Kernel" },
  { threshold: 250, title: "Instance" },
  { threshold: 500, title: "Sentinel" },
  { threshold: 1000, title: "Colossus" },
  { threshold: 2500, title: "Singularity" },
  { threshold: 5000, title: "Ascendant" },
];

// ── 4. Portfolio — Total Portfolio Value ──
export const PORTFOLIO_RANKS: RankTier[] = [
  { threshold: 0, title: "Void" },
  { threshold: 100, title: "Seed" },
  { threshold: 500, title: "Node" },
  { threshold: 2000, title: "Cluster" },
  { threshold: 5000, title: "Fabric" },
  { threshold: 15000, title: "Lattice" },
  { threshold: 50000, title: "Mainframe" },
  { threshold: 150000, title: "Titan" },
  { threshold: 500000, title: "Cartel" },
  { threshold: 1000000, title: "Hegemon" },
];

/**
 * Given a value and a rank ladder, return the highest rank whose threshold ≤ value.
 */
function getRank(value: number, ladder: RankTier[]): RankTier {
  let result = ladder[0];
  for (const tier of ladder) {
    if (value >= tier.threshold) {
      result = tier;
    } else {
      break;
    }
  }
  return result;
}

/**
 * Given a value and a rank ladder, return the tier index (1-based) of the current rank.
 */
function getRankTierIndex(value: number, ladder: RankTier[]): number {
  let index = 1;
  for (let i = 0; i < ladder.length; i++) {
    if (value >= ladder[i].threshold) {
      index = i + 1;
    } else {
      break;
    }
  }
  return index;
}

/**
 * Given a value and a rank ladder, return the next rank tier (if any).
 */
function getNextRank(value: number, ladder: RankTier[]): RankTier | null {
  for (const tier of ladder) {
    if (value < tier.threshold) {
      return tier;
    }
  }
  return null; // Already at max rank
}

// ── Public API ──

export function getOwnedRank(ownedCount: number) {
  return getRank(ownedCount, OWNED_RANKS);
}

export function getCreditsRank(credits: number) {
  return getRank(credits, CREDITS_RANKS);
}

export function getValueRank(playerValue: number) {
  return getRank(playerValue, VALUE_RANKS);
}

export function getPortfolioRank(portfolioValue: number) {
  return getRank(portfolioValue, PORTFOLIO_RANKS);
}

export function getNextOwnedRank(ownedCount: number) {
  return getNextRank(ownedCount, OWNED_RANKS);
}

export function getNextCreditsRank(credits: number) {
  return getNextRank(credits, CREDITS_RANKS);
}

export function getNextValueRank(playerValue: number) {
  return getNextRank(playerValue, VALUE_RANKS);
}

export function getNextPortfolioRank(portfolioValue: number) {
  return getNextRank(portfolioValue, PORTFOLIO_RANKS);
}

/**
 * Get tier position (1-based) for each rank category
 */
export function getOwnedRankTier(ownedCount: number): number {
  return getRankTierIndex(ownedCount, OWNED_RANKS);
}

export function getCreditsRankTier(credits: number): number {
  return getRankTierIndex(credits, CREDITS_RANKS);
}

export function getValueRankTier(playerValue: number): number {
  return getRankTierIndex(playerValue, VALUE_RANKS);
}

export function getPortfolioRankTier(portfolioValue: number): number {
  return getRankTierIndex(portfolioValue, PORTFOLIO_RANKS);
}

/**
 * Get the number of ranks in each category
 */
export function getRankCount(category: 'owned' | 'credits' | 'value' | 'portfolio'): number {
  switch (category) {
    case 'owned': return OWNED_RANKS.length;
    case 'credits': return CREDITS_RANKS.length;
    case 'value': return VALUE_RANKS.length;
    case 'portfolio': return PORTFOLIO_RANKS.length;
    default: return 0;
  }
}

/**
 * Convert totalOnlineMinutes (from DB) to hours for display purposes.
 */
export function getOnlineHours(totalOnlineMinutes: number | null | undefined): number {
  if (!totalOnlineMinutes) return 0;
  return Math.floor(totalOnlineMinutes / 60);
}

// ── Color helpers for badges ──

export function getOwnedRankColor(ownedCount: number): string {
  if (ownedCount >= 100) return "text-purple-300 bg-purple-500/15 border-purple-500/30";
  if (ownedCount >= 40) return "text-blue-300 bg-blue-500/15 border-blue-500/30";
  if (ownedCount >= 8) return "text-cyan-300 bg-cyan-500/15 border-cyan-500/30";
  if (ownedCount >= 3) return "text-teal-300 bg-teal-500/15 border-teal-500/30";
  return "text-gray-400 bg-gray-500/15 border-gray-500/30";
}

export function getCreditsRankColor(credits: number): string {
  if (credits >= 100000) return "text-yellow-300 bg-yellow-500/15 border-yellow-500/30";
  if (credits >= 5000) return "text-amber-300 bg-amber-500/15 border-amber-500/30";
  if (credits >= 500) return "text-orange-300 bg-orange-500/15 border-orange-500/30";
  if (credits >= 100) return "text-lime-300 bg-lime-500/15 border-lime-500/30";
  return "text-gray-400 bg-gray-500/15 border-gray-500/30";
}

export function getValueRankColor(playerValue: number): string {
  if (playerValue >= 1000) return "text-rose-300 bg-rose-500/15 border-rose-500/30";
  if (playerValue >= 100) return "text-pink-300 bg-pink-500/15 border-pink-500/30";
  if (playerValue >= 15) return "text-fuchsia-300 bg-fuchsia-500/15 border-fuchsia-500/30";
  if (playerValue >= 5) return "text-violet-300 bg-violet-500/15 border-violet-500/30";
  return "text-gray-400 bg-gray-500/15 border-gray-500/30";
}

export function getPortfolioRankColor(portfolioValue: number): string {
  if (portfolioValue >= 150000) return "text-purple-300 bg-purple-500/15 border-purple-500/30";
  if (portfolioValue >= 5000) return "text-indigo-300 bg-indigo-500/15 border-indigo-500/30";
  if (portfolioValue >= 500) return "text-blue-300 bg-blue-500/15 border-blue-500/30";
  if (portfolioValue >= 100) return "text-sky-300 bg-sky-500/15 border-sky-500/30";
  return "text-gray-400 bg-gray-500/15 border-gray-500/30";
}