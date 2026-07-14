import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, isNotNull, and } from "drizzle-orm";
import { safePortfolioValue, safeReward } from "@/lib/safeguards";
// import { extractIp, checkMultiAccount } from "@/lib/multi-account";

const PERM_BLOCK_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  // Multi-account detection disabled
  // const ipAddress = extractIp(request);
  // if (ipAddress) {
  //   checkMultiAccount(userId, ipAddress).catch((err) => {
  //     console.error("Multi-account check error:", err);
  //   });
  // }

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

  // Mark user as online, reactivate, and accumulate online time (atomic increment)
  await db
    .update(users)
    .set({
      lastOnlineAt: now,
      isActive: 1,
      totalOnlineMinutes: sql`${users.totalOnlineMinutes} + ${onlineIncrement}`,
    })
    .where(eq(users.id, userId));

  // Restart the 24-hour timer on every assigned permanent block while the user is online.
  const newPermBlockUntil = new Date(now.getTime() + PERM_BLOCK_MS);
  await db
    .update(ownership)
    .set({ permBlockUntil: newPermBlockUntil })
    .where(and(eq(ownership.ownerId, userId), isNotNull(ownership.permBlockUntil)));

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

  // Calculate portfolio value: player_value + sum of owned players' values
  // Count ALL owned players, multiply each by (1 + number of players they own)
  const [portfolioResult] = await db
    .select({
      ownedValue: sql<number>`COALESCE(SUM(${users.playerValue} * (1 + (SELECT COUNT(*) FROM ownership o2 WHERE o2.owner_id = ${users.id}))), 0)`.as("owned_value"),
    })
    .from(ownership)
    .innerJoin(users, eq(ownership.ownedId, users.id))
    .where(eq(ownership.ownerId, userId));

  // Get ownerCount (how many players own this player)
  const [ownerCountResult] = await db
    .select({
      ownerCount: sql<number>`COUNT(*)`.as("owner_count"),
    })
    .from(ownership)
    .where(eq(ownership.ownedId, userId));

  const ownedValue = Number(portfolioResult?.ownedValue ?? 0);
  const ownerCount = Number(ownerCountResult?.ownerCount ?? 0);
  const portfolioValue = safePortfolioValue(user.playerValue, ownedValue, ownerCount);

  // Calculate 0.2% reward — same formula as portfolio-reward cron and rankings
  const portfolioReward = safeReward(portfolioValue, 0.002);

  // wasReset flag is included in the response.
  // It is NOT auto-cleared here — the client must explicitly acknowledge it
  // via POST /api/me to avoid race conditions with multiple fetches.
  return NextResponse.json({
    ...user,
    portfolioValue,
    portfolioReward,
  });
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
