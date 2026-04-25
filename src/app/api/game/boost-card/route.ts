import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { capCredits } from "@/lib/safeguards";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const senderId = parseInt(session.user.id);

  try {
    const { targetId } = await req.json();

    if (!targetId || typeof targetId !== "number") {
      return NextResponse.json({ error: "Invalid target player" }, { status: 400 });
    }

    if (targetId === senderId) {
      return NextResponse.json({ error: "Cannot boost yourself" }, { status: 400 });
    }

    // Verify the sender owns the target player
    const [ownershipRecord] = await db
      .select()
      .from(ownership)
      .where(and(eq(ownership.ownerId, senderId), eq(ownership.ownedId, targetId)));

    if (!ownershipRecord) {
      return NextResponse.json({ error: "You don't own this player" }, { status: 403 });
    }

    // 60s cooldown per ownership
    const COOLDOWN_MS = 60_000;
    if (ownershipRecord.lastBoostAt) {
      const elapsed = Date.now() - ownershipRecord.lastBoostAt.getTime();
      if (elapsed < COOLDOWN_MS) {
        const retryAfterMs = COOLDOWN_MS - elapsed;
        return NextResponse.json(
          {
            error: `Boost cooling down. Try again in ${Math.ceil(retryAfterMs / 1000)}s`,
            retryAfterMs,
          },
          { status: 429 }
        );
      }
    }

    // Load target
    const [target] = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        credits: users.credits,
        isNpc: users.isNpc,
      })
      .from(users)
      .where(eq(users.id, targetId));

    if (!target) {
      return NextResponse.json({ error: "Target player not found" }, { status: 404 });
    }

    if (target.isNpc !== 1) {
      return NextResponse.json(
        { error: "Only hired card players can be boosted" },
        { status: 400 }
      );
    }

    // Load sender
    const [sender] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, senderId));

    if (!sender) {
      return NextResponse.json({ error: "Sender not found" }, { status: 404 });
    }

    const currentValue = target.playerValue;
    const cost = Math.round(currentValue * 0.20 * 100) / 100;
    const creditsToPlayer = Math.round(currentValue * 0.10 * 100) / 100;
    const newValue = Math.min(
      Math.round(currentValue * 1.10),
      Number.MAX_SAFE_INTEGER
    );

    if (cost < 0.01) {
      return NextResponse.json(
        { error: "Player value too low to boost" },
        { status: 400 }
      );
    }

    if (sender.credits < cost) {
      return NextResponse.json(
        { error: `Not enough credits. Need ${cost.toFixed(2)}¢` },
        { status: 400 }
      );
    }

    // Deduct from sender
    await db
      .update(users)
      .set({
        credits: Math.max(Math.round((sender.credits - cost) * 100) / 100, 0),
        updatedAt: new Date(),
      })
      .where(eq(users.id, senderId));

    // Credit target + bump value
    await db
      .update(users)
      .set({
        credits: capCredits(Math.round((target.credits + creditsToPlayer) * 100) / 100),
        playerValue: newValue,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId));

    // Stamp cooldown
    const now = new Date();
    await db
      .update(ownership)
      .set({ lastBoostAt: now })
      .where(eq(ownership.id, ownershipRecord.id));

    return NextResponse.json({
      success: true,
      cost,
      creditsToPlayer,
      newValue,
      previousValue: currentValue,
      targetUsername: target.username,
      lastBoostAt: now.toISOString(),
      cooldownMs: COOLDOWN_MS,
    });
  } catch (error) {
    console.error("Boost card error:", error);
    return NextResponse.json({ error: "Failed to boost card" }, { status: 500 });
  }
}
