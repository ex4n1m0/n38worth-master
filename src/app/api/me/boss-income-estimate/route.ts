import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { safePortfolioValue, safeReward } from "@/lib/safeguards";

/**
 * Returns the estimated boss income PER HOUR based on current ownership state.
 *
 * Two tax streams:
 * 1. Portfolio tax: 10% of each owned player's 0.2% portfolio reward × 30 cycles/hour
 * 2. Hourly tax: 1% of credits for owned players who own 0 players (once/hour)
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    // Get all players owned by the current user
    const ownedPlayers = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        credits: users.credits,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(eq(ownership.ownerId, userId));

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
      // Calculate the player's portfolio value (same as portfolio-reward cron)
      const [portfolioResult] = await db
        .select({
          ownedValue: sql<number>`COALESCE(SUM(${users.playerValue} * (1 + (SELECT COUNT(*) FROM ownership o2 WHERE o2.owner_id = ${users.id}))), 0)`.as("owned_value"),
        })
        .from(ownership)
        .innerJoin(users, eq(ownership.ownedId, users.id))
        .where(eq(ownership.ownerId, player.id));

      const [ownerCountResult] = await db
        .select({
          ownerCount: sql<number>`COUNT(*)`.as("owner_count"),
        })
        .from(ownership)
        .where(eq(ownership.ownedId, player.id));

      const ownedValue = Number(portfolioResult?.ownedValue ?? 0);
      const ownerCount = Number(ownerCountResult?.ownerCount ?? 0);

      const portfolioValue = safePortfolioValue(player.playerValue, ownedValue, ownerCount);

      // Portfolio tax: 10% of 0.2% portfolio reward per cycle × 30 cycles/hour
      const grossRewardPerCycle = safeReward(portfolioValue, 0.002);
      const bossTaxPerCycle = Math.floor(grossRewardPerCycle * 0.1);
      portfolioTaxPerHour += bossTaxPerCycle * 30;

      // Check if this player owns 0 players → they pay hourly tax (1% of credits, once/hour)
      const [ownedCountResult] = await db
        .select({
          count: sql<number>`COUNT(*)`.as("owned_count"),
        })
        .from(ownership)
        .where(eq(ownership.ownerId, player.id));

      const ownedCount = Number(ownedCountResult?.count ?? 0);
      if (ownedCount === 0) {
        const hourlyTax = Math.floor(Number(player.credits) * 0.01);
        if (hourlyTax > 0) {
          hourlyTaxPerHour += hourlyTax;
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
