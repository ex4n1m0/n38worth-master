import { db } from "@/db";
import { users, ipSessions, multiAccountIncidents, messages } from "@/db/schema";
import { eq, and, ne, gte, or, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Extract the client's public IP address from request headers.
 * Vercel / most reverse proxies set x-forwarded-for or x-real-ip.
 */
export function extractIp(request: Request): string | null {
  const headers = new Headers(request.headers);

  // x-forwarded-for may contain a chain: "client, proxy1, proxy2"
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0].trim();
    if (ip) return ip;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return null;
}

/**
 * Upsert the current user's IP session — track that this user was seen
 * from this IP address at this time.
 */
async function upsertIpSession(userId: number, ipAddress: string, now: Date) {
  await db
    .insert(ipSessions)
    .values({ userId, ipAddress, lastSeenAt: now, createdAt: now })
    .onConflictDoUpdate({
      target: [ipSessions.userId, ipSessions.ipAddress],
      set: { lastSeenAt: now },
    });
}

/**
 * Find other users who have been active from the same IP within the last 24 hours.
 * Excludes the current user and NPC accounts.
 */
async function findSameIpUsers(userId: number, ipAddress: string, now: Date) {
  const cutoff = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);

  const sameIpUsers = await db
    .select({
      userId: ipSessions.userId,
      username: users.username,
      multiAccountWarnings: users.multiAccountWarnings,
      multiAccountPenalized: users.multiAccountPenalized,
      isNpc: users.isNpc,
    })
    .from(ipSessions)
    .innerJoin(users, eq(ipSessions.userId, users.id))
    .where(
      and(
        eq(ipSessions.ipAddress, ipAddress),
        ne(ipSessions.userId, userId),
        gte(ipSessions.lastSeenAt, cutoff),
        eq(users.isNpc, 0) // Skip NPC accounts
      )
    );

  return sameIpUsers;
}

/**
 * Send a system message to a user (appears in their chat/notifications).
 */
async function sendSystemMessage(recipientId: number, content: string) {
  // Use the recipient as the sender for system messages (self-message with type "system")
  await db.insert(messages).values({
    senderId: recipientId,
    recipientId: recipientId,
    content,
    type: "system",
  });
}

/**
 * Send a warning notification to a user via Pusher + system message.
 */
async function sendWarning(userId: number) {
  const warningMessage =
    "⚠️ Multiple accounts detected from the same network. " +
    "Using multiple accounts simultaneously is not allowed. " +
    "If this continues, a 50% penalty will be applied to your credits and player value.";

  await sendSystemMessage(userId, warningMessage);

  try {
    await pusher.trigger(`player-${userId}`, "multi-account-warning", {
      type: "warning",
      message: warningMessage,
    });
  } catch (err) {
    console.error("Pusher error for multi-account warning:", err);
  }
}

/**
 * Apply the 50% penalty to a user's credits and player value.
 */
async function applyPenalty(userId: number) {
  const penaltyMessage =
    "🚫 Multi-account violation confirmed. " +
    "A 50% penalty has been applied to your credits and player value. " +
    "Please stop using multiple accounts from the same network.";

  // Halve credits and player value atomically
  await db
    .update(users)
    .set({
      credits: sql`GREATEST(${users.credits} * 0.5, 0)`,
      playerValue: sql`GREATEST(${users.playerValue} / 2, 1)`,
      multiAccountPenalized: 1,
    })
    .where(eq(users.id, userId));

  await sendSystemMessage(userId, penaltyMessage);

  try {
    await pusher.trigger(`player-${userId}`, "multi-account-penalty", {
      type: "penalty",
      message: penaltyMessage,
    });
  } catch (err) {
    console.error("Pusher error for multi-account penalty:", err);
  }
}

/**
 * Log a multi-account incident for audit trail.
 */
async function logIncident(
  ipAddress: string,
  userId1: number,
  userId2: number,
  action: "warning" | "penalty"
) {
  await db.insert(multiAccountIncidents).values({
    ipAddress,
    userId1,
    userId2,
    action,
  });
}

/**
 * Check if there's already been a recent incident (within last 24h) for this user pair.
 * This prevents repeated actions on every heartbeat within the same 24h window.
 */
async function hasRecentIncident(userId1: number, userId2: number, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);

  const recent = await db
    .select({ id: multiAccountIncidents.id })
    .from(multiAccountIncidents)
    .where(
      and(
        gte(multiAccountIncidents.createdAt, cutoff),
        or(
          and(
            eq(multiAccountIncidents.userId1, userId1),
            eq(multiAccountIncidents.userId2, userId2)
          ),
          and(
            eq(multiAccountIncidents.userId1, userId2),
            eq(multiAccountIncidents.userId2, userId1)
          )
        )
      )
    )
    .limit(1);

  return recent.length > 0;
}

/**
 * Main detection function — called on each heartbeat.
 * 
 * Flow:
 * 1. Upsert the current user's IP session
 * 2. Check if any other users are active from the same IP within 24h
 * 3. Check if there's already been an incident for this pair within 24h (cooldown)
 * 4. If no recent incident:
 *    - 1st occurrence (no prior warnings): Send warning to both users
 *    - 2nd occurrence (either user already warned before): Apply 50% penalty to both
 * 
 * The 24h cooldown between incidents ensures the "second time" means a second
 * separate 24-hour detection window, not the very next heartbeat.
 */
export async function checkMultiAccount(userId: number, ipAddress: string) {
  const now = new Date();

  // Step 1: Record this user's IP activity
  await upsertIpSession(userId, ipAddress, now);

  // Step 2: Find other users on the same IP within 24 hours
  const sameIpUsers = await findSameIpUsers(userId, ipAddress, now);

  if (sameIpUsers.length === 0) return; // No conflict

  // Step 3: Get current user's warning status
  const [currentUser] = await db
    .select({
      multiAccountWarnings: users.multiAccountWarnings,
      multiAccountPenalized: users.multiAccountPenalized,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!currentUser) return;

  for (const otherUser of sameIpUsers) {
    // Both already penalized — skip
    if (currentUser.multiAccountPenalized && otherUser.multiAccountPenalized) {
      continue;
    }

    // Step 4: Check cooldown — skip if there's already been an incident
    // for this pair within the last 24 hours
    const recentlyHandled = await hasRecentIncident(userId, otherUser.userId, now);
    if (recentlyHandled) {
      continue;
    }

    // Either user has been warned before → this is the 2nd+ time → apply penalty
    if (currentUser.multiAccountWarnings > 0 || otherUser.multiAccountWarnings > 0) {
      // Apply penalty to current user if not already penalized
      if (!currentUser.multiAccountPenalized) {
        await applyPenalty(userId);
      }

      // Apply penalty to other user if not already penalized
      if (!otherUser.multiAccountPenalized) {
        await applyPenalty(otherUser.userId);
      }

      await logIncident(ipAddress, userId, otherUser.userId, "penalty");
    } else {
      // First time detection — send warnings to both
      await db
        .update(users)
        .set({ multiAccountWarnings: sql`${users.multiAccountWarnings} + 1` })
        .where(eq(users.id, userId));

      await db
        .update(users)
        .set({ multiAccountWarnings: sql`${users.multiAccountWarnings} + 1` })
        .where(eq(users.id, otherUser.userId));

      await sendWarning(userId);
      await sendWarning(otherUser.userId);

      await logIncident(ipAddress, userId, otherUser.userId, "warning");
    }

    // Only process the first conflicting user to avoid cascading actions
    break;
  }
}
