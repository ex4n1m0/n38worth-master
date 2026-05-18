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

/** Original goddess values used when resetting the game */
export const GODDESS_VALUES: Record<string, number> = {
  "Goddess of Wealth": 100_000,
  "Goddess of Knowledge": 1_000_000,
  "Goddess of Fate": 10_000_000,
  "Goddess of Time": 100_000_000,
  "Goddess of War": 1_000_000_000,
  "Goddess": 10_000_000_000,
};
