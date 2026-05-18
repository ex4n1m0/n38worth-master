/**
 * Shared bonus card constants used across the game.
 * Single source of truth for bonus card names and their powers.
 */

export const BONUS_CARD_USERNAMES: string[] = [
  "Bonus Own Value",
  "Bonus Owned Players",
  "Bonus Player Slot",
];

/** Power description shown on each bonus card */
export const BONUS_CARD_POWERS: Record<string, string> = {
  "Bonus Own Value": "Your own player value increases by 1% every hour.",
  "Bonus Owned Players": "All your owned players' values increase by 1% every hour.",
  "Bonus Player Slot": "You gain +1 hire slot every hour.",
};

/** Image filenames for each bonus card (stored in public folder) */
export const BONUS_CARD_IMAGES: Record<string, string> = {
  "Bonus Own Value": "/Bonus_Own.png",
  "Bonus Owned Players": "/Bonus_Owned.png",
  "Bonus Player Slot": "/Bonus_Slot.png",
};

/** Check if a username is a bonus card */
export function isBonusCard(username: string): boolean {
  return BONUS_CARD_USERNAMES.includes(username);
}
