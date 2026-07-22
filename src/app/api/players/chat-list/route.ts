import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        lastOnlineAt: users.lastOnlineAt,
      })
      .from(users)
      .where(and(eq(users.isNpc, 0), eq(users.isActive, 1)))
      .orderBy(desc(users.lastOnlineAt), sql`"users"."username" ASC`);

    // Public player list polled every 120s — cache at the CDN.
    return NextResponse.json(rows, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("Chat list error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
