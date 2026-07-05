import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  try {
    const rows = await db
      .select({
        id: messages.id,
        content: messages.content,
        type: messages.type,
        createdAt: messages.createdAt,
        senderId: messages.senderId,
        senderUsername: users.username,
        senderAvatar: users.avatarUrl,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(
        and(
          eq(messages.type, "public"),
          sql`(${users.isNpc} = 1 OR (${users.avatarUrl} IS NOT NULL AND ${users.avatarCompleted} = 1))`
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);

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
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Public chat messages error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
