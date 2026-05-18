import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, rewardHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { sql } from "drizzle-orm";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { BONUS_CARD_USERNAMES } from "@/lib/bonus-cards";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const callerId = parseInt(session.user.id);

  try {
    const { targetId } = await req.json();

    if (!targetId || typeof targetId !== "number") {
      return NextResponse.json({ error: "Invalid target player" }, { status: 400 });
    }

    // Load target
    const [target] = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        valueFloor: users.valueFloor,
        credits: users.credits,
        isNpc: users.isNpc,
      })
      .from(users)
      .where(eq(users.id, targetId));

    if (!target) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Goddesses cannot be value-boosted
    if (GODDESS_USERNAMES.includes(target.username)) {
      return NextResponse.json({ error: "Cannot boost a goddess" }, { status: 400 });
    }

    // Bonus cards cannot be value-boosted
    if (BONUS_CARD_USERNAMES.includes(target.username)) {
      return NextResponse.json(
        { error: "Bonus cards cannot be value-boosted" },
        { status: 403 }
      );
    }

    // Only the player themselves OR their current owner can trigger this
    const [ownershipRecord] = await db
      .select({ ownerId: ownership.ownerId })
      .from(ownership)
      .where(eq(ownership.ownedId, targetId))
      .limit(1);

    const isOwner = ownershipRecord?.ownerId === callerId;
    const isSelf = callerId === targetId;

    if (!isSelf && !isOwner) {
      return NextResponse.json(
        { error: "You must own this player (or be this player) to boost their value" },
        { status: 403 }
      );
    }

    // Load caller credits
    const [caller] = await db
      .select({ credits: users.credits, username: users.username })
      .from(users)
      .where(eq(users.id, callerId));

    if (!caller) {
      return NextResponse.json({ error: "Caller not found" }, { status: 404 });
    }

    const currentValue = target.playerValue;
    const cost = currentValue * 1000;

    if (cost < 1) {
      return NextResponse.json({ error: "Player value too low to boost" }, { status: 400 });
    }

    if (caller.credits < cost) {
      return NextResponse.json(
        { error: `Not enough credits. Need ${cost.toLocaleString()}¢` },
        { status: 400 }
      );
    }

    const newValue = Math.min(currentValue * 2, Number.MAX_SAFE_INTEGER);
    const newFloor = Math.max(newValue, target.valueFloor);

    // Deduct cost from caller
    await db
      .update(users)
      .set({
        credits: Math.max(Math.round((caller.credits - cost) * 100) / 100, 0),
        updatedAt: new Date(),
      })
      .where(eq(users.id, callerId));

    // Double target's playerValue (and update floor if needed)
    await db
      .update(users)
      .set({
        playerValue: newValue,
        valueFloor: newFloor,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId));

    const historyEntries: { userId: number; type: string; amount: number; details: string }[] = [];

    // Caller paid the cost
    historyEntries.push({
      userId: callerId,
      type: "boost_value_cost",
      amount: cost,
      details: JSON.stringify({ targetId, targetUsername: target.username, previousValue: currentValue, newValue }),
    });

    // Route profit to the target player
    await db
      .update(users)
      .set({
        credits: sql`LEAST(credits + ${cost}, ${sql.raw(MAX_CREDITS_SQL)})`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId));

    historyEntries.push({
      userId: targetId,
      type: "boost_value_income",
      amount: cost,
      details: JSON.stringify({ fromCallerId: callerId, callerUsername: caller.username }),
    });

    // Pusher notification for target
    try {
      await pusher.trigger(`player-${targetId}`, "boost-value-income", {
        amount: cost,
        callerUsername: caller.username,
      });
    } catch (e) {
      console.error("Pusher boost-value-income error:", e);
    }

    try {
      await db.insert(rewardHistory).values(historyEntries);
    } catch (e) {
      console.error("Boost value history insert error:", e);
    }

    return NextResponse.json({
      success: true,
      cost,
      previousValue: currentValue,
      newValue,
      receiverUsername: target.username,
    });
  } catch (error) {
    console.error("Boost value error:", error);
    return NextResponse.json({ error: "Failed to boost value" }, { status: 500 });
  }
}
