import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership, rewardHistory, gameSettings } from "@/db/schema";
import { sql, eq, inArray } from "drizzle-orm";
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

    // Bulk-fetch owned-card counts for everyone in one query instead of N+1.
    const playerIds = playersWithBoss.map((p) => p.id);
    const ownedCountMap = new Map<number, number>();
    if (playerIds.length > 0) {
      const ownedCounts = await db
        .select({
          ownerId: ownership.ownerId,
          count: sql<number>`COUNT(*)`.as("owned_count"),
        })
        .from(ownership)
        .where(inArray(ownership.ownerId, playerIds))
        .groupBy(ownership.ownerId);
      for (const row of ownedCounts) {
        ownedCountMap.set(row.ownerId, Number(row.count));
      }
    }

    // Filter to only those who own 0 players
    const playersWithoutIncome = playersWithBoss.filter(
      (player) => (ownedCountMap.get(player.id) ?? 0) === 0
    );

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
    let skimTotal = 0; // accrued 20% crew-pot share (paid out once below)

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

      // Split the tax (2026-10-01 crew-pot ruling, GAME_INTEGRATION_STUDY
      // §5C): the boss keeps 80%, 20% is recycled into the CREW POT that
      // pays PvE crew jobs — bosses still profit from idle holdings, but a
      // slice now funds gameplay instead of pooling at the top.
      const bossShare = Math.floor(taxAmount * 0.8);
      const potShare = taxAmount - bossShare;

      // Deduct tax from player
      await db
        .update(users)
        .set({
          credits: sql`GREATEST(credits - ${taxAmount}, 0)`,
          updatedAt: now,
        })
        .where(eq(users.id, player.id));

      // Transfer the boss's share
      await db
        .update(users)
        .set({
          credits: sql`LEAST(credits + ${bossShare}, ${sql.raw(MAX_CREDITS_SQL)})`,
          updatedAt: now,
        })
        .where(eq(users.id, player.bossId));

      // Accrue the pot share (single upsert per cron at the end via skimTotal)
      skimTotal += potShare;

      // History entry for player (tax paid)
      historyEntries.push({
        userId: player.id,
        type: "boss_no_income_tax",
        amount: -taxAmount,
        details: JSON.stringify({ toBossId: player.bossId, toBoss: bossUsername, reason: "no_income_hourly_tax" }),
      });

      // History entry for boss (tax received — 80% share; 20% goes to the crew pot)
      historyEntries.push({
        userId: player.bossId,
        type: "boss_no_income_tax",
        amount: bossShare,
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
        data: { amount: bossShare, fromPlayer: player.username, type: "no_income", reason: `1% of ${player.username}'s credits (80% share — 20% to the crew pot)` },
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

    // Bank the accrued crew-pot skim (review blocker: the 20% must actually
    // LAND in the pot or bosses take a pure 20% cut for nothing). One upsert
    // per cron run; onConflictDoUpdate also bootstraps the row if absent.
    if (skimTotal > 0) {
      try {
        await db
          .insert(gameSettings)
          .values({ settingKey: "crew_pot", settingValue: skimTotal, updatedAt: now })
          .onConflictDoUpdate({
            target: gameSettings.settingKey,
            set: { settingValue: sql`${gameSettings.settingValue} + ${skimTotal}`, updatedAt: now },
          });
      } catch (potError) {
        console.error("Crew pot accrual error (tax already split; this run's skim is lost):", potError);
      }
    }

    return NextResponse.json({
      success: true,
      skipped: false,
      message: `Boss tax applied to ${playersTaxed} players without income`,
      playersTaxed,
      totalTaxCollected,
      crewPotSkim: skimTotal,
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
