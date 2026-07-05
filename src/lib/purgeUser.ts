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
 * Permanently delete a user and every FK-referencing row (system-initiated).
 *
 * Mirrors the cleanup performed by the self-service deleteAccount action:
 *  - each owner is refunded half the player's current value,
 *  - players owned by this user are released (value reset to floor; NPCs
 *    flagged ownerless),
 *  - onboarding references are NULLed,
 *  - all FK rows are removed before the final user delete.
 *
 * The neon-http driver has no transactions, so statements run sequentially and
 * FK rows are cleaned before deleting the user. Protected users are skipped.
 *
 * Set `options.resetOwnedValues` to false to release this user's owned players
 * WITHOUT resetting their value to the floor (e.g. when purging expired demo
 * players, so the players they hired keep their accumulated value).
 */
export async function purgeUser(
  userId: number,
  reason: string,
  options: { resetOwnedValues?: boolean } = {}
): Promise<boolean> {
  const { resetOwnedValues = true } = options;
  const [player] = await db.select().from(users).where(eq(users.id, userId));
  if (!player) return false;
  if (player.isProtected === 1) return false;

  const refundPerOwner = Math.floor(player.playerValue / 2);

  // Refund each owner half of the player's current value.
  const owners = await db
    .select({ ownerId: ownership.ownerId })
    .from(ownership)
    .where(eq(ownership.ownedId, userId));

  if (refundPerOwner > 0) {
    for (const o of owners) {
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${refundPerOwner}, ${sql.raw(MAX_CREDITS_SQL)})` })
        .where(eq(users.id, o.ownerId));
    }
  }

  // Release players owned by this user. Their value is reset to the floor
  // unless resetOwnedValues is false (NPCs are always flagged ownerless).
  const owned = await db
    .select({ ownedId: ownership.ownedId, isNpc: users.isNpc })
    .from(ownership)
    .innerJoin(users, eq(users.id, ownership.ownedId))
    .where(eq(ownership.ownerId, userId));

  for (const rec of owned) {
    await db
      .update(users)
      .set({
        ...(resetOwnedValues ? { playerValue: sql`value_floor` } : {}),
        updatedAt: new Date(),
        ...(rec.isNpc === 1 ? { ownerlessAt: new Date() } : {}),
      })
      .where(eq(users.id, rec.ownedId));
  }

  // Log to game history before deletion (gameHistory has no FK to users).
  await db.insert(gameHistory).values({
    eventType: "account_deletion",
    actorId: null,
    targetId: userId,
    targetUsername: player.username,
    details: JSON.stringify({
      reason,
      playerValue: player.playerValue,
      refundPerOwner,
      ownersRefunded: owners.length,
      playersReleased: owned.length,
    }),
  });

  // Remove FK-referencing rows, then the user.
  await db.update(users).set({ onboardingCreatedBy: null }).where(eq(users.onboardingCreatedBy, userId));
  await db.delete(ownership).where(or(eq(ownership.ownerId, userId), eq(ownership.ownedId, userId)));
  await db.delete(transactions).where(or(eq(transactions.buyerId, userId), eq(transactions.targetId, userId)));
  await db.delete(messages).where(or(eq(messages.senderId, userId), eq(messages.recipientId, userId)));
  await db.delete(rewardHistory).where(eq(rewardHistory.userId, userId));
  await db.delete(hallOfFame).where(eq(hallOfFame.userId, userId));
  await db.delete(avatarReveals).where(or(eq(avatarReveals.viewerId, userId), eq(avatarReveals.targetId, userId)));
  await db.delete(users).where(eq(users.id, userId));

  return true;
}
