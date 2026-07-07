/**
 * Shared goddess constants used across the game.
 * Single source of truth for goddess names and their original values.
 */

export const GODDESS_USERNAMES: string[] = [
  "Goddess of Wealth",
  "Goddess of Knowledge",
  "Goddess of Fate",
  "Goddess of Time",
  "Goddess of War",
  "Goddess",
];

/** Power description shown on each goddess card */
export const GODDESS_POWERS: Record<string, string> = {
  "Goddess of Wealth": "The player holding this card earns double credits from their portfolio rewards, and double on the boss tax they collect from players they own.",
  "Goddess of Knowledge": "The player holding this card automatically sees every avatar, including ones that are otherwise hidden.",
  "Goddess of Fate": "The player holding this card can create NPCs for free.",
  "Goddess of Time": "The player holding this card collects their portfolio rewards (and pays their boss's tax) twice as often as everyone else, halving their own wait between payouts.",
  "Goddess of War": "The player holding this card breaks sell blocks for free, paying only the normal hire cost — except during a partnership's initial unbreakable window, which no one can break.",
  "Goddess": "The player holding this card activates the powers of all other goddess cards, whether or not they hold those cards.",
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
