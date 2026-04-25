import { db } from "@/db";
import {
  users,
  ownership,
  transactions,
  messages,
  gameHistory,
  rewardHistory,
} from "@/db/schema";
import { eq, or } from "drizzle-orm";

/**
 * Hard-delete an NPC user and all associated rows.
 *
 * Cascades (no DB FK cascade — neon-http has no transactions either, so we run
 * each step sequentially). Callers should have already verified the target is
 * a non-protected NPC.
 *
 * Logs a single `game_history` row with the supplied reason/details BEFORE
 * deleting the user, so the audit survives.
 */
export async function deleteNpcCascade(
  npcId: number,
  npcUsername: string,
  reason: string,
  extraDetails: Record<string, unknown> = {}
): Promise<void> {
  // Audit log first
  await db.insert(gameHistory).values({
    eventType: "npc_deletion",
    actorId: null,
    targetId: npcId,
    targetUsername: npcUsername,
    details: JSON.stringify({ reason, ...extraDetails }),
  });

  // Ownership rows involving the NPC (as owner or owned)
  await db.delete(ownership).where(eq(ownership.ownerId, npcId));
  await db.delete(ownership).where(eq(ownership.ownedId, npcId));

  // Transactions
  await db
    .delete(transactions)
    .where(or(eq(transactions.buyerId, npcId), eq(transactions.targetId, npcId)));

  // Messages
  await db
    .delete(messages)
    .where(or(eq(messages.senderId, npcId), eq(messages.recipientId, npcId)));

  // Reward history (FK to users.id)
  await db.delete(rewardHistory).where(eq(rewardHistory.userId, npcId));

  // Finally the user itself
  await db.delete(users).where(eq(users.id, npcId));
}
