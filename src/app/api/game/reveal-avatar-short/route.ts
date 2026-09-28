import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, avatarReveals, messages, ownership } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { getGoddessPowers } from "@/lib/goddess-powers";

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
      return NextResponse.json({ error: "Cannot reveal your own building" }, { status: 400 });
    }

    // 1-minute avatar reveal duration
    const REVEAL_DURATION_MS = 60 * 1000;

    // Check for existing reveal (accumulative)
    const [existingReveal] = await db
      .select()
      .from(avatarReveals)
      .where(and(eq(avatarReveals.viewerId, senderId), eq(avatarReveals.targetId, targetId)));

    // Load target
    const [target] = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
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

    // Check if target is sell-blocked (cost doubles if so)
    const [ownershipRecord] = await db
      .select({ blockSellUntil: ownership.blockSellUntil })
      .from(ownership)
      .where(eq(ownership.ownedId, targetId));
    const isBlocked = !!(ownershipRecord?.blockSellUntil && new Date(ownershipRecord.blockSellUntil) > new Date());
    const costRate = isBlocked ? 0.20 : 0.10;

    // Knowledge / Creation power: reveals are free for the sender
    const senderPowers = await getGoddessPowers(senderId);
    const isFree = senderPowers.hasKnowledge;

    // Cost calculation: 10% of player value (or 20% if sell-blocked); 0 for Knowledge holders
    const currentValue = target.playerValue;
    const cost = isFree ? 0 : Math.round(currentValue * costRate * 100) / 100;
    const creditsToPlayer = isFree ? 0 : Math.round(currentValue * costRate * 100) / 100;

    if (!isFree && cost < 0.01) {
      return NextResponse.json(
        { error: "Player value too low to reveal building" },
        { status: 400 }
      );
    }

    if (!isFree && sender.credits < cost) {
      return NextResponse.json(
        { error: `Not enough credits. Need ${cost.toFixed(2)}¢` },
        { status: 400 }
      );
    }

    // Deduct from sender (skipped for Knowledge/Creation holders)
    // Use atomic SQL to avoid race conditions
    if (!isFree) {
      await db
        .update(users)
        .set({
          credits: sql`credits - ${cost}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, senderId));

      // Credit target (same gift)
      await db
        .update(users)
        .set({
          credits: sql`LEAST(credits + ${creditsToPlayer}, ${sql.raw(MAX_CREDITS_SQL)})`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetId));
    }

    // Calculate new reveal expiry (accumulative)
    const now = new Date();
    const currentRevealEnd = existingReveal && new Date(existingReveal.revealUntil) > now
      ? new Date(existingReveal.revealUntil).getTime()
      : now.getTime();
    const newRevealExpiry = new Date(currentRevealEnd + REVEAL_DURATION_MS);

    // Upsert reveal record
    if (existingReveal) {
      await db
        .update(avatarReveals)
        .set({ revealUntil: newRevealExpiry })
        .where(eq(avatarReveals.id, existingReveal.id));
    } else {
      await db
        .insert(avatarReveals)
        .values({
          viewerId: senderId,
          targetId: targetId,
          revealUntil: newRevealExpiry,
        });
    }

    // Create a reveal notification message in the DM chat
    const timestamp = now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const revealContent = `👁️ Revealed ${target.username}'s avatar on Network for 1 min (+${creditsToPlayer.toFixed(2)}¢ gifted) — ${timestamp}`;

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
      targetUsername: target.username,
      targetAvatarUrl: target.avatarUrl,
      avatarRevealUntil: newRevealExpiry.toISOString(),
      wasBlocked: isBlocked,
    });
  } catch (error) {
    console.error("Reveal avatar short error:", error);
    return NextResponse.json({ error: "Failed to reveal building" }, { status: 500 });
  }
}
