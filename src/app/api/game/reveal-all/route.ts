import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, rewardHistory } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { checkBonusCooldown, setBonusCooldown } from "@/lib/card-cooldowns";

const REVEAL_DURATION_MS = 10 * 60 * 1000; // 10 minutes per use
const COST_PERCENT = 0.1; // 10% of the buyer's current credits

/**
 * "Reveal" card — grants temporary Knowledge (see ALL avatars) for 10 minutes,
 * costing 10% of the buyer's current credits. Uses the existing
 * temporary_knowledge_until mechanism honored by getGoddessPowers().
 * Shares the 10-minute bonus-card cooldown, so the reveal window has expired
 * by the time the card can be used again.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = parseInt(session.user.id);

    const remaining = await checkBonusCooldown("reveal", userId);
    if (remaining) {
      return NextResponse.json(
        { error: `Reveal is on cooldown (${remaining} remaining)` },
        { status: 400 }
      );
    }

    const [user] = await db
      .select({ credits: users.credits, temporaryKnowledgeUntil: users.temporaryKnowledgeUntil })
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

    // Extend from the current expiry if a reveal window is already running.
    const now = Date.now();
    const currentEnd = user.temporaryKnowledgeUntil && new Date(user.temporaryKnowledgeUntil).getTime() > now
      ? new Date(user.temporaryKnowledgeUntil).getTime()
      : now;
    const newUntil = new Date(currentEnd + REVEAL_DURATION_MS);

    // Atomic: deduct cost + set reveal window in one guarded update.
    const updated = await db
      .update(users)
      .set({
        credits: sql`${users.credits} - ${cost}`,
        temporaryKnowledgeUntil: newUntil,
        updatedAt: new Date(),
      })
      .where(sql`${users.id} = ${userId} AND ${users.credits} >= ${cost}`)
      .returning({ credits: users.credits });

    if (updated.length === 0) {
      return NextResponse.json({ error: "Not enough credits." }, { status: 400 });
    }

    const cooldownEndsAt = await setBonusCooldown("reveal", userId);

    try {
      await db.insert(rewardHistory).values({
        userId,
        type: "reveal_all",
        amount: -cost,
        details: JSON.stringify({ revealUntil: newUntil.toISOString() }),
      });
    } catch (e) {
      console.error("Reveal all history insert error:", e);
    }

    return NextResponse.json({
      success: true,
      cost,
      revealUntil: newUntil.toISOString(),
      newCredits: Number(updated[0].credits),
      cooldownEndsAt,
    });
  } catch (error) {
    console.error("Reveal all error:", error);
    return NextResponse.json({ error: "Failed to reveal avatars" }, { status: 500 });
  }
}
