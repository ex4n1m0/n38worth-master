"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  users,
  ownership,
  transactions,
  messages,
  gameHistory,
  rewardHistory,
  hallOfFame,
  avatarReveals,
} from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";
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

    // Check if player is protected from deletion (e.g., goddesses)
    if (player.isProtected === 1) {
      return { error: "This account is protected and cannot be deleted." };
    }

    const refundPerOwner = Math.floor(player.playerValue / 2);

    // NOTE: neon-http driver does not support transactions, so we run
    // the statements sequentially. Order matters: clean up all FK-referencing
    // rows before deleting the user record.
    const tx = db;
    {
      // 2. Refund each owner half of the player's current value
      const owners = await tx
        .select({
          id: ownership.id,
          ownerId: ownership.ownerId,
        })
        .from(ownership)
        .where(eq(ownership.ownedId, playerId));

      if (refundPerOwner > 0) {
        for (const ownerRecord of owners) {
          await tx
            .update(users)
            .set({
              credits: sql`LEAST(credits + ${refundPerOwner}, ${sql.raw(MAX_CREDITS_SQL)})`,
            })
            .where(eq(users.id, ownerRecord.ownerId));
        }
      }

      // 3. Release all players owned by this user (reset value to floor).
      //    Mark NPCs as ownerless in the same statement.
      const ownedPlayers = await tx
        .select({
          ownedId: ownership.ownedId,
          isNpc: users.isNpc,
        })
        .from(ownership)
        .innerJoin(users, eq(users.id, ownership.ownedId))
        .where(eq(ownership.ownerId, playerId));

      for (const record of ownedPlayers) {
        await tx
          .update(users)
          .set({
            playerValue: sql`value_floor`,
            updatedAt: new Date(),
            ...(record.isNpc === 1 ? { ownerlessAt: new Date() } : {}),
          })
          .where(eq(users.id, record.ownedId));
      }

      // 4. Log to game history before deletion
      await tx.insert(gameHistory).values({
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

      // 5. Delete all related records that reference this user.
      //    Any table with a FK to users.id without ON DELETE CASCADE must be
      //    cleaned up here or the final DELETE FROM users will fail.

      // 5a. NULL out onboarding_created_by on NPCs created by this user.
      //     Without this, those NPCs would be permanently invisible (creator
      //     no longer exists, can never complete onboarding). Setting NULL
      //     makes the orphaned NPCs visible to everyone.
      await tx
        .update(users)
        .set({ onboardingCreatedBy: null })
        .where(eq(users.onboardingCreatedBy, playerId));

      await tx.delete(ownership).where(
        or(eq(ownership.ownerId, playerId), eq(ownership.ownedId, playerId))
      );
      await tx.delete(transactions).where(
        or(eq(transactions.buyerId, playerId), eq(transactions.targetId, playerId))
      );
      await tx.delete(messages).where(
        or(eq(messages.senderId, playerId), eq(messages.recipientId, playerId))
      );
      await tx.delete(rewardHistory).where(eq(rewardHistory.userId, playerId));
      await tx.delete(hallOfFame).where(eq(hallOfFame.userId, playerId));
      await tx.delete(avatarReveals).where(
        or(eq(avatarReveals.viewerId, playerId), eq(avatarReveals.targetId, playerId))
      );

      // 6. Delete the user record
      await tx.delete(users).where(eq(users.id, playerId));
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Delete account error:", message, error);
    return { error: `Account deletion failed: ${message}` };
  }
}
