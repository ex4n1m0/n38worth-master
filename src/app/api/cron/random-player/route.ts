import { NextResponse } from "next/server";
import { createRandomPlayer } from "@/lib/random-player";
import { db } from "@/db";
import { users, ownership, transactions, messages, gameHistory } from "@/db/schema";
import { sql, eq, or } from "drizzle-orm";

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
    // Fixed interval: 3 minutes
    const intervalMinutes = 3;
    const intervalMs = intervalMinutes * 60 * 1000;

    // Check if enough time has passed since the last NPC creation
    const lastCreationTime = await getLastNpcCreationTime();
    const now = new Date();
    
    if (lastCreationTime) {
      const minutesSinceLastCreation = (now.getTime() - lastCreationTime.getTime()) / (1000 * 60);
      
      if (minutesSinceLastCreation < intervalMinutes) {
        const nextCreationTime = new Date(lastCreationTime.getTime() + intervalMs);

        return NextResponse.json({
          success: true,
          skipped: true,
          reason: `Not enough time passed. Need ${intervalMinutes} minutes, only ${minutesSinceLastCreation.toFixed(2)} minutes since last creation.`,
          intervalMinutes,
          minutesSinceLastCreation: Math.round(minutesSinceLastCreation * 100) / 100,
          nextCreationTime: nextCreationTime.toISOString(),
          timestamp: now.toISOString(),
        });
      }
    }

    // Clean up NPCs without owners older than 1 day
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const npcs = await db
      .select({
        id: users.id,
        username: users.username,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.isNpc, 1));

    let deletedCount = 0;
    
    for (const npc of npcs) {
      // Check if NPC has any owners
      const owners = await db
        .select()
        .from(ownership)
        .where(eq(ownership.ownedId, npc.id));
      
      const hasOwner = owners.length > 0;
      const isOlderThan1Day = npc.createdAt <= oneDayAgo;
      
      // Delete if: no owner AND created more than 1 day ago
      if (!hasOwner && isOlderThan1Day) {
        try {
          const daysSinceCreation = (now.getTime() - new Date(npc.createdAt).getTime()) / (1000 * 60 * 60 * 24);

          // Log to game history before deletion
          await db.insert(gameHistory).values({
            eventType: "npc_deletion",
            actorId: null,
            targetId: npc.id,
            targetUsername: npc.username,
            details: JSON.stringify({ 
              reason: "ownerless_older_than_1_day", 
              daysSinceCreation: Math.round(daysSinceCreation * 10) / 10,
              createdAt: npc.createdAt
            }),
          });

          // Delete related records
          await db.delete(ownership).where(eq(ownership.ownerId, npc.id));
          await db.delete(ownership).where(eq(ownership.ownedId, npc.id));
          await db.delete(transactions).where(
            or(eq(transactions.buyerId, npc.id), eq(transactions.targetId, npc.id))
          );
          await db.delete(messages).where(
            or(eq(messages.senderId, npc.id), eq(messages.recipientId, npc.id))
          );
          await db.delete(users).where(eq(users.id, npc.id));
          
          deletedCount++;
          console.log(`Deleted ownerless NPC "${npc.username}" (created ${daysSinceCreation.toFixed(1)} days ago)`);
        } catch (err) {
          console.error(`Failed to delete NPC "${npc.username}" (id: ${npc.id}):`, err);
        }
      }
    }

    console.log(`Cleanup complete: Deleted ${deletedCount} ownerless NPC(s) older than 1 day`);

    // Create a new random player
    const result = await createRandomPlayer();

    return NextResponse.json({
      ...result,
      skipped: false,
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
