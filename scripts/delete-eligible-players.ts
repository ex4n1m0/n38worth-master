import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership, transactions, messages } from "../src/db/schema";
import { eq, sql, or } from "drizzle-orm";

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const now = new Date();
  
  if (isDryRun) {
    console.log("🔍 DRY RUN MODE - No deletions will be performed\n");
  }
  
  console.log(`Current time: ${now.toISOString()}\n`);

  // Find NPC players without any owner whose credits <= 2
  // OR whose estimatedDeletionAt is in the past
  // These match the deletion criteria from the offline-penalty cron (consistent threshold)
  const eligiblePlayers = await db
    .select({
      id: users.id,
      username: users.username,
      credits: users.credits,
      isNpc: users.isNpc,
      lastOnlineAt: users.lastOnlineAt,
      estimatedDeletionAt: users.estimatedDeletionAt,
      ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`,
    })
    .from(users)
    .where(
      sql`${users.isNpc} = 1 AND (SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id") = 0 AND (${users.credits} <= 2 OR (${users.estimatedDeletionAt} IS NOT NULL AND ${users.estimatedDeletionAt} <= ${now}))`
    );

  if (eligiblePlayers.length === 0) {
    console.log("No players match the deletion criteria.");
    process.exit(0);
  }

  console.log(`Found ${eligiblePlayers.length} player(s) matching deletion criteria:\n`);
  console.log("---------------------------------------------------");
  for (const p of eligiblePlayers) {
    console.log(`  ID: ${p.id}`);
    console.log(`  Username: ${p.username}`);
    console.log(`  Credits: ${p.credits}`);
    console.log(`  Is NPC: ${p.isNpc === 1 ? "Yes" : "No"}`);
    console.log(`  Owner Count: ${p.ownerCount}`);
    console.log(`  Last Online: ${p.lastOnlineAt}`);
    console.log(`  Estimated Deletion At: ${p.estimatedDeletionAt || "N/A"}`);
    console.log("---------------------------------------------------");
  }

  if (isDryRun) {
    console.log(`\n[DRY RUN] Would delete ${eligiblePlayers.length} player(s):\n`);
    for (const player of eligiblePlayers) {
      console.log(`  • ${player.username} (ID: ${player.id}, Credits: ${player.credits})`);
    }
    console.log("\nRun without --dry-run to perform actual deletion.");
  } else {
    console.log(`\nProceeding to delete ${eligiblePlayers.length} player(s)...\n`);

    let deleted = 0;
    for (const player of eligiblePlayers) {
      try {
        // Wrap deletion in transaction for atomicity
        await db.transaction(async (tx) => {
          // Remove ownerships where this player is the owner
          await tx.delete(ownership).where(eq(ownership.ownerId, player.id));
          // Remove ownerships where others own this player
          await tx.delete(ownership).where(eq(ownership.ownedId, player.id));
          // Remove transactions involving this player
          await tx.delete(transactions).where(
            or(eq(transactions.buyerId, player.id), eq(transactions.targetId, player.id))
          );
          // Remove messages involving this player
          await tx.delete(messages).where(
            or(eq(messages.senderId, player.id), eq(messages.recipientId, player.id))
          );
          // Delete the player
          await tx.delete(users).where(eq(users.id, player.id));
        });
        deleted++;
        console.log(`  ✓ Deleted: ${player.username} (ID: ${player.id})`);
      } catch (err) {
        console.error(`  ✗ Failed to delete ${player.username} (ID: ${player.id}):`, err);
      }
    }

    console.log(`\nDone. Deleted ${deleted}/${eligiblePlayers.length} player(s).`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
