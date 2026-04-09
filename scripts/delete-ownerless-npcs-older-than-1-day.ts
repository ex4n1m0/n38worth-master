import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership, transactions, messages, gameHistory } from "../src/db/schema";
import { sql, eq, or, and, isNull, lte } from "drizzle-orm";

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  if (isDryRun) {
    console.log("🔍 DRY RUN MODE - No deletions will be performed\n");
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find all NPCs that are older than 1 day
  const npcs = await db
    .select({
      id: users.id,
      username: users.username,
      createdAt: users.createdAt,
      ownerlessAt: users.ownerlessAt,
    })
    .from(users)
    .where(eq(users.isNpc, 1));

  const toDelete = [];

  for (const npc of npcs) {
    // Check if NPC has any owners
    const owners = await db
      .select()
      .from(ownership)
      .where(eq(ownership.ownedId, npc.id));
    
    const hasOwner = owners.length > 0;
    const isOlderThan1Day = npc.createdAt <= oneDayAgo;
    
    // Delete if: no owner AND created more than 1 day ago
    if (!hasOwner && isOlderThan1Day) {
      toDelete.push(npc);
    }
  }

  console.log(`Found ${toDelete.length} NPC(s) without owner older than 1 day.`);

  if (isDryRun) {
    console.log(`\n[DRY RUN] Would delete ${toDelete.length} NPC(s):\n`);
    for (const npc of toDelete) {
      const daysSinceCreation = (Date.now() - new Date(npc.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      console.log(`  • ${npc.username} (ID: ${npc.id}) - created ${daysSinceCreation.toFixed(1)} days ago`);
    }
    console.log("\nRun without --dry-run to perform actual deletion.");
  } else {
    let deleted = 0;
    for (const npc of toDelete) {
      try {
        const daysSinceCreation = (Date.now() - new Date(npc.createdAt).getTime()) / (1000 * 60 * 60 * 24);

        // Log to game history before deletion
        await db.insert(gameHistory).values({
          eventType: "npc_deletion",
          actorId: null, // System action
          targetId: npc.id,
          targetUsername: npc.username,
          details: JSON.stringify({ 
            reason: "ownerless_older_than_1_day", 
            daysSinceCreation: Math.round(daysSinceCreation * 10) / 10,
            createdAt: npc.createdAt
          }),
        });

        // Delete related records sequentially (no transaction support in neon-http driver)
        // Remove ownerships where NPC is owner
        await db.delete(ownership).where(eq(ownership.ownerId, npc.id));
        // Remove ownerships where NPC is owned
        await db.delete(ownership).where(eq(ownership.ownedId, npc.id));
        // Remove transactions involving NPC
        await db.delete(transactions).where(
          or(eq(transactions.buyerId, npc.id), eq(transactions.targetId, npc.id))
        );
        // Remove messages involving NPC
        await db.delete(messages).where(
          or(eq(messages.senderId, npc.id), eq(messages.recipientId, npc.id))
        );
        // Delete the NPC user
        await db.delete(users).where(eq(users.id, npc.id));
        deleted++;
        console.log(`  ✓ Deleted ${npc.username} (created ${daysSinceCreation.toFixed(1)} days ago)`);
      } catch (err) {
        console.error(`  ✗ Failed to delete NPC "${npc.username}" (id: ${npc.id}):`, err);
      }
    }

    console.log(`\n✅ Deleted ${deleted}/${toDelete.length} NPC players.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});