import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getCountdownState,
  getLastProcessedCountdownStart,
  isResolvingState,
} from "@/lib/goddess-countdown";

// Public global state, polled every 15s by many clients — cache at the CDN so
// a single function invocation serves all viewers within the window.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" };

export async function GET() {
  try {
    const state = await getCountdownState();
    // Expired-but-unprocessed window: the payload is idle-shaped, but the
    // win/cancel resolution is still pending (M1). s-maxage=10 keeps this
    // time-dependent field fresh enough.
    const resolving = isResolvingState(
      state,
      await getLastProcessedCountdownStart()
    );

    if (!state.active || state.userId === 0) {
      return NextResponse.json({
        active: false,
        userId: 0,
        username: null,
        startedAt: 0,
        expiresAt: 0,
        remainingSeconds: 0,
        durationMinutes: state.durationMinutes,
        resolving,
      }, { headers: CACHE_HEADERS });
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
      resolving, // always false while active (remaining > 0)
    }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Goddess countdown fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch countdown state" },
      { status: 500 }
    );
  }
}
