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

/**
 * Map a (possibly special-card) username to its display name.
 * Regular players pass through unchanged.
 */
export function cardDisplayName(username: string | null | undefined): string {
  if (!username) return "";
  return CARD_DISPLAY_NAMES[username] ?? username;
}

/** Collective noun for the six special win-condition cards. */
export const THE_SIX = "the Six";
