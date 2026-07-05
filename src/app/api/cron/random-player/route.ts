import { NextResponse } from "next/server";
import {
  createRandomPlayer,
  getCreationContext,
  MIN_GAP_ON_WAKE_MINUTES,
} from "@/lib/random-player";
import { db } from "@/db";
import {
  users,
  gameSettings,
} from "@/db/schema";
import { sql, eq } from "drizzle-orm";

/**
 * Count visible, in-play NPCs. We exclude the onboarding pool (those are
 * reserve NPCs not yet assigned to a player) but INCLUDE protected NPCs
 * (e.g. goddesses) since they're live in the game world.
 */
async function countActiveNpcs(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(users)
    .where(sql`${users.isNpc} = 1 AND ${users.isOnboardingPool} = 0`);
  return Number(row?.count ?? 0);
}


// Key used in the game_settings table to track when the scheduled random-player
// cron last created an NPC. We store epoch SECONDS (fits in int32 until 2038).
//
// We deliberately DO NOT derive this from the most-recent NPC's createdAt:
// the onboarding pool creates NPCs too, and using their timestamps would
// indefinitely starve the scheduled cron.
const LAST_CRON_KEY = "random_player_last_cron_at";
// Tracks whether the previous tick saw any humans online. Encoded as an int
// because the game_settings.settingValue column is `integer`:
//   1 → "online"
//   0 → "idle"
// When this row is missing we treat the previous mode as "idle", which makes
// the very first online tick after deploy trigger the wake-path.
const LAST_MODE_KEY = "random_player_last_mode";

async function getLastCronTime(): Promise<Date | null> {
  const [row] = await db
    .select({ settingValue: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, LAST_CRON_KEY))
    .limit(1);
  if (!row || !row.settingValue) return null;
  return new Date(row.settingValue * 1000);
}

async function setLastCronTime(date: Date): Promise<void> {
  const seconds = Math.floor(date.getTime() / 1000);
  // Upsert via insert + on-conflict update.
  await db
    .insert(gameSettings)
    .values({ settingKey: LAST_CRON_KEY, settingValue: seconds })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: seconds, updatedAt: new Date() },
    });
}

async function getLastMode(): Promise<"online" | "idle"> {
  const [row] = await db
    .select({ settingValue: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, LAST_MODE_KEY))
    .limit(1);
  return row?.settingValue === 1 ? "online" : "idle";
}

async function setLastMode(mode: "online" | "idle"): Promise<void> {
  const value = mode === "online" ? 1 : 0;
  await db
    .insert(gameSettings)
    .values({ settingKey: LAST_MODE_KEY, settingValue: value })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: value, updatedAt: new Date() },
    });
}

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

    // Determine the current number of active in-play NPCs (purely for the
    // response payload — population is no longer used for gating).
    const npcCount = await countActiveNpcs();

    // Decide the cadence based on whether any humans are currently online.
    const { onlineHumans, intervalMinutes, mode } = await getCreationContext();
    const intervalMs = intervalMinutes * 60 * 1000;

    // Check if enough time has passed since the LAST CRON RUN (not the last
    // NPC creation overall — see comment on LAST_CRON_KEY).
    const lastCronTime = await getLastCronTime();
    const lastMode = await getLastMode();

    // Idle → online wake: the previous tick saw nobody online, but this tick
    // does. Bypass the (potentially 24h-old) interval gate and create one
    // NPC immediately so newly-arrived players don't wait out the leftover
    // idle interval. Still respect a small min-gap as a sanity check against
    // unexpected back-to-back cron invocations.
    let isWake = false;
    if (lastMode === "idle" && mode === "online") {
      const minutesSinceLastCron = lastCronTime
        ? (now.getTime() - lastCronTime.getTime()) / (1000 * 60)
        : Infinity;
      if (minutesSinceLastCron >= MIN_GAP_ON_WAKE_MINUTES) {
        isWake = true;
      }
    }

    if (!isWake && lastCronTime) {
      const minutesSinceLastCron =
        (now.getTime() - lastCronTime.getTime()) / (1000 * 60);

      if (minutesSinceLastCron < intervalMinutes) {
        const nextCreationTime = new Date(lastCronTime.getTime() + intervalMs);
        // Persist current mode even when skipping so transitions are detected
        // on the very next tick instead of being delayed by one cron cycle.
        if (mode !== lastMode) {
          await setLastMode(mode);
        }
        return NextResponse.json({
          success: true,
          skipped: true,
          capped: false,
          wake: false,
          mode,
          onlineHumans,
          reason: `Not enough time passed. Need ${intervalMinutes} minutes, only ${minutesSinceLastCron.toFixed(2)} minutes since last cron run.`,
          npcCount,
          intervalMinutes,
          minutesSinceLastCron: Math.round(minutesSinceLastCron * 100) / 100,
          nextCreationTime: nextCreationTime.toISOString(),
          timestamp: now.toISOString(),
        });
      }
    }

    // Create a new random player
    const result = await createRandomPlayer();

    // Only advance the scheduler when creation actually succeeded. On failure
    // (rate limit, transient error, etc.) the next tick will retry instead of
    // waiting another full interval.
    if (result.success) {
      await setLastCronTime(now);
    }
    // Always persist the current mode so the next tick can correctly detect
    // online/idle transitions, even if creation failed.
    if (mode !== lastMode) {
      await setLastMode(mode);
    }

    return NextResponse.json({
      ...result,
      skipped: false,
      capped: false,
      wake: isWake,
      mode,
      onlineHumans,
      npcCount,
      intervalMinutes,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Random player cron error:", error);
    return NextResponse.json(
      { error: "Failed to create random player" },
      { status: 500 }
    );
  }
}
