import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership, transactions, messages, gameHistory } from "../src/db/schema";
import { eq, and, inArray, or } from "drizzle-orm";

async function main() {
  console.log("Finding human players who haven't changed their avatar...");

  // Find all human players with avatar_completed = 0
  const playersToDelete = await db
    .select({ id: users.id, username: users.username, avatarUrl: users.avatarUrl, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.isNpc, 0), eq(users.avatarCompleted, 0)));

  console.log(`Found ${playersToDelete.length} human players without avatar change:`);
  for (const p of playersToDelete) {
    console.log(`  - ${p.username} (id: ${p.id}, created: ${p.createdAt})`);
  }

  if (playersToDelete.length === 0) {
    console.log("No players to delete.");
    process.exit(0);
  }

  const ids = playersToDelete.map((p) => p.id);

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

  console.log("Logging deletion events to game history...");
  for (const p of playersToDelete) {
    await db.insert(gameHistory).values({
      eventType: "player_deletion",
      actorId: null,
      targetId: p.id,
      targetUsername: p.username,
      details: JSON.stringify({ reason: "no_avatar_change" }),
    });
  }
  console.log("  Game history events logged.");

  console.log("Deleting user records...");
  await db.delete(users).where(inArray(users.id, ids));
  console.log("  User records deleted.");

  console.log(`\n✅ Successfully deleted ${playersToDelete.length} human players who never changed their avatar.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});