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
import { isAdminUser } from "@/lib/admins";
import { isAIPlayerUsername } from "@/lib/agent/roster";

/**
 * Admin-only: hard-delete a human player or NPC card.
 *
 * Mirrors the cascade in `deleteAccount.ts` so refunds and player releases
 * stay consistent with the self-delete flow. The only differences are:
 *   - Caller must be in the admin allowlist (`@/lib/admins`).
 *   - Target must not be the admin themselves (self-delete keeps its own
 *     sign-out plumbing).
 *   - Target must not be protected (goddesses) and must not be an autonomous
 *     goddess — they are permanent game fixtures.
 *     Regular NPC cards and human players CAN be deleted.
 *
 * Audit row uses `eventType: "admin_deletion"` and stores `actorId` =
 * admin's user id, so the two flows can be told apart in `game_history`.
 */
export async function adminDeletePlayer(targetUserId: number) {
  const session = await auth();
  if (!session?.user?.id || !session.user.name) {
    return { error: "Unauthorized" } as const;
  }
  if (!isAdminUser(session.user.name)) {
    return { error: "Forbidden" } as const;
  }

  const adminId = parseInt(session.user.id);
  const adminUsername = session.user.name;

  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return { error: "Invalid target id" } as const;
  }
  if (targetUserId === adminId) {
    return { error: "Use the standard Delete Account flow for self-delete" } as const;
  }

  try {
    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId));

    if (!target) {
      return { error: "Player not found" } as const;
    }
    if (target.isProtected === 1) {
      return { error: "This account is protected and cannot be deleted." } as const;
    }
    if (isAIPlayerUsername(target.username)) {
      return { error: "Autonomous goddesses cannot be deleted." } as const;
    }

    const refundPerOwner = Math.floor(target.playerValue / 2);

    // neon-http has no transactions; run sequentially. Order matters: clean up
    // every FK-referencing row before deleting the user record.
    const tx = db;
    {
      // 1. Refund each owner half of the target's current value.
      const owners = await tx
        .select({
          id: ownership.id,
          ownerId: ownership.ownerId,
        })
        .from(ownership)
        .where(eq(ownership.ownedId, targetUserId));

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

      // 2. Release every player owned by the target (reset value to floor).
      //    NPCs additionally get `ownerlessAt` stamped so the decay loop can
      //    eventually reclaim them.
      const ownedPlayers = await tx
        .select({
          ownedId: ownership.ownedId,
          isNpc: users.isNpc,
        })
        .from(ownership)
        .innerJoin(users, eq(users.id, ownership.ownedId))
        .where(eq(ownership.ownerId, targetUserId));

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

      // 3. Audit log BEFORE deleting the user, so it survives FK cleanup.
      await tx.insert(gameHistory).values({
        eventType: "admin_deletion",
        actorId: adminId,
        targetId: targetUserId,
        targetUsername: target.username,
        details: JSON.stringify({
          reason: "admin_deletion",
          adminUsername,
          playerValue: target.playerValue,
          refundPerOwner,
          ownersRefunded: owners.length,
          playersReleased: ownedPlayers.length,
        }),
      });

      // 4. Delete every row that FK-references the target.

      // 4a. NULL out onboarding_created_by on NPCs created by this user.
      //     Without this, those NPCs would be permanently invisible (creator
      //     no longer exists, can never complete onboarding). Setting NULL
      //     makes the orphaned NPCs visible to everyone.
      await tx
        .update(users)
        .set({ onboardingCreatedBy: null })
        .where(eq(users.onboardingCreatedBy, targetUserId));

      await tx.delete(ownership).where(
        or(eq(ownership.ownerId, targetUserId), eq(ownership.ownedId, targetUserId))
      );
      await tx.delete(transactions).where(
        or(eq(transactions.buyerId, targetUserId), eq(transactions.targetId, targetUserId))
      );
      await tx.delete(messages).where(
        or(eq(messages.senderId, targetUserId), eq(messages.recipientId, targetUserId))
      );
      await tx.delete(rewardHistory).where(eq(rewardHistory.userId, targetUserId));
      await tx.delete(hallOfFame).where(eq(hallOfFame.userId, targetUserId));
      await tx.delete(avatarReveals).where(
        or(eq(avatarReveals.viewerId, targetUserId), eq(avatarReveals.targetId, targetUserId))
      );

      // 5. Finally the user row itself.
      await tx.delete(users).where(eq(users.id, targetUserId));
    }

    return { success: true, deletedUsername: target.username } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Admin delete error:", message, error);
    return { error: `Admin deletion failed: ${message}` } as const;
  }
}
