/**
 * Shared goddess constants used across the game.
 * Single source of truth for goddess names and their original values.
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
  "Goddess of Wealth": "The player holding this avatar earns double credits from their portfolio rewards, and double on the boss tax they collect from players they own.",
  "Goddess of Knowledge": "The player holding this avatar automatically sees every avatar, including ones that are otherwise hidden.",
  "Goddess of Fate": "While the player holds this avatar, all players they own get a permanent sell block. Other players can break the block, but it costs 1000× the player's current value.",
  "Goddess of Time": "The player holding this avatar collects their portfolio rewards (and pays their boss's tax) twice as often as everyone else, halving their own wait between payouts.",
  "Goddess of War": "The player holding this avatar breaks sell blocks for free, paying only the normal hire cost — except during a partnership's initial unbreakable window, which no one can break. They can also destroy a card they own: an owned NPC is permanently deleted and replaced by 2 fresh NPCs, while an owned human's value resets to 1¢ and is released. Destruction has a 1-minute cooldown.",
  "Goddess": "The player holding this avatar activates the powers of all other goddess avatars, whether or not they hold those avatars.",
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
