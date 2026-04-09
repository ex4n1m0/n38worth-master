import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership, transactions, messages, gameHistory } from "@/db/schema";
import { sql, eq, or } from "drizzle-orm";

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
    
    // 24 hours in milliseconds
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    const nowMs = now.getTime();
    
    // Find all NPCs without owners that have been ownerless for 24+ hours
    const inactiveNpcs = await db
      .select({
        id: users.id,
        username: users.username,
        ownerlessAt: users.ownerlessAt,
        isNpc: users.isNpc,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`,
      })
      .from(users)
      .where(
        sql`${users.isNpc} = 1 AND ${users.ownerlessAt} IS NOT NULL`
      );

    let totalDeleted = 0;
    const deletedNpcs: Array<{ username: string; hoursOwnerless: number }> = [];

    for (const npc of inactiveNpcs) {
      // Skip NPCs that have an owner
      if (Number(npc.ownerCount) > 0) {
        // Clear ownerlessAt since NPC now has an owner
        await db
          .update(users)
          .set({ ownerlessAt: null })
          .where(eq(users.id, npc.id));
        continue;
      }

      // Calculate how long NPC has been ownerless
      const ownerlessAtMs = new Date(npc.ownerlessAt!).getTime();
      const hoursOwnerless = (nowMs - ownerlessAtMs) / (1000 * 60 * 60);

      // Delete if ownerless for 24+ hours
      if (hoursOwnerless >= 24) {
        // Log to game history before deletion
        await db.insert(gameHistory).values({
          eventType: "npc_deletion",
          actorId: null, // System action
          targetId: npc.id,
          targetUsername: npc.username,
          details: JSON.stringify({ reason: "ownerless_24h", hoursOwnerless: Math.round(hoursOwnerless * 10) / 10 }),
        });

        // Execute deletion operations individually
        // Note: neon-http does not support transactions, so we execute operations individually
        // Delete ownership records where this NPC owns others
        await db.delete(ownership).where(eq(ownership.ownerId, npc.id));
        // Delete ownership records where others own this NPC
        await db.delete(ownership).where(eq(ownership.ownedId, npc.id));
        // Delete transactions involving this NPC
        await db.delete(transactions).where(
          or(eq(transactions.buyerId, npc.id), eq(transactions.targetId, npc.id))
        );
        // Delete messages involving this NPC
        await db.delete(messages).where(
          or(eq(messages.senderId, npc.id), eq(messages.recipientId, npc.id))
        );
        // Delete the NPC player
        await db.delete(users).where(eq(users.id, npc.id));
        
        deletedNpcs.push({
          username: npc.username,
          hoursOwnerless: Math.round(hoursOwnerless * 10) / 10,
        });
        totalDeleted++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `NPC cleanup: Deleted ${totalDeleted} NPC(s) without owner for 24+ hours.`,
      totalDeleted,
      deletedNpcs,
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
