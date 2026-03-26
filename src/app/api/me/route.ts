import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  // Get current lastOnlineAt to calculate online time delta
  const [currentUser] = await db
    .select({ lastOnlineAt: users.lastOnlineAt, totalOnlineMinutes: users.totalOnlineMinutes })
    .from(users)
    .where(eq(users.id, userId));

  const now = new Date();
  let onlineIncrement = 0;

  if (currentUser?.lastOnlineAt) {
    const diffMinutes = Math.floor(
      (now.getTime() - new Date(currentUser.lastOnlineAt).getTime()) / (1000 * 60)
    );
    // Only count if heartbeat is within 10 minutes (user was actively online)
    if (diffMinutes > 0 && diffMinutes <= 10) {
      onlineIncrement = diffMinutes;
    }
  }

  // Mark user as online, reactivate, and accumulate online time
  await db
    .update(users)
    .set({
      lastOnlineAt: now,
      isActive: 1,
      totalOnlineMinutes: (currentUser?.totalOnlineMinutes ?? 0) + onlineIncrement,
    })
    .where(eq(users.id, userId));

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      playerValue: users.playerValue,
      credits: users.credits,
      isActive: users.isActive,
      wasReset: users.wasReset,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // wasReset flag is included in the response.
  // It is NOT auto-cleared here — the client must explicitly acknowledge it
  // via POST /api/me to avoid race conditions with multiple fetches.
  return NextResponse.json(user);
}

/**
 * POST /api/me — Acknowledge account reset notification.
 * Clears the wasReset flag so the notification is only shown once.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  await db
    .update(users)
    .set({ wasReset: 0 })
    .where(eq(users.id, userId));

  return NextResponse.json({ success: true });
}
