import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, transactions } from "@/db/schema";
import { sql, desc, eq, and, gte, lt } from "drizzle-orm";
import {
  OWNED_RANKS,
  AGE_RANKS,
  CREDITS_RANKS,
  VALUE_RANKS,
  PORTFOLIO_RANKS,
} from "@/lib/ranks";

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
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Check if rank bonuses were already distributed today
    const [existingBonus] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(gte(users.lastRankBonusAt, todayStart));
    
    if (Number(existingBonus?.count ?? 0) > 0) {
      return NextResponse.json({
        success: true,
        message: "Rank bonuses already distributed today",
        timestamp: new Date().toISOString(),
      });
    }

    const allPayouts: Record<string, { username: string; bonus: number; rank: string; position: number }[]> = {};
    const bonusAmounts = [3, 2, 1]; // $3 for 1st, $2 for 2nd, $1 for 3rd

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
      .orderBy(desc(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`))
      .limit(3);

    allPayouts.empire = [];
    for (let i = 0; i < topEmpire.length; i++) {
      const player = topEmpire[i];
      const ownedCount = Number(player.ownedCount);
      const rankTier = getRankTierIndex(ownedCount, OWNED_RANKS);
      const bonus = bonusAmounts[i];

      await db
        .update(users)
        .set({
          credits: sql`credits + ${bonus}`,
          lastRankBonusAt: now,
          updatedAt: now
        })
        .where(eq(users.id, player.id));

      allPayouts.empire.push({
        username: player.username,
        bonus,
        rank: OWNED_RANKS[rankTier].title,
        position: i + 1
      });
    }

    // ─── 2. LEGACY BONUS (top 3 by account age) ───
    const topLegacy = await db
      .select({
        id: users.id,
        username: users.username,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(sql`"users"."created_at" ASC`)
      .limit(3);

    allPayouts.legacy = [];
    for (let i = 0; i < topLegacy.length; i++) {
      const player = topLegacy[i];
      const ageDays = Math.floor((Date.now() - new Date(player.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const rankTier = getRankTierIndex(ageDays, AGE_RANKS);
      const bonus = bonusAmounts[i];

      await db
        .update(users)
        .set({
          credits: sql`credits + ${bonus}`,
          lastRankBonusAt: now,
          updatedAt: now
        })
        .where(eq(users.id, player.id));

      allPayouts.legacy.push({
        username: player.username,
        bonus,
        rank: AGE_RANKS[rankTier].title,
        position: i + 1
      });
    }

    // ─── 3. CREDITS BONUS (top 3 by credits) ───
    const topCredits = await db
      .select({
        id: users.id,
        username: users.username,
        credits: users.credits,
      })
      .from(users)
      .orderBy(desc(users.credits))
      .limit(3);

    allPayouts.credits = [];
    for (let i = 0; i < topCredits.length; i++) {
      const player = topCredits[i];
      const credits = Number(player.credits);
      const rankTier = getRankTierIndex(credits, CREDITS_RANKS);
      const bonus = bonusAmounts[i];

      await db
        .update(users)
        .set({
          credits: sql`credits + ${bonus}`,
          lastRankBonusAt: now,
          updatedAt: now
        })
        .where(eq(users.id, player.id));

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
      .orderBy(desc(users.playerValue))
      .limit(3);

    allPayouts.value = [];
    for (let i = 0; i < topValue.length; i++) {
      const player = topValue[i];
      const playerValue = Number(player.playerValue);
      const rankTier = getRankTierIndex(playerValue, VALUE_RANKS);
      const bonus = bonusAmounts[i];
      
      await db
        .update(users)
        .set({ 
          credits: sql`credits + ${bonus}`, 
          lastRankBonusAt: now,
          updatedAt: now 
        })
        .where(eq(users.id, player.id));
      
      allPayouts.value.push({ 
        username: player.username, 
        bonus, 
        rank: VALUE_RANKS[rankTier].title,
        position: i + 1 
      });
    }

    // ─── 5. PORTFOLIO BONUS (top 3 by portfolio value) ───
    const portfolioSql = sql<number>`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1)`;

    const topPortfolio = await db
      .select({
        id: users.id,
        username: users.username,
        portfolioValue: portfolioSql.as("portfolio_value"),
      })
      .from(users)
      .orderBy(desc(portfolioSql))
      .limit(3);

    allPayouts.portfolio = [];
    for (let i = 0; i < topPortfolio.length; i++) {
      const player = topPortfolio[i];
      const portfolioValue = Number(player.portfolioValue);
      const rankTier = getRankTierIndex(portfolioValue, PORTFOLIO_RANKS);
      const bonus = bonusAmounts[i];
      
      await db
        .update(users)
        .set({ 
          credits: sql`credits + ${bonus}`, 
          lastRankBonusAt: now,
          updatedAt: now 
        })
        .where(eq(users.id, player.id));
      
      allPayouts.portfolio.push({ 
        username: player.username, 
        bonus, 
        rank: PORTFOLIO_RANKS[rankTier].title,
        position: i + 1 
      });
    }

    return NextResponse.json({
      success: true,
      message: "Rank bonuses distributed across 5 categories (Empire, Legacy, Credits, Value, Portfolio)",
      payouts: allPayouts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron rank bonus error:", error);
    return NextResponse.json(
      { error: "Failed to distribute rank bonuses" },
      { status: 500 }
    );
  }
}