import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { safePortfolioValue, safeReward, MAX_CREDITS_SQL } from "@/lib/safeguards";

// Track last successful portfolio reward distribution time
let lastPortfolioRewardTime: Date | null = null;

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

    // Check if enough time has passed since last portfolio reward
    if (lastPortfolioRewardTime) {
      const minutesSinceLastReward = (now.getTime() - lastPortfolioRewardTime.getTime()) / (1000 * 60);
      
      if (minutesSinceLastReward < intervalMinutes) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: `Not enough time passed. Need ${intervalMinutes} min, only ${minutesSinceLastReward.toFixed(2)} min since last reward.`,
          intervalMinutes,
          timestamp: now.toISOString(),
        });
      }
    }

    // Get all active human players (exclude NPCs)
    const allPlayers = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        credits: users.credits,
      })
      .from(users)
      .where(sql`${users.isActive} = 1 AND ${users.isNpc} = 0`);

    const payouts: { username: string; portfolioValue: number; reward: number }[] = [];
    let totalRewardsDistributed = 0;

    for (const player of allPlayers) {
      // Calculate portfolio value: player_value + sum of owned players' values
      // Count ALL owned players, multiply each by (1 + number of players they own)
      const [portfolioResult] = await db
        .select({
          ownedValue: sql<number>`COALESCE(SUM(${users.playerValue} * (1 + (SELECT COUNT(*) FROM ownership o2 WHERE o2.owner_id = ${users.id}))), 0)`.as("owned_value"),
        })
        .from(ownership)
        .innerJoin(users, eq(ownership.ownedId, users.id))
        .where(eq(ownership.ownerId, player.id));

      // Get ownerCount (how many players own this player)
      const [ownerCountResult] = await db
        .select({
          ownerCount: sql<number>`COUNT(*)`.as("owner_count"),
        })
        .from(ownership)
        .where(eq(ownership.ownedId, player.id));

      const ownedValue = Number(portfolioResult?.ownedValue ?? 0);
      const ownerCount = Number(ownerCountResult?.ownerCount ?? 0);

      // Use BigInt-safe portfolio calculation to avoid overflow with large player values
      const portfolioValue = safePortfolioValue(player.playerValue, ownedValue, ownerCount);

      // Calculate 1% reward using BigInt-safe arithmetic
      const reward = safeReward(portfolioValue, 0.01);

      if (reward > 0) {
        // Update player credits (cap at MAX_CREDITS to prevent overflow)
        await db
          .update(users)
          .set({
            credits: sql`LEAST(credits + ${reward}, ${sql.raw(MAX_CREDITS_SQL)})`,
            updatedAt: now,
          })
          .where(eq(users.id, player.id));

        // Send Pusher notification to the player
        try {
          await pusher.trigger(`player-${player.id}`, "portfolio-reward", {
            amount: reward,
            portfolioValue,
          });
        } catch (pusherError) {
          console.error("Pusher error for portfolio reward:", pusherError);
        }

        payouts.push({
          username: player.username,
          portfolioValue,
          reward,
        });

        totalRewardsDistributed += reward;
      }
    }

    // Update last successful reward time
    lastPortfolioRewardTime = now;

    return NextResponse.json({
      success: true,
      skipped: false,
      message: `Portfolio rewards distributed to ${payouts.length} players`,
      totalRewardsDistributed,
      intervalMinutes,
      payouts: payouts.slice(0, 10),
      timestamp: now.toISOString(),
    });
  } catch (error: any) {
    console.error("Cron portfolio reward error:", error);
    return NextResponse.json(
      { error: "Failed to distribute portfolio rewards", details: error?.message },
      { status: 500 }
    );
  }
}
