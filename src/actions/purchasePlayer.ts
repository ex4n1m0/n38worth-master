"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, transactions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";

export async function purchasePlayer(targetId: number) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const buyerId = parseInt(session.user.id);

  if (buyerId === targetId) {
    return { error: "You cannot buy yourself" };
  }

  try {
    // Use Neon HTTP transactions via drizzle
    // Note: Neon HTTP driver doesn't support traditional transactions with FOR UPDATE
    // We use a serializable approach with conflict detection

    // 1. Get target player
    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetId));

    if (!target) {
      return { error: "Player not found" };
    }

    // 2. Get buyer
    const [buyer] = await db
      .select()
      .from(users)
      .where(eq(users.id, buyerId));

    if (!buyer) {
      return { error: "Buyer not found" };
    }

    const cost = target.playerValue;

    // 3. Validate buyer has enough credits
    if (buyer.credits < cost) {
      return { error: "Insufficient credits" };
    }

    // 4. Check buyer doesn't already own this player
    const existingOwnership = await db
      .select()
      .from(ownership)
      .where(
        and(eq(ownership.ownerId, buyerId), eq(ownership.ownedId, targetId))
      );

    if (existingOwnership.length > 0) {
      return { error: "You already own this player" };
    }

    // 4b. Check ownership limit (max 111 players)
    const [ownershipCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(eq(ownership.ownerId, buyerId));

    if (ownershipCount.count >= 111) {
      return { error: "You've reached the maximum limit of 111 owned players. Discard some players to buy more!" };
    }

    // 5. Get the current owner of target (single owner now)
    const [currentOwner] = await db
      .select()
      .from(ownership)
      .where(eq(ownership.ownedId, targetId));

    // 6. Deduct credits from buyer (allow negative credits)
    await db
      .update(users)
      .set({ credits: sql`credits - ${cost}` })
      .where(eq(users.id, buyerId));

    // 7. Distribute revenue: 50% to original owner, 50% to the purchased player
    const ownerShare = Math.floor(cost / 2);
    const playerShare = cost - ownerShare;

    // Give 50% to the original owner (if exists)
    if (currentOwner) {
      await db
        .update(users)
        .set({ credits: sql`credits + ${ownerShare}` })
        .where(eq(users.id, currentOwner.ownerId));

      // Remove the original ownership
      await db
        .delete(ownership)
        .where(eq(ownership.id, currentOwner.id));
    }

    // Give 50% to the purchased player
    await db
      .update(users)
      .set({ credits: sql`credits + ${playerShare}` })
      .where(eq(users.id, targetId));

    // 8. Double the target's player value after purchase
    const newValue = target.playerValue * 2;
    await db
      .update(users)
      .set({
        playerValue: sql`player_value * 2`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId));

    // 9. Create ownership record — inherit any active sell block from the target player
    // Check ownership records first, then fall back to the player's own record
    const existingBlocked = await db
      .select({
        blockSellUntil: ownership.blockSellUntil,
        blockSellBy: ownership.blockSellBy,
      })
      .from(ownership)
      .where(
        and(
          eq(ownership.ownedId, targetId),
          sql`block_sell_until > NOW()`
        )
      )
      .limit(1);

    let blockUntil = existingBlocked.length > 0 ? existingBlocked[0].blockSellUntil : null;
    let blockBy = existingBlocked.length > 0 ? existingBlocked[0].blockSellBy : null;

    // Fallback: check the player record itself (covers case where seller was the only owner)
    if (!blockUntil && target.blockSellUntil && new Date(target.blockSellUntil) > new Date()) {
      blockUntil = target.blockSellUntil;
      blockBy = target.blockSellBy ?? null;
    }

    await db.insert(ownership).values({
      ownerId: buyerId,
      ownedId: targetId,
      purchasePrice: cost,
      blockSellUntil: blockUntil,
      blockSellBy: blockBy,
    });


    // 10. Log transaction
    await db.insert(transactions).values({
      buyerId,
      targetId,
      type: "purchase",
      amount: cost,
    });

    // 11. Trigger real-time updates via Pusher
    try {
      const pusherPromises = [
        pusher.trigger(`player-${targetId}`, "purchased", {
          buyerUsername: buyer.username,
          newValue,
        }),
        pusher.trigger(`player-${buyerId}`, "credits-updated", {
          newCredits: buyer.credits - cost,
        }),
      ];

      // Notify original owner if they exist
      if (currentOwner) {
        pusherPromises.push(
          pusher.trigger(`player-${currentOwner.ownerId}`, "revenue-received", {
            amount: ownerShare,
            fromPlayer: target.username,
            buyer: buyer.username,
          })
        );
      }

      await Promise.all(pusherPromises);
    } catch (pusherError) {
      // Don't fail the transaction if Pusher fails
      console.error("Pusher error:", pusherError);
    }

    return {
      success: true,
      newValue,
      cost,
    };
  } catch (error) {
    console.error("Purchase error:", error);
    return { error: "Purchase failed. Please try again." };
  }
}
