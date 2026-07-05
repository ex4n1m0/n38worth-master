import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createRandomPlayer } from "@/lib/random-player";
import { getBonusCardPrice, doubleBonusCardPrice } from "@/lib/bonus-card-price";

const COOLDOWN_MS = 10_000;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const callerId = parseInt(session.user.id);

  try {
    const [caller] = await db
      .select({
        credits: users.credits,
        lastCreateNpcAt: users.lastCreateNpcAt,
      })
      .from(users)
      .where(eq(users.id, callerId));

    if (!caller) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (caller.lastCreateNpcAt) {
      const elapsed = Date.now() - new Date(caller.lastCreateNpcAt).getTime();
      if (elapsed < COOLDOWN_MS) {
        const retryAfterMs = COOLDOWN_MS - elapsed;
        return NextResponse.json(
          {
            error: `Cooling down. Try again in ${Math.ceil(retryAfterMs / 1000)}s`,
            retryAfterMs,
          },
          { status: 429 }
        );
      }
    }

    // Current global Create NPC price — doubles on each successful use.
    const card = await getBonusCardPrice("Create NPC");
    const cost = card?.price ?? 1000;

    if (caller.credits < cost) {
      return NextResponse.json(
        { error: `Not enough credits. Need ${cost}¢` },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({
        credits: Math.max(Math.round((caller.credits - cost) * 100) / 100, 0),
        lastCreateNpcAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, callerId));

    // Create the NPC via the shared utility (handles Unsplash + username uniqueness)
    const result = await createRandomPlayer();

    if (!result.success) {
      // Refund the cost since NPC creation failed
      await db
        .update(users)
        .set({
          credits: Math.round((caller.credits) * 100) / 100,
          lastCreateNpcAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, callerId));

      return NextResponse.json(
        { error: result.message || "Failed to create NPC" },
        { status: 500 }
      );
    }

    // Success — double the global price for the next use.
    if (card) await doubleBonusCardPrice(card.id, card.price);

    return NextResponse.json({
      success: true,
      player: result.player,
      cost,
      cooldownMs: COOLDOWN_MS,
    });
  } catch (error) {
    console.error("Create NPC error:", error);
    return NextResponse.json({ error: "Failed to create NPC" }, { status: 500 });
  }
}
