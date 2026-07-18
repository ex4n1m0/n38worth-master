import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership, rewardHistory } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { safePortfolioValue, safeReward, MAX_CREDITS_SQL } from "@/lib/safeguards";
import { getGoddessPowers } from "@/lib/goddess-powers";
import { GODDESS_USERNAMES } from "@/lib/goddesses";

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

    // Rewards are HOURLY. The cron fires at :00 and :30 (see vercel.json):
    //   - :00 → FULL run: every active player gets their hourly portfolio reward.
    //   - :30 → Time-only run: ONLY Goddess of Time / Creation holders are paid,
    //           giving them 2x frequency (a payout every 30 min).
    // We key off the wall-clock minute rather than in-memory state so the split
    // is correct even on cold serverless instances.
    const intervalMinutes = 60;
    const globalIntervalSkip = now.getUTCMinutes() >= 15;

    // Get all active players eligible for portfolio rewards: real humans
    // (isNpc=0, which includes AGIs) plus the 6 goddesses (isNpc=1 but
    // autonomous AI players). Regular NPC cards are excluded.
    const allPlayers = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        credits: users.credits,
      })
      .from(users)
      .where(sql`${users.isActive} = 1 AND (${users.isNpc} = 0 OR ${users.username} IN (${sql.join(GODDESS_USERNAMES.map((u) => sql`${u}`), sql`, `)}))`);

    // When the global interval hasn't elapsed, only process Time/Creation holders
    // (they receive rewards every cron tick = 2x frequency). Everyone else is skipped
    // and we return early — preserving the original behaviour for normal players.
    if (globalIntervalSkip) {
      const timePusher: Array<{ channel: string; event: string; data: object }> = [];
      const timeHistory: { userId: number; type: string; amount: number; details: string }[] = [];

      for (const player of allPlayers) {
        const playerPowers = await getGoddessPowers(player.id);
        if (!playerPowers.hasTime) continue;

        const [portfolioResult] = await db
          .select({
            ownedValue: sql<number>`COALESCE(SUM(${users.playerValue} * (1 + (SELECT COUNT(*) FROM ownership o2 WHERE o2.owner_id = ${users.id}))), 0)`.as("owned_value"),
          })
          .from(ownership)
          .innerJoin(users, eq(ownership.ownedId, users.id))
          .where(eq(ownership.ownerId, player.id));

        const [ownerCountResult] = await db
          .select({ ownerCount: sql<number>`COUNT(*)`.as("owner_count") })
          .from(ownership)
          .where(eq(ownership.ownedId, player.id));

        const [bossResult] = await db
          .select({ bossId: ownership.ownerId, bossUsername: users.username })
          .from(ownership)
          .innerJoin(users, eq(ownership.ownerId, users.id))
          .where(eq(ownership.ownedId, player.id))
          .limit(1);

        const ownedValue = Number(portfolioResult?.ownedValue ?? 0);
        const ownerCount = Number(ownerCountResult?.ownerCount ?? 0);
        const bossId = bossResult?.bossId;
        const bossUsername = bossResult?.bossUsername;
        const portfolioValue = safePortfolioValue(player.playerValue, ownedValue, ownerCount);
        const grossReward = safeReward(portfolioValue, 0.002);

        if (grossReward > 0) {
          const bossTax = bossId ? Math.floor(grossReward * 0.1) : 0;
          const baseNetReward = grossReward - bossTax;
          const playerNetReward = playerPowers.hasWealth ? baseNetReward * 2 : baseNetReward;

          let effectiveBossTax = bossTax;
          if (bossId) {
            const bossPowers = await getGoddessPowers(bossId);
            if (bossPowers.hasWealth) effectiveBossTax = bossTax * 2;
          }

          await db
            .update(users)
            .set({ credits: sql`LEAST(credits + ${playerNetReward}, ${sql.raw(MAX_CREDITS_SQL)})`, updatedAt: now })
            .where(eq(users.id, player.id));

          timeHistory.push({ userId: player.id, type: "portfolio_reward", amount: playerNetReward, details: JSON.stringify({ portfolioValue, grossReward, bossTax, hasBoss: !!bossId }) });
          timePusher.push({ channel: `player-${player.id}`, event: "portfolio-reward", data: { amount: playerNetReward, portfolioValue, bossTax, bossUsername } });

          if (bossId && effectiveBossTax > 0) {
            await db
              .update(users)
              .set({ credits: sql`LEAST(credits + ${effectiveBossTax}, ${sql.raw(MAX_CREDITS_SQL)})`, updatedAt: now })
              .where(eq(users.id, bossId));
            timeHistory.push({ userId: bossId, type: "boss_portfolio_tax", amount: effectiveBossTax, details: JSON.stringify({ fromPlayerId: player.id, fromPlayer: player.username, portfolioValue }) });
            timePusher.push({ channel: `player-${bossId}`, event: "boss-tax", data: { amount: effectiveBossTax, fromPlayer: player.username, type: "portfolio" } });
          }
        }
      }

      if (timeHistory.length > 0) {
        try { await db.insert(rewardHistory).values(timeHistory); } catch (e) { console.error("Time reward history error:", e); }
      }
      if (timePusher.length > 0) {
        try { await Promise.all(timePusher.map(({ channel, event, data }) => pusher.trigger(channel, event, data))); } catch (e) { console.error("Time pusher error:", e); }
      }

      return NextResponse.json({
        success: true,
        skipped: true,
        reason: `Interval not elapsed — processed Time/Creation holders only (${timeHistory.length} entries).`,
        intervalMinutes,
        timestamp: now.toISOString(),
      });
    }

    // --- Full run: interval has elapsed, process ALL players ---
    const payouts: { username: string; portfolioValue: number; reward: number; bossTax: number; bossUsername?: string }[] = [];
    const bossTaxes: { bossUsername: string; fromPlayer: string; amount: number }[] = [];
    let totalRewardsDistributed = 0;
    let totalBossTaxesCollected = 0;
    const pusherNotifications: Array<{ channel: string; event: string; data: object }> = [];
    const historyEntries: { userId: number; type: string; amount: number; details: string }[] = [];

    for (const player of allPlayers) {
      const playerPowers = await getGoddessPowers(player.id);
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

      // Get player's boss (the one who owns them)
      const [bossResult] = await db
        .select({
          bossId: ownership.ownerId,
          bossUsername: users.username,
        })
        .from(ownership)
        .innerJoin(users, eq(ownership.ownerId, users.id))
        .where(eq(ownership.ownedId, player.id))
        .limit(1);

      const ownedValue = Number(portfolioResult?.ownedValue ?? 0);
      const ownerCount = Number(ownerCountResult?.ownerCount ?? 0);
      const bossId = bossResult?.bossId;
      const bossUsername = bossResult?.bossUsername;

      // Use BigInt-safe portfolio calculation to avoid overflow with large player values
      const portfolioValue = safePortfolioValue(player.playerValue, ownedValue, ownerCount);

      // Calculate 0.2% reward using BigInt-safe arithmetic
      const grossReward = safeReward(portfolioValue, 0.002);

      if (grossReward > 0) {
        // Calculate boss tax: 10% goes to boss, player keeps 90%
        const bossTax = bossId ? Math.floor(grossReward * 0.1) : 0;
        const baseNetReward = grossReward - bossTax;
        // Wealth / Creation power: 2x portfolio reward for the holder
        const playerNetReward = playerPowers.hasWealth ? baseNetReward * 2 : baseNetReward;

        // If player's boss holds Wealth / Creation, their boss income is also doubled
        let effectiveBossTax = bossTax;
        if (bossId) {
          const bossPowers = await getGoddessPowers(bossId);
          if (bossPowers.hasWealth) effectiveBossTax = bossTax * 2;
        }

        // Update player credits (net reward after boss tax)
        await db
          .update(users)
          .set({
            credits: sql`LEAST(credits + ${playerNetReward}, ${sql.raw(MAX_CREDITS_SQL)})`,
            updatedAt: now,
          })
          .where(eq(users.id, player.id));

        // Player's portfolio reward history entry
        historyEntries.push({
          userId: player.id,
          type: "portfolio_reward",
          amount: playerNetReward,
          details: JSON.stringify({ portfolioValue, grossReward, bossTax, hasBoss: !!bossId }),
        });

        // Pusher notification for player
        pusherNotifications.push({
          channel: `player-${player.id}`,
          event: "portfolio-reward",
          data: { amount: playerNetReward, portfolioValue, bossTax, bossUsername },
        });

        // If player has a boss, transfer the tax (effectiveBossTax is doubled for Wealth/Creation holders)
        if (bossId && effectiveBossTax > 0) {
          await db
            .update(users)
            .set({
              credits: sql`LEAST(credits + ${effectiveBossTax}, ${sql.raw(MAX_CREDITS_SQL)})`,
              updatedAt: now,
            })
            .where(eq(users.id, bossId));

          // Boss tax history entry
          historyEntries.push({
            userId: bossId,
            type: "boss_portfolio_tax",
            amount: effectiveBossTax,
            details: JSON.stringify({ fromPlayerId: player.id, fromPlayer: player.username, portfolioValue }),
          });

          // Pusher notification for boss
          pusherNotifications.push({
            channel: `player-${bossId}`,
            event: "boss-tax",
            data: { amount: effectiveBossTax, fromPlayer: player.username, type: "portfolio" },
          });

          bossTaxes.push({
            bossUsername,
            fromPlayer: player.username,
            amount: effectiveBossTax,
          });

          totalBossTaxesCollected += effectiveBossTax;
        }

        payouts.push({
          username: player.username,
          portfolioValue,
          reward: playerNetReward,
          bossTax,
          bossUsername,
        });

        totalRewardsDistributed += playerNetReward;
      }
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
        console.error("Pusher batch error for portfolio rewards:", pusherError);
      }
    }

    return NextResponse.json({
      success: true,
      skipped: false,
      message: `Portfolio rewards distributed to ${payouts.length} players`,
      totalRewardsDistributed,
      totalBossTaxesCollected,
      intervalMinutes,
      payouts: payouts.slice(0, 10),
      bossTaxes: bossTaxes.slice(0, 10),
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Cron portfolio reward error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to distribute portfolio rewards", details: errorMessage },
      { status: 500 }
    );
  }
}
