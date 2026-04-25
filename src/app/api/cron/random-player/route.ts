import { NextResponse } from "next/server";
import { createRandomPlayer, getCreationIntervalMinutes } from "@/lib/random-player";
import { db } from "@/db";
import {
  users,
  ownership,
  transactions,
  messages,
  gameHistory,
  gameSettings,
} from "@/db/schema";
import { sql, eq, or, and, isNull, lte } from "drizzle-orm";

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

/**
 * Delete NPCs that have been ownerless for more than 1 day. Runs every
 * cron invocation regardless of whether we're also creating a new player,
 * so cleanup doesn't get starved when creation is skipped.
 *
 * Uses a single LEFT JOIN to find ownerless NPCs in one query instead of
 * the previous N+1 pattern that ran one ownership SELECT per NPC. At the
 * 600-NPC population cap this turns ~600 serial queries into 1.
 */
async function cleanupOwnerlessNpcs(now: Date): Promise<number> {
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const ownerlessNpcs = await db
    .select({
      id: users.id,
      username: users.username,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(ownership, eq(ownership.ownedId, users.id))
    .where(
      and(
        eq(users.isNpc, 1),
        eq(users.isProtected, 0),
        lte(users.createdAt, oneDayAgo),
        isNull(ownership.ownedId)
      )
    );

  let deletedCount = 0;

  for (const npc of ownerlessNpcs) {
    try {
      const createdAt = new Date(npc.createdAt);
      const daysSinceCreation =
        (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

      await db.insert(gameHistory).values({
        eventType: "npc_deletion",
        actorId: null,
        targetId: npc.id,
        targetUsername: npc.username,
        details: JSON.stringify({
          reason: "ownerless_older_than_1_day",
          daysSinceCreation: Math.round(daysSinceCreation * 10) / 10,
          createdAt: npc.createdAt,
        }),
      });

      // ownership rows keyed by this NPC as owner can still exist even
      // though no one owns THEM, so clear both sides.
      await db.delete(ownership).where(eq(ownership.ownerId, npc.id));
      await db.delete(ownership).where(eq(ownership.ownedId, npc.id));
      await db
        .delete(transactions)
        .where(
          or(eq(transactions.buyerId, npc.id), eq(transactions.targetId, npc.id))
        );
      await db
        .delete(messages)
        .where(
          or(eq(messages.senderId, npc.id), eq(messages.recipientId, npc.id))
        );
      await db.delete(users).where(eq(users.id, npc.id));

      deletedCount++;
      console.log(
        `Deleted ownerless NPC "${npc.username}" (created ${daysSinceCreation.toFixed(1)} days ago)`
      );
    } catch (err) {
      console.error(`Failed to delete NPC "${npc.username}" (id: ${npc.id}):`, err);
    }
  }

  console.log(
    `Cleanup complete: Deleted ${deletedCount} ownerless NPC(s) older than 1 day`
  );
  return deletedCount;
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

    // Always run ownerless-NPC cleanup, even when we skip creation for this tick.
    const deletedCount = await cleanupOwnerlessNpcs(now);

    // Determine the dynamic interval (and population cap) based on the
    // current number of active in-play NPCs.
    const npcCount = await countActiveNpcs();
    const intervalMinutes = getCreationIntervalMinutes(npcCount);

    // Hard population cap — once we hit 600 active NPCs we stop creating
    // new ones until cleanup brings us back under the cap. Onboarding NPC
    // provisioning is NOT affected by this cap (separate code path).
    if (intervalMinutes === null) {
      return NextResponse.json({
        success: true,
        skipped: true,
        capped: true,
        reason: `Population cap reached (${npcCount} NPCs). No new random players will be created.`,
        npcCount,
        intervalMinutes: null,
        nextCreationTime: null,
        deletedOwnerlessNpcs: deletedCount,
        timestamp: now.toISOString(),
      });
    }

    const intervalMs = intervalMinutes * 60 * 1000;

    // Check if enough time has passed since the LAST CRON RUN (not the last
    // NPC creation overall — see comment on LAST_CRON_KEY).
    const lastCronTime = await getLastCronTime();

    if (lastCronTime) {
      const minutesSinceLastCron =
        (now.getTime() - lastCronTime.getTime()) / (1000 * 60);

      if (minutesSinceLastCron < intervalMinutes) {
        const nextCreationTime = new Date(lastCronTime.getTime() + intervalMs);
        return NextResponse.json({
          success: true,
          skipped: true,
          capped: false,
          reason: `Not enough time passed. Need ${intervalMinutes} minutes, only ${minutesSinceLastCron.toFixed(2)} minutes since last cron run.`,
          npcCount,
          intervalMinutes,
          minutesSinceLastCron: Math.round(minutesSinceLastCron * 100) / 100,
          nextCreationTime: nextCreationTime.toISOString(),
          deletedOwnerlessNpcs: deletedCount,
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

    return NextResponse.json({
      ...result,
      skipped: false,
      capped: false,
      npcCount,
      intervalMinutes,
      deletedOwnerlessNpcs: deletedCount,
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
