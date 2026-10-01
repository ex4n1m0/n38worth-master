import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership, transactions, messages, gameHistory } from "@/db/schema";
import { sql, desc, eq, or } from "drizzle-orm";
import { maybeProcessBreak } from "@/lib/world-vault";

export const maxDuration = 60;

export async function GET(req: Request) {
  // Verify the request is from Vercel Cron (skip if CRON_SECRET not configured)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // World Vault backstop (2026-10-01): this cron is the revived prize payer
  // (GAME_INTEGRATION_STUDY §5G) — process a pending vault break hourly even
  // if nobody reads the status endpoint. Never fails the cron.
  try {
    await maybeProcessBreak();
  } catch (e) {
    console.error("World vault backstop error:", e);
  }

  try {
    // Count total players in the game
    const [countResult] = await db
      .select({ totalPlayers: sql<number>`COUNT(*)` })
      .from(users);
    const totalPlayers = Number(countResult?.totalPlayers ?? 0);

    if (totalPlayers < 3) {
      return NextResponse.json({
        success: true,
        message: "Not enough players for leaderboard prizes (need at least 3)",
        totalPlayers,
        timestamp: new Date().toISOString(),
      });
    }

    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const multipliers = [3, 2, 1];
    // Prizes are 10% of player count, halved per run (runs 2x/hour)
    const prizeMultiplier = 0.05;
    const allPayouts: Record<string, { username: string; prize: number; position: number }[]> = {};

    // ─── 1. PORTFOLIO PRIZE (top 3 by portfolio value) ───
    // Only count owned players who themselves own other players
    // Portfolio = owned cards' value × max(ownerCount, 1). Own player_value excluded.
    const portfolioSql = sql<number>`COALESCE((SELECT SUM(u2.player_value) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = "users"."id" AND (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id) > 0), 0) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1)`;

    const topPortfolio = await db
      .select({
        id: users.id,
        username: users.username,
        portfolioValue: portfolioSql.as("portfolio_value"),
      })
      .from(users)
      .where(sql`"users"."last_online_at" >= ${twelveHoursAgo}`)
      .orderBy(desc(portfolioSql))
      .limit(3);

    allPayouts.portfolio = [];
    for (let i = 0; i < topPortfolio.length; i++) {
      const player = topPortfolio[i];
      allPayouts.portfolio.push({ username: player.username, prize: 0, position: i + 1 });
    }

    // ─── 2. DEMAND PRIZE (top 3 by owner count — most people own them) ───
    const topDemand = await db
      .select({
        id: users.id,
        username: users.username,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`.as("owner_count"),
      })
      .from(users)
      .where(sql`"users"."last_online_at" >= ${twelveHoursAgo}`)
      .orderBy(desc(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`))
      .limit(3);

    allPayouts.demand = [];
    for (let i = 0; i < topDemand.length; i++) {
      const player = topDemand[i];
      allPayouts.demand.push({ username: player.username, prize: 0, position: i + 1 });
    }

    // ─── 3. EMPIRE PRIZE (top 3 by owned player count — they own the most players) ───
    const topEmpire = await db
      .select({
        id: users.id,
        username: users.username,
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`.as("owned_count"),
      })
      .from(users)
      .where(sql`"users"."last_online_at" >= ${twelveHoursAgo}`)
      .orderBy(desc(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`))
      .limit(3);

    allPayouts.empire = [];
    for (let i = 0; i < topEmpire.length; i++) {
      const player = topEmpire[i];
      allPayouts.empire.push({ username: player.username, prize: 0, position: i + 1 });
    }

    // ─── 4. LEGACY PRIZE (top 3 by account age — oldest accounts) ───
    const topLegacy = await db
      .select({
        id: users.id,
        username: users.username,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(sql`"users"."last_online_at" >= ${twelveHoursAgo}`)
      .orderBy(sql`"users"."created_at" ASC`)
      .limit(3);

    allPayouts.legacy = [];
    for (let i = 0; i < topLegacy.length; i++) {
      const player = topLegacy[i];
      allPayouts.legacy.push({ username: player.username, prize: 0, position: i + 1 });
    }

    // ─── 5. CREDITS PRIZE (top 3 by credits — wealthiest players) ───
    const topCredits = await db
      .select({
        id: users.id,
        username: users.username,
        credits: users.credits,
      })
      .from(users)
      .where(sql`"users"."last_online_at" >= ${twelveHoursAgo}`)
      .orderBy(desc(users.credits))
      .limit(3);

    allPayouts.credits = [];
    for (let i = 0; i < topCredits.length; i++) {
      const player = topCredits[i];
      allPayouts.credits.push({ username: player.username, prize: 0, position: i + 1 });
    }

    // ─── 6. VALUE PRIZE (top 3 by player value — most valuable players) ───
    const topValue = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
      })
      .from(users)
      .where(sql`"users"."last_online_at" >= ${twelveHoursAgo}`)
      .orderBy(desc(users.playerValue))
      .limit(3);

    allPayouts.value = [];
    for (let i = 0; i < topValue.length; i++) {
      const player = topValue[i];
      allPayouts.value.push({ username: player.username, prize: 0, position: i + 1 });
    }

    // Also clean up quick-play accounts older than 1 hour (redundancy with inflate cron)
    // Skip protected users (e.g., goddesses)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const quickPlayUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        sql`username LIKE 'Player_%' AND (created_at <= ${oneHourAgo} OR last_online_at <= ${oneHourAgo}) AND ${users.isProtected} = 0`
      );

    for (const u of quickPlayUsers) {
      // Log to game history before deletion
      await db.insert(gameHistory).values({
        eventType: "player_deletion",
        actorId: null, // System action
        targetId: u.id,
        targetUsername: null, // Username not fetched in query
        details: JSON.stringify({ reason: "quick_play_cleanup" }),
      });

      await db.delete(ownership).where(eq(ownership.ownerId, u.id));
      await db.delete(ownership).where(eq(ownership.ownedId, u.id));
      await db.delete(transactions).where(
        or(eq(transactions.buyerId, u.id), eq(transactions.targetId, u.id))
      );
      await db.delete(messages).where(
        or(eq(messages.senderId, u.id), eq(messages.recipientId, u.id))
      );
      await db.delete(users).where(eq(users.id, u.id));
    }

    return NextResponse.json({
      success: true,
      message: `Leaderboard prizes distributed across 6 categories every 30 min (Portfolio, Demand, Empire, Legacy, Credits, Value)`,
      totalPlayers,
      payouts: allPayouts,
      quickPlayDeleted: quickPlayUsers.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron leaderboard prizes error:", error);
    return NextResponse.json(
      { error: "Failed to distribute leaderboard prizes" },
      { status: 500 }
    );
  }
}
