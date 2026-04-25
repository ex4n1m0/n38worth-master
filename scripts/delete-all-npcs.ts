import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership, transactions, messages, gameHistory } from "../src/db/schema";
import { eq, sql, or } from "drizzle-orm";

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  if (isDryRun) {
    console.log("🔍 DRY RUN MODE - No deletions will be performed\n");
  }

  // Find all NPC players (skip protected NPCs like goddesses)
  const npcs = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(sql`${users.isNpc} = 1 AND ${users.isProtected} = 0 AND ${users.isOnboardingPool} = 0`);

  console.log(`Found ${npcs.length} NPC players to delete.`);

  if (isDryRun) {
    console.log(`\n[DRY RUN] Would delete ${npcs.length} NPC(s):\n`);
    for (const npc of npcs) {
      console.log(`  • ${npc.username} (ID: ${npc.id})`);
    }
    console.log("\nRun without --dry-run to perform actual deletion.");
  } else {
    let deleted = 0;
    for (const npc of npcs) {
      try {
        // Log to game history before deletion
        await db.insert(gameHistory).values({
          eventType: "npc_deletion",
          actorId: null, // System action
          targetId: npc.id,
          targetUsername: npc.username,
          details: JSON.stringify({ reason: "scheduled_cleanup" }),
        });

        // Wrap deletion in transaction for atomicity
        await db.transaction(async (tx) => {
          // Remove ownerships where NPC is owner
          await tx.delete(ownership).where(eq(ownership.ownerId, npc.id));
          // Remove ownerships where NPC is owned
          await tx.delete(ownership).where(eq(ownership.ownedId, npc.id));
          // Remove transactions involving NPC
          await tx.delete(transactions).where(
            or(eq(transactions.buyerId, npc.id), eq(transactions.targetId, npc.id))
          );
          // Remove messages involving NPC
          await tx.delete(messages).where(
            or(eq(messages.senderId, npc.id), eq(messages.recipientId, npc.id))
          );
          // Delete the NPC user
          await tx.delete(users).where(eq(users.id, npc.id));
        });
        deleted++;
      } catch (err) {
        console.error(`Failed to delete NPC "${npc.username}" (id: ${npc.id}):`, err);
      }
    }

    console.log(`✅ Deleted ${deleted}/${npcs.length} NPC players.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
