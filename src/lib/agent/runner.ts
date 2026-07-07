import { db } from "@/db";
import { users, gameSettings, gameHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureAgent } from "@/lib/agent/seed";
import { buildStrategy } from "@/lib/agent/strategy";
import { decideAction } from "@/lib/agent/llm";
import { buyPlayerCore } from "@/lib/purchaseCore";
import { sellComboCore } from "@/lib/comboCore";
import { buyHireSlotsCore, createNpcCore } from "@/lib/agent/actions";
import { countOnlineHumans } from "@/lib/random-player";

const DAY_KEY = "agent_day"; // YYYYMMDD
const DAY_SPENT_KEY = "agent_day_spent"; // credits spent today

async function getSetting(key: string): Promise<number | null> {
  const [row] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, key))
    .limit(1);
  return row ? row.value : null;
}

async function setSetting(key: string, value: number): Promise<void> {
  await db
    .insert(gameSettings)
    .values({ settingKey: key, settingValue: value })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: value, updatedAt: new Date() },
    });
}

function todayInt(d: Date): number {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

export interface AgentMove {
  action: string;
  source: "llm" | "heuristic";
  reason?: string;
  success?: boolean;
  spent?: number;
  detail?: unknown;
}

export interface AgentRunResult {
  ran: boolean;
  skipped?: string;
  moves?: AgentMove[];
}

/**
 * Runs an Agent turn: up to `maxActions` moves (buy / sell-combo) per call.
 *
 * Online-gating (only act when humans are present) is enforced HERE as well as
 * by the caller — the Agent must never play in an empty room. We also enforce
 * the kill switch and an OPTIONAL daily spend cap (disabled by default — set
 * AGENT_DAILY_SPEND_CAP > 0 to re-enable). Every executed action is
 * independently re-validated by the action cores (buyPlayerCore /
 * sellComboCore). Each move re-reads game state so the burst reacts to its own
 * purchases.
 */
export async function runAgentTurn(
  opts: { maxActions?: number } = {}
): Promise<AgentRunResult> {
  if ((process.env.AGENT_ENABLED ?? "").trim() !== "true") {
    return { ran: false, skipped: "disabled" };
  }

  // Hard gate: only play when exactly one real human is online. This mirrors the
  // cron-route check so the Agent can't act from anywhere else when it shouldn't.
  // (countOnlineHumans excludes NPCs and the Agent itself.)
  //   - 0 humans  → empty room, never play.
  //   - >1 humans → real players are around; the Agent stops playing (it still
  //                 chats via maybeAgentChat) so it doesn't compete/interfere.
  const onlineHumans = await countOnlineHumans();
  if (onlineHumans <= 0) {
    return { ran: false, skipped: "no humans online" };
  }
  if (onlineHumans > 1) {
    return { ran: false, skipped: "multiple humans online — chat only" };
  }

  const maxActions = Math.max(1, Math.floor(opts.maxActions ?? 1));

  // Optional daily spend cap. Unset or <= 0 means UNLIMITED.
  const rawCap = process.env.AGENT_DAILY_SPEND_CAP;
  const dailySpendCap = rawCap ? Number(rawCap) : 0;
  const capEnabled = Number.isFinite(dailySpendCap) && dailySpendCap > 0;

  const now = new Date();
  const agentId = await ensureAgent();

  // Spend-cap bookkeeping (only when the cap is enabled).
  let spentToday = 0;
  if (capEnabled) {
    const today = todayInt(now);
    const storedDay = await getSetting(DAY_KEY);
    if (storedDay !== today) {
      await setSetting(DAY_KEY, today);
      await setSetting(DAY_SPENT_KEY, 0);
    } else {
      spentToday = (await getSetting(DAY_SPENT_KEY)) ?? 0;
    }
  }

  // Mark the Agent as recently online whenever it takes a turn.
  await db.update(users).set({ lastOnlineAt: now }).where(eq(users.id, agentId));

  const moves: AgentMove[] = [];

  for (let i = 0; i < maxActions; i++) {
    if (capEnabled && spentToday >= dailySpendCap) {
      moves.push({ action: "WAIT", source: "heuristic", reason: "daily spend cap reached" });
      break;
    }

    const strategy = await buildStrategy(agentId);
    const { decision, source } = await decideAction(strategy);

    if (decision.action === "WAIT") {
      moves.push({ action: "WAIT", source, reason: decision.reason });
      break; // nothing useful to do this tick
    }

    let detail: unknown;
    let spent = 0;
    let success = false;

    if (decision.action === "BUY") {
      // Safety net: the Agent may NEVER buy goddesses or bonus cards. Those are
      // never included in buyCandidates/growthCandidates, so a legal BUY target
      // must be present in one of them. Reject anything else outright.
      const allowedTarget =
        strategy.buyCandidates.some((c) => c.targetId === decision.targetId) ||
        strategy.growthCandidates.some((c) => c.targetId === decision.targetId);
      if (!allowedTarget) {
        detail = { error: "blocked: Agent may not buy goddesses or bonus cards" };
        success = false;
      } else {
        const result = await buyPlayerCore(agentId, decision.targetId, 1);
        detail = result;
        success = !!result.success;
        if (success && typeof result.cost === "number") spent = result.cost;
      }
    } else if (decision.action === "SELL_COMBO") {
      const result = await sellComboCore(agentId, decision.playerIds);
      detail = result;
      success = !!(result as { success?: boolean }).success;
    } else if (decision.action === "BUY_SLOTS") {
      // Single-use "+10 Player Slots" card: raise the hire cap.
      const result = await buyHireSlotsCore(agentId);
      detail = result;
      success = !!result.success;
      if (success && typeof result.cost === "number") spent = result.cost;
    } else if (decision.action === "CREATE_NPC") {
      // Single-use "Create NPC" card: spawn a fresh ownerless target.
      const result = await createNpcCore(agentId);
      detail = result;
      success = !!result.success;
      if (success && typeof result.cost === "number") spent = result.cost;
    }

    if (spent > 0) {
      spentToday += spent;
      if (capEnabled) {
        await setSetting(DAY_SPENT_KEY, Math.min(spentToday, 2_000_000_000));
      }
    }

    // Audit row (cores also log purchase/sell_combo; this captures the decision).
    try {
      await db.insert(gameHistory).values({
        eventType: "agent_action",
        actorId: agentId,
        targetId: decision.action === "BUY" ? decision.targetId : agentId,
        details: JSON.stringify({ action: decision.action, source, reason: decision.reason, success, detail }),
      });
    } catch (e) {
      console.error("Agent action audit log failed:", e);
    }

    moves.push({ action: decision.action, source, reason: decision.reason, success, spent, detail });

    // Stop the burst if the move failed (avoid hammering a dead-end target).
    if (!success) break;
  }

  return { ran: moves.some((m) => m.action !== "WAIT"), moves };
}
