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
      return NextResponse.json({ error: "Invalid target player" }, { status: 400 });
    }

    if (targetId === senderId) {
      return NextResponse.json({ error: "Cannot boost yourself" }, { status: 400 });
    }

    // Verify the sender owns the target player
    const [ownershipRecord] = await db
      .select()
      .from(ownership)
      .where(and(eq(ownership.ownerId, senderId), eq(ownership.ownedId, targetId)));

    if (!ownershipRecord) {
      return NextResponse.json({ error: "You don't own this player" }, { status: 403 });
    }

    // 12-hour hard cap on sell block
    const MAX_BLOCK_MS = 12 * 60 * 60 * 1000;
    const existingBlockEnd = ownershipRecord.blockSellUntil ? new Date(ownershipRecord.blockSellUntil).getTime() : 0;
    const remainingBlockMs = Math.max(0, existingBlockEnd - Date.now());
    if (remainingBlockMs >= MAX_BLOCK_MS) {
      return NextResponse.json(
        { error: "Sell block is already at the 12-hour maximum. Wait for it to decrease before adding more." },
        { status: 400 }
      );
    }

    // 1-hour sell block per press (flat)
    const SELL_BLOCK_MS = 60 * 60 * 1000;

    // Load target
    const [target] = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        credits: users.credits,
        isNpc: users.isNpc,
      })
      .from(users)
      .where(eq(users.id, targetId));

    if (!target) {
      return NextResponse.json({ error: "Target player not found" }, { status: 404 });
    }

    // Load sender
    const [sender] = await db
      .select({ credits: users.credits, username: users.username, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, senderId));

    if (!sender) {
      return NextResponse.json({ error: "Sender not found" }, { status: 404 });
    }

    const currentValue = target.playerValue;
    const cost = Math.round(currentValue * 1.0 * 100) / 100;
    const creditsToPlayer = Math.round(cost * 0.90 * 100) / 100;
    const newValue = Math.min(
      Math.round(currentValue * 1.10),
      Number.MAX_SAFE_INTEGER
    );

    if (cost < 0.01) {
      return NextResponse.json(
        { error: "Player value too low to boost" },
        { status: 400 }
      );
    }

    if (sender.credits < cost) {
      return NextResponse.json(
        { error: `Not enough credits. Need ${cost.toFixed(2)}¢` },
        { status: 400 }
      );
    }

    // Deduct from sender
    await db
      .update(users)
      .set({
        credits: Math.max(Math.round((sender.credits - cost) * 100) / 100, 0),
        updatedAt: new Date(),
      })
      .where(eq(users.id, senderId));

    // Credit target + bump value
    await db
      .update(users)
      .set({
        credits: capCredits(Math.round((target.credits + creditsToPlayer) * 100) / 100),
        playerValue: newValue,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId));

    // Add 1-hour sell block (accumulative)
    const now = new Date();
    const currentBlockEnd = ownershipRecord.blockSellUntil && new Date(ownershipRecord.blockSellUntil) > now
      ? new Date(ownershipRecord.blockSellUntil).getTime()
      : now.getTime();
    const newBlockExpiry = new Date(currentBlockEnd + SELL_BLOCK_MS);
    
    await db
      .update(ownership)
      .set({ 
        lastBoostAt: now,
        blockSellUntil: newBlockExpiry,
        blockSellBy: sender.username,
      })
      .where(eq(ownership.id, ownershipRecord.id));

    // Create a boost notification message in the DM chat
    const timestamp = now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const boostContent = `�️ Sell Block on ${target.username} for 1h! Value → ${newValue}¢ (+${creditsToPlayer.toFixed(2)}¢ gifted) — ${timestamp}`;

    const [boostMessage] = await db
      .insert(messages)
      .values({
        senderId,
        recipientId: targetId,
        content: boostContent,
        type: "private",
      })
      .returning();

    const messagePayload = {
      id: boostMessage.id,
      content: boostMessage.content,
      type: boostMessage.type,
      createdAt: boostMessage.createdAt.toISOString(),
      sender: {
        id: senderId,
        username: sender.username,
        avatarUrl: sender.avatarUrl || null,
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
      console.error("Pusher error for boost message:", pusherError);
    }

    return NextResponse.json({
      success: true,
      cost,
      creditsToPlayer,
      newValue,
      previousValue: currentValue,
      targetUsername: target.username,
    });
  } catch (error) {
    console.error("Boost card error:", error);
    return NextResponse.json({ error: "Failed to boost card" }, { status: 500 });
  }
}
