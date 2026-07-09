import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, messages } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { capCredits } from "@/lib/safeguards";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const senderId = parseInt(session.user.id);

  try {
    const { targetId } = await req.json();

    if (!targetId || typeof targetId !== "number") {
      return NextResponse.json(
        { error: "Invalid target player" },
        { status: 400 }
      );
    }

    if (targetId === senderId) {
      return NextResponse.json(
        { error: "Cannot send credits to yourself" },
        { status: 400 }
      );
    }

    // Verify the sender owns the target player
    const [ownershipRecord] = await db
      .select()
      .from(ownership)
      .where(
        and(
          eq(ownership.ownerId, senderId),
          eq(ownership.ownedId, targetId)
        )
      );

    if (!ownershipRecord) {
      return NextResponse.json(
        { error: "You don't own this player" },
        { status: 403 }
      );
    }

    // Get sender's current credits
    const [sender] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, senderId));

    if (!sender) {
      return NextResponse.json(
        { error: "Sender not found" },
        { status: 404 }
      );
    }

    // Calculate 1% of sender's credits
    const amount = Math.round(sender.credits * 0.01 * 100) / 100;

    if (amount < 0.01) {
      return NextResponse.json(
        { error: "Insufficient credits to send (need at least 1¢ total)" },
        { status: 400 }
      );
    }

    // Get target player
    const [target] = await db
      .select({ id: users.id, username: users.username, credits: users.credits })
      .from(users)
      .where(eq(users.id, targetId));

    if (!target) {
      return NextResponse.json(
        { error: "Target player not found" },
        { status: 404 }
      );
    }


    // Deduct from sender (floor at 0, never go negative)
    await db
      .update(users)
      .set({
        credits: Math.max(Math.round((sender.credits - amount) * 100) / 100, 0),
        updatedAt: new Date(),
      })
      .where(eq(users.id, senderId));

    // Add to target — cap to prevent overflow
    await db
      .update(users)
      .set({
        credits: capCredits(Math.round((target.credits + amount) * 100) / 100),
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId));

    // Get sender info for the chat message
    const [senderInfo] = await db
      .select({ username: users.username, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, senderId));

    // Create a gift notification message in the DM chat
    const now = new Date();
    const timestamp = now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const giftContent = `🎁 Gifted ${amount.toFixed(2)}¢ — ${timestamp}`;

    const [giftMessage] = await db
      .insert(messages)
      .values({
        senderId,
        recipientId: targetId,
        content: giftContent,
        type: "private",
      })
      .returning();

    // Push real-time notification to both sender and recipient
    const messagePayload = {
      id: giftMessage.id,
      content: giftMessage.content,
      type: giftMessage.type,
      createdAt: giftMessage.createdAt,
      sender: {
        id: senderId,
        username: senderInfo?.username || "Unknown",
        avatarUrl: senderInfo?.avatarUrl || null,
      },
      recipientId: targetId,
      recipientUsername: target.username,
    };

    try {
      await Promise.all([
        pusher.trigger(`chat-private-${senderId}`, "new-message", messagePayload),
        pusher.trigger(`chat-private-${targetId}`, "new-message", messagePayload),
      ]);
    } catch (pusherError) {
      console.error("Pusher error for gift message:", pusherError);
    }

    return NextResponse.json({
      success: true,
      amount,
      targetUsername: target.username,
      newSenderCredits: Math.round((sender.credits - amount) * 100) / 100,
    });
  } catch (error) {
    console.error("Send credits error:", error);
    return NextResponse.json(
      { error: "Failed to send credits" },
      { status: 500 }
    );
  }
}
