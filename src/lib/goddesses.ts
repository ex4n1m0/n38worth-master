/**
 * Shared goddess constants used across the game.
 * Single source of truth for goddess names and their original values.
 *
 * City rebrand note (2026-09-29): the usernames below are load-bearing DB
 * keys (mission rewards, purchase locks, power bitmask settings) and stay
 * unchanged. The user-facing names live in src/lib/display-names.ts:
 * The Architect, The Banker, The Surveyor, The Registrar, The Foreman,
 * The Wrecker. Collectively: "the Founders" (CITY_REBRAND_STUDY.md §3).
 */

export const GODDESS_USERNAMES: string[] = [
  "Goddess",
  "Goddess of Fate",
  "Goddess of Knowledge",
  "Goddess of Time",
  "Goddess of War",
  "Goddess of Wealth",
];

/** Power description shown on each Founder card */
export const GODDESS_POWERS: Record<string, string> = {
  "Goddess of Wealth": "Holder collects double rent and double management fees from the buildings they own.",
  "Goddess of Knowledge": "The Surveyor's maps show every building in the city — including off-market ones.",
  "Goddess of Fate": "Every building you own gets a sealed deed — foreclosing one costs 1000× its value.",
  "Goddess of Time": "On the Foreman's site payday comes twice as often — rent (and management fees) at double frequency.",
  "Goddess of War": "Foreclose any leasehold for free, paying only the building's price. Can also demolish one owned building (1-min cooldown): NPC buildings are cleared and two fresh ones rise in their place; humans are reset to 1¢ and walk free.",
  "Goddess": "The master builder who drew the city's first blueprint grants every Founder's power — even those you don't hold.",
};

/** Simplified-Chinese power descriptions (DB usernames stay English). */
export const GODDESS_POWERS_ZH: Record<string, string> = {
  "Goddess of Wealth": "持有者收取的租金与管理费翻倍。",
  "Goddess of Knowledge": "测绘师的地图看得到全城每一座建筑——包括未挂牌的。",
  "Goddess of Fate": "你名下所有建筑契据加封——法拍需支付其 1000 倍估值。",
  "Goddess of Time": "工地由监工掌舵——发薪日频率翻倍：收租（与缴费）都更勤。",
  "Goddess of War": "免费法拍任意租约持有，只需支付建筑价格。还可拆除名下一座建筑（冷却 1 分钟）：NPC 建筑被清场并由两座新建筑取代；人类重置为 1¢ 并重获自由。",
  "Goddess": "画出城市第一张蓝图的总建筑师，授予全部奠基人权能——即使你并未持有对方。",
};

/** Locale-aware power description for a goddess username. */
export function goddessPower(username: string, locale: "en" | "zh" = "en"): string {
  return locale === "zh"
    ? GODDESS_POWERS_ZH[username] ?? GODDESS_POWERS[username] ?? ""
    : GODDESS_POWERS[username] ?? "";
}

/**
 * Value/price floor for the most expensive goddess. Its effective value is
 * max(this floor, 90% of the global economy) — whichever is higher. This is
 * also its base/original value used when resetting the game.
 */
export const MOST_EXPENSIVE_GODDESS_MIN_VALUE = 100_000_000_000;

/** Original goddess values used when resetting the game */
export const GODDESS_VALUES: Record<string, number> = {
  "Goddess of Wealth": 100_000,
  "Goddess of Knowledge": 1_000_000,
  "Goddess of Fate": 10_000_000,
  "Goddess of Time": 100_000_000,
  "Goddess of War": 1_000_000_000,
  "Goddess": MOST_EXPENSIVE_GODDESS_MIN_VALUE,
};

/**
 * The most expensive goddess (by original value). Its hire cost is computed
 * dynamically as a share of the total economy rather than a fixed value.
 */
export const MOST_EXPENSIVE_GODDESS: string = Object.entries(GODDESS_VALUES).reduce(
  (max, [name, value]) => (value > max.value ? { name, value } : max),
  { name: "", value: -Infinity }
).name;

/**
 * Fraction of the total economy that the most expensive goddess costs to hire.
 * The final price is max(MOST_EXPENSIVE_GODDESS_MIN_VALUE, economy * this share).
 */
export const MOST_EXPENSIVE_GODDESS_ECONOMY_SHARE = 0.9;
