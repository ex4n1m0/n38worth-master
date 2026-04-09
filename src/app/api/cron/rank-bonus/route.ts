import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, transactions, ownership } from "@/db/schema";
import { sql, desc, eq } from "drizzle-orm";
import {
  OWNED_RANKS,
  CREDITS_RANKS,
  VALUE_RANKS,
  PORTFOLIO_RANKS,
} from "@/lib/ranks";
import { pusher } from "@/lib/pusher-server";
import { safePortfolioValue, safeReward, MAX_CREDITS_SQL } from "@/lib/safeguards";

// Track last successful rank bonus distribution time
let lastRankBonusTime: Date | null = null;

export async function GET(req: Request) {
  // Verify the request is from Vercel Cron (skip if CRON_SECRET not configured)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();

    // Fixed interval: 60 minutes (1 hour)
    const intervalMinutes = 60;
    const intervalMs = intervalMinutes * 60 * 1000;

    // Check if enough time has passed since last rank bonus
    if (lastRankBonusTime) {
      const minutesSinceLastBonus = (now.getTime() - lastRankBonusTime.getTime()) / (1000 * 60);
      
      if (minutesSinceLastBonus < intervalMinutes) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: `Not enough time passed. Need ${intervalMinutes} min, only ${minutesSinceLastBonus.toFixed(2)} min since last bonus.`,
          intervalMinutes,
          timestamp: now.toISOString(),
        });
      }
    }

    const allPayouts: Record<string, { username: string; bonus: number; rank: string; position: number }[]> = {};
    const baseBonusAmounts = [3, 2, 1]; // Base: $3 for 1st, $2 for 2nd, $1 for 3rd
    
    // Helper function to calculate portfolio reward for a player
    const calculatePortfolioReward = async (playerId: number): Promise<number> => {
      // Calculate portfolio value: player_value + sum of owned players' values
      // Count ALL owned players, multiply each by (1 + number of players they own)
      const [portfolioResult] = await db
        .select({
          ownedValue: sql<number>`COALESCE(SUM(${users.playerValue} * (1 + (SELECT COUNT(*) FROM ownership o2 WHERE o2.owner_id = ${users.id}))), 0)`.as("owned_value"),
        })
        .from(ownership)
        .innerJoin(users, eq(ownership.ownedId, users.id))
        .where(eq(ownership.ownerId, playerId));

      // Get ownerCount (how many players own this player)
      const [ownerCountResult] = await db
        .select({
          ownerCount: sql<number>`COUNT(*)`.as("owner_count"),
        })
        .from(ownership)
        .where(eq(ownership.ownedId, playerId));

      const [playerResult] = await db
        .select({
          playerValue: users.playerValue,
        })
        .from(users)
        .where(eq(users.id, playerId));

      const ownedValue = Number(portfolioResult?.ownedValue ?? 0);
      const ownerCount = Number(ownerCountResult?.ownerCount ?? 0);
      const playerValue = Number(playerResult?.playerValue ?? 0);

      // Use BigInt-safe portfolio calculation to avoid overflow
      const portfolioValue = safePortfolioValue(playerValue, ownedValue, ownerCount);

      // Calculate 1% reward using BigInt-safe arithmetic
      return safeReward(portfolioValue, 0.01);
    };

    // Helper function to get rank tier index
    const getRankTierIndex = (value: number, ladder: typeof OWNED_RANKS): number => {
      let index = 0;
      for (let i = 0; i < ladder.length; i++) {
        if (value >= ladder[i].threshold) {
          index = i;
        }
      }
      return index;
    };

    // ─── 1. EMPIRE BONUS (top 3 by owned player count) ───
    const topEmpire = await db
      .select({
        id: users.id,
        username: users.username,
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`.as("owned_count"),
      })
      .from(users)
      .where(eq(users.isNpc, 0))
      .orderBy(desc(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`))
      .limit(3);

    allPayouts.empire = [];
    for (let i = 0; i < topEmpire.length; i++) {
      const player = topEmpire[i];
      const ownedCount = Number(player.ownedCount);
      const rankTier = getRankTierIndex(ownedCount, OWNED_RANKS);
      const baseBonus = baseBonusAmounts[i];
      
      // Calculate portfolio reward and apply 10% multiplier
      const portfolioReward = await calculatePortfolioReward(player.id);
      const multiplier = 0.10 * portfolioReward;
      const bonus = Math.floor(baseBonus * Math.max(multiplier, 1)); // At least 1x multiplier

      await db
        .update(users)
        .set({
          credits: sql`LEAST(credits + ${bonus}, ${sql.raw(MAX_CREDITS_SQL)})`,
          lastRankBonusAt: now,
          updatedAt: now
        })
        .where(eq(users.id, player.id));

      try {
        await pusher.trigger(`player-${player.id}`, "rank-bonus", {
          amount: bonus,
          category: "empire",
          rank: OWNED_RANKS[rankTier].title,
          position: i + 1,
        });
      } catch (pusherError) {
        console.error("Pusher error for rank bonus:", pusherError);
      }

      allPayouts.empire.push({
        username: player.username,
        bonus,
        rank: OWNED_RANKS[rankTier].title,
        position: i + 1
      });
    }

    // ─── 2. CREDITS BONUS (top 3 by credits) ───
    const topCredits = await db
      .select({
        id: users.id,
        username: users.username,
        credits: users.credits,
      })
      .from(users)
      .where(eq(users.isNpc, 0))
      .orderBy(desc(users.credits))
      .limit(3);

    allPayouts.credits = [];
    for (let i = 0; i < topCredits.length; i++) {
      const player = topCredits[i];
      const credits = Number(player.credits);
      const rankTier = getRankTierIndex(credits, CREDITS_RANKS);
      const baseBonus = baseBonusAmounts[i];
      
      // Calculate portfolio reward and apply 10% multiplier
      const portfolioReward = await calculatePortfolioReward(player.id);
      const multiplier = 0.10 * portfolioReward;
      const bonus = Math.floor(baseBonus * Math.max(multiplier, 1)); // At least 1x multiplier

      await db
        .update(users)
        .set({
          credits: sql`LEAST(credits + ${bonus}, ${sql.raw(MAX_CREDITS_SQL)})`,
          lastRankBonusAt: now,
          updatedAt: now
        })
        .where(eq(users.id, player.id));

      try {
        await pusher.trigger(`player-${player.id}`, "rank-bonus", {
          amount: bonus,
          category: "credits",
          rank: CREDITS_RANKS[rankTier].title,
          position: i + 1,
        });
      } catch (pusherError) {
        console.error("Pusher error for rank bonus:", pusherError);
      }

      allPayouts.credits.push({
        username: player.username,
        bonus,
        rank: CREDITS_RANKS[rankTier].title,
        position: i + 1
      });
    }

    // ─── 4. VALUE BONUS (top 3 by player value) ───
    const topValue = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
      })
      .from(users)
      .where(eq(users.isNpc, 0))
      .orderBy(desc(users.playerValue))
      .limit(3);

    allPayouts.value = [];
    for (let i = 0; i < topValue.length; i++) {
      const player = topValue[i];
      const playerValue = Number(player.playerValue);
      const rankTier = getRankTierIndex(playerValue, VALUE_RANKS);
      const baseBonus = baseBonusAmounts[i];
      
      // Calculate portfolio reward and apply 10% multiplier
      const portfolioReward = await calculatePortfolioReward(player.id);
      const multiplier = 0.10 * portfolioReward;
      const bonus = Math.floor(baseBonus * Math.max(multiplier, 1)); // At least 1x multiplier
      
      await db
        .update(users)
        .set({ 
          credits: sql`LEAST(credits + ${bonus}, ${sql.raw(MAX_CREDITS_SQL)})`, 
          lastRankBonusAt: now,
          updatedAt: now 
        })
        .where(eq(users.id, player.id));

      try {
        await pusher.trigger(`player-${player.id}`, "rank-bonus", {
          amount: bonus,
          category: "value",
          rank: VALUE_RANKS[rankTier].title,
          position: i + 1,
        });
      } catch (pusherError) {
        console.error("Pusher error for rank bonus:", pusherError);
      }
      
      allPayouts.value.push({ 
        username: player.username, 
        bonus, 
        rank: VALUE_RANKS[rankTier].title,
        position: i + 1 
      });
    }

    // ─── 5. PORTFOLIO BONUS (top 3 by portfolio value) ───
    // Only count owned players who themselves own other players
    const portfolioSql = sql<number>`LEAST(("users"."player_value"::numeric + COALESCE((SELECT SUM(u2.player_value::numeric) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = "users"."id" AND (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id) > 0), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1), 9007199254740991)`;

    const topPortfolio = await db
      .select({
        id: users.id,
        username: users.username,
        portfolioValue: portfolioSql.as("portfolio_value"),
      })
      .from(users)
      .where(eq(users.isNpc, 0))
      .orderBy(desc(portfolioSql))
      .limit(3);

    allPayouts.portfolio = [];
    for (let i = 0; i < topPortfolio.length; i++) {
      const player = topPortfolio[i];
      const portfolioValue = Number(player.portfolioValue);
      const rankTier = getRankTierIndex(portfolioValue, PORTFOLIO_RANKS);
      const baseBonus = baseBonusAmounts[i];
      
      // Calculate portfolio reward and apply 10% multiplier
      const portfolioReward = await calculatePortfolioReward(player.id);
      const multiplier = 0.10 * portfolioReward;
      const bonus = Math.floor(baseBonus * Math.max(multiplier, 1)); // At least 1x multiplier
      
      await db
        .update(users)
        .set({ 
          credits: sql`LEAST(credits + ${bonus}, ${sql.raw(MAX_CREDITS_SQL)})`, 
          lastRankBonusAt: now,
          updatedAt: now 
        })
        .where(eq(users.id, player.id));

      try {
        await pusher.trigger(`player-${player.id}`, "rank-bonus", {
          amount: bonus,
          category: "portfolio",
          rank: PORTFOLIO_RANKS[rankTier].title,
          position: i + 1,
        });
      } catch (pusherError) {
        console.error("Pusher error for rank bonus:", pusherError);
      }
      
      allPayouts.portfolio.push({ 
        username: player.username, 
        bonus, 
        rank: PORTFOLIO_RANKS[rankTier].title,
        position: i + 1 
      });
    }

    // Update last successful bonus time
    lastRankBonusTime = now;

    return NextResponse.json({
      success: true,
      skipped: false,
      message: "Rank bonuses distributed across 4 categories",
      intervalMinutes,
      payouts: allPayouts,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Cron rank bonus error:", error);
    return NextResponse.json(
      { error: "Failed to distribute rank bonuses" },
      { status: 500 }
    );
  }
}
