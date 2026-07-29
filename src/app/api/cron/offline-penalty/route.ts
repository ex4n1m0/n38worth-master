import { NextResponse } from "next/server";
import { runOwnershipDecay } from "@/lib/ownershipDecay";
import { db } from "@/db";
import { ownership } from "@/db/schema";
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

    // Tiered offline ownership decay.
    // Players lose their cheapest NPC cards at a rate based on total cards owned:
    //   6000+ → 1 per 10 min, 5000-6000 → 1 per 20 min, ... 500-1000 → 1 per 6h, 0-500 → none.
    const decay = await runOwnershipDecay(false);

    // Clear expired permanent blocks so stale rows don't clog the 10-block
    // cap or linger in the UI. Blocks expire after 24h; enforcement queries
    // already ignore expired rows, this keeps the table clean.
    const clearedPermBlocks = await db
      .update(ownership)
      .set({ permBlockUntil: null })
      .where(sql`${ownership.permBlockUntil} IS NOT NULL AND ${ownership.permBlockUntil} <= NOW()`)
      .returning({ id: ownership.id });

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ownershipDecay: {
        usersProcessed: decay.usersProcessed,
        totalReleased: decay.totalReleased,
        perUser: decay.perUser,
      },
      expiredPermBlocksCleared: clearedPermBlocks.length,
    });
  } catch (error) {
    console.error("Offline penalty cron error:", error);
    return NextResponse.json(
      { error: "Failed to apply offline penalties" },
      { status: 500 }
    );
  }
}
