import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { ownership } from "@/db/schema";
import { sql, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Returns whether any player OTHER than the current viewer owns at least one
 * card. Used by the market + leaderboard to decide whether the "Others Owned"
 * filter should default to ON.
 *
 * Cheap: a single EXISTS query that stops at the first matching row.
 */
export async function GET() {
  try {
    const session = await auth();
    const viewerId = session?.user?.id ? Number(session.user.id) : null;

    // No session → treat as "no others own cards" so the caller falls back to
    // the safe default (filter off). Authed users get the real check.
    if (!viewerId) {
      return NextResponse.json({ exists: false });
    }

    const [row] = await db
      .select({ one: sql<number>`1` })
      .from(ownership)
      .where(ne(ownership.ownerId, viewerId))
      .limit(1);

    return NextResponse.json({ exists: !!row });
  } catch (error) {
    console.error("other-owners-exist error:", error);
    // Fail safe: don't enable the filter if the check errors.
    return NextResponse.json({ exists: false });
  }
}
