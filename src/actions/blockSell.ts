"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, messages } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL, capPlayerValue } from "@/lib/safeguards";

const BLOCK_SELL_COST_PERCENT = 1.0; // 100% of self value per hour
const BLOCK_SELL_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hour per press
const MAX_BLOCK_MS = 12 * 60 * 60 * 1000; // 12-hour hard cap on total sell block

export async function blockSell(ownershipId: number) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const ownerId = parseInt(session.user.id);

  try {
    // Get the ownership record — the caller must be the owner
    const [record] = await db
      .select()
      .from(ownership)
      .where(
        and(
          eq(ownership.id, ownershipId),
          eq(ownership.ownerId, ownerId)
        )
      );

    if (!record) {
      return { error: "Ownership record not found. You must be the owner." };
    }

    // Get owner info
    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, ownerId));

    if (!owner) {
      return { error: "Owner not found" };
    }

    // Get owned player info
    const [ownedPlayer] = await db
      .select()
      .from(users)
      .where(eq(users.id, record.ownedId));

    if (!ownedPlayer) {
      return { error: "Player not found" };
    }

    // Calculate cost: 100% of owned player's value per hour
    const cost = Math.max(1, Math.round(BLOCK_SELL_COST_PERCENT * ownedPlayer.playerValue));
    const newValue = capPlayerValue(Math.round(ownedPlayer.playerValue * 1.10));
    const creditsToPlayer = Math.round(cost * 0.90);

    // Check if owner has enough credits
    if (owner.credits < cost) {
      return { error: `Not enough credits. You need ${cost}¢ (100% of ${ownedPlayer.username}'s value of ${ownedPlayer.playerValue}¢)` };
    }

    // Calculate new expiry: if already blocked, extend from current expiry; otherwise from now
    const currentBlockEnd = record.blockSellUntil && new Date(record.blockSellUntil) > new Date()
      ? new Date(record.blockSellUntil).getTime()
      : Date.now();

    // 12-hour hard cap on total sell block
    const remainingBlockMs = Math.max(0, currentBlockEnd - Date.now());
    if (remainingBlockMs >= MAX_BLOCK_MS) {
      return { error: "Sell block is already at the 12-hour maximum. Wait for it to decrease before adding more." };
    }

    const newExpiresAt = new Date(currentBlockEnd + BLOCK_SELL_DURATION_MS);
    const totalHoursRemaining = Math.ceil((newExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60));

    // Deduct credits from the owner
    await db
      .update(users)
      .set({
        credits: sql`credits - ${cost}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ownerId));

    // Pay the owned player + bump value — cap to prevent overflow
    await db
      .update(users)
      .set({
        credits: sql`LEAST(credits + ${creditsToPlayer}, ${sql.raw(MAX_CREDITS_SQL)})`,
        playerValue: newValue,
      })
      .where(eq(users.id, record.ownedId));

    // Set block on the ownership record
    await db
      .update(ownership)
      .set({
        blockSellUntil: newExpiresAt,
        blockSellBy: owner.username,
      })
      .where(eq(ownership.id, ownershipId));

    // Send a DM chat message to the owned player about the block
    const now = new Date();
    const timestamp = now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const blockContent = `🔒 ${owner.username} blocked you from being sold! +1h, value → ${newValue}¢ (+${creditsToPlayer}¢ gifted) — ${timestamp}`;

    const [blockMessage] = await db
      .insert(messages)
      .values({
        senderId: ownerId,
        recipientId: record.ownedId,
        content: blockContent,
        type: "private",
      })
      .returning();

    // Push real-time DM notification to both parties
    const messagePayload = {
      id: blockMessage.id,
      content: blockMessage.content,
      type: blockMessage.type,
      createdAt: blockMessage.createdAt,
      sender: {
        id: ownerId,
        username: owner.username,
        avatarUrl: owner.avatarUrl,
      },
      recipientId: record.ownedId,
      recipientUsername: ownedPlayer.username,
    };

    try {
      await Promise.all([
        pusher.trigger(`chat-private-${ownerId}`, "new-message", messagePayload),
        pusher.trigger(`chat-private-${record.ownedId}`, "new-message", messagePayload),
        pusher.trigger(`player-${record.ownedId}`, "credits-updated", {
          message: `${owner.username} blocked you from being sold! You received ${cost}¢`,
        }),
        pusher.trigger(`player-${ownerId}`, "credits-updated", {
          newCredits: owner.credits - cost,
        }),
      ]);
    } catch (e) {
      // Pusher errors are non-critical
    }

    return {
      success: true,
      cost,
      ownedUsername: ownedPlayer.username,
      expiresAt: newExpiresAt.toISOString(),
      totalHours: totalHoursRemaining,
    };
  } catch (error) {
    console.error("Block sell error:", error);
    return { error: "Block sell failed. Please try again." };
  }
}