import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and, sql, notInArray } from "drizzle-orm";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.isNpc, 0), eq(users.isActive, 1), notInArray(users.username, [...REMOVED_AGENT_USERNAMES])));

    // Public counter — cache at the CDN.
    return NextResponse.json({ count: result?.count ?? 0 }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("Human count error:", error);
    return NextResponse.json({ count: 0 });
  }
}
