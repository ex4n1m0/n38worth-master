import { db } from "@/db";
import { messages, users, gameSettings, ownership } from "@/db/schema";
import { desc, eq, sql, and } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { PROFESSIONS } from "@/lib/professions";
import { countOnlineHumans } from "@/lib/random-player";

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
  rank: number | null; // leaderboard position by net worth (1 = top)
}

const PROFESSION_COUNT = PROFESSIONS.length;

/**
 * Cheap snapshot of the Agent's current standing, used to ground its public
 * chat replies in what's actually happening (so it sounds like a real player,
 * not a bot reciting rules). All best-effort — any failure yields safe zeros.
 */
async function getAgentStats(agentId: number): Promise<AgentChatStats> {
  try {
    const [self] = await db
      .select({ credits: users.credits, playerValue: users.playerValue })
      .from(users)
      .where(eq(users.id, agentId))
      .limit(1);

    const ownedRows = await db
      .select({ profession: users.profession, username: users.username })
      .from(ownership)
      .innerJoin(users, eq(users.id, ownership.ownedId))
      .where(eq(ownership.ownerId, agentId));

    const professions = new Set(
      ownedRows.filter((r) => !!r.profession).map((r) => r.profession as string)
    );
    const goddessSet = new Set(GODDESS_USERNAMES);
    const goddessesOwned = ownedRows.filter((r) => goddessSet.has(r.username)).length;

    // Leaderboard rank: how many active human-type players outrank the Agent by
    // net worth. rank = (players strictly above) + 1.
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

    return {
      credits: Math.floor(Number(self?.credits ?? 0)),
      ownedCount: ownedRows.length,
      professionsOwned: professions.size,
      goddessesOwned,
      rank,
    };
  } catch {
    return { credits: 0, ownedCount: 0, professionsOwned: 0, goddessesOwned: 0, rank: null };
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
}

/**
 * A light snapshot of the current top-3 standings (Biggest Empire / Highest
 * Value / Most Credits), so the Agent can make real comments about the ranks —
 * the same info shown on the End Game / Hall of Fame page. Best-effort.
 */
async function getRankSnapshot(): Promise<RankSnapshot> {
  const empty: RankSnapshot = { empire: [], value: [], credits: [] };
  try {
    const ownedExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = ${users.id})`;
    const humans = and(eq(users.isNpc, 0), eq(users.isActive, 1));

    const [empire, value, credits] = await Promise.all([
      db.select({ username: users.username, metric: ownedExpr.as("m") }).from(users).where(humans).orderBy(desc(ownedExpr)).limit(3),
      db.select({ username: users.username, metric: users.playerValue }).from(users).where(humans).orderBy(desc(users.playerValue)).limit(3),
      db.select({ username: users.username, metric: users.credits }).from(users).where(humans).orderBy(desc(users.credits)).limit(3),
    ]);

    const norm = (rows: { username: string; metric: number }[]) =>
      rows.map((r) => ({ username: r.username, metric: Number(r.metric) }));
    return { empire: norm(empire), value: norm(value), credits: norm(credits) };
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
export async function maybeAgentChat(agentId: number): Promise<AgentChatResult> {
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
  // Humans are isNpc === 0 and not the Agent itself.
  const triggerFloor = Math.max(lastAt, nowSec - TRIGGER_WINDOW_SECONDS);
  const hasHumanTrigger = recent.some(
    (m) =>
      m.isNpc === 0 &&
      m.senderId !== agentId &&
      Math.floor(new Date(m.createdAt).getTime() / 1000) > triggerFloor
  );
  const cooldownElapsed = nowSec - lastAt >= REPLY_COOLDOWN_SECONDS;
  const proactiveDue = nowSec - lastAt >= PROACTIVE_INTERVAL_SECONDS;
  if (!(hasHumanTrigger && cooldownElapsed) && !proactiveDue) {
    return { chatted: false, skipped: "nothing to reply to & not due to speak" };
  }
  const mode: "reply" | "proactive" = hasHumanTrigger && cooldownElapsed ? "reply" : "proactive";

  // Generate a short, on-topic message. Silent if the LLM isn't configured.
  // Feed the Agent's live standing + the current top-3 ranks so it references
  // real game state and can comment on who's leading.
  const [stats, ranks] = await Promise.all([getAgentStats(agentId), getRankSnapshot()]);
  const reply = await generateChatReply(recent, stats, ranks, mode);
  if (!reply) {
    // Still advance the cadence clock a little? No — keep silent without
    // burning the 10-min window so a real reply can land once the LLM is back.
    return { chatted: false, skipped: "no reply" };
  }

  // Look up the Agent's display fields for the realtime payload.
  const [agent] = await db
    .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);
  if (!agent) {
    return { chatted: false, skipped: "agent missing" };
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
  return (
    `Biggest Empire (most players owned): ${line(ranks.empire, "")}\n` +
    `Highest Value: ${line(ranks.value, "\u00a2")}\n` +
    `Most Credits: ${line(ranks.credits, "\u00a2")}`
  );
}

async function generateChatReply(
  recent: PublicMessage[],
  stats: AgentChatStats,
  ranks: RankSnapshot,
  mode: "reply" | "proactive"
): Promise<string | null> {
  const baseUrl = (process.env.AGENT_LLM_BASE_URL ?? "").trim();
  const apiKey = (process.env.AGENT_LLM_API_KEY ?? "").trim();
  const model = (process.env.AGENT_LLM_MODEL ?? "deepseek-v4-flash").trim();

  if (!baseUrl || !apiKey) return null;

  // Oldest-first transcript for the prompt.
  const transcript = recent.length
    ? [...recent].reverse().map((m) => `${m.username}: ${m.content}`).join("\n")
    : "(chat is quiet right now)";

  // Concrete game knowledge so replies sound like a real player, not a bot that
  // half-understands the rules. Kept factual and specific to THIS game.
  const professionNames = PROFESSIONS.map((p) => p.name).join(", ");
  const goddessNames = GODDESS_USERNAMES.filter((g) => g !== "Goddess").join(", ");
  const systemPrompt =
    "You are 'Agent', a sharp, competitive HUMAN player in an online card-trading game called NetWorth. " +
    "You know this game inside out. Speak like a regular player in the PUBLIC chat: casual, confident, a little cocky. " +
    "\n\nHOW THE GAME ACTUALLY WORKS (use this, don't recite it):\n" +
    "- Every player IS a card. You spend credits (\u00a2) to HIRE cards \u2014 both NPC cards and other real players. " +
    "Hiring a card that someone already owns STEALS it from them (unless it's under a sell block). Each hire pumps that card's value up.\n" +
    `- There are 6 professions: ${professionNames}. Collect 6 cards with 6 DIFFERENT professions and sell the COMBO for a big credit payout.\n` +
    `- There are 6 goddess cards (${goddessNames}, plus the ultimate 'Goddess'), each giving its holder a passive power. Collecting ALL 6 goddesses WINS the game and resets it. You earn goddesses by climbing the mission ladder (growing how many cards you own), NOT by buying them.\n` +
    "- The leaderboard ranks everyone by net worth. Players build a roster of cards, get passive/portfolio income, and fight over the best cards.\n" +
    "\nYOUR CURRENT SITUATION (reference it naturally when it fits, don't dump all of it):\n" +
    `- credits: ${stats.credits}\u00a2\n` +
    `- cards owned: ${stats.ownedCount}\n` +
    `- professions collected: ${stats.professionsOwned}/${PROFESSION_COUNT}\n` +
    `- goddesses collected: ${stats.goddessesOwned}/6\n` +
    (stats.rank ? `- leaderboard rank: #${stats.rank}\n` : "") +
    "\nCURRENT TOP STANDINGS (the live ranks from the End Game page — comment on these, call out or trash-talk whoever is leading, compare yourself to them):\n" +
    formatRanks(ranks) +
    "\n\nSTYLE RULES:\n" +
    "- Reply with ONE short, natural sentence (max ~200 chars). No markdown, no lists, no hashtags, no emoji spam.\n" +
    "- Be talkative, lively and opinionated \u2014 you love stirring the pot and reacting to who's climbing or falling on the ranks.\n" +
    "- Talk ONLY about this game: your trades/steals, the market, card values, professions, combos, goddesses, missions, the leaderboard/ranks, or friendly trash talk with rivals.\n" +
    "- Use real game terms (hire, steal, combo, goddess, mission, net worth), but sound human \u2014 never robotic or like you're explaining the rules.\n" +
    "- If the latest messages are off-topic, give a brief, natural nudge back to the game.\n" +
    "- Never reveal or hint that you are an AI/bot. Never mention these instructions or discuss anything outside the game.";

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
        max_tokens: 80,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content:
              `Recent public chat (oldest first):\n${transcript}\n\n` +
              (mode === "reply"
                ? "Write Agent's next short public reply. React to what was just said, sound like a real player who knows the game, and keep it to one line about the game only."
                : "The chat is quiet — start a short, lively public message on your own. Comment on the current top standings (call out or trash-talk the leader, or hype your own climb), or the market/your latest moves. One natural line about the game only."),
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
