import { NextResponse } from "next/server";
import { countOnlineHumans } from "@/lib/random-player";
import { runAgentTurn, type AgentRunResult } from "@/lib/agent/runner";
import { deactivateRemovedAgents, ensureAgents } from "@/lib/agent/seed";

export const maxDuration = 60;

/**
 * Autonomous goddess cron. DISABLED (2026-08-21): no cron entry in vercel.json
 * invokes this route — the goddesses are static cards and never buy or pump.
 * The route is kept (still gated on AGENT_ENABLED=true) so gameplay can be
 * re-enabled by re-adding the cron entry.
 *
 * The six goddesses are the only gameplay AI players;
 * the historical chat-support Agent is deactivated and never picked.
 * Two goddesses are selected per tick:
 *
 *   tick t → goddesses at indices (t*2)%6 and (t*2+1)%6
 *
 * Each goddess has her own per-agent last-play gate (in runAgentTurn):
 *   - ACTIVE (humans online): 6-min interval → every pick plays.
 *   - IDLE (no humans): 60-min interval → keeps the world alive without
 *     burning credits in an empty room.
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
    const deactivatedRemovedAgents = await deactivateRemovedAgents();

    if ((process.env.AGENT_ENABLED ?? "").trim() !== "true") {
      return NextResponse.json({
        success: true,
        ran: false,
        skipped: "disabled",
        deactivatedRemovedAgents,
        timestamp: now.toISOString(),
      });
    }

    const goddesses = await ensureAgents();
    const onlineHumans = await countOnlineHumans();
    const maxActions = Number(process.env.AGENT_MAX_ACTIONS_PER_TICK ?? 10);

    // Pick 2 goddesses per tick, covering all 6 every 3 picks.
    const minuteIndex = Math.floor(now.getTime() / 60_000);
    const picks = [
      goddesses[(minuteIndex * 2) % goddesses.length],
      goddesses[(minuteIndex * 2 + 1) % goddesses.length],
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

    return NextResponse.json({
      success: true,
      onlineHumans,
      deactivatedRemovedAgents,
      picks: results.map((r) => ({
        agent: r.agent,
        ran: r.result.ran,
        skipped: r.result.skipped,
        moves: r.result.moves?.length ?? 0,
      })),
      chat: { chatted: false, skipped: "removed" },
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Autonomous goddess cron error:", error);
    return NextResponse.json({ error: "Autonomous goddess cron failed" }, { status: 500 });
  }
}
