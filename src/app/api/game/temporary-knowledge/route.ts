import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getBonusCardPrice, doubleBonusCardPrice } from "@/lib/bonus-card-price";

const TEMPORARY_KNOWLEDGE_DURATION_MS = 10 * 60 * 1000;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    const [user] = await db
      .select({
        credits: users.credits,
        temporaryKnowledgeUntil: users.temporaryKnowledgeUntil,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Current global 10-Min Knowledge price — doubles on each use.
    const card = await getBonusCardPrice("10-Min Knowledge");
    const cost = card?.price ?? 1000;

    if (user.credits < cost) {
      return NextResponse.json(
        { error: `10-Min Knowledge costs ${cost}¢. You don't have enough credits.` },
        { status: 400 }
      );
    }

    const now = new Date();
    const currentExpiry = user.temporaryKnowledgeUntil && new Date(user.temporaryKnowledgeUntil) > now
      ? new Date(user.temporaryKnowledgeUntil).getTime()
      : now.getTime();
    const newTemporaryKnowledgeUntil = new Date(currentExpiry + TEMPORARY_KNOWLEDGE_DURATION_MS);

    await db
      .update(users)
      .set({
        credits: sql`GREATEST(credits - ${cost}, 0)`,
        temporaryKnowledgeUntil: newTemporaryKnowledgeUntil,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    // Double the global price for the next use.
    if (card) await doubleBonusCardPrice(card.id, card.price);

    return NextResponse.json({
      success: true,
      cost,
      temporaryKnowledgeUntil: newTemporaryKnowledgeUntil.toISOString(),
    });
  } catch (error) {
    console.error("Temporary knowledge error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
