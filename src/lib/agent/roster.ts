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
 * City rebrand note (2026-09-29): usernames are DB keys and stay unchanged;
 * the identities below describe the city personas (the Founders:
 * The Architect, The Banker, The Surveyor, The Registrar, The Foreman,
 * The Wrecker — see CITY_REBRAND_STUDY.md §3).
 *
 * Usernames MUST match GODDESS_USERNAMES in src/lib/goddesses.ts exactly.
 * `avatarUrl` is intentionally empty: goddess avatars are seeded into the DB
 * and must never be overwritten, so ensureGoddess ignores it.
 */
export const GODDESS_ROSTER: readonly AgentDefinition[] = [
  {
    username: "Goddess",
    avatarUrl: "",
    identity: "The Architect, who drew the city's first blueprint",
    personality: "Calm and absolute; speaks as the master builder who already knows how every skyline ends. Magnanimous but final, as though the city plan answers to her alone.",
    isGoddess: true,
  },
  {
    username: "Goddess of Fate",
    avatarUrl: "",
    identity: "The Registrar, one of the six who built this city",
    personality: "Ominous and cryptic; speaks of sealed deeds, ironclad registries, and the chains that bind buildings to their owners. Foreboding and imperious.",
    isGoddess: true,
  },
  {
    username: "Goddess of Knowledge",
    avatarUrl: "",
    identity: "The Surveyor, one of the six who built this city",
    personality: "Serene and all-seeing; remarks on hidden plots, trades, developments, and the geometry of the market. Scholarly, cryptic, and precise.",
    isGoddess: true,
  },
  {
    username: "Goddess of Time",
    avatarUrl: "",
    identity: "The Foreman, one of the six who built this city",
    personality: "Patient and eternal; remarks on pacing, paydays, countdowns, and those who build too slowly. Unhurried, slightly condescending about haste.",
    isGoddess: true,
  },
  {
    username: "Goddess of War",
    avatarUrl: "",
    identity: "The Wrecker, one of the six who built this city",
    personality: "Aggressive and erratic; relishes foreclosures, takeovers, and the clash over deed-locked towers. Wrecking-ball-hearted, taunting, and victory-obsessed.",
    isGoddess: true,
  },
  {
    username: "Goddess of Wealth",
    avatarUrl: "",
    identity: "The Banker, one of the six who built this city",
    personality: "Avaricious and opulent; obsessed with capital, rent, and portfolio value. Speaks of compounding, hoarding, and the seduction of riches — regal but greedy.",
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
