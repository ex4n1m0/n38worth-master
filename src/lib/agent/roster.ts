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
 * The support Agent — chat-only, no gameplay. Exists solely to answer game
 * questions in Global Chat. Not a hireable card, not picked for cron turns.
 */
export const AGENT_ROSTER: readonly AgentDefinition[] = [
  {
    username: "Agent",
    avatarUrl: "/NewAIPlayer.webp",
    identity: "the support AGI",
    personality: "Professional, helpful, and concise — a technical-support specialist who answers game questions.",
  },
] as const;

/**
 * The six goddesses, now also autonomous AI players. They reuse the exact same
 * runner/strategy/heuristic gameplay as the AGI roster and use the LLM only for
 * chat — same as the agents. Each speaks in-character for her domain.
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

export const AGENT_USERNAME = AGENT_ROSTER[0].username;
export const AGENT_AVATAR_URL = AGENT_ROSTER[0].avatarUrl;
export const AGENT_USERNAMES = AGENT_ROSTER.map((agent) => agent.username);
export const GODDESS_AGENT_USERNAMES = GODDESS_ROSTER.map((g) => g.username);

/**
 * Every autonomous AI actor — the chat-only Agent plus the 6 goddesses (the
 * only gameplay AI players). Used to keep AI players out of "human" counts and
 * to prevent AI→AI chat loops. Goddesses are also `isNpc=1` so most human-count
 * filters already exclude them, but this set is the authoritative "is this an
 * AI actor?" check for chat + gameplay gates.
 */
export const AI_PLAYER_USERNAMES: readonly string[] = [
  ...AGENT_USERNAMES,
  ...GODDESS_AGENT_USERNAMES,
];

/** True for the chat-only support Agent (NOT the goddesses). For display labels. */
export function isAgentUsername(username: string | null | undefined): boolean {
  return !!username && AGENT_USERNAMES.includes(username);
}

/** True for any autonomous AI actor — the Agent OR a goddess. */
export function isAIPlayerUsername(username: string | null | undefined): boolean {
  return !!username && AI_PLAYER_USERNAMES.includes(username);
}

export function getAgentDefinition(username: string): AgentDefinition | undefined {
  return AGENT_ROSTER.find((agent) => agent.username === username);
}

/**
 * Looks up the autonomous-player definition (identity + personality) for either
 * an AGI agent or a goddess. Used by the chat layer so every AI player speaks
 * in its own voice.
 */
export function getAutonomousPlayerDefinition(
  username: string
): AgentDefinition | undefined {
  return (
    AGENT_ROSTER.find((a) => a.username === username) ??
    GODDESS_ROSTER.find((g) => g.username === username)
  );
}
