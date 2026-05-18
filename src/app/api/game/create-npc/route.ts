import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { createRandomPlayer } from "@/lib/random-player";
import { getGoddessPowers } from "@/lib/goddess-powers";

const COST = 1000;
const COOLDOWN_MS = 10_000;
const MIN_OWNED = 10;

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

    const [{ ownedCount }] = await db
      .select({ ownedCount: count(ownership.id) })
      .from(ownership)
      .where(eq(ownership.ownerId, callerId));

    if (ownedCount < MIN_OWNED) {
      return NextResponse.json(
        { error: `You need to own at least ${MIN_OWNED} players to create an NPC` },
        { status: 403 }
      );
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

    const powers = await getGoddessPowers(callerId);
    const isFree = powers.hasFate;
    const effectiveCost = isFree ? 0 : COST;

    if (!isFree && caller.credits < COST) {
      return NextResponse.json(
        { error: `Not enough credits. Need ${COST}¢` },
        { status: 400 }
      );
    }

    // Deduct cost (0 for Fate/Creation holders)
    await db
      .update(users)
      .set({
        credits: isFree
          ? caller.credits
          : Math.max(Math.round((caller.credits - COST) * 100) / 100, 0),
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

    return NextResponse.json({
      success: true,
      player: result.player,
      cost: effectiveCost,
      cooldownMs: COOLDOWN_MS,
    });
  } catch (error) {
    console.error("Create NPC error:", error);
    return NextResponse.json({ error: "Failed to create NPC" }, { status: 500 });
  }
}
