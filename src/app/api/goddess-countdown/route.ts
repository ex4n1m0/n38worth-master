import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCountdownState } from "@/lib/goddess-countdown";

export async function GET() {
  try {
    const state = await getCountdownState();

    if (!state.active || state.userId === 0) {
      return NextResponse.json({
        active: false,
        userId: 0,
        username: null,
        startedAt: 0,
        expiresAt: 0,
        remainingSeconds: 0,
        durationMinutes: state.durationMinutes,
      });
    }

    // Fetch the username for the countdown user
    const [user] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, state.userId));

    return NextResponse.json({
      active: state.active,
      userId: state.userId,
      username: user?.username ?? "Unknown",
      startedAt: state.startedAt,
      expiresAt: state.expiresAt,
      remainingSeconds: state.remainingSeconds,
      durationMinutes: state.durationMinutes,
    });
  } catch (error) {
    console.error("Goddess countdown fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch countdown state" },
      { status: 500 }
    );
  }
}
