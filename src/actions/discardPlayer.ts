"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, transactions, gameHistory } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { broadcastMarketPatch } from "@/lib/market-broadcast";

export async function sellPlayer(otherId: number) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const sellerId = parseInt(session.user.id);

  try {
    // Check if seller owns the other player
    const [ownershipRecord] = await db
      .select()
      .from(ownership)
      .where(
        and(
          eq(ownership.ownerId, sellerId),
          eq(ownership.ownedId, otherId)
        )
      );

    if (!ownershipRecord) {
      return { error: "You don't own this player" };
    }

    // Get the other player's current value (sell price)
    const [targetPlayer] = await db
      .select()
      .from(users)
      .where(eq(users.id, otherId));

    if (!targetPlayer) {
      return { error: "Player not found" };
    }

    const sellPrice = targetPlayer.playerValue;

    // Get seller info
    const [seller] = await db
      .select()
      .from(users)
      .where(eq(users.id, sellerId));

    // 1-4. Execute all database operations individually
    // Note: neon-http does not support transactions, so we execute operations individually
    // 1. Distribute sell price: 50% to owner, 50% to the sold player
    const ownerShare = Math.floor(sellPrice / 2);
    const playerShare = sellPrice - ownerShare;
    const blockUntil = new Date(Date.now() + 1 * 60 * 1000);

    // Give 50% to the owner (seller) — cap credits to prevent overflow
    await db
      .update(users)
      .set({ credits: sql`LEAST(credits + ${ownerShare}, ${sql.raw(MAX_CREDITS_SQL)})` })
      .where(eq(users.id, sellerId));

    // Give 50% to the sold player — cap credits to prevent overflow
    await db
      .update(users)
      .set({ credits: sql`LEAST(credits + ${playerShare}, ${sql.raw(MAX_CREDITS_SQL)})` })
      .where(eq(users.id, otherId));

    // 2. Reset the sold player's value to their floor (milestone-based minimum).
    // NOTE: purchaseCount is intentionally NOT reset — it is a lifetime
    // "times hired" counter used by profile achievements and sort options.
    await db
      .update(users)
      .set({
        playerValue: sql`value_floor`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, otherId));

    // 3. Remove ownership record
    await db
      .delete(ownership)
      .where(eq(ownership.id, ownershipRecord.id));

    // Broadcast: card is ownerless again, value reset to floor, seller owns one less.
    await broadcastMarketPatch({
      targetId: otherId,
      value: targetPlayer.valueFloor ?? 1,
      ownerCount: 0,
      ownedDeltas: [{ id: sellerId, delta: -1 }],
      reason: "discard",
    });

    // 3b. If sold player is an NPC, set ownerlessAt timestamp
    if (targetPlayer.isNpc === 1) {
      await db
        .update(users)
        .set({ ownerlessAt: new Date() })
        .where(eq(users.id, otherId));
    }

    // 3c. After selling, set 1min sell block on the player record so new buyers inherit it
    await db
      .update(users)
      .set({
        blockSellUntil: blockUntil,
        blockSellBy: seller.username,
      })
      .where(eq(users.id, otherId));

    // 4. Log transaction
    await db.insert(transactions).values({
      buyerId: sellerId,
      targetId: otherId,
      type: "sell",
      amount: sellPrice,
    });

    // 4b. Log to game history
    await db.insert(gameHistory).values({
      eventType: "sell",
      actorId: sellerId,
      targetId: otherId,
      targetUsername: targetPlayer.username,
      details: JSON.stringify({ amount: sellPrice }),
    });

    // 5. Trigger real-time updates
    try {
      await Promise.all([
        pusher.trigger(`player-${sellerId}`, "credits-updated", {
          newCredits: seller.credits + sellPrice,
        }),
        pusher.trigger(`player-${otherId}`, "ownership-changed", {
          type: "sell",
          initiator: seller.username,
          newValue: targetPlayer.valueFloor,
        }),
      ]);
    } catch (pusherError) {
      console.error("Pusher error:", pusherError);
    }

    return {
      success: true,
      sellPrice,
    };
  } catch (error) {
    console.error("Sell error:", error);
    return { error: "Sell failed. Please try again." };
  }
}
