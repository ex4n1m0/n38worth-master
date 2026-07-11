import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { ownership } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getMassHireCooldownEnd, getMassHireCooldownMs } from "@/lib/mass-hire";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const buyerId = Number(session.user.id);
    const [cooldownEnd, [ownedCountRow]] = await Promise.all([
      getMassHireCooldownEnd(buyerId),
      db
        .select({ count: sql<number>`count(*)` })
        .from(ownership)
        .where(eq(ownership.ownerId, buyerId))
        .limit(1),
    ]);

    const ownedCount = Number(ownedCountRow?.count ?? 0);
    const cooldownMs = getMassHireCooldownMs(ownedCount);

    return NextResponse.json({
      cooldownEndsAt: cooldownEnd, // epoch seconds
      cooldownMs,
      onCooldown: cooldownEnd > Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    console.error("Mass Hire status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
