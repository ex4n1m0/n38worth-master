import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership, transactions, messages, gameHistory } from "../src/db/schema";
import { sql, eq, or } from "drizzle-orm";

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  if (isDryRun) {
    console.log("🔍 DRY RUN MODE - No deletions will be performed\n");
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Find all NPCs without owners that have been ownerless for 24+ hours
  // Skip protected NPCs (e.g., goddesses)
  const npcs = await db
    .select({
      id: users.id,
      username: users.username,
      ownerlessAt: users.ownerlessAt,
      ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`,
    })
    .from(users)
    .where(
      sql`${users.isNpc} = 1 AND ${users.ownerlessAt} IS NOT NULL AND ${users.isProtected} = 0 AND ${users.isOnboardingPool} = 0`
    );

  const toDelete = npcs.filter(npc => {
    // Skip if NPC has an owner
    if (Number(npc.ownerCount) > 0) return false;
    
    // Check if ownerless for 24+ hours
    const ownerlessAt = new Date(npc.ownerlessAt!);
    return ownerlessAt <= twentyFourHoursAgo;
  });

  console.log(`Found ${toDelete.length} NPC(s) ownerless for 24+ hours.`);

  if (isDryRun) {
    console.log(`\n[DRY RUN] Would delete ${toDelete.length} NPC(s):\n`);
    for (const npc of toDelete) {
      const hoursOwnerless = (now.getTime() - new Date(npc.ownerlessAt!).getTime()) / (1000 * 60 * 60);
      console.log(`  • ${npc.username} (ID: ${npc.id}) - ownerless for ${hoursOwnerless.toFixed(1)} hours`);
    }
    console.log("\nRun without --dry-run to perform actual deletion.");
  } else {
    let deleted = 0;
    for (const npc of toDelete) {
      try {
        const hoursOwnerless = (now.getTime() - new Date(npc.ownerlessAt!).getTime()) / (1000 * 60 * 60);

        // Log to game history before deletion
        await db.insert(gameHistory).values({
          eventType: "npc_deletion",
          actorId: null, // System action
          targetId: npc.id,
          targetUsername: npc.username,
          details: JSON.stringify({ reason: "ownerless_24h", hoursOwnerless: Math.round(hoursOwnerless * 10) / 10 }),
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
        console.log(`  ✓ Deleted ${npc.username} (ownerless for ${hoursOwnerless.toFixed(1)} hours)`);
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