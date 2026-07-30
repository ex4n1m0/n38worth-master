import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, gameHistory, hallOfFame, ownership } from "@/db/schema";
import { sql, eq, desc, and, inArray, notInArray } from "drizzle-orm";
import { getCountdownState } from "@/lib/goddess-countdown";
import { GODDESS_USERNAMES, GODDESS_VALUES } from "@/lib/goddesses";
import { ONLINE_THRESHOLD_MINUTES } from "@/lib/random-player";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";

export const dynamic = "force-dynamic";

/**
 * Public API for the landing page — no auth required.
 * Returns game stats, recent activity, Hall of Fame winners, active countdown,
 * and a top player for the profile teaser.
 */
export async function GET() {
  try {
    const removedAgentNamesSql = sql.join(REMOVED_AGENT_USERNAMES.map((name) => sql`${name}`), sql`, `);
    const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MINUTES * 60 * 1000);

    // Wave 1 — all independent queries in parallel.
    const [statsRows, onlineRows, events, winners, countdown, topPlayers, topNpcs, goddesses] = await Promise.all([
      // 1. Game stats
      db
        .select({
          totalPlayers: sql<number>`COUNT(*) FILTER (WHERE username NOT IN (${removedAgentNamesSql}))`,
          totalCredits: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 AND username NOT IN (${removedAgentNamesSql}) THEN credits ELSE 0 END), 0)`,
          totalValues: sql<number>`COALESCE(SUM(CASE WHEN username NOT IN (${removedAgentNamesSql}) THEN player_value ELSE 0 END), 0)`,
          totalNpcs: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 1 THEN 1 ELSE 0 END), 0)`,
          totalHumans: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 AND username NOT IN (${removedAgentNamesSql}) THEN 1 ELSE 0 END), 0)`,
        })
        .from(users),
      // Online humans
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(users)
        .where(and(eq(users.isNpc, 0), eq(users.isActive, 1), notInArray(users.username, [...REMOVED_AGENT_USERNAMES]), sql`${users.lastOnlineAt} >= ${cutoff}`)),
      // 2. Recent game events (last 20) for the activity ticker
      db
        .select({
          id: gameHistory.id,
          eventType: gameHistory.eventType,
          actorId: gameHistory.actorId,
          targetId: gameHistory.targetId,
          targetUsername: gameHistory.targetUsername,
          createdAt: gameHistory.createdAt,
          details: gameHistory.details,
        })
        .from(gameHistory)
        .where(inArray(gameHistory.eventType, ["purchase", "pump", "sell_combo", "mission_reward", "game_won"]))
        .orderBy(desc(gameHistory.createdAt))
        .limit(20),
      // 3. Hall of Fame winners (last 5)
      db
        .select({
          id: hallOfFame.id,
          userId: hallOfFame.userId,
          username: hallOfFame.username,
          wonAt: hallOfFame.wonAt,
        })
        .from(hallOfFame)
        .orderBy(desc(hallOfFame.wonAt))
        .limit(5),
      // 4. Active goddess countdown
      getCountdownState(),
      // 5. Top player for profile teaser (highest value human, not removed Agent)
      db
        .select({
          id: users.id,
          username: users.username,
          playerValue: users.playerValue,
          avatarUrl: users.avatarUrl,
          profession: users.profession,
        })
        .from(users)
        .where(and(eq(users.isNpc, 0), eq(users.isActive, 1), notInArray(users.username, [...REMOVED_AGENT_USERNAMES])))
        .orderBy(desc(users.playerValue))
        .limit(1),
      // 7. Top 36 NPCs by value (for the landing page avatar grid — 12x3)
      db
        .select({
          username: users.username,
          avatarUrl: users.avatarUrl,
          playerValue: users.playerValue,
        })
        .from(users)
        .where(and(eq(users.isNpc, 1), eq(users.isActive, 1), notInArray(users.username, [...REMOVED_AGENT_USERNAMES]), sql`${users.username} NOT LIKE 'Goddess%'`))
        .orderBy(desc(users.playerValue))
        .limit(36),
      // 6. Goddess data for flip cards
      db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          playerValue: users.playerValue,
        })
        .from(users)
        .where(inArray(users.username, GODDESS_USERNAMES)),
    ]);

    const statsRow = statsRows[0];
    const onlineRow = onlineRows[0];
    const topPlayer = topPlayers[0];

    // Wave 2 — dependent lookups in parallel.
    const actorIds = [...new Set(events.map((e) => e.actorId).filter(Boolean))] as number[];
    const [actorRows, countdownUsers, topPlayerOwnedRows] = await Promise.all([
      actorIds.length > 0
        ? db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, actorIds))
        : Promise.resolve([]),
      countdown.active && countdown.userId !== 0
        ? db.select({ username: users.username }).from(users).where(eq(users.id, countdown.userId))
        : Promise.resolve([]),
      topPlayer
        ? db.select({ count: sql<number>`COUNT(*)::int` }).from(ownership).where(eq(ownership.ownerId, topPlayer.id))
        : Promise.resolve([]),
    ]);

    const actorMap = new Map(actorRows.map((r) => [r.id, r.username ?? "Someone"]));

    const activity = events.map((e) => {
      const actorName = e.actorId ? actorMap.get(e.actorId) ?? "Someone" : "System";
      const details = (() => { try { return JSON.parse(e.details ?? "{}"); } catch { return {}; } })();
      let text = "";
      switch (e.eventType) {
        case "purchase":
          text = `${actorName} hired ${e.targetUsername ?? "someone"}`;
          break;
        case "pump":
          text = `${actorName} pumped ${e.targetUsername ?? "someone"}`;
          break;
        case "sell_combo":
          text = `${actorName} sold a profession combo for ${Math.round(details.reward ?? 0)}¢`;
          break;
        case "mission_reward":
          text = `${actorName} unlocked ${e.targetUsername ?? "a goddess"}`;
          break;
        case "game_won":
          text = `${actorName} WON THE GAME`;
          break;
        default:
          text = `${actorName} did something`;
      }
      return { id: e.id, text, type: e.eventType, createdAt: e.createdAt };
    });

    // 4. Active goddess countdown
    const countdownUser = countdownUsers[0];
    let countdownData = { active: false, username: null as string | null, remainingSeconds: 0 };
    if (countdown.active && countdown.userId !== 0) {
      countdownData = {
        active: true,
        username: countdownUser?.username ?? null,
        remainingSeconds: countdown.remainingSeconds ?? 0,
      };
    }

    // Count owned cards for the top player (from wave 2)
    const topPlayerOwnedCount = Number((topPlayerOwnedRows[0] as { count?: number } | undefined)?.count ?? 0);

    const goddessData = GODDESS_USERNAMES.map((name) => {
      const g = goddesses.find((gd) => gd.username === name);
      return {
        username: name,
        value: GODDESS_VALUES[name] ?? 0,
        avatarUrl: g?.avatarUrl ?? null,
      };
    });

    return NextResponse.json({
      stats: {
        totalPlayers: Number(statsRow?.totalPlayers ?? 0),
        totalEconomy: Math.round(Number(statsRow?.totalCredits ?? 0) * 100) / 100,
        totalNpcs: Number(statsRow?.totalNpcs ?? 0),
        totalHumans: Number(statsRow?.totalHumans ?? 0),
        onlineHumans: Number(onlineRow?.count ?? 0),
      },
      activity,
      winners: winners.map((w) => ({ username: w.username, wonAt: w.wonAt })),
      countdown: countdownData,
      topPlayer: topPlayer ? {
        username: topPlayer.username,
        playerValue: Number(topPlayer.playerValue),
        avatarUrl: topPlayer.avatarUrl,
        profession: topPlayer.profession,
        ownedCount: topPlayerOwnedCount,
      } : null,
      goddesses: goddessData,
      topNpcs: topNpcs.map((n) => ({
        username: n.username,
        avatarUrl: n.avatarUrl,
        playerValue: Number(n.playerValue),
      })),
    }, {
      // Public landing-page payload (large) — cache at the CDN so repeat
      // visits/bots don't invoke the function on every request.
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("Landing data error:", error);
    return NextResponse.json({ error: "Failed to fetch landing data" }, { status: 500 });
  }
}
