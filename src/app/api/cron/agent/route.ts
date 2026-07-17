import { NextResponse } from "next/server";
import { countOnlineHumans } from "@/lib/random-player";
import { runAgentTurn, type AgentRunResult } from "@/lib/agent/runner";
import { ensureAgents } from "@/lib/agent/seed";
import { maybeAgentChat } from "@/lib/agent/chat";

export const maxDuration = 60;

/**
 * AGI roster cron — fires every minute. All six AGIs are created up front, then
 * one is selected round-robin for gameplay each tick. This gives every AGI the
 * same full gameplay logic without launching six concurrent 10-action bursts.
 * Chat uses the same rotating AGI and is globally throttled in maybeAgentChat.
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

    const agents = await ensureAgents();

    // Hard gate: AGIs neither play nor speak unless a real human is online.
    const onlineHumans = await countOnlineHumans();
    if (onlineHumans <= 0) {
      return NextResponse.json({
        success: true,
        ran: false,
        skipped: "no humans online",
        onlineHumans,
        agents: agents.map(({ id, username }) => ({ id, username })),
        timestamp: now.toISOString(),
      });
    }

    // Rotate one AGI per minute. Each receives the exact same runner logic and
    // individual cycle/cooldown bookkeeping keyed by its own user id.
    const rosterIndex = Math.floor(now.getTime() / 60_000) % agents.length;
    const activeAgent = agents[rosterIndex];
    const maxActions = Number(process.env.AGENT_MAX_ACTIONS_PER_TICK ?? 10);
    let result: AgentRunResult;
    try {
      result = await runAgentTurn(activeAgent.id, { maxActions });
    } catch (playError) {
      console.error(`${activeAgent.username} gameplay error:`, playError);
      result = { ran: false, skipped: "gameplay error" };
    }

    let chat;
    try {
      chat = await maybeAgentChat(activeAgent.id);
    } catch (chatError) {
      console.error(`${activeAgent.username} chat error:`, chatError);
      chat = { chatted: false, skipped: "error" };
    }

    return NextResponse.json({
      success: true,
      onlineHumans,
      activeAgent: { id: activeAgent.id, username: activeAgent.username },
      ...result,
      chat,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("AGI roster cron error:", error);
    return NextResponse.json({ error: "AGI roster cron failed" }, { status: 500 });
  }
}
