/**
 * Autopilot — "Bring Your Own Brain" (PLAYER_AI_STUDY.md, v1 client-side).
 *
 * The player's own AI plays the market for them: the browser calls the
 * player's chosen LLM provider directly (their key, their token cost) and
 * executes the validated plan through the ordinary session-authed game
 * routes. The server never sees the key and never calls the provider.
 *
 * Security model (copied from src/lib/agent/llm.ts validateDecision): the
 * model only ever PICKS from an enumerated candidate set computed from real
 * game state; every action is re-validated by the economy cores anyway.
 */

export type AutopilotVerb =
  | "acquire" // buy/steal a market card (POST /api/game/purchase)
  | "renovate" // pump an owned card (POST /api/game/pump)
  | "deedLock" // block-sell an owned card (POST /api/game/blocksell)
  | "foreclose" // break a deed lock and take the card (POST /api/game/break-partnership)
  | "comboSale" // sell a 6-profession combo (POST /api/game/sell-profession-combo)
  | "landGrab"; // mass hire (POST /api/game/mass-hire)

export const ALL_AUTOPILOT_VERBS: readonly AutopilotVerb[] = [
  "acquire",
  "renovate",
  "deedLock",
  "foreclose",
  "comboSale",
  "landGrab",
] as const;

/** Safe-by-default verb set; the pricier/forceful verbs are opt-in. */
export const DEFAULT_AUTOPILOT_VERBS: readonly AutopilotVerb[] = [
  "acquire",
  "renovate",
  "comboSale",
] as const;

export type AutopilotProviderId =
  | "openrouter"
  | "openai"
  | "groq"
  | "deepseek"
  | "anthropic"
  | "gemini"
  | "custom";

export type AutopilotMode = "copilot" | "execute";

export interface AutopilotConfig {
  provider: AutopilotProviderId;
  /** Custom/override base URL (preset default when empty). */
  baseUrl: string;
  model: string;
  /** Minutes between turns. */
  cadenceMin: number;
  /** Max % of liquid credits the autopilot may spend per turn. */
  budgetPct: number;
  /** Never spend below this % of liquid credits. */
  reservePct: number;
  verbs: AutopilotVerb[];
  mode: AutopilotMode;
}

export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  provider: "openrouter",
  baseUrl: "",
  model: "",
  cadenceMin: 5,
  budgetPct: 20,
  reservePct: 10,
  verbs: [...DEFAULT_AUTOPILOT_VERBS],
  mode: "copilot",
};

export const AUTOPILOT_TURN_MAX_ACTIONS = 6;
/** Agent speed ruling (2026-10-03): one action per 10 seconds, hard floor. */
export const AUTOPILOT_ACTION_MIN_GAP_MS = 10_000;
export const AUTOPILOT_ACTION_JITTER_MS = 3_000;

// ── Snapshot (what the brain sees; ids only as command operands) ──

export interface BuyCandidateRow {
  targetId: number;
  username: string;
  profession: string | null;
  value: number; // ≈ acquire cost at 1 lease-hour
  hasOwner: boolean;
  ownerName: string | null;
}

export interface OwnedCandidateRow {
  ownershipId: number;
  /** The card's USER id (combo sale wants player ids, not ownership ids). */
  playerId: number;
  username: string;
  value: number;
  profession: string | null;
  lockedUntil: string | null; // active deed lock (ISO) or null
}

export interface ComboCandidateRow {
  playerIds: number[];
  sumValue: number;
  estimatedReward: number; // ≈ sumValue × 10 (server computes the real payout)
}

export interface AutopilotSnapshot {
  credits: number;
  spendBudget: number; // min(budgetPct × credits, credits − reserve)
  slotsRemaining: number;
  ownedCount: number;
  ownedProfessions: string[];
  buyCandidates: BuyCandidateRow[];
  renovateCandidates: OwnedCandidateRow[];
  lockCandidates: OwnedCandidateRow[];
  comboCandidate: ComboCandidateRow | null;
  massHireReady: boolean;
  generatedAt: number;
}

// ── Plan (LLM output, validated against the snapshot) ──

export interface RawAutopilotAction {
  verb?: string;
  targetId?: number;
  ownershipId?: number;
  playerIds?: number[];
  reason?: string;
}

export interface ValidatedAutopilotAction {
  verb: AutopilotVerb;
  targetId?: number;
  ownershipId?: number;
  playerIds?: number[];
  estCost: number;
  reason?: string;
}

export interface AutopilotPlan {
  actions: ValidatedAutopilotAction[];
  dropped: number;
  note?: string;
  source: "llm" | "empty";
}

// ── Turn results ──

export interface TurnActionResult {
  verb: AutopilotVerb;
  label?: string;
  ok: boolean;
  error?: string;
}

export interface TurnLog {
  at: number; // epoch ms
  mode: AutopilotMode | "preview";
  executed: TurnActionResult[];
  plannedCount: number;
  dropped: number;
  spentEst: number;
  note?: string;
  error?: string;
  stopped?: "rate" | "auth" | "failures" | "manual";
  approved?: boolean;
}

/** Rolling memory shown to the model so it doesn't re-do what it just did. */
export interface TurnMemoryEntry {
  at: number;
  summary: string;
}
