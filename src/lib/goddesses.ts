/**
 * Shared goddess constants used across the game.
 * Single source of truth for goddess names and their original values.
 */

export const GODDESS_USERNAMES: string[] = [
  "Morríghan",
  "Athena",
  "Freyja",
  "Ishtar",
  "Inanna",
];

/** Original goddess values used when resetting the game */
export const GODDESS_VALUES: Record<string, number> = {
  "Morríghan": 1_000_000,
  "Athena": 1_000_000,
  "Freyja": 100_000,
  "Ishtar": 10_000,
  "Inanna": 1_000_000_000,
};
