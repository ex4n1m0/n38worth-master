import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { sql } from "drizzle-orm";

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
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Find all players who were last online more than 1 hour ago
    // and have more than 1 credit (no need to process those already at minimum)
    // Include both NPC without owner and human players
    const inactivePlayers = await db
      .select({
        id: users.id,
        username: users.username,
        credits: users.credits,
        lastOnlineAt: users.lastOnlineAt,
        isNpc: users.isNpc,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`,
      })
      .from(users)
      .where(
        sql`${users.lastOnlineAt} < ${oneHourAgo} AND ${users.credits} > 1`
      );

    let totalPenalized = 0;
    let totalDeleted = 0;
    const penalties: Array<{ username: string; hoursOffline: number; oldCredits: number; newCredits: number; isNpc: boolean; deleted: boolean }> = [];

    for (const player of inactivePlayers) {
      const isNpcWithoutOwner = player.isNpc === 1 && Number(player.ownerCount) === 0;
      const isHuman = player.isNpc === 0;

      // Only apply penalty to: NPC without owner OR human players
      if (!isNpcWithoutOwner && !isHuman) continue;

      // Calculate hours offline (round down)
      const hoursOffline = Math.floor(
        (now.getTime() - new Date(player.lastOnlineAt).getTime()) / (1000 * 60 * 60)
      );

      if (hoursOffline < 1) continue;

      // Calculate new credits: reduce by 1% per hour offline
      // Formula: newCredits = oldCredits * (0.99 ^ hoursOffline)
      const decayFactor = Math.pow(0.99, hoursOffline);
      let newCredits = player.credits * decayFactor;

      // Round to 2 decimal places
      newCredits = Math.round(newCredits * 100) / 100;

      // Never go below 1 credit
      newCredits = Math.max(newCredits, 1);

      // Only update if credits actually changed
      if (newCredits < player.credits) {
        let deleted = false;

        // NPC without owner: delete when credits reach 1
        if (isNpcWithoutOwner && newCredits <= 1) {
          // Delete ownership records where this NPC owns others
          await db.delete(ownership).where(sql`${ownership.ownerId} = ${player.id}`);
          // Delete ownership records where others own this NPC
          await db.delete(ownership).where(sql`${ownership.ownedId} = ${player.id}`);
          // Delete the NPC player
          await db.delete(users).where(sql`${users.id} = ${player.id}`);
          deleted = true;
          totalDeleted++;
        } else {
          // Calculate estimated deletion time for NPC without owner
          let estimatedDeletionAt: Date | null = null;
          if (isNpcWithoutOwner && newCredits > 1) {
            // Hours until credits decay to 1: ln(credits) / (-ln(0.99))
            const hoursUntilDeletion = Math.ceil(Math.log(newCredits) / (-Math.log(0.99)));
            estimatedDeletionAt = new Date(now.getTime() + hoursUntilDeletion * 60 * 60 * 1000);
          }

          // Update credits only (value is NEVER affected by offline penalty)
          await db
            .update(users)
            .set({
              credits: newCredits,
              estimatedDeletionAt,
              updatedAt: now,
            })
            .where(sql`${users.id} = ${player.id}`);
        }

        penalties.push({
          username: player.username,
          hoursOffline,
          oldCredits: Math.round(player.credits * 100) / 100,
          newCredits,
          isNpc: player.isNpc === 1,
          deleted,
        });
        totalPenalized++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Offline penalty applied: 1% credit decay per hour. NPC without owner deleted at 1¢. Value never affected.`,
      totalPenalized,
      totalDeleted,
      penalties,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Offline penalty cron error:", error);
    return NextResponse.json(
      { error: "Failed to apply offline penalties" },
      { status: 500 }
    );
  }
}
