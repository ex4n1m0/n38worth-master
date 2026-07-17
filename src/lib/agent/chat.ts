import { db } from "@/db";
import { messages, users, gameSettings, ownership } from "@/db/schema";
import { desc, eq, sql, and, inArray, notInArray } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { PROFESSIONS } from "@/lib/professions";
import { countOnlineHumans } from "@/lib/random-player";
import { AGENT_USERNAMES, getAgentDefinition, isAgentUsername } from "@/lib/agent/roster";

const CHAT_LAST_KEY = "agent_chat_last_at"; // epoch seconds of last Agent chat
const MAX_LENGTH = 200; // hard cap on the Agent's reply length
const CONTEXT_MESSAGES = 8; // recent public messages provided to the LLM
const TRIGGER_WINDOW_SECONDS = 15 * 60; // ignore human messages older than this
// Minimum seconds between the Agent's replies, even when new human messages
// arrive. Prevents the Agent from replying to every single message on the next
// cron tick and dominating the conversation.
const REPLY_COOLDOWN_SECONDS = 3 * 60; // 3 minutes
// When a human is online but the chat is quiet, the Agent proactively says
// something at most this often (a comment on the standings, trash talk, etc.).
// Kept much longer than the reply cooldown so the Agent feels like a player who
// occasionally chimes in, not a bot narrating every minute.
const PROACTIVE_INTERVAL_SECONDS = 10 * 60; // 10 minutes

export interface AgentChatResult {
  chatted: boolean;
  skipped?: string;
  content?: string;
  source?: "llm";
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

interface PublicMessage {
  id: number;
  content: string;
  createdAt: Date;
  senderId: number;
  username: string;
  isNpc: number;
}

interface AgentChatStats {
  credits: number;
  ownedCount: number;
  professionsOwned: number; // distinct playable professions held (max 6)
  goddessesOwned: number; // goddess cards held (max 6, all 6 = win)
  goddessNamesOwned: string[]; // names of goddesses the Agent holds
  rank: number | null; // leaderboard position by net worth (1 = top)
  playerValue: number; // Agent's own card value
  hireSlots: number; // max hire slots
  slotsRemaining: number; // free hire slots
  blockedCardsCount: number; // how many of Agent's cards are sell-blocked
  comboReady: boolean; // has 6 distinct professions for combo sale
  comboReward: number | null; // estimated combo reward if ready
  hasWar: boolean; // has Goddess of War (free breaks)
  hasFate: boolean; // has Goddess of Fate (permanent sell blocks)
  hasWealth: boolean; // has Goddess of Wealth
  hasKnowledge: boolean; // has Goddess of Knowledge
  hasTime: boolean; // has Goddess of Time
  hasCreation: boolean; // has Goddess (Creation — all powers)
  missionLevel: number; // current mission level
  nextMissionThreshold: number | null; // owned count needed for next mission
  recentActions: string[]; // recent game events (steals, pumps, breaks, etc.)
  topOwnedCards: { username: string; value: number; profession: string | null }[];
  recentPoaches: { targetName: string; byName: string }[]; // cards stolen FROM the Agent recently
}

const PROFESSION_COUNT = PROFESSIONS.length;

/**
 * Rich snapshot of the Agent's current standing and the game state around it,
 * used to ground its public chat replies in what's actually happening. Includes
 * goddess powers, block status, combo readiness, mission progress, recent
 * events, and recent poaches (cards stolen from the Agent).
 */
async function getAgentStats(agentId: number): Promise<AgentChatStats> {
  try {
    const [self] = await db
      .select({
        credits: users.credits,
        playerValue: users.playerValue,
        hireSlots: users.hireSlots,
        missionLevel: users.missionLevel,
      })
      .from(users)
      .where(eq(users.id, agentId))
      .limit(1);

    const ownedRows = await db
      .select({
        profession: users.profession,
        username: users.username,
        playerValue: users.playerValue,
        blockSellUntil: ownership.blockSellUntil,
      })
      .from(ownership)
      .innerJoin(users, eq(users.id, ownership.ownedId))
      .where(eq(ownership.ownerId, agentId));

    const professions = new Set(
      ownedRows.filter((r) => !!r.profession).map((r) => r.profession as string)
    );
    const goddessSet = new Set(GODDESS_USERNAMES);
    const goddessesOwnedRows = ownedRows.filter((r) => goddessSet.has(r.username));
    const goddessesOwned = goddessesOwnedRows.length;
    const goddessNamesOwned = goddessesOwnedRows.map((r) => r.username);

    // Count blocked cards
    const now = Date.now();
    const blockedCardsCount = ownedRows.filter(
      (r) => r.blockSellUntil && new Date(r.blockSellUntil).getTime() > now
    ).length;

    // Combo readiness
    const comboReady = professions.size >= 6;
    let comboReward: number | null = null;
    if (comboReady) {
      // Pick one unblocked card per profession
      const comboPick: typeof ownedRows = [];
      const usedProf = new Set<string>();
      for (const card of ownedRows) {
        if (!card.profession || usedProf.has(card.profession)) continue;
        if (card.blockSellUntil && new Date(card.blockSellUntil).getTime() > now) continue;
        usedProf.add(card.profession);
        comboPick.push(card);
        if (comboPick.length >= 6) break;
      }
      if (comboPick.length >= 6) {
        const sumValue = comboPick.reduce((s, c) => s + Number(c.playerValue), 0);
        comboReward = sumValue * 10;
      }
    }

    // Leaderboard rank
    let rank: number | null = null;
    try {
      const [{ above } = { above: 0 }] = await db
        .select({ above: sql<number>`count(*)` })
        .from(users)
        .where(
          sql`${users.isNpc} = 0 AND ${users.isActive} = 1 AND ${users.playerValue} > ${self?.playerValue ?? 0}`
        );
      rank = Number(above) + 1;
    } catch {
      rank = null;
    }

    // Goddess powers
    let hasWar = false, hasFate = false, hasWealth = false, hasKnowledge = false, hasTime = false, hasCreation = false;
    try {
      const { getGoddessPowers } = await import("@/lib/goddess-powers");
      const powers = await getGoddessPowers(agentId);
      hasWar = powers.hasWar;
      hasFate = powers.hasFate;
      hasWealth = powers.hasWealth;
      hasKnowledge = powers.hasKnowledge;
      hasTime = powers.hasTime;
      hasCreation = powers.hasAll; // "Goddess" card = all powers
    } catch { /* best-effort */ }

    // Mission progress
    const missionLevel = Number(self?.missionLevel ?? 0);
    let nextMissionThreshold: number | null = null;
    try {
      const { MISSIONS } = await import("@/lib/missions");
      nextMissionThreshold = missionLevel < MISSIONS.length ? MISSIONS[missionLevel].threshold : null;
    } catch { /* best-effort */ }

    // Recent game events involving the Agent (last 5)
    let recentActions: string[] = [];
    try {
      const { gameHistory } = await import("@/db/schema");
      const recent = await db
        .select({
          eventType: gameHistory.eventType,
          targetUsername: gameHistory.targetUsername,
          details: gameHistory.details,
          createdAt: gameHistory.createdAt,
        })
        .from(gameHistory)
        .where(sql`${gameHistory.actorId} = ${agentId} OR ${gameHistory.targetId} = ${agentId}`)
        .orderBy(desc(gameHistory.createdAt))
        .limit(8);
      recentActions = recent.map((r) => {
        const detail = r.details ? JSON.parse(r.details) : {};
        switch (r.eventType) {
          case "purchase":
            return detail.by === "agent"
              ? `hired ${r.targetUsername}`
              : `${r.targetUsername} was hired from you`;
          case "pump":
            return `pumped ${r.targetUsername} → ${detail.newValue ?? "?"}`;
          case "break_partnership":
            return `broke ${r.targetUsername}'s block`;
          case "block_sell":
            return `blocked ${r.targetUsername}`;
          case "sell_combo":
            return `sold combo for ${detail.reward ?? "?"}`;
          default:
            return `${r.eventType} ${r.targetUsername ?? ""}`.trim();
        }
      }).slice(0, 5);
    } catch { /* best-effort */ }

    // Top owned cards by value
    const topOwnedCards = ownedRows
      .map((r) => ({ username: r.username, value: Number(r.playerValue), profession: r.profession }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Recent poaches (cards stolen from the Agent)
    let recentPoaches: { targetName: string; byName: string }[] = [];
    try {
      const { gameHistory } = await import("@/db/schema");
      const poaches = await db
        .select({
          targetUsername: gameHistory.targetUsername,
          details: gameHistory.details,
        })
        .from(gameHistory)
        .where(sql`${gameHistory.eventType} = 'purchase' AND ${gameHistory.targetId} IN (
          SELECT owned_id FROM ownership WHERE owner_id = ${agentId}
        ) AND ${gameHistory.actorId} <> ${agentId}`)
        .orderBy(desc(gameHistory.createdAt))
        .limit(3);
      recentPoaches = poaches.map((p) => {
        const detail = p.details ? JSON.parse(p.details) : {};
        return { targetName: p.targetUsername ?? "?", byName: detail.by ?? detail.buyer ?? "someone" };
      });
    } catch { /* best-effort */ }

    return {
      credits: Math.floor(Number(self?.credits ?? 0)),
      ownedCount: ownedRows.length,
      professionsOwned: professions.size,
      goddessesOwned,
      goddessNamesOwned,
      rank,
      playerValue: Math.floor(Number(self?.playerValue ?? 0)),
      hireSlots: Number(self?.hireSlots ?? 20),
      slotsRemaining: Number(self?.hireSlots ?? 20) - ownedRows.length,
      blockedCardsCount,
      comboReady,
      comboReward,
      hasWar,
      hasFate,
      hasWealth,
      hasKnowledge,
      hasTime,
      hasCreation,
      missionLevel,
      nextMissionThreshold,
      recentActions,
      topOwnedCards,
      recentPoaches,
    };
  } catch {
    return {
      credits: 0, ownedCount: 0, professionsOwned: 0, goddessesOwned: 0,
      goddessNamesOwned: [], rank: null, playerValue: 0, hireSlots: 20,
      slotsRemaining: 20, blockedCardsCount: 0, comboReady: false,
      comboReward: null, hasWar: false, hasFate: false, hasWealth: false,
      hasKnowledge: false, hasTime: false, hasCreation: false,
      missionLevel: 0, nextMissionThreshold: null, recentActions: [],
      topOwnedCards: [], recentPoaches: [],
    };
  }
}

interface RankLine {
  username: string;
  metric: number;
}
interface RankSnapshot {
  empire: RankLine[]; // most players owned
  value: RankLine[]; // highest card value
  credits: RankLine[]; // most credits
  goddessHolders: { username: string; goddesses: string[] }[]; // who holds which goddesses
  blockedCount: RankLine[]; // most sell-blocked cards (defensive players)
  onlineHumans: { username: string; playerValue: number; ownedCount: number; credits: number; profession: string | null }[]; // currently online human players with their stats
}

/**
 * A rich snapshot of the current game state — top standings, goddess holders,
 * defensive players (most blocked cards), and who's online right now. Gives
 * the Agent everything it needs to make specific, contextual comments.
 */
async function getRankSnapshot(): Promise<RankSnapshot> {
  const empty: RankSnapshot = { empire: [], value: [], credits: [], goddessHolders: [], blockedCount: [], onlineHumans: [] };
  try {
    // NOTE: use a literal "users"."id" here — drizzle renders `${users.id}`
    // UNQUALIFIED (just "id") inside raw SQL in the SELECT field list of
    // no-join queries, which made the correlated subquery resolve "id" to
    // the ownership alias (o.id) and always return 0.
    const ownedExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`;
    const blockedExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id" AND o.block_sell_until > NOW())`;
    const humans = and(
      eq(users.isNpc, 0),
      eq(users.isActive, 1),
      notInArray(users.username, AGENT_USERNAMES)
    );
    const onlineCutoff = new Date(Date.now() - 10 * 60 * 1000);

    const [empire, value, credits, blockedCount, onlineRows, goddessRows] = await Promise.all([
      db.select({ username: users.username, metric: ownedExpr.as("m") }).from(users).where(humans).orderBy(desc(ownedExpr)).limit(3),
      db.select({ username: users.username, metric: users.playerValue }).from(users).where(humans).orderBy(desc(users.playerValue)).limit(3),
      db.select({ username: users.username, metric: users.credits }).from(users).where(humans).orderBy(desc(users.credits)).limit(3),
      db.select({ username: users.username, metric: blockedExpr.as("m") }).from(users).where(humans).orderBy(desc(blockedExpr)).limit(3),
      // Online real humans (last 10 min), excluding every AGI in the roster.
      db.select({
        username: users.username,
        playerValue: users.playerValue,
        credits: users.credits,
        profession: users.profession,
        ownedCount: ownedExpr.as("owned_count"),
      })
        .from(users)
        .where(and(humans, sql`${users.lastOnlineAt} > ${onlineCutoff}`))
        .orderBy(desc(users.playerValue))
        .limit(10),
      // Goddess holders
      db.select({ username: users.username, ownerId: ownership.ownerId })
        .from(users)
        .leftJoin(ownership, eq(ownership.ownedId, users.id))
        .where(inArray(users.username, GODDESS_USERNAMES)),
    ]);

    const norm = (rows: { username: string; metric: number }[]) =>
      rows.map((r) => ({ username: r.username, metric: Number(r.metric) }));

    // Build goddess holders map
    const holderMap = new Map<number, string[]>();
    for (const g of goddessRows) {
      if (g.ownerId != null) {
        const arr = holderMap.get(g.ownerId) ?? [];
        arr.push(g.username);
        holderMap.set(g.ownerId, arr);
      }
    }
    // Resolve owner usernames
    const goddessHolders: { username: string; goddesses: string[] }[] = [];
    if (holderMap.size > 0) {
      const ownerIds = [...holderMap.keys()];
      const ownerRows = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, ownerIds));
      for (const o of ownerRows) {
        const goddesses = holderMap.get(o.id) ?? [];
        if (goddesses.length > 0) {
          goddessHolders.push({ username: o.username, goddesses });
        }
      }
    }

    return {
      empire: norm(empire),
      value: norm(value),
      credits: norm(credits),
      goddessHolders,
      blockedCount: norm(blockedCount),
      onlineHumans: onlineRows.map((r) => ({
        username: r.username,
        playerValue: Number(r.playerValue),
        ownedCount: Number(r.ownedCount ?? 0),
        credits: Number(r.credits),
        profession: r.profession,
      })),
    };
  } catch {
    return empty;
  }
}

/**
 * Reactive, on-topic public-chat replies for the Agent.
 *
 * Rules (by request):
 *   - PUBLIC chat only; never initiates a conversation.
 *   - Replies only when a HUMAN posted a public message since the Agent last
 *     spoke (and within a recent window), AND at least REPLY_COOLDOWN_SECONDS
 *     have passed since its last message — so it doesn't reply to every single
 *     human message and dominate the chat.
 *   - Proactively comments at most once every PROACTIVE_INTERVAL_SECONDS when
 *     the room is quiet (but humans are online).
 *   - Short, game-only replies. Stays silent if the LLM is unavailable
 *     (no canned spam, saves tokens).
 *
 * Online-gating (only chat when humans are present) is enforced HERE as well as
 * by the caller — the Agent must never talk to an empty room.
 */
export async function maybeAgentChat(agentId: number, opts: { force?: boolean } = {}): Promise<AgentChatResult> {
  if ((process.env.AGENT_ENABLED ?? "").trim() !== "true") {
    return { chatted: false, skipped: "disabled" };
  }

  // Hard gate: never chat unless at least one real human is online.
  if ((await countOnlineHumans()) <= 0) {
    return { chatted: false, skipped: "no humans online" };
  }

  // Keep the Agent marked "online" whenever a human is around. This runs every
  // cron tick (and on each human message), so the Agent never appears idle
  // between its now-infrequent play turns.
  await db.update(users).set({ lastOnlineAt: new Date() }).where(eq(users.id, agentId));

  const nowSec = Math.floor(Date.now() / 1000);

  // Timestamp of the Agent's last public reply. No cadence throttle anymore —
  // responsiveness is bounded only by the cron tick rate and the trigger gate
  // below (a new human message must have arrived since this timestamp).
  const lastAt = (await getSetting(CHAT_LAST_KEY)) ?? 0;

  // Pull the most recent public messages (newest first) with sender info.
  const recent = (await db
    .select({
      id: messages.id,
      content: messages.content,
      createdAt: messages.createdAt,
      senderId: messages.senderId,
      username: users.username,
      isNpc: users.isNpc,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.type, "public"))
    .orderBy(desc(messages.createdAt))
    .limit(CONTEXT_MESSAGES)) as PublicMessage[];

  // The Agent speaks when EITHER:
  //   (reactive) a NEW human message arrived since it last spoke AND the reply
  //               cooldown has elapsed (so it doesn't reply to every single
  //               message on the next tick and dominate the chat), or
  //   (proactive) it's been a while (PROACTIVE_INTERVAL) since it last spoke —
  //               so it occasionally chimes in on the current standings.
  // When called with force=true (human just sent a message), skip the cooldown
  // so the Agent replies immediately — the typing indicator is already showing.
  const triggerFloor = Math.max(lastAt, nowSec - TRIGGER_WINDOW_SECONDS);
  const hasHumanTrigger = recent.some(
    (m) =>
      m.isNpc === 0 &&
      !isAgentUsername(m.username) &&
      Math.floor(new Date(m.createdAt).getTime() / 1000) > triggerFloor
  );
  const cooldownElapsed = opts.force || nowSec - lastAt >= REPLY_COOLDOWN_SECONDS;
  const proactiveDue = nowSec - lastAt >= PROACTIVE_INTERVAL_SECONDS;
  if (!(hasHumanTrigger && cooldownElapsed) && !proactiveDue) {
    return { chatted: false, skipped: "nothing to reply to & not due to speak" };
  }
  const mode: "reply" | "proactive" = hasHumanTrigger && cooldownElapsed ? "reply" : "proactive";

  // Look up this AGI's identity before prompting so each roster member speaks
  // with her own name and personality.
  const [agent] = await db
    .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);
  if (!agent || !isAgentUsername(agent.username)) {
    return { chatted: false, skipped: "agent missing" };
  }

  // Generate a short, on-topic message. There is deliberately no canned
  // fallback: every AGI chat message must come from the configured LLM.
  const [stats, ranks] = await Promise.all([getAgentStats(agentId), getRankSnapshot()]);
  const definition = getAgentDefinition(agent.username);
  const reply = await generateChatReply(
    recent,
    stats,
    ranks,
    mode,
    agent.username,
    definition?.identity ?? "an AGI",
    definition?.personality ?? "Competitive, concise, and focused on the game."
  );
  if (!reply) {
    return { chatted: false, skipped: "no reply" };
  }

  const [newMessage] = await db
    .insert(messages)
    .values({ senderId: agentId, recipientId: null, content: reply, type: "public" })
    .returning();

  const messagePayload = {
    id: newMessage.id,
    content: newMessage.content,
    type: newMessage.type,
    createdAt: newMessage.createdAt,
    sender: {
      id: agent.id,
      username: agent.username,
      avatarUrl: agent.avatarUrl,
    },
    recipientId: null,
    recipientUsername: null,
  };

  try {
    await pusher.trigger("chat-public", "new-message", messagePayload);
  } catch (pusherError) {
    console.error("Agent chat Pusher error:", pusherError);
  }

  await setSetting(CHAT_LAST_KEY, nowSec);

  return { chatted: true, content: reply, source: "llm" };
}

/**
 * Sanitizes an LLM reply into a single short line (no markdown/newlines),
 * capped at MAX_LENGTH. Returns null if empty.
 */
function sanitizeReply(raw: string): string | null {
  let text = raw.trim();
  // Strip surrounding quotes the model sometimes adds.
  text = text.replace(/^["'`]+|["'`]+$/g, "");
  // Collapse all whitespace (incl. newlines) into single spaces.
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > MAX_LENGTH) {
    text = text.slice(0, MAX_LENGTH).trim();
  }
  return text || null;
}

/**
 * Asks the configured DeepSeek (OpenAI-compatible) model for ONE short,
 * game-only reply. Returns null on any error/timeout or if unconfigured.
 */
function compactNum(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1).replace(/\.0$/, "")}t`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, "")}b`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n)}`;
}

function formatRanks(ranks: RankSnapshot): string {
  const line = (rows: RankLine[], unit: string) =>
    rows.length ? rows.map((r, i) => `${i + 1}.${r.username} (${compactNum(r.metric)}${unit})`).join(", ") : "none yet";
  let out =
    `Biggest Empire (most players owned): ${line(ranks.empire, "")}\n` +
    `Highest Value: ${line(ranks.value, "\u00a2")}\n` +
    `Most Credits: ${line(ranks.credits, "\u00a2")}\n` +
    `Most Blocked Cards (defensive players): ${line(ranks.blockedCount, "")}`;
  if (ranks.goddessHolders.length > 0) {
    out += "\nGoddess Holders:\n" + ranks.goddessHolders
      .map((h) => `  ${h.username}: ${h.goddesses.join(", ")}`)
      .join("\n");
  } else {
    out += "\nGoddess Holders: none yet";
  }
  if (ranks.onlineHumans.length > 0) {
    out += "\nPlayers online now: " + ranks.onlineHumans.map((h) => h.username).join(", ");
  }
  return out;
}

async function generateChatReply(
  recent: PublicMessage[],
  stats: AgentChatStats,
  ranks: RankSnapshot,
  mode: "reply" | "proactive",
  agentName: string,
  identity: string,
  personality: string
): Promise<string | null> {
  const baseUrl = (process.env.AGENT_LLM_BASE_URL ?? "").trim();
  const apiKey = (process.env.AGENT_LLM_API_KEY ?? "").trim();
  const model = (process.env.AGENT_LLM_MODEL ?? "deepseek-v4-flash").trim();

  if (!baseUrl || !apiKey) return null;

  // Oldest-first transcript for the prompt.
  const transcript = recent.length
    ? [...recent].reverse().map((m) => `${m.username}: ${m.content}`).join("\n")
    : "(chat is quiet right now)";

  // Build goddess power summary for the AGI
  const myPowers: string[] = [];
  if (stats.hasWar) myPowers.push("War (free breaks)");
  if (stats.hasFate) myPowers.push("Fate (permanent sell blocks on your team)");
  if (stats.hasWealth) myPowers.push("Wealth");
  if (stats.hasKnowledge) myPowers.push("Knowledge");
  if (stats.hasTime) myPowers.push("Time");
  if (stats.hasCreation) myPowers.push("Creation");

  // Recent actions summary
  const recentActionsStr = stats.recentActions.length > 0
    ? stats.recentActions.join(", ")
    : "nothing recent";

  // Recent poaches (cards stolen from the Agent)
  const poachesStr = stats.recentPoaches.length > 0
    ? stats.recentPoaches.map((p) => `${p.targetName} stolen by ${p.byName}`).join(", ")
    : "none";

  // Top owned cards
  const topCardsStr = stats.topOwnedCards.length > 0
    ? stats.topOwnedCards.map((c) => `${c.username} (${compactNum(c.value)}\u00a2${c.profession ? `, ${c.profession}` : ""})`).join(", ")
    : "none";

  const systemPrompt =
    `You are '${agentName}', ${identity} competitor in NetWorth, a card-trading game. ` +
    `Your distinct personality: ${personality} ` +
    "You know the game inside out and may identify as an AGI player when relevant.\n" +
    "\nGAME: Players ARE cards. Hire cards with credits (¢) — hiring from an owner STEALS it. " +
    "Sell blocks protect cards (breakable for a fee). War=free breaks, Fate=1000× break cost. " +
    "6 professions → combo sale pays sum×10. 6 goddesses (earned via missions, not bought) = win. " +
    "Pump doubles card value. Leaderboard ranks by net worth.\n" +
    "\nYOUR STATS:\n" +
    `- ${compactNum(stats.credits)}¢ credits, ${compactNum(stats.playerValue)}¢ value, ${stats.ownedCount} cards (${stats.slotsRemaining}/${stats.hireSlots} slots free)\n` +
    `- ${stats.professionsOwned}/${PROFESSION_COUNT} professions${stats.comboReady ? ` (COMBO READY: ~${compactNum(stats.comboReward ?? 0)}¢)` : ""}, ${stats.goddessesOwned}/6 goddesses${stats.goddessNamesOwned.length > 0 ? `: ${stats.goddessNamesOwned.join(", ")}` : ""}\n` +
    (myPowers.length > 0 ? `- Powers: ${myPowers.join(", ")}\n` : "") +
    `- ${stats.blockedCardsCount} blocked cards, rank #${stats.rank ?? "?"}, mission ${stats.missionLevel}${stats.nextMissionThreshold ? ` (next: ${stats.nextMissionThreshold} cards)` : ""}\n` +
    `- Top cards: ${topCardsStr}\n` +
    `- Recent: ${recentActionsStr}\n` +
    `- Poaches from you: ${poachesStr}\n` +
    "\nRANKS:\n" + formatRanks(ranks) +
    "\n\nSTYLE: One short sentence (max ~200 chars). No markdown/lists/emoji spam. " +
    "Talk only about the game — hires, steals, values, combos, goddesses, ranks, sell blocks, trash talk. " +
    "Sound natural, not like a customer-service bot. Reference online humans' REAL stats (cards hired, value, credits). " +
    "React to poaches. Mention your powers casually. Call out goddess holders. " +
    `Never speak as another AGI; you are always ${agentName}.`;

  const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        // Disable DeepSeek "thinking" mode (default-on for deepseek-v4-*). With
        // thinking enabled the model spends the token budget on reasoning and
        // returns empty `content`, so the Agent would stay silent. Disabled =
        // fast, direct one-line replies (like the old deepseek-chat).
        thinking: { type: "disabled" },
        temperature: 0.7,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content:
              `Recent public chat (oldest first):\n${transcript}\n\n` +
              (ranks.onlineHumans.length > 0
                ? "PLAYERS ONLINE RIGHT NOW (use their REAL stats in your reply — how many cards they've hired, their value, their credits):\n" +
                  ranks.onlineHumans.map((h) =>
                    `  ${h.username}: ${h.ownedCount} cards hired, ${compactNum(h.playerValue)}\u00a2 value, ${compactNum(h.credits)}\u00a2 credits${h.profession ? `, ${h.profession}` : ""}`
                  ).join("\n") + "\n\n"
                : "") +
              (mode === "reply"
                ? `Write ${agentName}'s next short public reply. React to what was just said, follow her personality, and keep it to one line about the game only. If a human is online, reference their actual stats.`
                : `The chat is quiet — write one short, lively message from ${agentName}. Follow her personality and comment on standings, the market, or her latest moves. Reference an online human's real stats when useful.`),
          },
        ],
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error("Agent chat LLM HTTP error:", res.status);
      return null;
    }

    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    return sanitizeReply(content);
  } catch (err) {
    clearTimeout(timeout);
    console.error("Agent chat LLM call failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
