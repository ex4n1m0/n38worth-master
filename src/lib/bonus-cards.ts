/**
 * Shared bonus card constants used across the game.
 * Single source of truth for bonus card names and their powers.
 */

export const BONUS_CARD_USERNAMES: string[] = [
  "Bonus Own Value",
  "Bonus Owned Players",
  "Bonus Player Slot",
  "Mass Hire",
  "Create NPC",
  "+10 Player Slots",
  "10-Min Knowledge",
];

/** Power description shown on each bonus card */
export const BONUS_CARD_POWERS: Record<string, string> = {
  "Bonus Own Value": "Your own player value increases by 1% every hour.",
  "Bonus Owned Players": "All your owned players' values increase by 1% every hour.",
  "Bonus Player Slot": "You gain +1 hire slot every hour.",
  "Mass Hire": "Hire as many affordable players as possible, cheapest first.",
  "Create NPC": "Spawn a new ownerless NPC into the marketplace.",
  "+10 Player Slots": "Buy 10 more hire slots at your current slot upgrade price.",
  "10-Min Knowledge": "Gain Goddess of Knowledge reveal power for 10 minutes. Press again to add more time.",
};

/** Image filenames for each bonus card (stored in public folder) */
export const BONUS_CARD_IMAGES: Record<string, string> = {
  "Bonus Own Value": "/Bonus_Own.png",
  "Bonus Owned Players": "/Bonus_Owned.png",
  "Bonus Player Slot": "/Bonus_Slot.png",
  "Mass Hire": "/masshire.png",
  "Create NPC": "/addNPC.png",
  "+10 Player Slots": "/10slots.png",
  "10-Min Knowledge": "/reveal.png",
};

/** Original/base values for each bonus card */
export const BONUS_CARD_VALUES: Record<string, number> = {
  "Bonus Own Value": 1000,
  "Bonus Owned Players": 1000,
  "Bonus Player Slot": 1000,
  "Mass Hire": 1000,
  "Create NPC": 1000,
  "+10 Player Slots": 1000,
  "10-Min Knowledge": 1000,
};

/** Check if a username is a bonus card */
export function isBonusCard(username: string): boolean {
  return BONUS_CARD_USERNAMES.includes(username);
}

/**
 * Cards whose price stays on a separate pricing model (not the 1000→2000→…
 * global doubling). "+10 Player Slots" uses the slot-upgrade price instead.
 */
export const NON_DOUBLING_BONUS_CARDS: string[] = ["+10 Player Slots"];

/** Whether a bonus card's price doubles globally on each hire/use. */
export function doublesOnUse(username: string): boolean {
  return BONUS_CARD_USERNAMES.includes(username) && !NON_DOUBLING_BONUS_CARDS.includes(username);
}
