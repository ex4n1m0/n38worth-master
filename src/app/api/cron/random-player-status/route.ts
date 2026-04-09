import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * Get the timestamp of the last created NPC player
 */
async function getLastNpcCreationTime(): Promise<Date | null> {
  const [lastNpc] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(sql`${users.isNpc} = 1`)
    .orderBy(sql`${users.createdAt} DESC`)
    .limit(1);
  
  return lastNpc?.createdAt ? new Date(lastNpc.createdAt) : null;
}

/**
 * GET endpoint to check the status of random player creation timing.
 * Returns the actual next creation time based on server logic.
 * This allows the frontend countdown to be in sync with the actual cron behavior.
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
    // Fixed interval: 3 minutes (matches cron job)
    const intervalMinutes = 3;
    const intervalMs = intervalMinutes * 60 * 1000;

    // Check when the last NPC was created
    const lastCreationTime = await getLastNpcCreationTime();
    const now = new Date();
    
    if (lastCreationTime) {
      const minutesSinceLastCreation = (now.getTime() - lastCreationTime.getTime()) / (1000 * 60);
      
      if (minutesSinceLastCreation < intervalMinutes) {
        // Not enough time has passed, calculate next creation time
        const nextCreationTime = new Date(lastCreationTime.getTime() + intervalMs);

        return NextResponse.json({
          canCreate: false,
          reason: `Waiting for interval. ${minutesSinceLastCreation.toFixed(2)}/${intervalMinutes} minutes elapsed.`,
          intervalMinutes,
          minutesSinceLastCreation: Math.round(minutesSinceLastCreation * 100) / 100,
          nextCreationTime: nextCreationTime.toISOString(),
          timestamp: now.toISOString(),
        });
      } else {
        // Enough time has passed, player can be created
        return NextResponse.json({
          canCreate: true,
          reason: `Enough time has passed. Ready to create new player.`,
          intervalMinutes,
          minutesSinceLastCreation: Math.round(minutesSinceLastCreation * 100) / 100,
          nextCreationTime: now.toISOString(), // Can create now
          timestamp: now.toISOString(),
        });
      }
    }

    // No NPC exists yet - can create immediately
    return NextResponse.json({
      canCreate: true,
      reason: "No NPCs exist yet. Ready to create first player.",
      intervalMinutes,
      nextCreationTime: now.toISOString(),
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Random player status error:", error);
    return NextResponse.json(
      { error: "Failed to get random player status" },
      { status: 500 }
    );
  }
}
