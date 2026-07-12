import { NextResponse } from "next/server";
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

    // Tiered offline ownership decay.
    // Players lose their cheapest NPC cards at a rate based on total cards owned:
    //   6000+ → 1 per 10 min, 5000-6000 → 1 per 20 min, ... 500-1000 → 1 per 6h, 0-500 → none.
    const decay = await runOwnershipDecay(false);

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ownershipDecay: {
        usersProcessed: decay.usersProcessed,
        totalReleased: decay.totalReleased,
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
