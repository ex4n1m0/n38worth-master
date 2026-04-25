import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import {
  users,
  ownership,
  transactions,
  messages,
  gameHistory,
  rewardHistory,
  multiAccountIncidents,
  ipSessions,
} from "../src/db/schema";
import { eq, and, inArray, or, isNull, sql } from "drizzle-orm";

async function main() {
  console.log("Finding NPCs without an avatar...");

  // NPC = is_npc = 1, unprotected, and either avatar_url is NULL or empty string.
  const npcsToDelete = await db
    .select({
      id: users.id,
      username: users.username,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      and(
        eq(users.isNpc, 1),
        eq(users.isProtected, 0),
        or(isNull(users.avatarUrl), sql`${users.avatarUrl} = ''`)
      )
    );

  console.log(`Found ${npcsToDelete.length} NPCs without avatar:`);
  for (const p of npcsToDelete) {
    console.log(`  - ${p.username} (id: ${p.id}, created: ${p.createdAt})`);
  }

  if (npcsToDelete.length === 0) {
    console.log("No NPCs to delete.");
    process.exit(0);
  }

  const ids = npcsToDelete.map((p) => p.id);

  console.log("\nDeleting ownership records...");
  await db.delete(ownership).where(
    or(inArray(ownership.ownerId, ids), inArray(ownership.ownedId, ids))
  );
  console.log("  Ownership records deleted.");

  console.log("Deleting transactions...");
  await db.delete(transactions).where(
    or(inArray(transactions.buyerId, ids), inArray(transactions.targetId, ids))
  );
  console.log("  Transactions deleted.");

  console.log("Deleting messages...");
  await db.delete(messages).where(
    or(inArray(messages.senderId, ids), inArray(messages.recipientId, ids))
  );
  console.log("  Messages deleted.");

  console.log("Deleting reward history...");
  await db.delete(rewardHistory).where(inArray(rewardHistory.userId, ids));
  console.log("  Reward history deleted.");

  console.log("Deleting multi-account incidents...");
  await db.delete(multiAccountIncidents).where(
    or(inArray(multiAccountIncidents.userId1, ids), inArray(multiAccountIncidents.userId2, ids))
  );
  console.log("  Multi-account incidents deleted.");

  console.log("Deleting IP sessions...");
  await db.delete(ipSessions).where(inArray(ipSessions.userId, ids));
  console.log("  IP sessions deleted.");

  console.log("Nullifying game_history references to these users...");
  for (const id of ids) {
    await db.update(gameHistory).set({ actorId: null }).where(eq(gameHistory.actorId, id));
    await db.update(gameHistory).set({ targetId: null }).where(eq(gameHistory.targetId, id));
  }
  console.log("  Game history references nulled.");

  console.log("Logging deletion events to game history...");
  for (const p of npcsToDelete) {
    await db.insert(gameHistory).values({
      eventType: "player_deletion",
      actorId: null,
      targetId: null,
      targetUsername: p.username,
      details: JSON.stringify({ reason: "npc_without_avatar" }),
    });
  }
  console.log("  Game history events logged.");

  console.log("Deleting NPC user records...");
  await db.delete(users).where(inArray(users.id, ids));
  console.log("  User records deleted.");

  console.log(`\n✅ Successfully deleted ${npcsToDelete.length} NPCs without an avatar.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
