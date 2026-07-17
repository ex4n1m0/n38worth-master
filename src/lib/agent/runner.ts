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
const LAST_PLAY_KEY = "agent_last_play_at"; // epoch seconds of the AGI's last play turn
const CYCLE_START_KEY = "agent_cycle_start"; // epoch seconds of the current 15-min cycle

function agentSettingKey(base: string, agentId: number): string {
  return `${base}_${agentId}`;
}

// ── Aggressive cycle: 5 minutes ON, 10 minutes OFF ──
// The Agent plays aggressively (buys/steals/pumps as much as possible) for 5
// minutes, then rests for 10 minutes, then repeats. This makes it a bursty,
// aggressive competitor rather than a slow drip.
const AGGRESSIVE_DURATION_SECONDS = 5 * 60;   // 5 min of aggressive play
const REST_DURATION_SECONDS = 10 * 60;        // 10 min of rest
const CYCLE_DURATION_SECONDS = AGGRESSIVE_DURATION_SECONDS + REST_DURATION_SECONDS; // 15 min
// During aggressive phase, play every tick (cron runs every minute).
const AGGRESSIVE_PLAY_INTERVAL_SECONDS = 60;  // 1 min between actions during burst

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
  agentId: number,
  opts: { maxActions?: number } = {}
): Promise<AgentRunResult> {
  if ((process.env.AGENT_ENABLED ?? "").trim() !== "true") {
    return { ran: false, skipped: "disabled" };
  }

  // Hard gate: only play when at least one real human is online. The Agent now
  // plays even when multiple humans are present — it's a competitive player that
  // participates in the market alongside everyone else.
  // (countOnlineHumans excludes NPCs and the Agent itself.)
  //   - 0 humans  → empty room, never play.
  //   - 1+ humans → play normally (compete with real players).
  const onlineHumans = await countOnlineHumans();
  if (onlineHumans <= 0) {
    return { ran: false, skipped: "no humans online" };
  }

  // ── Aggressive cycle: 5 min ON / 10 min OFF ──
  // Determine where we are in the 15-minute cycle.
  const nowSec = Math.floor(Date.now() / 1000);
  // The roster shares one 5-on/10-off cycle. The cron rotates the active AGI,
  // so five roster members act in each burst and the starting index shifts on
  // the next cycle, giving all six equal turns over time.
  const dayKey = agentSettingKey(DAY_KEY, agentId);
  const daySpentKey = agentSettingKey(DAY_SPENT_KEY, agentId);
  let cycleStart = (await getSetting(CYCLE_START_KEY)) ?? 0;
  // Initialize or rotate the shared cycle if the current one has expired.
  const isNewCycle = cycleStart === 0 || nowSec - cycleStart >= CYCLE_DURATION_SECONDS;
  if (isNewCycle) {
    cycleStart = nowSec;
    await setSetting(CYCLE_START_KEY, cycleStart);
  }
  const elapsedInCycle = nowSec - cycleStart;
  const isAggressivePhase = elapsedInCycle < AGGRESSIVE_DURATION_SECONDS;

  if (!isAggressivePhase) {
    return { ran: false, skipped: `rest phase (${Math.floor((REST_DURATION_SECONDS - (elapsedInCycle - AGGRESSIVE_DURATION_SECONDS)) / 60)} min remaining)` };
  }

  // During aggressive phase, play every ~1 minute (cron runs every minute).
  const lastPlay = (await getSetting(LAST_PLAY_KEY)) ?? 0;
  if (nowSec - lastPlay < AGGRESSIVE_PLAY_INTERVAL_SECONDS) {
    return { ran: false, skipped: "aggressive cooldown (1 min)" };
  }
  await setSetting(LAST_PLAY_KEY, nowSec);

  // During aggressive phase, allow many actions per tick to buy/steal as much
  // as possible. The caller may override, but defaults are high for aggression.
  const maxActions = Math.max(1, Math.floor(opts.maxActions ?? 8));

  // Optional daily spend cap. Unset or <= 0 means UNLIMITED.
  const rawCap = process.env.AGENT_DAILY_SPEND_CAP;
  const dailySpendCap = rawCap ? Number(rawCap) : 0;
  const capEnabled = Number.isFinite(dailySpendCap) && dailySpendCap > 0;

  const now = new Date();

  // Refill each AGI once when she first participates in a new shared cycle.
  const refillCycleKey = agentSettingKey("agent_last_refill_cycle", agentId);
  const lastRefillCycle = (await getSetting(refillCycleKey)) ?? 0;
  if (lastRefillCycle !== cycleStart) {
    const refillAmount = Number(process.env.AGENT_REFILL_CREDITS ?? 100000);
    await db.update(users)
      .set({ credits: sql`LEAST(credits + ${refillAmount}, ${sql.raw(MAX_CREDITS_SQL)})`, updatedAt: now })
      .where(eq(users.id, agentId));
    await setSetting(refillCycleKey, cycleStart);
    console.log(`AGI ${agentId} refilled with ${refillAmount} credits for cycle ${cycleStart}`);
  }

  // Spend-cap bookkeeping (only when the cap is enabled).
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
