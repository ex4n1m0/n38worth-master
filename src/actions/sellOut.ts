"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, transactions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";

/**
 * Sell Out: A player pays their current value to release themselves from an owner.
 * - The player pays their own playerValue in credits to the owner.
 * - The ownership record is removed.
 * - The player's value is NOT reset (preserved as-is).
 */
export async function sellOut(ownershipId: number) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const playerId = parseInt(session.user.id);

  try {
    // Get the ownership record — must be an ownership where the current player is the owned one
    const [record] = await db
      .select()
      .from(ownership)
      .where(
        and(
          eq(ownership.id, ownershipId),
          eq(ownership.ownedId, playerId)
        )
      );

    if (!record) {
      return { error: "Ownership record not found" };
    }

    // Get player info
    const [player] = await db
      .select()
      .from(users)
      .where(eq(users.id, playerId));

    if (!player) {
      return { error: "Player not found" };
    }

    const cost = Math.floor(player.credits * 0.9);

    // Check if player has enough credits
    if (player.credits < cost) {
      return { error: `Not enough credits. You need ${cost}¢ (90% of your credits) to sell out.` };
    }

    // Get owner info
    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, record.ownerId));

    if (!owner) {
      return { error: "Owner not found" };
    }

    // 1-5. Execute all database operations individually
    // Note: neon-http does not support transactions, so we execute operations individually

    // 1. Deduct credits from the player (floor at 0, never go negative)
    await db
      .update(users)
      .set({
        credits: sql`credits - ${cost}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, playerId));

    // 2. Pay the owner the player's current value — cap to prevent overflow
    await db
      .update(users)
      .set({ credits: sql`LEAST(credits + ${cost}, ${sql.raw(MAX_CREDITS_SQL)})` })
      .where(eq(users.id, record.ownerId));

    // 3. Remove the ownership record
    await db
      .delete(ownership)
      .where(eq(ownership.id, ownershipId));

    // 3a. If the owner is an NPC (card), also remove the reverse ownership (player -> NPC)
    if (owner.isNpc === 1) {
      await db
        .delete(ownership)
        .where(
          and(eq(ownership.ownerId, playerId), eq(ownership.ownedId, record.ownerId))
        );
    }

    // 4. Log transaction
    await db.insert(transactions).values({
      buyerId: playerId,
      targetId: record.ownerId,
      type: "sell",
      amount: cost,
    });

    // 5. Trigger real-time updates
    try {
      await Promise.all([
        pusher.trigger(`player-${playerId}`, "credits-updated", {
          newCredits: player.credits - cost,
        }),
        pusher.trigger(`player-${record.ownerId}`, "credits-updated", {
          message: `${player.username} sold out from you! You received ${cost}¢`,
        }),
        pusher.trigger(`player-${record.ownerId}`, "ownership-changed", {
          type: "sell_out",
          initiator: player.username,
          newValue: player.playerValue,
        }),
      ]);
    } catch (e) {
      // Pusher errors are non-critical
    }

    return {
      success: true,
      cost,
      ownerUsername: owner.username,
    };
  } catch (error) {
    console.error("Sell out error:", error);
    return { error: "Sell out failed. Please try again." };
  }
}
