/**
 * Client-safe marketplace mission data and pure unlock helpers.
 *
 * This module contains ONLY plain data and pure functions (no database or
 * server-only imports) so it can be imported from both server code
 * (`missions.ts`, `purchaseCore.ts`) and client components (market cards) to
 * decide which goddess/bonus cards are unlocked for purchase.
 */

export interface Mission {
  /** Number of owned cards required to complete the mission */
  threshold: number;
  /** Card usernames awarded for free on completion */
  rewardCards: string[];
  /** Text shown on the progress bar */
  label: string;
}

export const MISSIONS: Mission[] = [
  {
    threshold: 20,
    rewardCards: ["Bonus Own Value", "Bonus Owned Players", "Bonus Player Slot"],
    label: "Collect 20 cards to acquire the 3 Bonus cards",
  },
  {
    threshold: 100,
    rewardCards: ["Goddess of Wealth"],
    label: "Collect 100 cards to acquire Goddess of Wealth",
  },
  {
    threshold: 200,
    rewardCards: ["Goddess of Knowledge"],
    label: "Collect 200 cards to acquire Goddess of Knowledge",
  },
  {
    threshold: 300,
    rewardCards: ["Goddess of Fate"],
    label: "Collect 300 cards to acquire Goddess of Fate",
  },
  {
    threshold: 400,
    rewardCards: ["Goddess of Time"],
    label: "Collect 400 cards to acquire Goddess of Time",
  },
  {
    threshold: 500,
    rewardCards: ["Goddess of War"],
    label: "Collect 500 cards to acquire Goddess of War",
  },
  {
    threshold: 10000,
    rewardCards: ["Goddess"],
    label: "Collect 10,000 cards to acquire Goddess",
  },
];

/**
 * Map of mission-reward card username -> index of the mission that awards it.
 * Derived from `MISSIONS` so it stays in sync with the ladder.
 */
export const MISSION_CARD_INDEX: Record<string, number> = MISSIONS.reduce(
  (acc, mission, index) => {
    for (const card of mission.rewardCards) acc[card] = index;
    return acc;
  },
  {} as Record<string, number>
);

/**
 * Whether a card must be unlocked via missions before it can be bought with
 * credits. True for the 3 passive bonus cards and the 6 goddesses (everything
 * the mission ladder awards). False for regular players and the single-use
 * action cards (Mass Hire, Create NPC, +10 Player Slots, 10-Min Knowledge),
 * which are never part of the mission ladder.
 */
export function isLockablePurchaseCard(username: string): boolean {
  return username in MISSION_CARD_INDEX;
}

/**
 * Whether `username` is unlocked for purchase at the given mission level.
 *
 * A lockable card unlocks once the player has completed the mission that awards
 * it (i.e. obtained it from a mission at least once). Completing mission index
 * `i` advances `mission_level` to `i + 1`, so a card awarded by mission `i` is
 * unlocked when `missionLevel >= i + 1`. Non-lockable cards are always
 * purchasable.
 */
export function isPurchaseUnlockedAtLevel(
  username: string,
  missionLevel: number
): boolean {
  const index = MISSION_CARD_INDEX[username];
  if (index === undefined) return true;
  return missionLevel >= index + 1;
}

/**
 * The owned-card threshold the player must reach to unlock `username` for
 * purchase, or null if the card is not lockable.
 */
export function purchaseUnlockThreshold(username: string): number | null {
  const index = MISSION_CARD_INDEX[username];
  if (index === undefined) return null;
  return MISSIONS[index].threshold;
}
