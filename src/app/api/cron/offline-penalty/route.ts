import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { deleteNpcCascade } from "@/lib/deleteNpc";
import { runOwnershipDecay } from "@/lib/ownershipDecay";

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
    const nowMs = now.getTime();

    // =================================================================
    // Pass 1: Ownerless NPC cleanup (existing behavior)
    // Delete non-protected NPCs that have been ownerless for 24+ hours.
    // =================================================================
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
        sql`${users.isNpc} = 1 AND ${users.ownerlessAt} IS NOT NULL AND ${users.isProtected} = 0`
      );

    let ownerlessDeleted = 0;
    const ownerlessDeletedList: Array<{ username: string; hoursOwnerless: number }> = [];

    for (const npc of inactiveNpcs) {
      // Skip NPCs that have an owner — clear the stale flag.
      if (Number(npc.ownerCount) > 0) {
        await db.update(users).set({ ownerlessAt: null }).where(eq(users.id, npc.id));
        continue;
      }

      const ownerlessAtMs = new Date(npc.ownerlessAt!).getTime();
      const hoursOwnerless = (nowMs - ownerlessAtMs) / (1000 * 60 * 60);

      if (hoursOwnerless >= 24) {
        await deleteNpcCascade(npc.id, npc.username, "ownerless_24h", {
          hoursOwnerless: Math.round(hoursOwnerless * 10) / 10,
        });
        ownerlessDeletedList.push({
          username: npc.username,
          hoursOwnerless: Math.round(hoursOwnerless * 10) / 10,
        });
        ownerlessDeleted++;
      }
    }

    // =================================================================
    // Pass 2: Idle-user ownership decay
    // Humans offline >24h lose 1 owned NPC per hour (oldest first). Hard-delete
    // regular NPCs; release (ownership removed, NPC user kept) for goddesses.
    // =================================================================
    const decay = await runOwnershipDecay(false);

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ownerlessCleanup: {
        totalDeleted: ownerlessDeleted,
        deletedNpcs: ownerlessDeletedList,
      },
      ownershipDecay: {
        usersProcessed: decay.usersProcessed,
        totalDeleted: decay.totalDeleted,
        totalReleasedGoddesses: decay.totalReleasedGoddesses,
        perUser: decay.perUser,
      },
    });
  } catch (error) {
    console.error("Offline penalty cron error:", error);
    return NextResponse.json(
      { error: "Failed to apply offline penalties" },
      { status: 500 }
    );
  }
}
