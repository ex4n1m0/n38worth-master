/**
 * Professions system - players can choose a profession during onboarding,
 * and NPCs randomly acquire one with weighted probabilities.
 *
 * City-building rebrand (2026-09-29, CITY_REBRAND_STUDY.md §4): DISPLAY-ONLY.
 * The DB values below (Cryptographer, Zero-Day, …) are load-bearing contracts
 * (users.profession rows, art-family keys, pixel-sheet filenames) and stay
 * English forever; the UI renders the city "trade" names (Notary, Auctioneer,
 * Renovator, Vault Keeper, City Planner, Prospector) at display time via
 * `professionName()` / `professionPerk()`. No DB migration this time.
 *
 * History: fantasy names were renamed in code AND data (2026-09 sci-fi
 * rebrand, `npm run rebrand:professions`); the city rebrand does NOT repeat
 * that — indirection only.
 */

import type { Locale } from "./i18n";

export interface Profession {
  name: string;
  imagePath: string;
  probability: number; // 0-100, used only for NPC random assignment
}

export const PROFESSIONS: Profession[] = [
  {
    name: "Cryptographer",
    imagePath: "/NewCryptographer.webp",
    probability: 5,
  },
  {
    name: "Zero-Day",
    imagePath: "/NewZeroDay.webp",
    probability: 6,
  },
  {
    name: "Overclocker",
    imagePath: "/NewOverclocker.webp",
    probability: 7,
  },
  {
    name: "Cache Keeper",
    imagePath: "/NewCacheKeeper.webp",
    probability: 8,
  },
  {
    name: "Server Marshal",
    imagePath: "/NewServerMarshal.webp",
    probability: 9,
  },
  {
    name: "Bot Herder",
    imagePath: "/NewBotHerder.webp",
    probability: 10,
  },
];

/** Total probability of receiving any profession (sum of all 6). */
const TOTAL_PROFESSION_PROBABILITY = 45;

/**
 * Rolls a random profession for an NPC based on weighted probabilities.
 * Returns the profession name, or null if the NPC gets no profession (hidden card).
 *
 * Probabilities:
 *   Cryptographer: 5%
 *   Zero-Day: 6%
 *   Overclocker: 7%
 *   Cache Keeper: 8%
 *   Server Marshal: 9%
 *   Bot Herder: 10%
 *   Hidden Card (null): 55%
 */
export function rollProfession(): string | null {
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (const profession of PROFESSIONS) {
    cumulative += profession.probability;
    if (roll < cumulative) {
      return profession.name;
    }
  }

  return null; // Hidden card (55%)
}

/**
 * Returns the image path for a given profession name.
 */
export function getProfessionImage(professionName: string | null | undefined): string | null {
  if (!professionName) return null;
  const profession = PROFESSIONS.find((p) => p.name === professionName);
  return profession?.imagePath ?? null;
}

/** City-building ("trade") display names, keyed by the DB (English) name. */
export const PROFESSION_DISPLAY_NAMES: Record<string, string> = {
  Cryptographer: "Notary",
  "Zero-Day": "Auctioneer",
  Overclocker: "Renovator",
  "Cache Keeper": "Vault Keeper",
  "Server Marshal": "City Planner",
  "Bot Herder": "Prospector",
};

/** Simplified-Chinese display names, keyed by the DB (English) name. */
export const PROFESSION_NAMES_ZH: Record<string, string> = {
  Cryptographer: "公证人",
  "Zero-Day": "拍卖师",
  Overclocker: "翻新师",
  "Cache Keeper": "金库管家",
  "Server Marshal": "城市规划师",
  "Bot Herder": "勘探者",
};

/** Locale-aware display name for a profession (DB names stay English). */
export function professionName(name: string | null | undefined, locale: Locale = "en"): string {
  if (!name) return "";
  if (locale === "zh") return PROFESSION_NAMES_ZH[name] ?? name;
  return PROFESSION_DISPLAY_NAMES[name] ?? name;
}

/**
 * Profession perks ("Trade Secrets") — display metadata. A perk is active for a
 * player while they either ARE that profession or OWN at least one card with
 * it. Server-side checks live in src/lib/professionPerks.ts.
 */
export const PROFESSION_PERKS: Record<string, { name: string; description: string }> = {
  "Cryptographer": {
    name: "Notarized Deeds",
    description: "Your deed locks last 50% longer (1.5h per press).",
  },
  "Zero-Day": {
    name: "Inside Bid",
    description: "Foreclosures you pay for are 20% cheaper.",
  },
  "Overclocker": {
    name: "In-House Crew",
    description: "Renovations cost 10% less but still double the building's value.",
  },
  "Cache Keeper": {
    name: "Accrued Interest",
    description: "Your daily dividend is 25% bigger.",
  },
  "Server Marshal": {
    name: "Upzoned",
    description: "+2 land plots.",
  },
  "Bot Herder": {
    name: "Sharp Eye",
    description: "Land Grab claims +1 extra building.",
  },
};

/** Simplified-Chinese perk display metadata, keyed by the DB profession name. */
export const PROFESSION_PERKS_ZH: Record<string, { name: string; description: string }> = {
  "Cryptographer": {
    name: "公证契据",
    description: "你的契锁持续时间延长 50%（每次加签 1.5 小时）。",
  },
  "Zero-Day": {
    name: "内幕出价",
    description: "你支付的法拍费用便宜 20%。",
  },
  "Overclocker": {
    name: "自有施工队",
    description: "翻新费用减少 10%，但建筑估值依然翻倍。",
  },
  "Cache Keeper": {
    name: "生息",
    description: "你的每日分红增加 25%。",
  },
  "Server Marshal": {
    name: "扩批用地",
    description: "+2 块地块。",
  },
  "Bot Herder": {
    name: "火眼金睛",
    description: "圈地每次多圈 1 座建筑。",
  },
};

/** Locale-aware perk display metadata for a profession. */
export function professionPerk(
  professionNameKey: string | null | undefined,
  locale: Locale = "en"
): { name: string; description: string } | undefined {
  if (!professionNameKey) return undefined;
  return locale === "zh"
    ? PROFESSION_PERKS_ZH[professionNameKey] ?? PROFESSION_PERKS[professionNameKey]
    : PROFESSION_PERKS[professionNameKey];
}
