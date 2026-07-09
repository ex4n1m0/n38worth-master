import { db } from "@/db";
import { users, gameSettings, gameHistory, ownership } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { ensureAgent } from "@/lib/agent/seed";
import { buildStrategy } from "@/lib/agent/strategy";
import { decideAction } from "@/lib/agent/llm";
import { buyPlayerCore } from "@/lib/purchaseCore";
import { sellComboCore } from "@/lib/comboCore";
import { countOnlineHumans } from "@/lib/random-player";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { capPlayerValue, MAX_CREDITS_SQL } from "@/lib/safeguards";

const DAY_KEY = "agent_day"; // YYYYMMDD
const DAY_SPENT_KEY = "agent_day_spent"; // credits spent today
const LAST_PLAY_KEY = "agent_last_play_at"; // epoch seconds of the Agent's last play turn

// The Agent only plays (buys/sells/pumps) once every 15 minutes, even though the
// cron runs every minute (so it can chat very frequently).
const PLAY_INTERVAL_SECONDS = 15 * 60;

// Pump tuning — mirrors pumpPlayer (100% cost, value x2, +10 min block, 12h cap).
const PUMP_BLOCK_MS = 10 * 60 * 1000;
const PUMP_MAX_BLOCK_MS = 12 * 60 * 60 * 1000;
const MAX_PUMPS_PER_TURN = 2;

/**
 * Once per play turn, the Agent pumps the 1-2 most valuable cards it owns —
 * favouring cards that own other players (a "team"), then high photo scores,
 * then raw value. Pumping costs 100% of the card's value, doubles it, pays that
 * card, and extends its sell block. Returns total credits spent.
 */
async function pumpValuableOwnedCards(agentId: number): Promise<AgentMove[]> {
  const moves: AgentMove[] = [];
  try {
    const [agent] = await db
      .select({ credits: users.credits, username: users.username })
      .from(users)
      .where(eq(users.id, agentId));
    if (!agent) return moves;

    // The Agent's owned cards, ranked by "value the Agent cares about":
    // owns-a-team first, then best photo, then highest value. Goddesses are
    // skipped (their value is pinned).
    const owned = await db
      .select({
        ownershipId: ownership.id,
        ownedId: ownership.ownedId,
        username: users.username,
        playerValue: users.playerValue,
        photoScore: users.photoScore,
        credits: users.credits,
        blockSellUntil: ownership.blockSellUntil,
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o2 WHERE o2.owner_id = ${users.id})`.as("owned_count"),
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(eq(ownership.ownerId, agentId))
      .orderBy(
        desc(sql`(SELECT COUNT(*) FROM ownership o2 WHERE o2.owner_id = ${users.id})`),
        desc(users.photoScore),
        desc(users.playerValue)
      )
      .limit(20);

    let remainingCredits = Number(agent.credits);
    let pumps = 0;

    for (const card of owned) {
      if (pumps >= MAX_PUMPS_PER_TURN) break;
      if (GODDESS_USERNAMES.includes(card.username)) continue;

      const cost = Math.max(1, Math.round(Number(card.playerValue)));
      if (cost > remainingCredits) continue;

      // Skip cards already at the 12h block cap.
      const now = Date.now();
      const currentEnd = card.blockSellUntil ? new Date(card.blockSellUntil).getTime() : 0;
      if (Math.max(0, currentEnd - now) >= PUMP_MAX_BLOCK_MS) continue;

      const newValue = capPlayerValue(Math.round(Number(card.playerValue) * 2));
      const newEnd = new Date(Math.max(now, currentEnd) + PUMP_BLOCK_MS);

      // Deduct from the Agent, bump + pay the pumped card, extend its block.
      await db.update(users).set({ credits: sql`GREATEST(credits - ${cost}, 0)`, updatedAt: new Date() }).where(eq(users.id, agentId));
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${cost}, ${sql.raw(MAX_CREDITS_SQL)})`, playerValue: newValue, updatedAt: new Date() })
        .where(eq(users.id, card.ownedId));
      await db
        .update(ownership)
        .set({ blockSellUntil: newEnd, blockSellBy: agent.username })
        .where(eq(ownership.id, card.ownershipId));

      try {
        await db.insert(gameHistory).values({
          eventType: "pump",
          actorId: agentId,
          targetId: card.ownedId,
          targetUsername: card.username,
          details: JSON.stringify({ amount: cost, newValue, ownedCount: Number(card.ownedCount), photoScore: card.photoScore, by: "agent" }),
        });
      } catch { /* audit best-effort */ }

      remainingCredits -= cost;
      pumps++;
      moves.push({
        action: "PUMP",
        source: "heuristic",
        reason: `pumped ${card.username} (team=${Number(card.ownedCount)}, score=${card.photoScore})`,
        success: true,
        spent: cost,
        detail: { targetId: card.ownedId, newValue },
      });
    }
  } catch (e) {
    console.error("Agent pump error:", e);
  }
  return moves;
}

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

  // Play at most once every 15 minutes. The cron runs every minute (so the Agent
  // can chat often), but actual gameplay is rate-limited here via a persistent
  // timestamp so it survives cold serverless instances.
  const nowSec = Math.floor(Date.now() / 1000);
  const lastPlay = (await getSetting(LAST_PLAY_KEY)) ?? 0;
  if (nowSec - lastPlay < PLAY_INTERVAL_SECONDS) {
    return { ran: false, skipped: "play cooldown (15 min)" };
  }
  await setSetting(LAST_PLAY_KEY, nowSec);

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

  // Once per hourly turn, pump the Agent's most valuable owned cards.
  const pumpMoves = await pumpValuableOwnedCards(agentId);
  moves.push(...pumpMoves);

  return { ran: moves.some((m) => m.action !== "WAIT"), moves };
}
