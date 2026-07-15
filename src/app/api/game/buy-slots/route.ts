import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, rewardHistory } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

const SLOTS_PER_PURCHASE = 10;
const COST_PERCENT = 0.1; // 10% of the buyer's current credits

/**
 * "10 Slots" card — adds +10 hire slots for 10% of the buyer's current
 * credits. The cost scales with wealth so it's always meaningful but never
 * unaffordable. No cooldown.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = parseInt(session.user.id);

    const [user] = await db
      .select({ credits: users.credits, hireSlots: users.hireSlots })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const cost = Math.max(1, Math.round(Number(user.credits) * COST_PERCENT));
    if (Number(user.credits) < cost || Number(user.credits) < 1) {
      return NextResponse.json(
        { error: `Not enough credits. Need ${cost}¢ (10% of your credits).` },
        { status: 400 }
      );
    }

    // Atomic: deduct cost + add slots in one guarded update so concurrent
    // requests can't double-spend.
    const updated = await db
      .update(users)
      .set({
        credits: sql`${users.credits} - ${cost}`,
        hireSlots: sql`${users.hireSlots} + ${SLOTS_PER_PURCHASE}`,
        updatedAt: new Date(),
      })
      .where(sql`${users.id} = ${userId} AND ${users.credits} >= ${cost}`)
      .returning({ credits: users.credits, hireSlots: users.hireSlots });

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "Not enough credits." },
        { status: 400 }
      );
    }

    try {
      await db.insert(rewardHistory).values({
        userId,
        type: "buy_slots",
        amount: -cost,
        details: JSON.stringify({ slotsAdded: SLOTS_PER_PURCHASE, newSlots: Number(updated[0].hireSlots) }),
      });
    } catch (e) {
      console.error("Buy slots history insert error:", e);
    }

    return NextResponse.json({
      success: true,
      cost,
      slotsAdded: SLOTS_PER_PURCHASE,
      newSlots: Number(updated[0].hireSlots),
      newCredits: Number(updated[0].credits),
    });
  } catch (error) {
    console.error("Buy slots error:", error);
    return NextResponse.json({ error: "Failed to buy slots" }, { status: 500 });
  }
}
