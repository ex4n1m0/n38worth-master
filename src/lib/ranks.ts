// ──────────────────────────────────────────────
// Rank Title System
// Five ladders, 10 titles each:
//   Empire (Owned), Legacy (Age),
//   Credits, Value, Portfolio
// ──────────────────────────────────────────────

export interface RankTier {
  threshold: number;
  title: string;
}

// ── 1. Empire — Amount of Owned Players (Power) ──
export const OWNED_RANKS: RankTier[] = [
  { threshold: 0, title: "Spectator" },
  { threshold: 3, title: "Collector" },
  { threshold: 8, title: "Trader" },
  { threshold: 15, title: "Merchant" },
  { threshold: 25, title: "Broker" },
  { threshold: 40, title: "Mogul" },
  { threshold: 60, title: "Baron" },
  { threshold: 80, title: "Tycoon" },
  { threshold: 100, title: "Magnate" },
  { threshold: 150, title: "Emperor" },
];

// ── 2. Legacy — Days Since Creation (Account Age) ──
export const AGE_RANKS: RankTier[] = [
  { threshold: 0, title: "Newborn" },
  { threshold: 1, title: "Fledgling" },
  { threshold: 3, title: "Apprentice" },
  { threshold: 7, title: "Journeyman" },
  { threshold: 14, title: "Veteran" },
  { threshold: 30, title: "Stalwart" },
  { threshold: 90, title: "Master" },
  { threshold: 180, title: "Sage" },
  { threshold: 365, title: "Guardian" },
  { threshold: 730, title: "Eternal" },
];

// ── 3. Credits — Wealth (Credits) ──
export const CREDITS_RANKS: RankTier[] = [
  { threshold: 0, title: "Broke" },
  { threshold: 100, title: "Saver" },
  { threshold: 500, title: "Wealthy" },
  { threshold: 2000, title: "Affluent" },
  { threshold: 5000, title: "Rich" },
  { threshold: 15000, title: "Opulent" },
  { threshold: 50000, title: "Millionaire" },
  { threshold: 100000, title: "Billionaire" },
  { threshold: 250000, title: "Elite" },
  { threshold: 1000000, title: "Tycoon" },
];

// ── 4. Value — Player Value (Worth) ──
export const VALUE_RANKS: RankTier[] = [
  { threshold: 1, title: "Nobody" },
  { threshold: 5, title: "Rookie" },
  { threshold: 15, title: "Rising" },
  { threshold: 50, title: "Notable" },
  { threshold: 100, title: "Prominent" },
  { threshold: 250, title: "Distinguished" },
  { threshold: 500, title: "Prestigious" },
  { threshold: 1000, title: "Celebrity" },
  { threshold: 2500, title: "Superstar" },
  { threshold: 5000, title: "Legend" },
];

// ── 5. Portfolio — Total Portfolio Value ──
export const PORTFOLIO_RANKS: RankTier[] = [
  { threshold: 0, title: "Empty" },
  { threshold: 100, title: "Starter" },
  { threshold: 500, title: "Investor" },
  { threshold: 2000, title: "Capitalist" },
  { threshold: 5000, title: "Financier" },
  { threshold: 15000, title: "Magnate" },
  { threshold: 50000, title: "Mogul" },
  { threshold: 150000, title: "Titan" },
  { threshold: 500000, title: "Oligarch" },
  { threshold: 1000000, title: "Sovereign" },
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

export function getAgeRank(ageDays: number) {
  return getRank(ageDays, AGE_RANKS);
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

export function getNextAgeRank(ageDays: number) {
  return getNextRank(ageDays, AGE_RANKS);
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
 * Get the number of ranks in each category
 */
export function getRankCount(category: 'owned' | 'age' | 'credits' | 'value' | 'portfolio'): number {
  switch (category) {
    case 'owned': return OWNED_RANKS.length;
    case 'age': return AGE_RANKS.length;
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

/**
 * Calculate account age in days from createdAt date. Used for Legacy rank.
 */
export function getAgeDays(createdAt: string | Date | null | undefined): number {
  if (!createdAt) return 0;
  const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Color helpers for badges ──

export function getOwnedRankColor(ownedCount: number): string {
  if (ownedCount >= 100) return "text-purple-300 bg-purple-500/15 border-purple-500/30";
  if (ownedCount >= 40) return "text-blue-300 bg-blue-500/15 border-blue-500/30";
  if (ownedCount >= 8) return "text-cyan-300 bg-cyan-500/15 border-cyan-500/30";
  if (ownedCount >= 3) return "text-teal-300 bg-teal-500/15 border-teal-500/30";
  return "text-gray-400 bg-gray-500/15 border-gray-500/30";
}

export function getAgeRankColor(ageDays: number): string {
  if (ageDays >= 365) return "text-emerald-300 bg-emerald-500/15 border-emerald-500/30";
  if (ageDays >= 30) return "text-green-300 bg-green-500/15 border-green-500/30";
  if (ageDays >= 7) return "text-lime-300 bg-lime-500/15 border-lime-500/30";
  if (ageDays >= 1) return "text-sky-300 bg-sky-500/15 border-sky-500/30";
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