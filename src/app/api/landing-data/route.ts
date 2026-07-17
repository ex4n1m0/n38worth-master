import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, gameHistory, hallOfFame, ownership } from "@/db/schema";
import { sql, eq, desc, and, inArray, notInArray } from "drizzle-orm";
import { getCountdownState } from "@/lib/goddess-countdown";
import { GODDESS_USERNAMES, GODDESS_VALUES } from "@/lib/goddesses";
import { ONLINE_THRESHOLD_MINUTES } from "@/lib/random-player";
import { AGENT_USERNAMES } from "@/lib/agent/roster";

export const dynamic = "force-dynamic";

/**
 * Public API for the landing page — no auth required.
 * Returns game stats, recent activity, Hall of Fame winners, active countdown,
 * and a top player for the profile teaser.
 */
export async function GET() {
  try {
    const agiNamesSql = sql.join(AGENT_USERNAMES.map((name) => sql`${name}`), sql`, `);

    // 1. Game stats
    const [statsRow] = await db
      .select({
        totalPlayers: sql<number>`COUNT(*)`,
        totalCredits: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 THEN credits ELSE 0 END), 0)`,
        totalValues: sql<number>`COALESCE(SUM(player_value), 0)`,
        totalNpcs: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 1 THEN 1 ELSE 0 END), 0)`,
        totalHumans: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 AND username NOT IN (${agiNamesSql}) THEN 1 ELSE 0 END), 0)`,
      })
      .from(users);

    const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MINUTES * 60 * 1000);
    const [onlineRow] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(users)
      .where(and(eq(users.isNpc, 0), eq(users.isActive, 1), notInArray(users.username, AGENT_USERNAMES), sql`${users.lastOnlineAt} >= ${cutoff}`));

    // 2. Recent game events (last 20) for the activity ticker
    const events = await db
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
      .limit(20);

    // Fetch actor usernames
    const actorIds = [...new Set(events.map((e) => e.actorId).filter(Boolean))] as number[];
    const actorRows = actorIds.length > 0
      ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, actorIds))
      : [];
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

    // 3. Hall of Fame winners (last 5)
    const winners = await db
      .select({
        id: hallOfFame.id,
        userId: hallOfFame.userId,
        username: hallOfFame.username,
        wonAt: hallOfFame.wonAt,
      })
      .from(hallOfFame)
      .orderBy(desc(hallOfFame.wonAt))
      .limit(5);

    // 4. Active goddess countdown
    const countdown = await getCountdownState();
    let countdownData = { active: false, username: null as string | null, remainingSeconds: 0 };
    if (countdown.active && countdown.userId !== 0) {
      const [countdownUser] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, countdown.userId));
      countdownData = {
        active: true,
        username: countdownUser?.username ?? null,
        remainingSeconds: countdown.remainingSeconds ?? 0,
      };
    }

    // 5. Top player for profile teaser (highest value human, not Agent)
    const [topPlayer] = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        avatarUrl: users.avatarUrl,
        profession: users.profession,
      })
      .from(users)
      .where(and(eq(users.isNpc, 0), eq(users.isActive, 1), notInArray(users.username, AGENT_USERNAMES)))
      .orderBy(desc(users.playerValue))
      .limit(1);

    // Count owned cards for the top player
    let topPlayerOwnedCount = 0;
    if (topPlayer) {
      const [ownedRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(ownership)
        .where(eq(ownership.ownerId, topPlayer.id));
      topPlayerOwnedCount = Number(ownedRow?.count ?? 0);
    }

    // 7. Top 72 NPCs by value (for the landing page avatar grid — 12x6)
    const topNpcs = await db
      .select({
        username: users.username,
        avatarUrl: users.avatarUrl,
        playerValue: users.playerValue,
      })
      .from(users)
      .where(and(eq(users.isNpc, 1), eq(users.isActive, 1), notInArray(users.username, AGENT_USERNAMES), sql`${users.username} NOT LIKE 'Goddess%'`))
      .orderBy(desc(users.playerValue))
      .limit(72);

    // 6. Goddess data for flip cards
    const goddesses = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        playerValue: users.playerValue,
      })
      .from(users)
      .where(inArray(users.username, GODDESS_USERNAMES));

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
    });
  } catch (error) {
    console.error("Landing data error:", error);
    return NextResponse.json({ error: "Failed to fetch landing data" }, { status: 500 });
  }
}
