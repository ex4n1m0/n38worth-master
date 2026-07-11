import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ensureMassHireCard, getMassHireCooldownEnd } from "@/lib/mass-hire";

export const dynamic = "force-dynamic";

/**
 * Returns the Mass Hire card data for the market page's pinned card:
 *   - card id, username, avatarUrl, playerValue
 *   - viewer's owned card count (for unlock check + hire limit display)
 *   - cooldown end timestamp
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const viewerId = Number(session.user.id);

    const [cardId, [viewer], [ownedCountRow], cooldownEnd] = await Promise.all([
      ensureMassHireCard(),
      db.select({ id: users.id }).from(users).where(eq(users.id, viewerId)).limit(1),
      db.select({ count: sql<number>`count(*)` }).from(ownership).where(eq(ownership.ownerId, viewerId)).limit(1),
      getMassHireCooldownEnd(viewerId),
    ]);

    if (!viewer) {
      return NextResponse.json({ error: "Viewer not found" }, { status: 404 });
    }

    return NextResponse.json({
      cardId,
      ownedCount: Number(ownedCountRow?.count ?? 0),
      cooldownEndsAt: cooldownEnd, // epoch seconds
    });
  } catch (error) {
    console.error("Mass Hire card fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
