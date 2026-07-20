import { NextResponse } from "next/server";
import { countOnlineHumans } from "@/lib/random-player";
import { runAgentTurn, type AgentRunResult } from "@/lib/agent/runner";
import { ensureAgents } from "@/lib/agent/seed";
import { maybeAgentChat } from "@/lib/agent/chat";
import { AGENT_USERNAME } from "@/lib/agent/roster";

export const maxDuration = 60;

/**
 * Autonomous AI roster cron — fires every minute. All 12 AI players (6 AGIs +
 * 6 goddesses) are created up front, then TWO are selected per tick for
 * gameplay. This covers all 12 every 6 minutes:
 *
 *   tick t → agents at indices (t*2)%12 and (t*2+1)%12
 *
 * Each AI has its own per-agent last-play gate (in runAgentTurn):
 *   - ACTIVE (humans online): 6-min interval → every pick plays.
 *   - IDLE (no humans): 60-min interval → only 1-in-10 picks play, keeping
 *     the world alive (1 play / 5 min) without burning credits in an empty
 *     room.
 *
 * Chat runs on the first picked agent only and is globally throttled in
 * maybeAgentChat (which also hard-gates on human presence, so no AI chat in
 * an empty room).
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
    const onlineHumans = await countOnlineHumans();
    const maxActions = Number(process.env.AGENT_MAX_ACTIONS_PER_TICK ?? 10);

    // Pick 2 agents per tick, covering all 12 every 6 minutes.
    const minuteIndex = Math.floor(now.getTime() / 60_000);
    const picks = [
      agents[(minuteIndex * 2) % agents.length],
      agents[(minuteIndex * 2 + 1) % agents.length],
    ];

    const results: Array<{ agent: { id: number; username: string }; result: AgentRunResult }> = [];
    for (const agent of picks) {
      try {
        const result = await runAgentTurn(agent.id, { maxActions });
        results.push({ agent: { id: agent.id, username: agent.username }, result });
      } catch (playError) {
        console.error(`${agent.username} gameplay error:`, playError);
        results.push({ agent: { id: agent.id, username: agent.username }, result: { ran: false, skipped: "gameplay error" } });
      }
    }

    // Chat: only the support "Agent" AGI speaks now (all other AGIs and
    // Goddesses are silent). maybeAgentChat hard-gates on human presence and
    // only replies to human questions, so no AI chat in idle mode and no
    // unsolicited commentary.
    let chat;
    try {
      const supportAgent = agents.find((a) => a.username === AGENT_USERNAME);
      if (supportAgent) {
        chat = await maybeAgentChat(supportAgent.id);
      } else {
        chat = { chatted: false, skipped: "support agent not found" };
      }
    } catch (chatError) {
      console.error("Agent chat error:", chatError);
      chat = { chatted: false, skipped: "error" };
    }

    return NextResponse.json({
      success: true,
      onlineHumans,
      picks: results.map((r) => ({
        agent: r.agent,
        ran: r.result.ran,
        skipped: r.result.skipped,
        moves: r.result.moves?.length ?? 0,
      })),
      chat,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("AGI roster cron error:", error);
    return NextResponse.json({ error: "AGI roster cron failed" }, { status: 500 });
  }
}
