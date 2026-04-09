import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, gameSettings, gameHistory } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

/**
 * Cron job to update the daily ownership limit based on 10% of total players
 * Runs daily at midnight (0 0 * * *)
 */
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
    // Count total players in the game
    const [playerCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users);

    const totalPlayers = playerCount.count;
    
    // Calculate 10% of total players, rounded down, minimum 1
    const newLimit = Math.max(1, Math.floor(totalPlayers * 0.1));

    // Get current limit for logging
    const [currentSetting] = await db
      .select({ value: gameSettings.settingValue })
      .from(gameSettings)
      .where(eq(gameSettings.settingKey, "max_ownership_limit"));

    const previousLimit = currentSetting?.value ?? null;

    // Update or insert the ownership limit
    await db
      .insert(gameSettings)
      .values({
        settingKey: "max_ownership_limit",
        settingValue: newLimit,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: gameSettings.settingKey,
        set: {
          settingValue: newLimit,
          updatedAt: new Date(),
        },
      });

    // Log the change to game history
    await db.insert(gameHistory).values({
      eventType: "ownership_limit_update",
      actorId: null,
      targetId: null,
      targetUsername: null,
      details: JSON.stringify({
        previousLimit,
        newLimit,
        totalPlayers,
        calculation: `${totalPlayers} players * 0.1 = ${newLimit}`,
        timestamp: new Date().toISOString(),
      }),
    });

    console.log(
      `Ownership limit updated: ${previousLimit} → ${newLimit} (${totalPlayers} total players)`
    );

    return NextResponse.json({
      success: true,
      previousLimit,
      newLimit,
      totalPlayers,
      calculation: `${totalPlayers} players * 0.1 = ${newLimit}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Ownership limit cron error:", error);
    return NextResponse.json(
      { error: "Failed to update ownership limit" },
      { status: 500 }
    );
  }
}