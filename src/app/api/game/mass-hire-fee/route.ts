import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getGoddessPowers } from "@/lib/goddess-powers";
import { getBonusCardPrice, doubleBonusCardPrice } from "@/lib/bonus-card-price";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    const [user] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const powers = await getGoddessPowers(userId);
    if (powers.hasFate) {
      return NextResponse.json({ ok: true, deducted: 0 });
    }

    // Current global Mass Hire fee — doubles on each use.
    const card = await getBonusCardPrice("Mass Hire");
    const fee = card?.price ?? 1000;

    if (user.credits < fee) {
      return NextResponse.json(
        { error: `Mass Hire costs ${fee}¢. You don't have enough credits.` },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({ credits: sql`GREATEST(credits - ${fee}, 0)` })
      .where(eq(users.id, userId));

    // Double the global price for the next use.
    if (card) await doubleBonusCardPrice(card.id, card.price);

    return NextResponse.json({ ok: true, deducted: fee });
  } catch (error) {
    console.error("Mass hire fee error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
