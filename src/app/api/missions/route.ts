import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MISSIONS, getOwnedCount } from "@/lib/missions";

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

    const current = allComplete
      ? null
      : {
          index: missionLevel,
          threshold: MISSIONS[missionLevel].threshold,
          label: MISSIONS[missionLevel].label,
          progress: Math.min(ownedCount, MISSIONS[missionLevel].threshold),
        };

    return NextResponse.json({
      missionLevel,
      ownedCount,
      totalMissions: MISSIONS.length,
      allComplete,
      current,
    });
  } catch (error) {
    console.error("Missions API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch missions" },
      { status: 500 }
    );
  }
}
