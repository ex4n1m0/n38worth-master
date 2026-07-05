import { NextResponse } from "next/server";
import { countOnlineHumans } from "@/lib/random-player";
import { runAgentTurn } from "@/lib/agent/runner";
import { ensureAgent } from "@/lib/agent/seed";
import { maybeAgentChat } from "@/lib/agent/chat";

// Allow the burst of moves (up to ~6 LLM calls) to finish within one invocation.
export const maxDuration = 60;

/**
 * AI Agent cron — fires every minute (see vercel.json).
 *
 * Gating:
 *   - CRON_SECRET bearer (same as other crons).
 *   - AGENT_ENABLED must be "true" (checked inside runAgentTurn).
 *   - The Agent ONLY acts on ticks where at least one human is online.
 *     No empty-room play.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();

    if ((process.env.AGENT_ENABLED ?? "").trim() !== "true") {
      return NextResponse.json({ success: true, ran: false, skipped: "disabled", timestamp: now.toISOString() });
    }

    // Ensure the Agent player exists so it shows on the leaderboard even on
    // ticks where it doesn't act (e.g. no humans online). Cheap (cached id).
    const agentId = await ensureAgent();

    // Only play when humans are online.
    const onlineHumans = await countOnlineHumans();
    if (onlineHumans <= 0) {
      return NextResponse.json({
        success: true,
        ran: false,
        skipped: "no humans online",
        onlineHumans,
        timestamp: now.toISOString(),
      });
    }

    const maxActions = Number(process.env.AGENT_MAX_ACTIONS_PER_TICK ?? 6);
    const result = await runAgentTurn({ maxActions });

    // Reactive, throttled public-chat reply (only when a human posted recently).
    let chat;
    try {
      chat = await maybeAgentChat(agentId);
    } catch (chatError) {
      console.error("Agent chat error:", chatError);
      chat = { chatted: false, skipped: "error" };
    }

    return NextResponse.json({
      success: true,
      onlineHumans,
      ...result,
      chat,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Agent cron error:", error);
    return NextResponse.json({ error: "Agent cron failed" }, { status: 500 });
  }
}
