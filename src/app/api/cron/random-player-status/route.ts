import { NextResponse } from "next/server";
import { db } from "@/db";
import { gameSettings, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getCreationIntervalMinutes } from "@/lib/random-player";

// Must match the key used by src/app/api/cron/random-player/route.ts
const LAST_CRON_KEY = "random_player_last_cron_at";

async function getLastCronTime(): Promise<Date | null> {
  const [row] = await db
    .select({ settingValue: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, LAST_CRON_KEY))
    .limit(1);
  if (!row || !row.settingValue) return null;
  return new Date(row.settingValue * 1000);
}

/**
 * Count visible, in-play NPCs — must match the cron's definition so the
 * frontend countdown mirrors the server's actual behavior.
 */
async function countActiveNpcs(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(users)
    .where(sql`${users.isNpc} = 1 AND ${users.isOnboardingPool} = 0`);
  return Number(row?.count ?? 0);
}

/**
 * GET endpoint to check the status of random player creation timing.
 * Returns the actual next creation time based on server logic, including
 * the tiered interval and the 600-NPC population cap.
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
    const now = new Date();

    // Surface server misconfiguration to the UI rather than claiming we're
    // ready to create when the cron will always fail.
    if (!process.env.UNSPLASH_ACCESS_KEY?.trim()) {
      return NextResponse.json({
        canCreate: false,
        capped: false,
        misconfigured: true,
        reason:
          "Server misconfiguration: UNSPLASH_ACCESS_KEY is not set. Random player creation is disabled.",
        npcCount: null,
        intervalMinutes: null,
        nextCreationTime: null,
        timestamp: now.toISOString(),
      });
    }

    const npcCount = await countActiveNpcs();
    const intervalMinutes = getCreationIntervalMinutes(npcCount);

    // Population cap reached — no creation until cleanup brings us back under.
    if (intervalMinutes === null) {
      return NextResponse.json({
        canCreate: false,
        capped: true,
        reason: `Population cap reached (${npcCount} NPCs). No new random players will be created.`,
        npcCount,
        intervalMinutes: null,
        nextCreationTime: null,
        timestamp: now.toISOString(),
      });
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    const lastCronTime = await getLastCronTime();

    if (lastCronTime) {
      const minutesSinceLastCron =
        (now.getTime() - lastCronTime.getTime()) / (1000 * 60);

      if (minutesSinceLastCron < intervalMinutes) {
        const nextCreationTime = new Date(lastCronTime.getTime() + intervalMs);
        return NextResponse.json({
          canCreate: false,
          capped: false,
          reason: `Waiting for interval. ${minutesSinceLastCron.toFixed(2)}/${intervalMinutes} minutes elapsed.`,
          npcCount,
          intervalMinutes,
          minutesSinceLastCron: Math.round(minutesSinceLastCron * 100) / 100,
          nextCreationTime: nextCreationTime.toISOString(),
          timestamp: now.toISOString(),
        });
      }

      return NextResponse.json({
        canCreate: true,
        capped: false,
        reason: `Enough time has passed. Ready to create new player.`,
        npcCount,
        intervalMinutes,
        minutesSinceLastCron: Math.round(minutesSinceLastCron * 100) / 100,
        nextCreationTime: now.toISOString(),
        timestamp: now.toISOString(),
      });
    }

    // No cron has recorded a run yet — first tick will create immediately.
    return NextResponse.json({
      canCreate: true,
      capped: false,
      reason: "No cron run recorded yet. Ready to create first player.",
      npcCount,
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
