import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership, rewardHistory } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";

// Track last successful boss tax time
let lastBossTaxTime: Date | null = null;

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

    // Hourly interval
    const intervalMinutes = 60;

    // Check if enough time has passed since last boss tax
    if (lastBossTaxTime) {
      const minutesSinceLastTax = (now.getTime() - lastBossTaxTime.getTime()) / (1000 * 60);

      if (minutesSinceLastTax < intervalMinutes) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: `Not enough time passed. Need ${intervalMinutes} min, only ${minutesSinceLastTax.toFixed(2)} min since last tax.`,
          intervalMinutes,
          timestamp: now.toISOString(),
        });
      }
    }

    // Get all players who:
    // 1. Have a boss (are owned by someone)
    // 2. Own 0 players (no portfolio income)
    // 3. Are active (includes NPCs - they pay tax too)
    const playersWithBoss = await db
      .select({
        id: users.id,
        username: users.username,
        credits: users.credits,
        bossId: ownership.ownerId,
      })
      .from(users)
      .innerJoin(ownership, eq(ownership.ownedId, users.id))
      .where(sql`${users.isActive} = 1`);

    // Filter to only those who own 0 players
    const playersWithoutIncome: typeof playersWithBoss = [];
    for (const player of playersWithBoss) {
      const [ownedCountResult] = await db
        .select({
          count: sql<number>`COUNT(*)`.as("owned_count"),
        })
        .from(ownership)
        .where(eq(ownership.ownerId, player.id));

      // COUNT returns string/bigint in postgres, convert to Number for comparison
      const ownedCount = Number(ownedCountResult?.count ?? 0);
      if (ownedCount === 0) {
        playersWithoutIncome.push(player);
      }
    }

    if (playersWithoutIncome.length === 0) {
      lastBossTaxTime = now;
      return NextResponse.json({
        success: true,
        skipped: false,
        message: "No players without income to tax",
        playersTaxed: 0,
        totalTaxCollected: 0,
        timestamp: now.toISOString(),
      });
    }

    const taxes: { playerUsername: string; bossUsername: string; taxAmount: number }[] = [];
    const historyEntries: { userId: number; type: string; amount: number; details: string }[] = [];
    const pusherNotifications: Array<{ channel: string; event: string; data: object }> = [];
    let totalTaxCollected = 0;
    let playersTaxed = 0;

    for (const player of playersWithoutIncome) {
      // Calculate 1% of player's credits
      const playerCredits = Number(player.credits);
      const taxAmount = Math.floor(playerCredits * 0.01);

      // Skip if player has minimal/no credits
      if (taxAmount <= 0) {
        continue;
      }

      // Get boss username
      const [bossResult] = await db
        .select({
          bossUsername: users.username,
        })
        .from(users)
        .where(eq(users.id, player.bossId))
        .limit(1);

      const bossUsername = bossResult?.bossUsername;

      // Deduct tax from player
      await db
        .update(users)
        .set({
          credits: sql`GREATEST(credits - ${taxAmount}, 0)`,
          updatedAt: now,
        })
        .where(eq(users.id, player.id));

      // Transfer tax to boss
      await db
        .update(users)
        .set({
          credits: sql`LEAST(credits + ${taxAmount}, ${sql.raw(MAX_CREDITS_SQL)})`,
          updatedAt: now,
        })
        .where(eq(users.id, player.bossId));

      // History entry for player (tax paid)
      historyEntries.push({
        userId: player.id,
        type: "boss_no_income_tax",
        amount: -taxAmount,
        details: JSON.stringify({ toBossId: player.bossId, toBoss: bossUsername, reason: "no_income_hourly_tax" }),
      });

      // History entry for boss (tax received)
      historyEntries.push({
        userId: player.bossId,
        type: "boss_no_income_tax",
        amount: taxAmount,
        details: JSON.stringify({ fromPlayerId: player.id, fromPlayer: player.username, reason: "no_income_hourly_tax" }),
      });

      // Pusher notification for player
      pusherNotifications.push({
        channel: `player-${player.id}`,
        event: "boss-tax",
        data: { amount: -taxAmount, toBoss: bossUsername, type: "no_income", reason: "1% of your credits paid to boss hourly" },
      });

      // Pusher notification for boss
      pusherNotifications.push({
        channel: `player-${player.bossId}`,
        event: "boss-tax",
        data: { amount: taxAmount, fromPlayer: player.username, type: "no_income", reason: `1% of ${player.username}'s credits` },
      });

      taxes.push({
        playerUsername: player.username,
        bossUsername,
        taxAmount,
      });

      totalTaxCollected += taxAmount;
      playersTaxed++;
    }

    // Batch insert all history entries
    if (historyEntries.length > 0) {
      try {
        await db.insert(rewardHistory).values(historyEntries);
      } catch (historyError) {
        console.error("Reward history batch insert error:", historyError);
      }
    }

    // Fire all Pusher notifications in parallel
    if (pusherNotifications.length > 0) {
      try {
        await Promise.all(
          pusherNotifications.map(({ channel, event, data }) =>
            pusher.trigger(channel, event, data)
          )
        );
      } catch (pusherError) {
        console.error("Pusher batch error for boss tax:", pusherError);
      }
    }

    // Update last successful tax time
    lastBossTaxTime = now;

    return NextResponse.json({
      success: true,
      skipped: false,
      message: `Boss tax applied to ${playersTaxed} players without income`,
      playersTaxed,
      totalTaxCollected,
      taxes: taxes.slice(0, 10),
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Cron boss tax error:", error);
    return NextResponse.json(
      { error: "Failed to apply boss tax", details: String(error) },
      { status: 500 }
    );
  }
}
