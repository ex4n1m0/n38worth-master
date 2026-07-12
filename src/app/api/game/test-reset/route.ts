import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { triggerGameReset } from "@/actions/triggerGameReset";

/**
 * Test-only endpoint: triggers a full game reset exactly like the real one,
 * but does NOT record a winner in the Hall of Fame.
 *
 * Only IgorCarlier can call this. The reset is identical in every other way:
 * - All ownership, transactions, messages, avatar reveals are deleted
 * - All accounts are reset to 100 credits, value 1, etc.
 * - Goddess NPCs are reset to their original values
 * - The "world-rebooting" + "game-won" Pusher events are sent
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const callerId = parseInt(session.user.id);

  // Only IgorCarlier can trigger the test reset
  const [caller] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, callerId));

  if (!caller || caller.username !== "IgorCarlier") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  try {
    const result = await triggerGameReset(
      callerId,
      caller.username,
      undefined, // no countdown start (skip idempotency marker)
      { skipHallOfFame: true }
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "World reset triggered (test mode — no Hall of Fame entry)",
      ...result,
    });
  } catch (error) {
    console.error("Test reset error:", error);
    return NextResponse.json({ error: "Failed to trigger reset" }, { status: 500 });
  }
}
