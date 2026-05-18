import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { purchasePlayer } from "@/actions/purchasePlayer";
import { getGoddessPowers } from "@/lib/goddess-powers";
import { BONUS_CARD_USERNAMES } from "@/lib/bonus-cards";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const buyerId = parseInt(session.user.id);

  try {
    const { targetId } = await req.json();

    if (!targetId || typeof targetId !== "number") {
      return NextResponse.json({ error: "Invalid target player" }, { status: 400 });
    }

    if (targetId === buyerId) {
      return NextResponse.json({ error: "Cannot break your own partnership" }, { status: 400 });
    }

    // Load the current ownership record for target
    const [ownershipRecord] = await db
      .select()
      .from(ownership)
      .where(eq(ownership.ownedId, targetId));

    if (!ownershipRecord) {
      // No owner — no block, proceed with normal purchase
      return NextResponse.json({ error: "This player has no active partnership to break" }, { status: 400 });
    }

    // Verify there is actually an active sell block
    const now = Date.now();
    const blockEnd = ownershipRecord.blockSellUntil ? new Date(ownershipRecord.blockSellUntil).getTime() : 0;
    const remainingMs = Math.max(0, blockEnd - now);

    if (remainingMs <= 0) {
      return NextResponse.json({ error: "No active sell block — use the regular hire button" }, { status: 400 });
    }

    // Load target value
    const [target] = await db
      .select({ id: users.id, username: users.username, playerValue: users.playerValue, credits: users.credits })
      .from(users)
      .where(eq(users.id, targetId));

    if (!target) {
      return NextResponse.json({ error: "Target player not found" }, { status: 404 });
    }

    // Check if target is a bonus card - their blocks are unbreakable
    if (BONUS_CARD_USERNAMES.includes(target.username)) {
      return NextResponse.json(
        { error: "Bonus cards have an unbreakable partnership block that cannot be broken by any means" },
        { status: 403 }
      );
    }

    // Load buyer
    const [buyer] = await db
      .select({ id: users.id, credits: users.credits, username: users.username })
      .from(users)
      .where(eq(users.id, buyerId));

    if (!buyer) {
      return NextResponse.json({ error: "Buyer not found" }, { status: 404 });
    }

    // Check buyer doesn't already own this player
    const [alreadyOwns] = await db
      .select({ id: ownership.id })
      .from(ownership)
      .where(and(eq(ownership.ownerId, buyerId), eq(ownership.ownedId, targetId)));

    if (alreadyOwns) {
      return NextResponse.json({ error: "You already own this player" }, { status: 400 });
    }

    // Calculate break fee: ceil(hoursRemaining) × playerValue
    // War / Creation power: break fee is waived — only normal hire cost applies
    const buyerPowers = await getGoddessPowers(buyerId);
    const hoursRemaining = Math.ceil(remainingMs / (60 * 60 * 1000));
    const breakCost = buyerPowers.hasWar ? 0 : hoursRemaining * target.playerValue;

    // Buyer must afford break fee + normal purchase price
    const totalCost = breakCost + target.playerValue;
    if (buyer.credits < totalCost) {
      return NextResponse.json(
        { error: `Not enough credits. Need ${totalCost.toFixed(2)}¢ (${breakCost.toFixed(2)}¢ break fee + ${target.playerValue.toFixed(2)}¢ hire)` },
        { status: 400 }
      );
    }

    // Deduct break fee from buyer (0 for War/Creation holders)
    if (breakCost > 0) {
      await db
        .update(users)
        .set({ credits: Math.max(Math.round((buyer.credits - breakCost) * 100) / 100, 0) })
        .where(eq(users.id, buyerId));

      // Credit break fee to the current owner (compensation)
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${breakCost}, ${sql.raw(MAX_CREDITS_SQL)})` })
        .where(eq(users.id, ownershipRecord.ownerId));
    }

    // Clear the sell block on the ownership record so purchasePlayer can proceed
    await db
      .update(ownership)
      .set({ blockSellUntil: null, blockSellBy: null })
      .where(eq(ownership.id, ownershipRecord.id));

    // Now run the normal purchase (standard 1-hour block for new owner)
    const purchaseResult = await purchasePlayer(targetId, 1);

    if (purchaseResult.error) {
      // Rollback: refund break fee to buyer, re-credit owner, restore block
      await db
        .update(users)
        .set({ credits: Math.min(Math.round((buyer.credits) * 100) / 100, Number(MAX_CREDITS_SQL)) })
        .where(eq(users.id, buyerId));
      return NextResponse.json({ error: purchaseResult.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      breakCost,
      purchaseCost: target.playerValue,
      totalCost,
      newValue: purchaseResult.newValue,
      targetUsername: target.username,
      countdownStarted: purchaseResult.countdownStarted,
    });
  } catch (error) {
    console.error("Break partnership error:", error);
    return NextResponse.json({ error: "Failed to break partnership" }, { status: 500 });
  }
}
