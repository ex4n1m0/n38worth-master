/**
 * Autopilot executor — plays a validated plan through the ORDINARY
 * session-authed routes (same-origin fetch, session cookie rides along).
 *
 * Hard properties (study §6):
 *  - ROUTE WHITELIST: the only reachable endpoints; anything else is
 *    unreachable BY CONSTRUCTION (chat, credits transfers, account changes
 *    are not on the map).
 *  - PACE: one action per 10–13 s (agent speed ruling 2026-10-03) — the
 *    server's 1-per-10-s guard backs this up with 429s.
 *  - STOPS: on 401 (disarm), on 429 (end turn), after 3 consecutive
 *    failures.
 */

import {
  AUTOPILOT_ACTION_JITTER_MS,
  AUTOPILOT_ACTION_MIN_GAP_MS,
  type AutopilotPlan,
  type TurnActionResult,
  type ValidatedAutopilotAction,
} from "./types";

const VIA_HEADER = { "x-n38-via": "autopilot" } as const;

type RouteBuilder = (action: ValidatedAutopilotAction) => { path: string; body: unknown };

/** Frozen route whitelist — do NOT add account/chat/credit-transfer routes. */
export const ACTION_ROUTES: Readonly<Record<string, RouteBuilder>> = Object.freeze({
  acquire: (a) => ({ path: "/api/game/purchase", body: { targetId: a.targetId, blockDurationHours: 1 } }),
  renovate: (a) => ({ path: "/api/game/pump", body: { ownershipId: a.ownershipId } }),
  deedLock: (a) => ({ path: "/api/game/blocksell", body: { ownershipId: a.ownershipId } }),
  foreclose: (a) => ({ path: "/api/game/break-partnership", body: { targetId: a.targetId } }),
  comboSale: (a) => ({ path: "/api/game/sell-profession-combo", body: { playerIds: a.playerIds ?? [] } }),
  landGrab: () => ({ path: "/api/game/mass-hire", body: {} }),
});

export interface ExecutorOptions {
  /** Called after each action with its result (for live UI + invalidation). */
  onAction?: (result: TurnActionResult, action: ValidatedAutopilotAction) => void;
  /** Checked between paced actions; returning true aborts the turn. */
  shouldStop?: () => boolean;
  /**
   * Overrides the inter-action gap (tests pass ~0; production uses the
   * 10–13 s ruling pace).
   */
  actionGapMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ExecutionOutcome {
  results: TurnActionResult[];
  stopped?: "rate" | "auth" | "failures" | "manual";
}

export async function executeAutopilotPlan(
  plan: AutopilotPlan,
  opts: ExecutorOptions = {}
): Promise<ExecutionOutcome> {
  const results: TurnActionResult[] = [];
  let consecutiveFailures = 0;
  let stopped: ExecutionOutcome["stopped"];

  for (let i = 0; i < plan.actions.length; i++) {
    if (i > 0) {
      const gap =
        opts.actionGapMs ??
        AUTOPILOT_ACTION_MIN_GAP_MS + Math.floor(Math.random() * AUTOPILOT_ACTION_JITTER_MS);
      await sleep(Math.max(0, gap));
    }
    if (opts.shouldStop?.()) {
      stopped = "manual";
      break;
    }

    const action = plan.actions[i];
    const builder = ACTION_ROUTES[action.verb];
    if (!builder) continue; // unreachable: verbs outside the whitelist are dropped earlier
    const route = builder(action);

    let result: TurnActionResult;
    try {
      const res = await fetch(route.path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...VIA_HEADER },
        body: JSON.stringify(route.body),
      });

      if (res.status === 401) {
        result = { verb: action.verb, ok: false, error: "Session expired" };
        results.push(result);
        opts.onAction?.(result, action);
        stopped = "auth";
        break;
      }
      if (res.status === 429) {
        result = { verb: action.verb, ok: false, error: "Rate limited" };
        results.push(result);
        opts.onAction?.(result, action);
        stopped = "rate";
        break;
      }

      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data?.error) {
        result = { verb: action.verb, ok: false, error: String(data?.error ?? `HTTP ${res.status}`) };
      } else {
        result = { verb: action.verb, ok: true };
      }
    } catch (err) {
      result = { verb: action.verb, ok: false, error: err instanceof Error ? err.message : "Network error" };
    }

    consecutiveFailures = result.ok ? 0 : consecutiveFailures + 1;
    results.push(result);
    opts.onAction?.(result, action);

    if (consecutiveFailures >= 3) {
      stopped = "failures";
      break;
    }
  }

  return { results, stopped };
}
