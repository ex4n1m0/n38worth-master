import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { ensureAgent } from "@/lib/agent/seed";
import { maybeAgentChat } from "@/lib/agent/chat";

const PUBLIC_REWARD = 0; // Credits earned per public message (disabled)
const MAX_LENGTH = 280;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const senderId = parseInt(session.user.id);

  try {
    const body = await req.json();
    const { content, recipientUsername } = body;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
    }

    if (content.trim().length > MAX_LENGTH) {
      return NextResponse.json({ error: `Message too long (max ${MAX_LENGTH} chars)` }, { status: 400 });
    }

    const isPrivate = !!recipientUsername;

    // Get sender
    const [sender] = await db
      .select()
      .from(users)
      .where(eq(users.id, senderId));

    if (!sender) {
      return NextResponse.json({ error: "Sender not found" }, { status: 404 });
    }

    // Block sending from humans who haven't uploaded an avatar.
    if (sender.isNpc === 0 && (!sender.avatarUrl || sender.avatarCompleted !== 1)) {
      return NextResponse.json(
        { error: "You must upload an avatar before you can chat." },
        { status: 403 }
      );
    }

    let recipientId: number | null = null;

    if (isPrivate) {
      const [recipient] = await db
        .select({
          id: users.id,
          isNpc: users.isNpc,
          avatarUrl: users.avatarUrl,
          avatarCompleted: users.avatarCompleted,
        })
        .from(users)
        .where(eq(users.username, recipientUsername));

      if (!recipient) {
        return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
      }

      // Treat invisible humans as non-existent for messaging purposes.
      if (recipient.isNpc === 0 && (!recipient.avatarUrl || recipient.avatarCompleted !== 1)) {
        return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
      }

      if (recipient.id === senderId) {
        return NextResponse.json({ error: "You cannot message yourself" }, { status: 400 });
      }

      recipientId = recipient.id;
    }

    // Public messages no longer earn credits
    const newCredits = sender.credits;

    // Insert message
    const [newMessage] = await db
      .insert(messages)
      .values({
        senderId,
        recipientId,
        content: content.trim(),
        type: isPrivate ? "private" : "public",
      })
      .returning();

    // Build message payload for real-time
    const messagePayload = {
      id: newMessage.id,
      content: newMessage.content,
      type: newMessage.type,
      createdAt: newMessage.createdAt,
      sender: {
        id: sender.id,
        username: sender.username,
        avatarUrl: sender.avatarUrl,
      },
      recipientId,
      recipientUsername: recipientUsername || null,
    };

    // Trigger real-time updates via Pusher
    try {
      if (isPrivate && recipientId) {
        // Send to both sender and recipient private channels
        await Promise.all([
          pusher.trigger(`chat-private-${senderId}`, "new-message", messagePayload),
          pusher.trigger(`chat-private-${recipientId}`, "new-message", messagePayload),
        ]);
      } else {
        // Send the user's message
        await pusher.trigger("chat-public", "new-message", messagePayload);
        // Send agent-typing indicator immediately (non-blocking) so the user
        // sees the typing bubble the instant their message appears.
        if (sender.isNpc === 0) {
          console.log("[chat] sending agent-typing event");
          pusher.trigger("chat-public", "agent-typing", { typing: true }).catch((e: unknown) => {
            console.error("[chat] agent-typing trigger failed:", e);
          });
        }
      }
    } catch (pusherError) {
      console.error("Pusher error:", pusherError);
    }

    // When a human posts in the PUBLIC room, have the Agent reply immediately
    // (instead of waiting for its once-a-minute cron). Runs after the response
    // is sent so it never slows down the sender.
    if (!isPrivate && sender.isNpc === 0) {
      after(async () => {
        try {
          const agentId = await ensureAgent();
          if (senderId !== agentId) {
            await maybeAgentChat(agentId, { force: true });
          }
        } catch (e) {
          console.error("Agent fast-reply error:", e);
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: messagePayload,
      reward: isPrivate ? 0 : PUBLIC_REWARD,
      newCredits,
    });
  } catch (error) {
    console.error("Chat send error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
