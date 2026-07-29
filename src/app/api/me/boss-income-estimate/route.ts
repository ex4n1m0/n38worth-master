import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { safePortfolioValue, safeRewardFractional } from "@/lib/safeguards";

/**
 * Returns the estimated boss income PER HOUR based on current ownership state.
 *
 * Two tax streams (schedule factors pinned to the actual cron cadences):
 * 1. Portfolio tax: 10% of each owned player's 0.2% portfolio reward × 1
 *    full cycle/hour (portfolio-reward cron only does a full run at :00; the
 *    :30 tick is Time-holders only, which we ignore in the estimate).
 * 2. Hourly tax: 1% of credits for owned players who own 0 players, × 0.5
 *    (boss-tax cron only runs every 2 hours).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    // One batched query for all owned players (was 3 queries per player):
    // each row carries the player's portfolio owned-value (same formula as the
    // portfolio-reward cron), their owner count, and how much they themselves own.
    const result = await db.execute(sql`
      SELECT
        p.id AS id,
        p.player_value AS "playerValue",
        p.credits AS credits,
        (SELECT COUNT(*) FROM ownership oc WHERE oc.owned_id = p.id) AS "ownerCount",
        (SELECT COUNT(*) FROM ownership ow WHERE ow.owner_id = p.id) AS "ownedCount",
        COALESCE((
          SELECT SUM(u2.player_value * (1 + (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id)))
          FROM ownership o1
          INNER JOIN users u2 ON u2.id = o1.owned_id
          WHERE o1.owner_id = p.id
        ), 0) AS "ownedValue"
      FROM ownership o
      INNER JOIN users p ON p.id = o.owned_id
      WHERE o.owner_id = ${userId}
    `);

    const ownedPlayers = result.rows as {
      id: number;
      playerValue: number;
      credits: number;
      ownerCount: string | number;
      ownedCount: string | number;
      ownedValue: string | number;
    }[];

    if (ownedPlayers.length === 0) {
      return NextResponse.json({
        estimatedPerHour: 0,
        portfolioTaxPerHour: 0,
        hourlyTaxPerHour: 0,
        ownedPlayerCount: 0,
      });
    }

    let portfolioTaxPerHour = 0;
    let hourlyTaxPerHour = 0;

    for (const player of ownedPlayers) {
      const ownedValue = Number(player.ownedValue ?? 0);
      const ownerCount = Number(player.ownerCount ?? 0);

      const portfolioValue = safePortfolioValue(Number(player.playerValue), ownedValue, ownerCount);

      // Portfolio tax: 10% of the 0.2% reward × 1 full cycle/hour (see header)
      const grossRewardPerCycle = safeRewardFractional(portfolioValue, 0.002);
      const bossTaxPerCycle = grossRewardPerCycle * 0.1;
      portfolioTaxPerHour += bossTaxPerCycle;

      // Players who own 0 players pay 1% of credits — boss-tax cron runs
      // every 2 hours, so × 0.5 per hour
      const ownedCount = Number(player.ownedCount ?? 0);
      if (ownedCount === 0) {
        const hourlyTax = Math.floor(Number(player.credits) * 0.01);
        if (hourlyTax > 0) {
          hourlyTaxPerHour += hourlyTax * 0.5;
        }
      }
    }

    return NextResponse.json({
      estimatedPerHour: portfolioTaxPerHour + hourlyTaxPerHour,
      portfolioTaxPerHour,
      hourlyTaxPerHour,
      ownedPlayerCount: ownedPlayers.length,
    });
  } catch (error) {
    console.error("Boss income estimate error:", error);
    return NextResponse.json(
      { error: "Failed to estimate boss income" },
      { status: 500 }
    );
  }
}
