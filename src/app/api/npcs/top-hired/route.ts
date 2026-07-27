import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, desc, isNotNull, ne, notInArray, or } from "drizzle-orm";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";

// Latest 40 online players (humans + NPCs) with avatars, sorted by most recently online.
export async function GET() {
  try {
    const combined = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        lastOnlineAt: users.lastOnlineAt,
      })
      .from(users)
      .where(
        and(
          isNotNull(users.avatarUrl),
          ne(users.avatarUrl, ""),
          or(
            eq(users.isNpc, 1),
            and(eq(users.isNpc, 0), eq(users.avatarCompleted, 1)),
          ),
          eq(users.isProtected, 0),
          notInArray(users.username, [...REMOVED_AGENT_USERNAMES]),
        )
      )
      .orderBy(desc(users.lastOnlineAt))
      .limit(40);

    // Public roster snapshot — cache at the CDN.
    return NextResponse.json({ npcs: combined }, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("top-hired NPCs API error:", error);
    return NextResponse.json({ error: "Failed to fetch NPCs" }, { status: 500 });
  }
}
