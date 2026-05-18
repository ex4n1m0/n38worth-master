import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

const SLOTS_PER_PURCHASE = 10;

/** Cost to buy the next +10 slots — 1.3× per tier.
 *  tier = floor(slots / 10) - 2, clamped to 0 minimum.
 *  Examples: 20 slots → 1,000¢ | 30 → 1,300¢ | 50 → 2,197¢ | 100 → ~37,972¢
 */
function getSlotCost(currentSlots: number): number {
  const tier = Math.max(0, Math.floor(currentSlots / 10) - 2);
  return Math.round(1000 * Math.pow(1.3, tier));
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    const [user] = await db
      .select({ credits: users.credits, hireSlots: users.hireSlots })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const cost = getSlotCost(user.hireSlots);

    if (user.credits < cost) {
      return NextResponse.json(
        { error: `Buying +${SLOTS_PER_PURCHASE} slots costs ${cost.toLocaleString()}¢. You don't have enough credits.` },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({
        credits: sql`GREATEST(credits - ${cost}, 0)`,
        hireSlots: sql`hire_slots + ${SLOTS_PER_PURCHASE}`,
      })
      .where(eq(users.id, userId));

    const newLimit = user.hireSlots + SLOTS_PER_PURCHASE;
    const nextCost = getSlotCost(newLimit);

    return NextResponse.json({ ok: true, newLimit, nextCost });
  } catch (error) {
    console.error("Buy hire slots error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
