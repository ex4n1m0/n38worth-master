import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql, eq, and, notInArray } from "drizzle-orm";
import { ONLINE_THRESHOLD_MINUTES } from "@/lib/random-player";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const removedAgentNamesSql = sql.join(REMOVED_AGENT_USERNAMES.map((name) => sql`${name}`), sql`, `);
    const result = await db
      .select({
        totalPlayers: sql<number>`COUNT(*) FILTER (WHERE username NOT IN (${removedAgentNamesSql}))`,
        totalCredits: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 AND username NOT IN (${removedAgentNamesSql}) THEN credits ELSE 0 END), 0)`,
        totalValues: sql<number>`COALESCE(SUM(CASE WHEN username NOT IN (${removedAgentNamesSql}) THEN player_value ELSE 0 END), 0)`,
        totalNpcs: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 1 THEN 1 ELSE 0 END), 0)`,
        totalHumans: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 AND username NOT IN (${removedAgentNamesSql}) THEN 1 ELSE 0 END), 0)`,
      })
      .from(users);

    const { totalPlayers, totalCredits, totalValues, totalNpcs, totalHumans } = result[0];
    const totalEconomy = Number(totalCredits);

    // Online humans: same definition as the random-player cron (lastOnlineAt
    // heartbeat within the online threshold, excluding NPCs, deactivated
    // accounts, and the removed Agent).
    const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MINUTES * 60 * 1000);
    const [onlineRow] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(users)
      .where(
        and(
          eq(users.isNpc, 0),
          eq(users.isActive, 1),
          notInArray(users.username, [...REMOVED_AGENT_USERNAMES]),
          sql`${users.lastOnlineAt} >= ${cutoff}`
        )
      );
    const onlineHumans = Number(onlineRow?.count ?? 0);

    // Public aggregate stats — cache at the CDN so polling clients don't
    // invoke the function on every request.
    return NextResponse.json({
      totalPlayers: Number(totalPlayers),
      totalEconomy: Math.round(totalEconomy * 100) / 100,
      totalNpcs: Number(totalNpcs),
      totalHumans: Number(totalHumans),
      onlineHumans,
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
