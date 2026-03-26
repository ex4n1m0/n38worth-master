"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, messages } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";

const BLOCK_SELL_COST_PERCENT = 0.01; // 1% of self cost per hour
const BLOCK_SELL_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hour per press

export async function blockSell(ownershipId: number) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const playerId = parseInt(session.user.id);

  try {
    // Get the ownership record — must be an ownership where the current player is the owned one
    const [record] = await db
      .select()
      .from(ownership)
      .where(
        and(
          eq(ownership.id, ownershipId),
          eq(ownership.ownedId, playerId)
        )
      );

    if (!record) {
      return { error: "Ownership record not found" };
    }

    // Get player info
    const [player] = await db
      .select()
      .from(users)
      .where(eq(users.id, playerId));

    if (!player) {
      return { error: "Player not found" };
    }

    // Get owner info
    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, record.ownerId));

    if (!owner) {
      return { error: "Owner not found" };
    }

    // Calculate cost: 1% of player value per hour
    const cost = Math.max(1, Math.round(BLOCK_SELL_COST_PERCENT * player.playerValue));

    // Check if player has enough credits
    if (player.credits < cost) {
      return { error: `Not enough credits. You need ${cost}¢ (1% of your value of ${player.playerValue}¢)` };
    }

    // Deduct credits from the player (floor at 0, never go negative)
    await db
      .update(users)
      .set({
        credits: sql`credits - ${cost}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, playerId));

    // Pay the owner
    await db
      .update(users)
      .set({ credits: sql`credits + ${cost}` })
      .where(eq(users.id, record.ownerId));

    // Calculate new expiry: if already blocked, extend from current expiry; otherwise from now
    const currentBlockEnd = record.blockSellUntil && new Date(record.blockSellUntil) > new Date()
      ? new Date(record.blockSellUntil).getTime()
      : Date.now();
    const newExpiresAt = new Date(currentBlockEnd + BLOCK_SELL_DURATION_MS);

    // Set block on the ownership record
    await db
      .update(ownership)
      .set({
        blockSellUntil: newExpiresAt,
        blockSellBy: player.username,
      })
      .where(eq(ownership.id, ownershipId));

    // Send a DM chat message to the owner about the partnership
    const now = new Date();
    const timestamp = now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const totalHoursRemaining = Math.ceil((newExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
    const partnerContent = `🤝 ${player.username} partnered with you for ${cost}¢ (+1h, ${totalHoursRemaining}h total) — ${timestamp}`;

    const [partnerMessage] = await db
      .insert(messages)
      .values({
        senderId: playerId,
        recipientId: record.ownerId,
        content: partnerContent,
        type: "private",
      })
      .returning();

    // Push real-time DM notification to both parties
    const messagePayload = {
      id: partnerMessage.id,
      content: partnerMessage.content,
      type: partnerMessage.type,
      createdAt: partnerMessage.createdAt,
      sender: {
        id: playerId,
        username: player.username,
        avatarUrl: player.avatarUrl,
      },
      recipientId: record.ownerId,
      recipientUsername: owner.username,
    };

    try {
      await Promise.all([
        pusher.trigger(`chat-private-${playerId}`, "new-message", messagePayload),
        pusher.trigger(`chat-private-${record.ownerId}`, "new-message", messagePayload),
        pusher.trigger(`player-${record.ownerId}`, "credits-updated", {
          message: `${player.username} partnered with you! You received ${cost}¢`,
        }),
        pusher.trigger(`player-${playerId}`, "credits-updated", {
          newCredits: player.credits - cost,
        }),
      ]);
    } catch (e) {
      // Pusher errors are non-critical
    }

    return {
      success: true,
      cost,
      ownerUsername: owner.username,
      expiresAt: newExpiresAt.toISOString(),
      totalHours: totalHoursRemaining,
    };
  } catch (error) {
    console.error("Block sell error:", error);
    return { error: "Block sell failed. Please try again." };
  }
}
