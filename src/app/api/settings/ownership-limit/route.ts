import { NextResponse } from "next/server";
import { db } from "@/db";
import { ownership } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

// Static ownership limit — every player can own up to 500 players.
const OWNERSHIP_LIMIT = 500;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = parseInt(session.user.id);

    // Get user's current ownership count
    const [ownershipCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(eq(ownership.ownerId, userId));

    const currentOwned = ownershipCount.count;

    return NextResponse.json({
      limit: OWNERSHIP_LIMIT,
      currentOwned,
      canBuyMore: currentOwned < OWNERSHIP_LIMIT,
    });
  } catch (error) {
    console.error("Error fetching ownership limit:", error);
    return NextResponse.json(
      { error: "Failed to fetch ownership limit" },
      { status: 500 }
    );
  }
}
