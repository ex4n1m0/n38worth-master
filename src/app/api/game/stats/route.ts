import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql, eq, ne, and } from "drizzle-orm";
import { ONLINE_THRESHOLD_MINUTES } from "@/lib/random-player";
import { AGENT_USERNAME } from "@/lib/agent/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await db
      .select({
        totalPlayers: sql<number>`COUNT(*)`,
        totalCredits: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 THEN credits ELSE 0 END), 0)`,
        totalValues: sql<number>`COALESCE(SUM(player_value), 0)`,
        totalNpcs: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 1 THEN 1 ELSE 0 END), 0)`,
        totalHumans: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 THEN 1 ELSE 0 END), 0)`,
      })
      .from(users);

    const { totalPlayers, totalCredits, totalValues, totalNpcs, totalHumans } = result[0];
    const totalEconomy = Number(totalCredits);

    // Online humans: same definition as the random-player cron (lastOnlineAt
    // heartbeat within the online threshold, excluding NPCs, deactivated
    // accounts, and the AI Agent).
    const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MINUTES * 60 * 1000);
    const [onlineRow] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(users)
      .where(
        and(
          eq(users.isNpc, 0),
          eq(users.isActive, 1),
          ne(users.username, AGENT_USERNAME),
          sql`${users.lastOnlineAt} >= ${cutoff}`
        )
      );
    const onlineHumans = Number(onlineRow?.count ?? 0);

    return NextResponse.json({
      totalPlayers: Number(totalPlayers),
      totalEconomy: Math.round(totalEconomy * 100) / 100,
      totalNpcs: Number(totalNpcs),
      totalHumans: Number(totalHumans),
      onlineHumans,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
