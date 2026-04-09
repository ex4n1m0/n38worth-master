"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, transactions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";

export async function sellAllPlayers() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const sellerId = parseInt(session.user.id);

  try {
    // Get all ownership records for this seller
    const ownedRecords = await db
      .select({
        ownershipId: ownership.id,
        ownedId: ownership.ownedId,
        blockSellUntil: ownership.blockSellUntil,
      })
      .from(ownership)
      .where(eq(ownership.ownerId, sellerId));

    if (ownedRecords.length === 0) {
      return { error: "You don't own any players" };
    }

    // Filter out players that have active sell blocks
    const now = new Date();
    const sellable = ownedRecords.filter(
      (r) => !r.blockSellUntil || new Date(r.blockSellUntil) <= now
    );

    if (sellable.length === 0) {
      return { error: "All your players currently have active sell blocks" };
    }

    // Get seller info
    const [seller] = await db
      .select()
      .from(users)
      .where(eq(users.id, sellerId));

    let totalCreditsEarned = 0;
    let discardedCount = 0;

    const blockUntil = new Date(Date.now() + 1 * 60 * 1000);

    // Execute all database operations individually
    // Note: neon-http does not support transactions, so we execute operations individually
    for (const record of sellable) {
      // Get the player's current value
      const [targetPlayer] = await db
        .select()
        .from(users)
        .where(eq(users.id, record.ownedId));

      if (!targetPlayer) continue;

      const sellPrice = targetPlayer.playerValue;
      totalCreditsEarned += sellPrice;
      discardedCount++;

      // Reset the sold player's value to their floor
      await db
        .update(users)
        .set({
          playerValue: sql`value_floor`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, record.ownedId));

      // Remove ownership record
      await db
        .delete(ownership)
        .where(eq(ownership.id, record.ownershipId));

      // If the discarded player is an NPC (card), also remove the reverse ownership (NPC -> seller)
      if (targetPlayer.isNpc === 1) {
        await db
          .delete(ownership)
          .where(
            and(eq(ownership.ownerId, record.ownedId), eq(ownership.ownedId, sellerId))
          );
      }

      // Set 1min sell block on all remaining ownerships of this player
      await db
        .update(ownership)
        .set({
          blockSellUntil: blockUntil,
          blockSellBy: seller.username,
        })
        .where(eq(ownership.ownedId, record.ownedId));

      // Set the block on the player record so new buyers inherit it
      await db
        .update(users)
        .set({
          blockSellUntil: blockUntil,
          blockSellBy: seller.username,
        })
        .where(eq(users.id, record.ownedId));

      // Log transaction
      await db.insert(transactions).values({
        buyerId: sellerId,
        targetId: record.ownedId,
        type: "sell",
        amount: sellPrice,
      });
    }

    // Add total sell price to seller's credits — cap to prevent overflow
    await db
      .update(users)
      .set({ credits: sql`LEAST(credits + ${totalCreditsEarned}, ${sql.raw(MAX_CREDITS_SQL)})` })
      .where(eq(users.id, sellerId));

    // Trigger real-time update for seller
    try {
      await pusher.trigger(`player-${sellerId}`, "credits-updated", {
        newCredits: seller.credits + totalCreditsEarned,
      });
    } catch (pusherError) {
      console.error("Pusher error:", pusherError);
    }

    return {
      success: true,
      totalCreditsEarned,
      discardedCount,
      skippedCount: ownedRecords.length - sellable.length,
    };
  } catch (error) {
    console.error("Discard all error:", error);
    return { error: "Discard all failed. Please try again." };
  }
}
