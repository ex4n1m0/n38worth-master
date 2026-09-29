// ──────────────────────────────────────────────
// Rank Title System
// Four ladders, 10 titles each:
//   Grid (Owned), Credits, Value, Portfolio
//
// City-building rebrand (2026-09-29, CITY_REBRAND_STUDY.md §5): display
// titles only — the category API values ("empire", "legacy", …) and snapshot
// columns keep their original names. Titles translate at DISPLAY time via
// `rankTitle(title, locale)`; the ladder data above stays English so
// server-side consumers are unaffected.
// ──────────────────────────────────────────────

import type { Locale } from "./i18n";

export interface RankTier {
  threshold: number;
  title: string;
}

// ── 1. Grid — Amount of Owned Players (Power) ──
export const OWNED_RANKS: RankTier[] = [
  { threshold: 0, title: "Newcomer" },
  { threshold: 3, title: "Tenant" },
  { threshold: 8, title: "Leaseholder" },
  { threshold: 15, title: "Freeholder" },
  { threshold: 25, title: "Landlord" },
  { threshold: 40, title: "Developer" },
  { threshold: 60, title: "Builder" },
  { threshold: 80, title: "Magnate" },
  { threshold: 100, title: "Tycoon" },
  { threshold: 150, title: "Baron" },
];

// ── 2. Credits — Wealth (Capital) ──
export const CREDITS_RANKS: RankTier[] = [
  { threshold: 0, title: "Broke" },
  { threshold: 100, title: "Pocket Change" },
  { threshold: 500, title: "Nest Egg" },
  { threshold: 2000, title: "Savings" },
  { threshold: 5000, title: "Windfall" },
  { threshold: 15000, title: "First Pot" },
  { threshold: 50000, title: "Fortune" },
  { threshold: 100000, title: "Riches" },
  { threshold: 250000, title: "Wealth" },
  { threshold: 1000000, title: "Mogul" },
];

// ── 3. Value — Player Value (Appraisal) ──
export const VALUE_RANKS: RankTier[] = [
  { threshold: 1, title: "Empty Lot" },
  { threshold: 5, title: "Kiosk" },
  { threshold: 15, title: "Storefront" },
  { threshold: 50, title: "Walk-Up" },
  { threshold: 100, title: "Townhouse" },
  { threshold: 250, title: "Mid-Rise" },
  { threshold: 500, title: "High-Rise" },
  { threshold: 1000, title: "Tower" },
  { threshold: 2500, title: "Skyscraper" },
  { threshold: 5000, title: "Landmark" },
];

// ── 4. Portfolio — Total Portfolio Value ──
export const PORTFOLIO_RANKS: RankTier[] = [
  { threshold: 0, title: "Ghost Town" },
  { threshold: 100, title: "Outpost" },
  { threshold: 500, title: "Village" },
  { threshold: 2000, title: "Town" },
  { threshold: 5000, title: "Borough" },
  { threshold: 15000, title: "City" },
  { threshold: 50000, title: "Metropolis" },
  { threshold: 150000, title: "Megacity" },
  { threshold: 500000, title: "Megalopolis" },
  { threshold: 1000000, title: "World Capital" },
];

/** Simplified-Chinese display titles, keyed by the English ladder title. */
export const RANK_TITLES_ZH: Record<string, string> = {
  // Grid
  Newcomer: "新人",
  Tenant: "租客",
  Leaseholder: "承租人",
  Freeholder: "业主",
  Landlord: "房东",
  Developer: "开发商",
  Builder: "营造商",
  Magnate: "巨贾",
  Tycoon: "巨富",
  Baron: "巨头",
  // Credits
  Broke: "破产",
  "Pocket Change": "零钱",
  "Nest Egg": "小金库",
  Savings: "存款",
  Windfall: "意外之财",
  "First Pot": "第一桶金",
  Fortune: "财富",
  Riches: "豪富",
  Wealth: "家财万贯",
  Mogul: "大亨",
  // Value
  "Empty Lot": "空地",
  Kiosk: "报刊亭",
  Storefront: "临街店面",
  "Walk-Up": "步行楼",
  Townhouse: "联排宅",
  "Mid-Rise": "多层楼",
  "High-Rise": "高层楼",
  Tower: "塔楼",
  Skyscraper: "摩天楼",
  Landmark: "城市地标",
  // Portfolio
  "Ghost Town": "荒城",
  Outpost: "前哨站",
  Village: "村镇",
  Town: "城镇",
  Borough: "市区",
  City: "城市",
  Metropolis: "大都会",
  Megacity: "特大城市",
  Megalopolis: "巨型都市",
  "World Capital": "世界之都",
};

/** Locale-aware display title for a rank tier. */
export function rankTitle(title: string, locale: Locale = "en"): string {
  return locale === "zh" ? (RANK_TITLES_ZH[title] ?? title) : title;
}

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