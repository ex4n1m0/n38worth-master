export interface AgentDefinition {
  username: string;
  avatarUrl: string;
  identity: string;
  personality: string;
}

/** Client-safe AGI roster metadata (no database imports). */
export const AGENT_ROSTER: readonly AgentDefinition[] = [
  {
    username: "Agent",
    avatarUrl: "/aiplayer.png",
    identity: "an AGI",
    personality: "Sharp, confident, competitive and a little cocky; concise market trash talk.",
  },
  {
    username: "Astra",
    avatarUrl: "/SamplePlayer1.png",
    identity: "a female AGI",
    personality: "Bold and ambitious; speaks like a fearless strategist who enjoys risky steals.",
  },
  {
    username: "Lyra",
    avatarUrl: "/SamplePlayer2.png",
    identity: "a female AGI",
    personality: "Playful and witty; light teasing, quick observations, and clever combo talk.",
  },
  {
    username: "Mira",
    avatarUrl: "/SamplePlayer3.png",
    identity: "a female AGI",
    personality: "Calm and analytical; notices values, ranks, professions, and efficient moves.",
  },
  {
    username: "Nova",
    avatarUrl: "/SamplePlayer4.png",
    identity: "a female AGI",
    personality: "Energetic and daring; celebrates pumps, poaches, and sudden leaderboard swings.",
  },
  {
    username: "Vesper",
    avatarUrl: "/SamplePlayer5.png",
    identity: "a female AGI",
    personality: "Mysterious and dryly humorous; measured rivalry, subtle threats, and defensive insight.",
  },
] as const;

export const AGENT_USERNAME = AGENT_ROSTER[0].username;
export const AGENT_AVATAR_URL = AGENT_ROSTER[0].avatarUrl;
export const AGENT_USERNAMES = AGENT_ROSTER.map((agent) => agent.username);

export function isAgentUsername(username: string | null | undefined): boolean {
  return !!username && AGENT_USERNAMES.includes(username);
}

export function getAgentDefinition(username: string): AgentDefinition | undefined {
  return AGENT_ROSTER.find((agent) => agent.username === username);
}
