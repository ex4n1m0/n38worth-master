import { NextResponse } from "next/server";
import { db } from "@/db";
import { ownership, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getProfessionPerks } from "@/lib/professionPerks";

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

    // Server Marshal perk (Extra Racks): +2 hire slots.
    const perks = await getProfessionPerks(userId);
    const marshalBonus = perks.has("Server Marshal") ? 2 : 0;

    const limit = (user?.hireSlots ?? 20) + marshalBonus;
    const currentOwned = ownershipCount.count;

    return NextResponse.json({
      limit,
      currentOwned,
      canBuyMore: currentOwned < limit,
    });
  } catch (error) {
    console.error("Error fetching ownership limit:", error);
    return NextResponse.json(
      { error: "Failed to fetch ownership limit" },
      { status: 500 }
    );
  }
}
