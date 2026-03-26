import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership, transactions, messages } from "../src/db/schema";
import { eq, sql, or } from "drizzle-orm";

async function main() {
  // Find all NPC players
  const npcs = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.isNpc, 1));

  console.log(`Found ${npcs.length} NPC players to delete.`);

  let deleted = 0;
  for (const npc of npcs) {
    try {
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
    } catch (err) {
      console.error(`Failed to delete NPC "${npc.username}" (id: ${npc.id}):`, err);
    }
  }

  console.log(`✅ Deleted ${deleted}/${npcs.length} NPC players.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
