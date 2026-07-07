import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { BONUS_CARD_VALUES } from "@/lib/bonus-cards";

const SLOTS_PER_PURCHASE = 10;

/** Cost to buy the next +10 slots — pinned to the "+10 Player Slots" card's
 *  floor value (a flat price that no longer escalates with slot count). */
function getSlotCost(_currentSlots: number): number {
  return BONUS_CARD_VALUES["+10 Player Slots"] ?? 1000;
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
