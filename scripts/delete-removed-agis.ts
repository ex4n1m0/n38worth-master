/**
 * One-time script: HARD-DELETE the 5 removed AGI players (Astra, Lyra, Mira,
 * Nova, Vesper) from the database. They are no longer in the roster and
 * shouldn't appear anywhere in the game. The Agent is kept (chat-only support).
 *
 * Mirrors the cascade in adminDeletePlayer.ts: refunds owners, releases owned
 * cards, cleans up all FK-referencing rows, then deletes the user row.
 *
 * Run with: npx tsx scripts/delete-removed-agis.ts
 */
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
import { eq, or, sql, inArray } from "drizzle-orm";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";

const REMOVED_AGIS = ["Astra", "Lyra", "Mira", "Nova", "Vesper"];

async function main() {
  console.log(`Hard-deleting ${REMOVED_AGIS.length} removed AGI players...`);

  // Find the users
  const targets = await db
    .select({
      id: users.id,
      username: users.username,
      playerValue: users.playerValue,
    })
    .from(users)
    .where(inArray(users.username, REMOVED_AGIS));

  if (targets.length === 0) {
    console.log("No removed AGIs found in the database — already deleted.");
    process.exit(0);
  }

  console.log(`Found ${targets.length} users to delete:`);
  for (const t of targets) {
    console.log(`  - ${t.username} (id=${t.id})`);
  }

  for (const target of targets) {
    console.log(`\nDeleting ${target.username} (id=${target.id})...`);
    const refundPerOwner = Math.floor(Number(target.playerValue) / 2);

    // 1. Refund each owner half of the target's current value.
    const owners = await db
      .select({ id: ownership.id, ownerId: ownership.ownerId })
      .from(ownership)
      .where(eq(ownership.ownedId, target.id));

    if (refundPerOwner > 0) {
      for (const ownerRecord of owners) {
        await db
          .update(users)
          .set({
            credits: sql`LEAST(credits + ${refundPerOwner}, ${sql.raw(MAX_CREDITS_SQL)})`,
          })
          .where(eq(users.id, ownerRecord.ownerId));
      }
    }
    console.log(`  Refunded ${owners.length} owners (${refundPerOwner}¢ each).`);

    // 2. Release every player owned by the target (reset value to floor).
    const ownedPlayers = await db
      .select({ ownedId: ownership.ownedId, isNpc: users.isNpc })
      .from(ownership)
      .innerJoin(users, eq(users.id, ownership.ownedId))
      .where(eq(ownership.ownerId, target.id));

    for (const record of ownedPlayers) {
      await db
        .update(users)
        .set({
          playerValue: sql`value_floor`,
          updatedAt: new Date(),
          ...(record.isNpc === 1 ? { ownerlessAt: new Date() } : {}),
        })
        .where(eq(users.id, record.ownedId));
    }
    console.log(`  Released ${ownedPlayers.length} owned cards.`);

    // 3. Audit log BEFORE deleting the user.
    await db.insert(gameHistory).values({
      eventType: "admin_deletion",
      actorId: 0,
      targetId: target.id,
      targetUsername: target.username,
      details: JSON.stringify({
        reason: "removed_agi_cleanup",
        playerValue: target.playerValue,
        refundPerOwner,
        ownersRefunded: owners.length,
        playersReleased: ownedPlayers.length,
      }),
    });

    // 4. NULL out onboarding_created_by on NPCs created by this user.
    await db
      .update(users)
      .set({ onboardingCreatedBy: null })
      .where(eq(users.onboardingCreatedBy, target.id));

    // 5. Delete every row that FK-references the target.
    await db
      .delete(ownership)
      .where(or(eq(ownership.ownerId, target.id), eq(ownership.ownedId, target.id)));
    await db
      .delete(transactions)
      .where(or(eq(transactions.buyerId, target.id), eq(transactions.targetId, target.id)));
    await db
      .delete(messages)
      .where(or(eq(messages.senderId, target.id), eq(messages.recipientId, target.id)));
    await db.delete(rewardHistory).where(eq(rewardHistory.userId, target.id));
    await db.delete(hallOfFame).where(eq(hallOfFame.userId, target.id));
    await db
      .delete(avatarReveals)
      .where(or(eq(avatarReveals.viewerId, target.id), eq(avatarReveals.targetId, target.id)));

    // 6. Finally the user row itself.
    await db.delete(users).where(eq(users.id, target.id));
    console.log(`  Deleted user row.`);
  }

  console.log(`\nDone. Deleted ${targets.length} removed AGI players.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
