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
  "Goddess of Wealth": "The player holding this card gains double from all passive income, portfolio rewards, and boss income.",
  "Goddess of Knowledge": "The player holding this card can see all avatars without needing to press the reveal buttons.",
  "Goddess of Fate": "The player holding this card can create NPCs and perform mass hire for free.",
  "Goddess of Time": "The player holding this card reduces the time needed to receive portfolio rewards and boss income by half, but only for himself.",
  "Goddess of War": "The player holding this card can break blocks for free; only the normal hire cost applies when hiring a player.",
  "Goddess": "The player holding this card activates all powers from all other cards, regardless of whether the player holds any other goddess card or not.",
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
