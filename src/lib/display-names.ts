/**
 * Display-name indirection for special cards whose DB usernames are
 * load-bearing contracts (mission rewards, purchase locks, power bitmasks,
 * `ensureGoddess` seeding). The database keeps the canonical usernames
 * forever; the UI renders the rebranded sci-fi names through this map.
 *
 * Client-safe: plain data + pure functions only.
 *
 * When applying, render `cardDisplayName(username)` instead of the raw
 * username anywhere a special card's NAME is shown (titles, toasts, lists,
 * countdowns). Links and API calls must keep using the raw username.
 */

import type { Locale } from "./i18n";

/** Sci-fi display names for the six goddesses + the Mass Hire card. */
export const CARD_DISPLAY_NAMES: Record<string, string> = {
  Goddess: "The Architect",
  "Goddess of Wealth": "The Banker",
  "Goddess of Knowledge": "The Oracle",
  "Goddess of Fate": "The Locksmith",
  "Goddess of Time": "The Clockkeeper",
  "Goddess of War": "NullPointer",
  "Mass Hire": "Botnet",
};

/** Simplified-Chinese display names (DB keys stay English forever). */
export const CARD_DISPLAY_NAMES_ZH: Record<string, string> = {
  Goddess: "架构师",
  "Goddess of Wealth": "银行家",
  "Goddess of Knowledge": "先知",
  "Goddess of Fate": "锁匠",
  "Goddess of Time": "守钟人",
  "Goddess of War": "空指针",
  "Mass Hire": "僵尸网络",
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
export const THE_SIX = "the Six";

export function theSixLabel(locale: Locale = "en"): string {
  return locale === "zh" ? "六使" : THE_SIX;
}
