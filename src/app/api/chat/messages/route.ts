import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { eq, or, and, desc, sql, notInArray } from "drizzle-orm";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  try {
    // Get public messages + private messages involving this user
    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        type: messages.type,
        createdAt: messages.createdAt,
        senderId: messages.senderId,
        senderUsername: users.username,
        senderAvatar: users.avatarUrl,
        recipientId: messages.recipientId,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(
        and(
          or(
            eq(messages.type, "public"),
            and(eq(messages.type, "private"), eq(messages.senderId, userId)),
            and(eq(messages.type, "private"), eq(messages.recipientId, userId))
          ),
          // Sender must be visible (NPC, the current user, or a human with avatar uploaded)
          notInArray(users.username, [...REMOVED_AGENT_USERNAMES]),
          sql`(${users.isNpc} = 1 OR ${users.id} = ${userId} OR (${users.avatarUrl} IS NOT NULL AND ${users.avatarCompleted} = 1))`
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    // For private messages, get recipient usernames
    const recipientIds = rows
      .filter((r) => r.type === "private" && r.recipientId)
      .map((r) => r.recipientId!);

    let recipientMap: Record<number, string> = {};
    if (recipientIds.length > 0) {
      const recipients = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(sql`${users.id} IN (${sql.join(recipientIds.map(id => sql`${id}`), sql`, `)})`);
      recipientMap = Object.fromEntries(recipients.map((r) => [r.id, r.username]));
    }

    const result = rows.reverse().map((row) => ({
      id: row.id,
      content: row.content,
      type: row.type,
      createdAt: row.createdAt,
      sender: {
        id: row.senderId,
        username: row.senderUsername,
        avatarUrl: row.senderAvatar,
      },
      recipientId: row.recipientId,
      recipientUsername: row.recipientId ? recipientMap[row.recipientId] : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Chat messages error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
