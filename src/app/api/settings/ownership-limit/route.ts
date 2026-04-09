import { NextResponse } from "next/server";
import { db } from "@/db";
import { gameSettings, ownership, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = parseInt(session.user.id);

    // Get current ownership limit
    const [limitSetting] = await db
      .select({ value: gameSettings.settingValue })
      .from(gameSettings)
      .where(eq(gameSettings.settingKey, "max_ownership_limit"));

    const ownershipLimit = limitSetting?.value ?? 111;

    // Get user's current ownership count
    const [ownershipCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(eq(ownership.ownerId, userId));

    const currentOwned = ownershipCount.count;

    return NextResponse.json({
      limit: ownershipLimit,
      currentOwned,
      canBuyMore: currentOwned < ownershipLimit,
    });
  } catch (error) {
    console.error("Error fetching ownership limit:", error);
    return NextResponse.json(
      { error: "Failed to fetch ownership limit" },
      { status: 500 }
    );
  }
}