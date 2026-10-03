/**
 * Autopilot turn orchestration — snapshot → provider → validate →
 * (approve?) → execute. Pure module functions (no React), driven by
 * useAutopilot's timer or the Settings preview/approve buttons.
 */

import { buildAutopilotMessages, parsePlanText, validateAutopilotPlan } from "./brain";
import { callAutopilotModel, PROVIDER_PRESETS } from "./providers";
import { executeAutopilotPlan } from "./executor";
import { buildAutopilotSnapshot } from "./snapshot";
import { getAutopilotKey, useAutopilotStore } from "./store";
import type { AutopilotPlan, AutopilotSnapshot, TurnActionResult, TurnLog } from "./types";

/** react-query keys to invalidate after autopilot actions (MarketActionButton parity). */
export const AUTOPILOT_INVALIDATE_KEYS = [
  "credits",
  "ownership",
  "ownership-limit",
  "missions",
  "players",
  "leaderboard",
] as const;

export function planDigest(plan: AutopilotPlan): string {
  if (plan.actions.length === 0) return plan.note ?? "—";
  return plan.actions
    .map((a) => {
      const id = a.targetId ?? a.ownershipId ?? "";
      return `${a.verb}#${id}`;
    })
    .join(", ");
}

export function summarizeTurn(executed: TurnActionResult[]): string {
  const ok = executed.filter((r) => r.ok).length;
  const failed = executed.length - ok;
  const parts = [`${ok} ok`];
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(", ");
}

interface TurnCallbacks {
  /** Runs after each executed action (invalidation, live UI). */
  onAction?: (result: TurnActionResult) => void;
  /** Aborts a running turn when true. */
  shouldStop?: () => boolean;
  onSound?: (sound: "reward" | "error" | "message") => void;
}

interface RunTurnOptions extends TurnCallbacks {
  username: string;
  /** Execute mode override: run the given already-validated plan (approval). */
  approvedPlan?: AutopilotPlan;
}

/**
 * One full turn. Returns the TurnLog (also pushed to the store log).
 * Never throws — all failures land in the log.
 */
export async function runAutopilotTurn(opts: RunTurnOptions): Promise<TurnLog> {
  const store = useAutopilotStore.getState();
  const config = store.config;
  const key = getAutopilotKey();

  const turn = async (log: TurnLog) => {
    useAutopilotStore.getState().pushTurnLog(log);
    return log;
  };

  if (!key && config.provider !== "builtin") {
    useAutopilotStore.getState().setLastError("no-key");
    return turn({ at: Date.now(), mode: config.mode, executed: [], plannedCount: 0, dropped: 0, spentEst: 0, error: "no-key" });
  }

  useAutopilotStore.getState().setRunning(true);
  try {
    // 1) Snapshot (fresh reads of the same endpoints the UI polls).
    let snapshot: AutopilotSnapshot;
    try {
      snapshot = await buildAutopilotSnapshot(opts.username, config);
    } catch (err) {
      useAutopilotStore.getState().setLastError("snapshot");
      opts.onSound?.("error");
      return turn({
        at: Date.now(),
        mode: config.mode,
        executed: [],
        plannedCount: 0,
        dropped: 0,
        spentEst: 0,
        error: `snapshot: ${err instanceof Error ? err.message : "failed"}`,
      });
    }

    // 2) Approved plan from copilot mode skips the LLM call.
    let plan: AutopilotPlan;
    if (opts.approvedPlan) {
      plan = opts.approvedPlan;
    } else {
      const memory = useAutopilotStore.getState().log.map((l) => ({
        at: l.at,
        summary: `${new Date(l.at).toISOString().slice(11, 16)} ${l.mode}: ${summarizeTurn(l.executed)}${l.note ? ` — ${l.note}` : ""}`,
      }));
      const messages = buildAutopilotMessages(snapshot, memory);
      const res = await callAutopilotModel({
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: key,
        system: messages.system,
        user: messages.user,
        snapshot,
        memory,
      });
      if (res.usage) useAutopilotStore.getState().addUsage(res.usage.in, res.usage.out);
      if (!res.ok) {
        useAutopilotStore.getState().setLastError(res.error ?? "model");
        opts.onSound?.("error");
        return turn({
          at: Date.now(),
          mode: config.mode,
          executed: [],
          plannedCount: 0,
          dropped: 0,
          spentEst: 0,
          error: `model: ${res.error ?? "failed"}`,
        });
      }
      plan = validateAutopilotPlan(parsePlanText(res.content ?? ""), snapshot, config.verbs);
    }

    // 3) Copilot mode: park the plan for approval instead of executing.
    if (config.mode === "copilot" && !opts.approvedPlan) {
      if (plan.actions.length > 0) {
        useAutopilotStore.getState().setAwaiting({ plan, createdAt: Date.now(), digest: planDigest(plan) });
        opts.onSound?.("message");
      }
      return turn({
        at: Date.now(),
        mode: "copilot",
        executed: [],
        plannedCount: plan.actions.length,
        dropped: plan.dropped,
        spentEst: plan.actions.reduce((s, a) => s + a.estCost, 0),
        note: plan.note,
      });
    }

    // 4) Execute (paced, whitelisted, stop-safe).
    const outcome = await executeAutopilotPlan(plan, {
      onAction: (result) => opts.onAction?.(result),
      shouldStop: opts.shouldStop,
    });
    const anyOk = outcome.results.some((r) => r.ok);
    if (outcome.stopped === "auth") useAutopilotStore.getState().setArmed(false);
    opts.onSound?.(anyOk ? "reward" : outcome.results.length > 0 ? "error" : "message");

    return turn({
      at: Date.now(),
      mode: "execute",
      executed: outcome.results,
      plannedCount: plan.actions.length,
      dropped: plan.dropped,
      spentEst: plan.actions.reduce((s, a) => s + a.estCost, 0),
      note: plan.note,
      stopped: outcome.stopped,
    });
  } finally {
    useAutopilotStore.getState().setRunning(false);
  }
}

/** Settings "Preview next turn": full turn up to the validated plan, NO execution. */
export async function previewAutopilotTurn(username: string): Promise<{ plan: AutopilotPlan; error?: string }> {
  const store = useAutopilotStore.getState();
  const config = store.config;
  const key = getAutopilotKey();
  if (!key && config.provider !== "builtin") return { plan: { actions: [], dropped: 0, source: "empty" }, error: "no-key" };

  try {
    const snapshot = await buildAutopilotSnapshot(username, config);
    const memory = store.log.slice(0, 3).map((l) => ({ at: l.at, summary: summarizeTurn(l.executed) }));
    const messages = buildAutopilotMessages(snapshot, memory);
    const res = await callAutopilotModel({
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: key,
      system: messages.system,
      user: messages.user,
      snapshot,
      memory,
    });
    if (res.usage) useAutopilotStore.getState().addUsage(res.usage.in, res.usage.out);
    if (!res.ok) return { plan: { actions: [], dropped: 0, source: "empty" }, error: res.error };
    const plan = validateAutopilotPlan(parsePlanText(res.content ?? ""), snapshot, config.verbs);
    return { plan };
  } catch (err) {
    return { plan: { actions: [], dropped: 0, source: "empty" }, error: err instanceof Error ? err.message : "failed" };
  }
}

/** Approve a copilot-parked plan (chip popover / settings). */
export async function approveAwaitingPlan(username: string, callbacks: TurnCallbacks): Promise<TurnLog | null> {
  const awaiting = useAutopilotStore.getState().awaiting;
  if (!awaiting) return null;
  useAutopilotStore.getState().setAwaiting(null);
  return runAutopilotTurn({ username, approvedPlan: awaiting.plan, ...callbacks });
}

/** Resolve the effective model name (preset default when blank). */
export function effectiveModelName(): string {
  const { config } = useAutopilotStore.getState();
  return config.model || PROVIDER_PRESETS[config.provider].defaultModel || "(set a model)";
}
