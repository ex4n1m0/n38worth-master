/**
 * Professions system - players can choose a profession during onboarding,
 * and NPCs randomly acquire one with weighted probabilities.
 *
 * Sci-fi rebrand mapping (2026-09): Rift Binder → Cryptographer,
 * Hexblade Courier → Zero-Day, Scrap Alchemist → Overclocker,
 * Spirit Archivist → Cache Keeper, Iron Choir Marshal → Server Marshal,
 * Plague Cartographer → Bot Herder. Existing DB rows were migrated with
 * `npm run rebrand:professions`.
 *
 * Simplified Chinese (2026-09): DB rows keep the English names; the UI
 * translates at display time via `professionName()` / `professionPerk()`.
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

/** Simplified-Chinese display names, keyed by the DB (English) name. */
export const PROFESSION_NAMES_ZH: Record<string, string> = {
  Cryptographer: "密码学家",
  "Zero-Day": "零日客",
  Overclocker: "超频师",
  "Cache Keeper": "缓存管家",
  "Server Marshal": "服务器执法官",
  "Bot Herder": "僵尸牧人",
};

/** Locale-aware display name for a profession (DB names stay English). */
export function professionName(name: string | null | undefined, locale: Locale = "en"): string {
  if (!name) return "";
  return locale === "zh" ? (PROFESSION_NAMES_ZH[name] ?? name) : name;
}

/**
 * Profession perks ("Firmware Perks") — display metadata. A perk is active for a
 * player while they either ARE that profession or OWN at least one card with
 * it. Server-side checks live in src/lib/professionPerks.ts.
 */
export const PROFESSION_PERKS: Record<string, { name: string; description: string }> = {
  "Cryptographer": {
    name: "Deep Encryption",
    description: "Your firewalls last 50% longer (1.5h per press).",
  },
  "Zero-Day": {
    name: "Exploit Chain",
    description: "Breaches you pay for are 20% cheaper.",
  },
  "Overclocker": {
    name: "Turbo Boost",
    description: "Overclocking costs 10% less but still doubles the avatar's value.",
  },
  "Cache Keeper": {
    name: "Cached Dividends",
    description: "Your daily login reward is 25% bigger.",
  },
  "Server Marshal": {
    name: "Extra Racks",
    description: "+2 hire slots.",
  },
  "Bot Herder": {
    name: "Wider Botnet",
    description: "Botnet grabs +1 extra avatar.",
  },
};

/** Simplified-Chinese perk display metadata, keyed by the DB profession name. */
export const PROFESSION_PERKS_ZH: Record<string, { name: string; description: string }> = {
  "Cryptographer": {
    name: "深度加密",
    description: "你的防火墙持续时间延长 50%（每次点击 1.5 小时）。",
  },
  "Zero-Day": {
    name: "漏洞链",
    description: "你支付的击穿费用便宜 20%。",
  },
  "Overclocker": {
    name: "涡轮加速",
    description: "超频费用减少 10%，但依然使化身身价翻倍。",
  },
  "Cache Keeper": {
    name: "缓存分红",
    description: "你的每日登录奖励增加 25%。",
  },
  "Server Marshal": {
    name: "扩展机架",
    description: "+2 雇佣位。",
  },
  "Bot Herder": {
    name: "更广的僵尸网络",
    description: "僵尸网络每次多抓 1 个化身。",
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
