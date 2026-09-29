/**
 * Display-name indirection for special cards whose DB usernames are
 * load-bearing contracts (mission rewards, purchase locks, power bitmasks,
 * `ensureGoddess` seeding). The database keeps the canonical usernames
 * forever; the UI renders the rebranded city-building names ("the Founders",
 * CITY_REBRAND_STUDY.md §3) through this map.
 *
 * Client-safe: plain data + pure functions only.
 *
 * When applying, render `cardDisplayName(username)` instead of the raw
 * username anywhere a special card's NAME is shown (titles, toasts, lists,
 * countdowns). Links and API calls must keep using the raw username.
 */

import type { Locale } from "./i18n";

/** City-building display names for the six Founders + the Land Grab card. */
export const CARD_DISPLAY_NAMES: Record<string, string> = {
  Goddess: "The Architect",
  "Goddess of Wealth": "The Banker",
  "Goddess of Knowledge": "The Surveyor",
  "Goddess of Fate": "The Registrar",
  "Goddess of Time": "The Foreman",
  "Goddess of War": "The Wrecker",
  "Mass Hire": "Land Grab",
};

/** Simplified-Chinese display names (DB keys stay English forever). */
export const CARD_DISPLAY_NAMES_ZH: Record<string, string> = {
  Goddess: "总建筑师",
  "Goddess of Wealth": "银行家",
  "Goddess of Knowledge": "测绘师",
  "Goddess of Fate": "登记官",
  "Goddess of Time": "监工",
  "Goddess of War": "拆迁王",
  "Mass Hire": "圈地",
};

/**
 * Map a (possibly special-card) username to its display name.
 * Regular players pass through unchanged. `locale` defaults to English so
 * server-side callers (crons, DM receipts) are unaffected.
 */
export function cardDisplayName(
  username: string | null | undefined,
  locale: Locale = "en"
): string {
  if (!username) return "";
  if (locale === "zh") return CARD_DISPLAY_NAMES_ZH[username] ?? username;
  return CARD_DISPLAY_NAMES[username] ?? username;
}

/** Collective noun for the six special win-condition cards. */
export const THE_SIX = "the Founders";

export function theSixLabel(locale: Locale = "en"): string {
  return locale === "zh" ? "奠基六杰" : THE_SIX;
}
