import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, messages } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { MAX_CREDITS_SQL, capPlayerValue } from "@/lib/safeguards";
import { pusher } from "@/lib/pusher-server";

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
      return NextResponse.json({ error: "Cannot reveal your own avatar" }, { status: 400 });
    }

    // Verify the sender owns the target player
    const [ownershipRecord] = await db
      .select()
      .from(ownership)
      .where(and(eq(ownership.ownerId, senderId), eq(ownership.ownedId, targetId)));

    if (!ownershipRecord) {
      return NextResponse.json({ error: "You don't own this player" }, { status: 403 });
    }

    // 12-hour hard cap on reveal
    const MAX_REVEAL_MS = 12 * 60 * 60 * 1000;
    const existingRevealEnd = ownershipRecord.avatarRevealUntil ? new Date(ownershipRecord.avatarRevealUntil).getTime() : 0;
    const remainingRevealMs = Math.max(0, existingRevealEnd - Date.now());
    if (remainingRevealMs >= MAX_REVEAL_MS) {
      return NextResponse.json(
        { error: "Avatar reveal is already at the 12-hour maximum. Wait for it to decrease before adding more." },
        { status: 400 }
      );
    }

    // 1-hour reveal per press (flat)
    const REVEAL_DURATION_MS = 60 * 60 * 1000;

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
    const newValue = capPlayerValue(Math.round(currentValue * 1.10));

    if (cost < 0.01) {
      return NextResponse.json(
        { error: "Player value too low to reveal avatar" },
        { status: 400 }
      );
    }

    if (sender.credits < cost) {
      return NextResponse.json(
        { error: `Not enough credits. Need ${cost.toFixed(2)}¢` },
        { status: 400 }
      );
    }

    // Deduct from sender (atomic SQL to avoid race conditions)
    await db
      .update(users)
      .set({
        credits: sql`credits - ${cost}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, senderId));

    // Credit target + bump value
    await db
      .update(users)
      .set({
        credits: sql`LEAST(credits + ${creditsToPlayer}, ${sql.raw(MAX_CREDITS_SQL)})`,
        playerValue: newValue,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId));

    // Add 1-hour avatar reveal (accumulative)
    const now = new Date();
    const currentRevealEnd = ownershipRecord.avatarRevealUntil && new Date(ownershipRecord.avatarRevealUntil) > now
      ? new Date(ownershipRecord.avatarRevealUntil).getTime()
      : now.getTime();
    const newRevealExpiry = new Date(currentRevealEnd + REVEAL_DURATION_MS);

    await db
      .update(ownership)
      .set({
        lastBoostAt: now,
        avatarRevealUntil: newRevealExpiry,
      })
      .where(eq(ownership.id, ownershipRecord.id));

    // Create a reveal notification message in the DM chat
    const timestamp = now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const revealContent = `👁️ Revealed ${target.username}'s avatar! +1h reveal, value → ${newValue}¢ (+${creditsToPlayer.toFixed(2)}¢ gifted) — ${timestamp}`;

    const [revealMessage] = await db
      .insert(messages)
      .values({
        senderId,
        recipientId: targetId,
        content: revealContent,
        type: "private",
      })
      .returning();

    const messagePayload = {
      id: revealMessage.id,
      content: revealMessage.content,
      type: revealMessage.type,
      createdAt: revealMessage.createdAt.toISOString(),
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
      console.error("Pusher error for reveal message:", pusherError);
    }

    return NextResponse.json({
      success: true,
      cost,
      creditsToPlayer,
      newValue,
      previousValue: currentValue,
      targetUsername: target.username,
      avatarRevealUntil: newRevealExpiry.toISOString(),
    });
  } catch (error) {
    console.error("Reveal avatar error:", error);
    return NextResponse.json({ error: "Failed to reveal avatar" }, { status: 500 });
  }
}
