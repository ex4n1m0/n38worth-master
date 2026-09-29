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
  /** Hire slots to ADD on completion (stacks with each mission). */
  addHireSlots?: number;
}

/** Special "Mass Hire" card — unlocked by the second mission (50 owned cards). */
export const MASS_HIRE_CARD = "Mass Hire";
export const MASS_HIRE_UNLOCK_THRESHOLD = 50;

/** Mission index that unlocks the full game UI (rankings, activity, filters, End Game). */
export const UNLOCK_GAME_MISSION_INDEX = 0;
export const UNLOCK_GAME_THRESHOLD = 20;

/** Hire slots added on each mission completion. */
export const MISSION_HIRE_SLOTS_REWARD = 50;

export const MISSIONS: Mission[] = [
  {
    threshold: 20,
    rewardCards: [],
    addHireSlots: MISSION_HIRE_SLOTS_REWARD,
    label: "Own 20 buildings to earn your Builder's Permit",
  },
  {
    threshold: 50,
    rewardCards: ["Mass Hire"],
    addHireSlots: MISSION_HIRE_SLOTS_REWARD,
    label: "Own 50 buildings to unlock Land Grab",
  },
  {
    threshold: 100,
    rewardCards: ["Goddess of Wealth"],
    addHireSlots: MISSION_HIRE_SLOTS_REWARD,
    label: "Own 100 buildings to unlock The Banker",
  },
  {
    threshold: 250,
    rewardCards: ["Goddess of Knowledge"],
    addHireSlots: MISSION_HIRE_SLOTS_REWARD,
    label: "Own 250 buildings to unlock The Surveyor",
  },
  {
    threshold: 500,
    rewardCards: ["Goddess of Fate"],
    addHireSlots: MISSION_HIRE_SLOTS_REWARD,
    label: "Own 500 buildings to unlock The Registrar",
  },
  {
    threshold: 1000,
    rewardCards: ["Goddess of Time"],
    addHireSlots: MISSION_HIRE_SLOTS_REWARD,
    label: "Own 1,000 buildings to unlock The Foreman",
  },
  {
    threshold: 2000,
    rewardCards: ["Goddess of War"],
    addHireSlots: MISSION_HIRE_SLOTS_REWARD,
    label: "Own 2,000 buildings to unlock The Wrecker",
  },
  {
    threshold: 5000,
    rewardCards: ["Goddess"],
    addHireSlots: MISSION_HIRE_SLOTS_REWARD,
    label: "Own 5,000 buildings to unlock The Architect",
  },
];

/**
 * The final mission (awards the last Goddess) has a DYNAMIC threshold:
 * base 5,000 cards, +1,000 for every game won so far (stored server-side in
 * game_settings as `game_win_count`). The static `threshold` above is the
 * base; server code and the missions API compute the effective value via
 * `finalGoddessThreshold(winCount)`.
 */
export const FINAL_MISSION_INDEX = MISSIONS.length - 1;
export const FINAL_GODDESS_CARD = MISSIONS[FINAL_MISSION_INDEX].rewardCards[0];
export const WIN_THRESHOLD_INCREMENT = 1000;

/** Effective owned-card threshold for the final Goddess given total game wins. */
export function finalGoddessThreshold(winCount: number): number {
  return (
    MISSIONS[FINAL_MISSION_INDEX].threshold +
    Math.max(0, winCount) * WIN_THRESHOLD_INCREMENT
  );
}

/**
 * Simplified-Chinese progress-bar labels, keyed by mission index (the English
 * labels above stay the server-side canon). `{n}` marks the threshold.
 */
export const MISSION_LABELS_ZH: Record<number, string> = {
  0: "拥有 {n} 座建筑，取得建造执照",
  1: "拥有 {n} 座建筑，解锁圈地",
  2: "拥有 {n} 座建筑，解锁银行家",
  3: "拥有 {n} 座建筑，解锁测绘师",
  4: "拥有 {n} 座建筑，解锁登记官",
  5: "拥有 {n} 座建筑，解锁监工",
  6: "拥有 {n} 座建筑，解锁拆迁王",
  7: "拥有 {n} 座建筑，解锁总建筑师",
};

/** Locale-aware progress-bar label for a mission. */
export function missionLabel(index: number, locale: "en" | "zh" = "en"): string {
  const threshold = MISSIONS[index]?.threshold ?? 0;
  if (locale === "zh") {
    return (MISSION_LABELS_ZH[index] ?? MISSIONS[index]?.label ?? "").replace(
      "{n}",
      threshold.toLocaleString("en-US")
    );
  }
  return MISSIONS[index]?.label ?? "";
}

/** Label for the final mission at the given effective threshold. */
export function finalGoddessLabel(threshold: number, locale: "en" | "zh" = "en"): string {
  const n = threshold.toLocaleString("en-US");
  return locale === "zh"
    ? `拥有 ${n} 座建筑，解锁总建筑师`
    : `Own ${n} buildings to unlock The Architect`;
}

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
