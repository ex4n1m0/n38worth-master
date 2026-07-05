import { NextResponse } from "next/server";
import { db } from "@/db";
import { ownership, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = parseInt(session.user.id);

    // Get user's hire slot limit and current ownership count
    const [user] = await db
      .select({ hireSlots: users.hireSlots })
      .from(users)
      .where(eq(users.id, userId));

    const [ownershipCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(eq(ownership.ownerId, userId));

    const limit = user?.hireSlots ?? 20;
    const currentOwned = ownershipCount.count;
    const tier = Math.min(50, Math.max(0, Math.floor(limit / 10) - 2));
    const nextSlotCost = Math.round(1000 * Math.pow(1.3, tier));

    return NextResponse.json({
      limit,
      currentOwned,
      canBuyMore: currentOwned < limit,
      nextSlotCost,
    });
  } catch (error) {
    console.error("Error fetching ownership limit:", error);
    return NextResponse.json(
      { error: "Failed to fetch ownership limit" },
      { status: 500 }
    );
  }
}
