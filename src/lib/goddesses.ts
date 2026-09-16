/**
 * Shared goddess constants used across the game.
 * Single source of truth for goddess names and their original values.
 *
 * Sci-fi rebrand note (2026-09): the usernames below are load-bearing DB
 * keys (mission rewards, purchase locks, power bitmask settings) and stay
 * unchanged. The user-facing names live in src/lib/display-names.ts:
 * The Architect, The Banker, The Oracle, The Locksmith, The Clockkeeper,
 * NullPointer. Collectively: "the Six".
 */

export const GODDESS_USERNAMES: string[] = [
  "Goddess",
  "Goddess of Fate",
  "Goddess of Knowledge",
  "Goddess of Time",
  "Goddess of War",
  "Goddess of Wealth",
];

/** Power description shown on each goddess card */
export const GODDESS_POWERS: Record<string, string> = {
  "Goddess of Wealth": "Holder earns double portfolio rewards and double boss tax from players they own.",
  "Goddess of Knowledge": "Holder sees every avatar, including cloaked ones.",
  "Goddess of Fate": "Holder's owned players get a permanent hard-lock; breaching it costs 1000× the player's value.",
  "Goddess of Time": "Holder collects portfolio rewards (and pays boss tax) twice as often.",
  "Goddess of War": "Holder breaches firewalls for free, paying only the normal hire cost — except during a partnership's initial unbreakable window. Can also destroy an owned card (1-min cooldown): NPCs are deleted and replaced by 2 fresh NPCs; humans reset to 1¢ and are released.",
  "Goddess": "Holder activates the powers of all other daemons, even ones they don't hold.",
};

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
