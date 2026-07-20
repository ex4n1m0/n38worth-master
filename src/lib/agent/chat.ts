import { db } from "@/db";
import { messages, users, gameSettings } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { countOnlineHumans } from "@/lib/random-player";
import { AGENT_USERNAME, isAIPlayerUsername } from "@/lib/agent/roster";

const CHAT_LAST_KEY = "agent_chat_last_at"; // epoch seconds of last Agent chat
const MAX_LENGTH = 280; // hard cap on the Agent's reply length (support answers can be a bit longer)
const CONTEXT_MESSAGES = 8; // recent public messages provided to the LLM
const TRIGGER_WINDOW_SECONDS = 15 * 60; // ignore human messages older than this
// Minimum seconds between the Agent's replies. Prevents the Agent from
// replying to every single message and dominating the chat.
const REPLY_COOLDOWN_SECONDS = 60; // 1 minute — support answers shouldn't spam

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

/**
 * Reactive, support-only public-chat replies for the Agent.
 *
 * Rules (by request):
 *   - ONLY the "Agent" AGI speaks in the public chat. All other AGIs and
 *     Goddesses are silent.
 *   - The Agent acts as a technical-support professional: it only replies when
 *     a HUMAN asks a question (or makes a clearly game-related inquiry), and
 *     answers with how the game works. It does NOT comment on live stats,
 *     standings, trash talk, or its own gameplay.
 *   - No proactive chat — the Agent stays quiet unless a human asks something.
 *   - Stays silent if the LLM is unavailable (no canned spam, saves tokens).
 *
 * Online-gating (only chat when humans are present) is enforced HERE as well as
 * by the caller — the Agent must never talk to an empty room.
 */
export async function maybeAgentChat(agentId: number, opts: { force?: boolean } = {}): Promise<AgentChatResult> {
  if ((process.env.AGENT_ENABLED ?? "").trim() !== "true") {
    return { chatted: false, skipped: "disabled" };
  }

  // Only the "Agent" AGI is allowed to chat. All other AGIs and Goddesses
  // stay silent.
  const [agentRow] = await db
    .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);
  if (!agentRow || agentRow.username !== AGENT_USERNAME) {
    return { chatted: false, skipped: "not the support agent" };
  }

  // Hard gate: never chat unless at least one real human is online.
  if ((await countOnlineHumans()) <= 0) {
    return { chatted: false, skipped: "no humans online" };
  }

  // Keep the Agent marked "online" whenever a human is around.
  await db.update(users).set({ lastOnlineAt: new Date() }).where(eq(users.id, agentId));

  const nowSec = Math.floor(Date.now() / 1000);

  // Timestamp of the Agent's last public reply.
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

  // The Agent only replies when a NEW human message arrived since it last spoke
  // (and within a recent window), AND the reply cooldown has elapsed. No
  // proactive chat — the Agent is a support agent, not a chatter.
  // When called with force=true (human just sent a message), skip the cooldown
  // so the Agent replies immediately — the typing indicator is already showing.
  const triggerFloor = Math.max(lastAt, nowSec - TRIGGER_WINDOW_SECONDS);
  const hasHumanTrigger = recent.some(
    (m) =>
      m.isNpc === 0 &&
      !isAIPlayerUsername(m.username) &&
      Math.floor(new Date(m.createdAt).getTime() / 1000) > triggerFloor
  );
  const cooldownElapsed = opts.force || nowSec - lastAt >= REPLY_COOLDOWN_SECONDS;
  if (!hasHumanTrigger || !cooldownElapsed) {
    return { chatted: false, skipped: "no human question to answer" };
  }

  // Check whether the most recent human message looks like a question or
  // game-related inquiry. The Agent only speaks when someone asks something —
  // it does not chime in on casual conversation.
  const latestHumanMsg = recent.find(
    (m) =>
      m.isNpc === 0 &&
      !isAIPlayerUsername(m.username) &&
      Math.floor(new Date(m.createdAt).getTime() / 1000) > triggerFloor
  );
  if (!latestHumanMsg || !looksLikeQuestion(latestHumanMsg.content)) {
    return { chatted: false, skipped: "not a question" };
  }

  // Generate a short, on-topic support reply. No canned fallback.
  const reply = await generateSupportReply(recent, latestHumanMsg, agentRow.username);
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
      id: agentRow.id,
      username: agentRow.username,
      avatarUrl: agentRow.avatarUrl,
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
 * Heuristic: does this message look like a question or game-related inquiry
 * that the support Agent should answer? Catches direct questions (?), how/what/
 * why/when/where/who/can/do/does/is/are starters, and mentions of game terms
 * paired with an inquiry vibe.
 */
function looksLikeQuestion(content: string): boolean {
  const text = content.trim().toLowerCase();
  if (!text) return false;
  // Direct question mark is the strongest signal.
  if (text.includes("?")) return true;
  // Common question starters.
  const starters = [
    "how ", "how do ", "how does ", "how can ", "how to ",
    "what ", "what's ", "what is ", "what are ",
    "why ", "why do ", "why does ", "why can ",
    "when ", "when do ", "when does ",
    "where ", "where do ", "where can ",
    "who ", "who can ",
    "can i ", "can you ", "can we ",
    "do i ", "do you ", "does the ", "does a ",
    "is there ", "are there ", "is it ", "are the ",
    "help", "explain", "tutorial", "guide", "tip", "tips",
    "what does ", "what do ",
  ];
  if (starters.some((s) => text.startsWith(s))) return true;
  // "@agent" mention — treat as a direct request.
  if (text.includes("@agent")) return true;
  return false;
}

/**
 * Sanitizes an LLM reply into a single line (no markdown/newlines), capped at
 * MAX_LENGTH. Returns null if empty.
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
 * Asks the configured LLM for ONE support-style reply answering a human's
 * question about how the game works. Returns null on any error/timeout or if
 * unconfigured.
 */
async function generateSupportReply(
  recent: PublicMessage[],
  latestHumanMsg: PublicMessage,
  agentName: string
): Promise<string | null> {
  const baseUrl = (process.env.AGENT_LLM_BASE_URL ?? "").trim();
  const apiKey = (process.env.AGENT_LLM_API_KEY ?? "").trim();
  const model = (process.env.AGENT_LLM_MODEL ?? "deepseek-v4-flash").trim();

  if (!baseUrl || !apiKey) return null;

  // Oldest-first transcript for context (last few messages).
  const transcript = recent.length
    ? [...recent].reverse().map((m) => `${m.username}: ${m.content}`).join("\n")
    : "(chat is quiet right now)";

  const systemPrompt =
    `You are '${agentName}', the official support agent for NetWorth, a multiplayer card-trading game. ` +
    "Your tone is professional, helpful, and concise — like a knowledgeable technical-support specialist. " +
    "You answer questions about how the game works. You do NOT comment on live stats, standings, leaderboards, " +
    "specific players, your own gameplay, or anything outside game mechanics. You never trash talk or joke around. " +
    "If a message isn't a game-related question, stay silent (return empty).\n" +
    "\nGAME KNOWLEDGE — NetWorth:\n" +
    "- Players ARE cards. Every player (human or NPC) is a card with a value. You start with 100¢.\n" +
    "- GET (hire): Pay a card's current value to hire it. The previous owner gets paid, the card's value multiplies (×1.2), and it joins your team. Hiring from an owner STEALS it.\n" +
    "- PUMP: Pay 100% of your card's value to double it. The cost goes to the card, and its sell block extends by 10 minutes. Main value-growth engine.\n" +
    "- BLOCK (Block Sell): Protect a card from being hired away. +1 hour per press (12h max), bumps value +10%, pays 90% of cost to the card.\n" +
    "- BREAK: Break a rival's sell block by paying (hours remaining × card value) to the owner, then hire the card. Unbreakable blocks can't be broken.\n" +
    "- PERM: Your first 10 hires get a 24-hour unbreakable Perm Block that refreshes while you're online. You can move these blocks between cards.\n" +
    "- MASS (Mass Hire): Unlocked at 50 cards. Bulk-hires the cheapest available cards — 1 + 10% of your owned count per press, on a short cooldown.\n" +
    "- Professions: 6 professions (Rifleman, Smuggler, Mystic, Spirit Archivist, Diplomat, Engineer). Pick one for yourself; assign one to NPCs you own. Owning at least one card of a profession activates its passive perk.\n" +
    "- Profession Combo: Own one card of each of the 6 professions → sell them together for a combo reward = sum of their values × 10.\n" +
    "- Missions: Sequential 'Get N cards' missions. Get 20 cards to unlock the full game (rankings, filters, activity, mission ladder). Each mission awards reward cards (Mass Hire card, then 6 Goddesses) for FREE and adds +50 hire slots.\n" +
    "- Goddesses: 6 goddesses earned via missions (NOT bought): Goddess of Wealth, Knowledge, Fate, Time, War, and the Goddess (Creation). Each has a power. Hold all 6 for 1 hour → you win, the world resets, your name goes to the Hall of Champions.\n" +
    "- Goddess powers: War = free breaks; Fate = permanent sell blocks on your team (break cost 1000×); Wealth = boosts daily reward; Knowledge = reveals info; Time = slows poach cooldowns on your cards; Creation (the Goddess) = all powers combined.\n" +
    "- Daily Login Reward: Once every 24h, claim a reward equal to the Goddess of Wealth's current value — taken from the richest human player. Auto-claimed when you first reach 20 cards.\n" +
    "- Leaderboard: Ranks by net worth (portfolio value = owned cards' value × max(ownerCount, 1); your OWN card value is NOT included).\n" +
    "- Offline penalty: Being offline too long reduces your income. Stay online to keep earning.\n" +
    "- Hire slots: You start with a base number of hire slots. Each mission adds +50. You can also buy slots.\n" +
    "- Values and credits are capped (very high limits) to keep the game playable.\n" +
    "\nSTYLE: One concise, professional answer (max ~280 chars). No markdown, no lists, no emoji spam. " +
    "Plain text, friendly but technical. Answer the specific question asked. " +
    "If the question isn't about NetWorth game mechanics, return an empty string (stay silent). " +
    `Never speak as another AGI or goddess; you are always ${agentName}.`;

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
        // Disable DeepSeek "thinking" mode — fast, direct replies.
        thinking: { type: "disabled" },
        temperature: 0.3,
        max_tokens: 280,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content:
              `Recent public chat (oldest first):\n${transcript}\n\n` +
              `The most recent human message is from ${latestHumanMsg.username}: "${latestHumanMsg.content}"\n\n` +
              `If this is a question about how NetWorth works, write ${agentName}'s concise, professional answer. ` +
              `If it is NOT a game-mechanics question (casual chat, trash talk, greetings, opinions), return an empty string.`,
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
