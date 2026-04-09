"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, transactions, messages, gameHistory } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";

/**
 * Delete Account: A player permanently deletes their own account.
 * - Each owner receives half of the player's current value as a refund.
 * - All players owned by this user are released (value reset to floor).
 * - All related records are deleted.
 * - The user record is deleted.
 */
export async function deleteAccount() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const playerId = parseInt(session.user.id);

  try {
    // 1. Get the player's info
    const [player] = await db
      .select()
      .from(users)
      .where(eq(users.id, playerId));

    if (!player) {
      return { error: "Player not found" };
    }

    const refundPerOwner = Math.floor(player.playerValue / 2);

    // 2. Refund each owner half of the player's current value
    const owners = await db
      .select({
        id: ownership.id,
        ownerId: ownership.ownerId,
      })
      .from(ownership)
      .where(eq(ownership.ownedId, playerId));

    for (const ownerRecord of owners) {
      if (refundPerOwner > 0) {
        await db
          .update(users)
          .set({
            credits: sql`LEAST(credits + ${refundPerOwner}, ${sql.raw(MAX_CREDITS_SQL)})`,
          })
          .where(eq(users.id, ownerRecord.ownerId));
      }
    }

    // 3. Release all players owned by this user (reset their value to floor)
    const ownedPlayers = await db
      .select({
        id: ownership.id,
        ownedId: ownership.ownedId,
      })
      .from(ownership)
      .where(eq(ownership.ownerId, playerId));

    for (const record of ownedPlayers) {
      // Reset the owned player's value to their floor
      await db
        .update(users)
        .set({
          playerValue: sql`value_floor`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, record.ownedId));

      // If the owned player is an NPC, set ownerlessAt
      const [ownedPlayer] = await db
        .select({ isNpc: users.isNpc })
        .from(users)
        .where(eq(users.id, record.ownedId));

      if (ownedPlayer?.isNpc === 1) {
        await db
          .update(users)
          .set({ ownerlessAt: new Date() })
          .where(eq(users.id, record.ownedId));
      }
    }

    // 4. Log to game history before deletion
    await db.insert(gameHistory).values({
      eventType: "account_deletion",
      actorId: playerId,
      targetId: playerId,
      targetUsername: player.username,
      details: JSON.stringify({
        reason: "self_deletion",
        playerValue: player.playerValue,
        refundPerOwner,
        ownersRefunded: owners.length,
        playersReleased: ownedPlayers.length,
      }),
    });

    // 5. Delete all related records
    await db.delete(ownership).where(eq(ownership.ownerId, playerId));
    await db.delete(ownership).where(eq(ownership.ownedId, playerId));
    await db.delete(transactions).where(eq(transactions.buyerId, playerId));
    await db.delete(transactions).where(eq(transactions.targetId, playerId));
    await db.delete(messages).where(eq(messages.senderId, playerId));
    await db.delete(messages).where(eq(messages.recipientId, playerId));

    // 6. Delete the user record
    await db.delete(users).where(eq(users.id, playerId));

    return { success: true };
  } catch (error) {
    console.error("Delete account error:", error);
    return { error: "Account deletion failed. Please try again." };
  }
}
