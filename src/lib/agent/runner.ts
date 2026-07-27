import { db } from "@/db";
import { users, gameSettings, gameHistory, ownership } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { buildStrategy } from "@/lib/agent/strategy";
import { heuristicDecision } from "@/lib/agent/llm";
import { buyPlayerCore, breakPartnershipCore, blockSellCore } from "@/lib/purchaseCore";
import { sellComboCore } from "@/lib/comboCore";
import { countOnlineHumans, getTopHumanOwnedCount } from "@/lib/random-player";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { capPlayerValue, MAX_CREDITS_SQL } from "@/lib/safeguards";
import { getProfessionPerks } from "@/lib/professionPerks";

const DAY_KEY = "agent_day"; // YYYYMMDD
const DAY_SPENT_KEY = "agent_day_spent"; // credits spent today
// Per-agent last-play timestamp (epoch seconds). Each goddess is gated
// independently so the 6-player roster distributes evenly.
const LAST_PLAY_KEY = "agent_last_play_at";

function agentSettingKey(base: string, agentId: number): string {
  return `${base}_${agentId}`;
}

// ── Per-agent play intervals (mode-dependent) ──
// ACTIVE: at least one real human is online. Each goddess may play every
//   6 min, keeping them ever-present without overwhelming the DB.
// IDLE: no humans online. Each goddess may play once per hour so the world
//   stays alive without burning credits or LLM tokens in an empty room.
const ACTIVE_PLAY_INTERVAL_SECONDS = 6 * 60;   // 6 min between turns per agent
const IDLE_PLAY_INTERVAL_SECONDS = 60 * 60;     // 60 min between turns per agent

// The Agent stops buying once it owns this many more players than the top human.
// If all humans have 0 players, the Agent caps at this number. This keeps the
// Agent competitive without letting it run away from real players.
const AGENT_OWNED_CAP_AHEAD = 50;

// Pump tuning — mirrors pumpPlayer (100% cost, value x2, +10 min block, 12h cap).
const PUMP_BLOCK_MS = 10 * 60 * 1000;
const PUMP_MAX_BLOCK_MS = 12 * 60 * 60 * 1000;
const MAX_PUMPS_PER_TURN = 5; // increased from 2 — pump aggressively during burst

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
    const perks = await getProfessionPerks(agentId);
    const pumpCostMultiplier = perks.has("Scrap Alchemist") ? 0.9 : 1;

    for (const card of owned) {
      if (pumps >= MAX_PUMPS_PER_TURN) break;
      if (GODDESS_USERNAMES.includes(card.username)) continue;

      const cost = Math.max(1, Math.round(Number(card.playerValue) * pumpCostMultiplier));
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
 * Runs an AI player's turn: up to `maxActions` moves (buy / sell-combo) per call.
 *
 * Play cadence is per-agent and mode-dependent:
 *   - ACTIVE (humans online): 6-min interval between turns.
 *   - IDLE (no humans): 60-min interval — keeps the world alive without burning
 *     credits in an empty room.
 *
 * The kill switch (AGENT_ENABLED) and an OPTIONAL daily spend cap (disabled by
 * default — set AGENT_DAILY_SPEND_CAP > 0 to re-enable) are enforced here. Every
 * executed action is independently re-validated by the action cores
 * (buyPlayerCore / sellComboCore). Each move re-reads game state so the turn
 * reacts to its own purchases.
 */
export async function runAgentTurn(
  agentId: number,
  opts: { maxActions?: number } = {}
): Promise<AgentRunResult> {
  if ((process.env.AGENT_ENABLED ?? "").trim() !== "true") {
    return { ran: false, skipped: "disabled" };
  }

  // ── Mode-dependent play gating ──
  // ACTIVE (humans online): each goddess may play every 6 min.
  // IDLE (no humans): each goddess may play once per hour so the world stays
  //   alive (cards still get hired/pumped) without burning credits in an empty room.
  const onlineHumans = await countOnlineHumans();
  const isActive = onlineHumans > 0;
  const playInterval = isActive ? ACTIVE_PLAY_INTERVAL_SECONDS : IDLE_PLAY_INTERVAL_SECONDS;

  const nowSec = Math.floor(Date.now() / 1000);
  const lastPlayKey = agentSettingKey(LAST_PLAY_KEY, agentId);
  const lastPlay = (await getSetting(lastPlayKey)) ?? 0;
  if (nowSec - lastPlay < playInterval) {
    return { ran: false, skipped: `${isActive ? "active" : "idle"} cooldown (${playInterval / 60} min)` };
  }
  await setSetting(lastPlayKey, nowSec);

  // Allow many actions per tick to buy/steal as much as possible.
  const maxActions = Math.max(1, Math.floor(opts.maxActions ?? 8));

  // Optional daily spend cap. Unset or <= 0 means UNLIMITED.
  const rawCap = process.env.AGENT_DAILY_SPEND_CAP;
  const dailySpendCap = rawCap ? Number(rawCap) : 0;
  const capEnabled = Number.isFinite(dailySpendCap) && dailySpendCap > 0;

  const now = new Date();

  // Spend-cap bookkeeping (only when the cap is enabled).
  const dayKey = agentSettingKey(DAY_KEY, agentId);
  const daySpentKey = agentSettingKey(DAY_SPENT_KEY, agentId);
  let spentToday = 0;
  if (capEnabled) {
    const today = todayInt(now);
    const storedDay = await getSetting(dayKey);
    if (storedDay !== today) {
      await setSetting(dayKey, today);
      await setSetting(daySpentKey, 0);
    } else {
      spentToday = (await getSetting(daySpentKey)) ?? 0;
    }
  }

  // Mark the Agent as recently online whenever it takes a turn.
  await db.update(users).set({ lastOnlineAt: now }).where(eq(users.id, agentId));

  const moves: AgentMove[] = [];

  // Check how far ahead the Agent is vs the top human. If the Agent already owns
  // 50+ more players than the best human, skip buying (but still allow breaks,
  // combos, pumps, and block-sells). This prevents the Agent from snowballing
  // out of reach when humans aren't buying as fast.
  const topHumanOwned = await getTopHumanOwnedCount();
  const [agentOwnedRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(ownership)
    .where(eq(ownership.ownerId, agentId));
  let agentOwned = Number(agentOwnedRow?.count ?? 0);
  const buyCapReached = () => agentOwned >= topHumanOwned + AGENT_OWNED_CAP_AHEAD;

  for (let i = 0; i < maxActions; i++) {
    if (capEnabled && spentToday >= dailySpendCap) {
      moves.push({ action: "WAIT", source: "heuristic", reason: "daily spend cap reached" });
      break;
    }

    const strategy = await buildStrategy(agentId);
    // During aggressive phase, skip the LLM and use the fast aggressive
    // heuristic directly — no network calls, maximum speed for burst buying.
    const { decision, source } = { decision: heuristicDecision(strategy), source: "heuristic" as const };

    if (decision.action === "WAIT") {
      moves.push({ action: "WAIT", source, reason: decision.reason });
      break; // nothing useful to do this tick
    }

    let detail: unknown;
    let spent = 0;
    let success = false;

    if (decision.action === "BUY") {
      if (buyCapReached()) {
        moves.push({ action: "WAIT", source, reason: `owned cap reached (${agentOwned} vs top human ${topHumanOwned}, cap +${AGENT_OWNED_CAP_AHEAD})` });
        break;
      }
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
        if (success) agentOwned++;
        if (success && typeof result.cost === "number") spent = result.cost;
      }
    } else if (decision.action === "BREAK") {
      if (buyCapReached()) {
        moves.push({ action: "WAIT", source, reason: `owned cap reached — skip break` });
        break;
      }
      // Break a sell block on a target card to steal it. The break cost includes
      // the break fee + the hire cost. Validated against breakCandidates.
      const allowedTarget = strategy.breakCandidates.some((c) => c.targetId === decision.targetId);
      if (!allowedTarget) {
        detail = { error: "blocked: target not in break candidates" };
        success = false;
      } else {
        const result = await breakPartnershipCore(agentId, decision.targetId);
        detail = result;
        success = !!result.success;
        if (success) agentOwned++;
        if (success && typeof result.totalCost === "number") spent = result.totalCost;
      }
    } else if (decision.action === "SELL_COMBO") {
      const result = await sellComboCore(agentId, decision.playerIds);
      detail = result;
      success = !!(result as { success?: boolean }).success;
      if (success) agentOwned = Math.max(0, agentOwned - decision.playerIds.length);
    }

    if (spent > 0) {
      spentToday += spent;
      if (capEnabled) {
        await setSetting(daySpentKey, Math.min(spentToday, 2_000_000_000));
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

  // Once per play turn, pump the Agent's most valuable owned cards.
  const pumpMoves = await pumpValuableOwnedCards(agentId);
  moves.push(...pumpMoves);

  // Protect valuable unblocked owned cards with sell blocks. The Agent
  // block-sells its 2 most valuable unblocked non-goddess cards per turn,
  // spending up to 50% of its remaining credits on protection.
  const blockMoves = await blockSellValuableCards(agentId);
  moves.push(...blockMoves);

  return { ran: moves.some((m) => m.action !== "WAIT"), moves };
}

const MAX_BLOCKS_PER_TURN = 5; // increased from 2 — protect aggressively during burst

/**
 * Protects the Agent's most valuable unblocked owned cards by extending their
 * sell blocks. Costs 100% of the card's value per hour but bumps the card's
 * value by 10% and pays 90% to the card. Only blocks cards that are:
 *   - Not goddesses (value is pinned)
 *   - Not already blocked
 *   - Affordable (cost <= 50% of remaining credits, to keep cash for buys)
 */
async function blockSellValuableCards(agentId: number): Promise<AgentMove[]> {
  const moves: AgentMove[] = [];
  try {
    const [agent] = await db
      .select({ credits: users.credits, username: users.username })
      .from(users)
      .where(eq(users.id, agentId));
    if (!agent) return moves;

    // Find unblocked owned cards, sorted by value descending.
    const unblocked = await db
      .select({
        ownershipId: ownership.id,
        ownedId: ownership.ownedId,
        username: users.username,
        playerValue: users.playerValue,
        blockSellUntil: ownership.blockSellUntil,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(eq(ownership.ownerId, agentId))
      .orderBy(desc(users.playerValue))
      .limit(20);

    const now = Date.now();
    const remainingCredits = Number(agent.credits);
    // Spend at most 50% of credits on block-sells (keep the rest for buys).
    const blockBudget = remainingCredits * 0.5;
    let blocks = 0;
    let blockSpent = 0;

    for (const card of unblocked) {
      if (blocks >= MAX_BLOCKS_PER_TURN) break;
      if (GODDESS_USERNAMES.includes(card.username)) continue;

      // Skip cards that already have an active block.
      const currentEnd = card.blockSellUntil ? new Date(card.blockSellUntil).getTime() : 0;
      if (currentEnd > now) continue;

      const cost = Math.max(1, Math.round(Number(card.playerValue)));
      if (cost > blockBudget - blockSpent) continue;

      const result = await blockSellCore(agentId, card.ownershipId);
      if (result.success) {
        blockSpent += cost;
        blocks++;
        moves.push({
          action: "BLOCK_SELL",
          source: "heuristic",
          reason: `blocked ${card.username} (value=${Number(card.playerValue)})`,
          success: true,
          spent: cost,
          detail: { targetId: card.ownedId, expiresAt: result.expiresAt },
        });
      }
    }
  } catch (e) {
    console.error("Agent block-sell error:", e);
  }
  return moves;
}
