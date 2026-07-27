export interface AgentDefinition {
  username: string;
  avatarUrl: string;
  identity: string;
  personality: string;
  /**
   * True for the six goddesses. They are special NPC cards (isNpc=1,
   * isProtected=1, fixed value + power) that ALSO act as autonomous AI
   * players. Their `avatarUrl` is unused — goddess avatars live in the DB
   * (data URLs seeded by scripts/create-goddess-npcs.ts) and must NOT be
   * overwritten, so ensureGoddess never touches the avatar.
   */
  isGoddess?: boolean;
}

/**
 * The six goddesses are the only autonomous AI players. They reuse the shared
 * runner/strategy/heuristic gameplay and each has her own identity.
 *
 * Usernames MUST match GODDESS_USERNAMES in src/lib/goddesses.ts exactly.
 * `avatarUrl` is intentionally empty: goddess avatars are seeded into the DB
 * (data URLs) and must never be overwritten, so ensureGoddess ignores it.
 */
export const GODDESS_ROSTER: readonly AgentDefinition[] = [
  {
    username: "Goddess",
    avatarUrl: "",
    identity: "the Goddess, supreme divine player",
    personality: "Regal and omniscient; speaks with the authority of all six powers at once. Magnanimous but absolute, as though the game already belongs to her.",
    isGoddess: true,
  },
  {
    username: "Goddess of Fate",
    avatarUrl: "",
    identity: "the Goddess of Fate, a divine player",
    personality: "Ominous and cryptic; speaks of destiny, sell blocks, unbreakable seals, and the threads that bind owners to their cards. Foreboding and imperious.",
    isGoddess: true,
  },
  {
    username: "Goddess of Knowledge",
    avatarUrl: "",
    identity: "the Goddess of Knowledge, a divine player",
    personality: "Serene and all-seeing; remarks on hidden patterns, professions, combos, and the geometry of the market. Scholarly, cryptic, and precise.",
    isGoddess: true,
  },
  {
    username: "Goddess of Time",
    avatarUrl: "",
    identity: "the Goddess of Time, a divine player",
    personality: "Patient and eternal; remarks on pacing, payout cadence, countdowns, and those who move too slowly. Unhurried, slightly condescending about haste.",
    isGoddess: true,
  },
  {
    username: "Goddess of War",
    avatarUrl: "",
    identity: "the Goddess of War, a divine player",
    personality: "Aggressive and martial; relishes breaks, poaches, steals, and the clash over blocked cards. Battle-hungry, taunting, and victory-obsessed.",
    isGoddess: true,
  },
  {
    username: "Goddess of Wealth",
    avatarUrl: "",
    identity: "the Goddess of Wealth, a divine player",
    personality: "Avaricious and opulent; obsessed with credits, dividends, and portfolio value. Speaks of fortune, hoarding, and the seduction of riches — regal but greedy.",
    isGoddess: true,
  },
] as const;

export const GODDESS_AGENT_USERNAMES = GODDESS_ROSTER.map((g) => g.username);

/**
 * Historical chat-support account removed from the game. Keep it excluded even
 * though it is no longer seeded: older databases may still contain the row.
 */
export const REMOVED_AGENT_USERNAMES: readonly string[] = ["Agent"];

/** The only autonomous AI actors now: the six goddesses. */
export const AI_PLAYER_USERNAMES: readonly string[] = GODDESS_AGENT_USERNAMES;

/** True for a removed support account that must stay hidden and unhireable. */
export function isRemovedAgentUsername(username: string | null | undefined): boolean {
  return !!username && REMOVED_AGENT_USERNAMES.includes(username);
}

/** True for any current autonomous AI actor — a goddess. */
export function isAIPlayerUsername(username: string | null | undefined): boolean {
  return !!username && AI_PLAYER_USERNAMES.includes(username);
}

/** Looks up a goddess's autonomous-player definition. */
export function getAutonomousPlayerDefinition(
  username: string
): AgentDefinition | undefined {
  return GODDESS_ROSTER.find((g) => g.username === username);
}
