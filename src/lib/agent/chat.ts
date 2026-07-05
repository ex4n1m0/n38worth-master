import { db } from "@/db";
import { messages, users, gameSettings } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";

const CHAT_LAST_KEY = "agent_chat_last_at"; // epoch seconds of last Agent chat
const MAX_LENGTH = 200; // hard cap on the Agent's reply length
const CONTEXT_MESSAGES = 8; // recent public messages provided to the LLM
const TRIGGER_WINDOW_SECONDS = 15 * 60; // ignore human messages older than this

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
 * Reactive, on-topic public-chat replies for the Agent.
 *
 * Rules (by request):
 *   - PUBLIC chat only; never initiates a conversation.
 *   - Replies only when a HUMAN posted a public message since the Agent last
 *     spoke (and within a recent window).
 *   - No cadence throttle: the Agent answers each new human message promptly
 *     (bounded by the cron tick rate). The trigger gate prevents re-replying
 *     to a message it already answered, so it won't spam.
 *   - Short, game-only replies. Stays silent if the LLM is unavailable
 *     (no canned spam, saves tokens).
 *
 * Online-gating (only chat when humans are present) is enforced by the caller.
 */
export async function maybeAgentChat(agentId: number): Promise<AgentChatResult> {
  if ((process.env.AGENT_ENABLED ?? "").trim() !== "true") {
    return { chatted: false, skipped: "disabled" };
  }

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

  if (recent.length === 0) {
    return { chatted: false, skipped: "no messages" };
  }

  // Trigger gate: there must be a NEW human message since the last Agent reply,
  // recent enough that a reply still makes sense. Humans are isNpc === 0 and
  // are not the Agent itself.
  const triggerFloor = Math.max(lastAt, nowSec - TRIGGER_WINDOW_SECONDS);
  const hasHumanTrigger = recent.some(
    (m) =>
      m.isNpc === 0 &&
      m.senderId !== agentId &&
      Math.floor(new Date(m.createdAt).getTime() / 1000) > triggerFloor
  );
  if (!hasHumanTrigger) {
    return { chatted: false, skipped: "no trigger" };
  }

  // Generate a short, on-topic reply. Silent if the LLM isn't configured.
  const reply = await generateChatReply(recent);
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
async function generateChatReply(recent: PublicMessage[]): Promise<string | null> {
  const baseUrl = (process.env.AGENT_LLM_BASE_URL ?? "").trim();
  const apiKey = (process.env.AGENT_LLM_API_KEY ?? "").trim();
  const model = (process.env.AGENT_LLM_MODEL ?? "deepseek-chat").trim();

  if (!baseUrl || !apiKey) return null;

  // Oldest-first transcript for the prompt.
  const transcript = [...recent]
    .reverse()
    .map((m) => `${m.username}: ${m.content}`)
    .join("\n");

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
        temperature: 0.7,
        max_tokens: 80,
        messages: [
          {
            role: "system",
            content:
              "You are 'Agent', a competitive PLAYER in an online card-trading game " +
              "(players buy/steal each other's cards, complete missions, collect goddess " +
              "cards, and climb the leaderboard). You are chatting in the game's PUBLIC chat. " +
              "Reply with ONE short, casual sentence (max ~200 characters), no markdown, no lists. " +
              "Talk ONLY about the game: your trades, the market, missions, goddesses, the " +
              "leaderboard, or friendly trash talk with rivals. If the latest messages are " +
              "off-topic, briefly steer back to the game. Never reveal you are an AI or discuss " +
              "anything unrelated to the game.",
          },
          {
            role: "user",
            content:
              `Recent public chat (oldest first):\n${transcript}\n\n` +
              "Write Agent's next short public reply, on the game only.",
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
