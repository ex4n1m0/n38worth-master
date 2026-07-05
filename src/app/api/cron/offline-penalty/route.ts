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

    // Idle-user ownership decay.
    // Humans offline >24h lose 1 owned NPC per hour (oldest first).
    // Goddesses are released (ownership removed, NPC kept); regular NPC ownership is simply released.
    const decay = await runOwnershipDecay(false);

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      ownershipDecay: {
        usersProcessed: decay.usersProcessed,
        totalReleased: decay.totalDeleted,
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
