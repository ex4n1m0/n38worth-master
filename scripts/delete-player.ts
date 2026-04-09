import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership, transactions, messages, gameHistory } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const username = process.argv[2];
  
  if (!username) {
    console.error("Usage: npx tsx scripts/delete-player.ts <username>");
    console.error("Example: npx tsx scripts/delete-player.ts BoldNinja51");
    process.exit(1);
  }

  const [user] = await db.select().from(users).where(eq(users.username, username));
  
  if (!user) {
    console.log(`User "${username}" not found`);
    process.exit(1);
  }

  console.log(`Found user: id=${user.id}, username=${user.username}`);

  // Log to game history before deletion
  await db.insert(gameHistory).values({
    eventType: "player_deletion",
    actorId: null, // System action
    targetId: user.id,
    targetUsername: user.username,
    details: JSON.stringify({ reason: "admin_deletion" }),
  });

  // Delete all related records
  await db.delete(ownership).where(eq(ownership.ownerId, user.id));
  await db.delete(ownership).where(eq(ownership.ownedId, user.id));
  await db.delete(transactions).where(eq(transactions.buyerId, user.id));
  await db.delete(transactions).where(eq(transactions.targetId, user.id));
  await db.delete(messages).where(eq(messages.senderId, user.id));
  await db.delete(messages).where(eq(messages.recipientId, user.id));
  await db.delete(users).where(eq(users.id, user.id));

  console.log(`Successfully deleted player "${username}" and all related records.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
