import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MISSIONS, getOwnedCount } from "@/lib/missions";
import { FINAL_MISSION_INDEX, finalGoddessLabel } from "@/lib/missions-data";
import { getFinalGoddessThreshold } from "@/lib/game-wins";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    let missionLevel = 0;
    try {
      const [row] = await db
        .select({ missionLevel: users.missionLevel })
        .from(users)
        .where(eq(users.id, userId));
      missionLevel = row ? Number(row.missionLevel) : 0;
    } catch {
      // mission_level column may not exist yet
      missionLevel = 0;
    }

    const ownedCount = await getOwnedCount(userId);
    const allComplete = missionLevel >= MISSIONS.length;

    // The final mission's threshold is dynamic: 5,000 base +1,000 per game won.
    const finalThreshold = await getFinalGoddessThreshold();

    let current = null;
    if (!allComplete) {
      const isFinal = missionLevel === FINAL_MISSION_INDEX;
      const threshold = isFinal ? finalThreshold : MISSIONS[missionLevel].threshold;
      current = {
        index: missionLevel,
        threshold,
        label: isFinal ? finalGoddessLabel(threshold) : MISSIONS[missionLevel].label,
        progress: Math.min(ownedCount, threshold),
      };
    }

    return NextResponse.json({
      missionLevel,
      ownedCount,
      totalMissions: MISSIONS.length,
      allComplete,
      current,
      finalGoddessThreshold: finalThreshold,
    });
  } catch (error) {
    console.error("Missions API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch missions" },
      { status: 500 }
    );
  }
}
