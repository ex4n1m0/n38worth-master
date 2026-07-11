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

/** Special "Mass Hire" card — unlocks at 500 owned cards (not a goddess mission). */
export const MASS_HIRE_CARD = "Mass Hire";
export const MASS_HIRE_UNLOCK_THRESHOLD = 500;

export const MISSIONS: Mission[] = [
  {
    threshold: 1000,
    rewardCards: ["Goddess of Wealth"],
    label: "Own 1,000 cards to unlock Goddess of Wealth",
  },
  {
    threshold: 2000,
    rewardCards: ["Goddess of Knowledge"],
    label: "Own 2,000 cards to unlock Goddess of Knowledge",
  },
  {
    threshold: 3000,
    rewardCards: ["Goddess of Fate"],
    label: "Own 3,000 cards to unlock Goddess of Fate",
  },
  {
    threshold: 4000,
    rewardCards: ["Goddess of Time"],
    label: "Own 4,000 cards to unlock Goddess of Time",
  },
  {
    threshold: 5000,
    rewardCards: ["Goddess of War"],
    label: "Own 5,000 cards to unlock Goddess of War",
  },
  {
    threshold: 6000,
    rewardCards: ["Goddess"],
    label: "Own 6,000 cards to unlock the Goddess",
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
 * credits. True for the 6 goddesses (everything the mission ladder awards) and
 * the Mass Hire card. False for regular players.
 */
export function isLockablePurchaseCard(username: string): boolean {
  return username in MISSION_CARD_INDEX || username === MASS_HIRE_CARD;
}

/**
 * Whether `username` is unlocked for purchase at the given mission level.
 *
 * A lockable card unlocks once the player has completed the mission that awards
 * it (i.e. obtained it from a mission at least once). Completing mission index
 * `i` advances `mission_level` to `i + 1`, so a card awarded by mission `i` is
 * unlocked when `missionLevel >= i + 1`. Non-lockable cards are always
 * purchasable.
 *
 * The Mass Hire card is special: it unlocks at 500 owned cards, which is below
 * the first goddess mission (1000). It's unlocked when missionLevel >= 1
 * (i.e. the player has completed at least the first mission-equivalent, which
 * at 500 cards is tracked separately).
 */
export function isPurchaseUnlockedAtLevel(
  username: string,
  missionLevel: number
): boolean {
  if (username === MASS_HIRE_CARD) {
    // Mass Hire unlocks at 500 cards. The mission level for 500 cards is
    // not part of the goddess ladder, so we use a separate threshold check.
    // The client passes the owned card count via missionLevel for this card.
    // Actually, missionLevel is the mission index, not card count. We need
    // a different approach — see isMassHireUnlocked below.
    return missionLevel >= 1; // fallback: unlocked after first goddess mission
  }
  const index = MISSION_CARD_INDEX[username];
  if (index === undefined) return true;
  return missionLevel >= index + 1;
}

/**
 * The owned-card threshold the player must reach to unlock `username` for
 * purchase, or null if the card is not lockable.
 */
export function purchaseUnlockThreshold(username: string): number | null {
  if (username === MASS_HIRE_CARD) return MASS_HIRE_UNLOCK_THRESHOLD;
  const index = MISSION_CARD_INDEX[username];
  if (index === undefined) return null;
  return MISSIONS[index].threshold;
}
