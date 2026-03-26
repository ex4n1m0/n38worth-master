import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../src/db";
import { users, ownership, transactions, messages } from "../src/db/schema";
import { sql } from "drizzle-orm";

async function resetAllPlayers() {
  console.log("Starting reset of all players to initial status...");

  try {
    // Step 1: Delete all messages
    console.log("Deleting all messages...");
    await db.delete(messages);
    console.log("✓ Messages deleted");

    // Step 2: Delete all transactions
    console.log("Deleting all transactions...");
    await db.delete(transactions);
    console.log("✓ Transactions deleted");

    // Step 3: Delete all ownership records
    console.log("Deleting all ownership records...");
    await db.delete(ownership);
    console.log("✓ Ownership records deleted");

    // Step 4: Reset all users to initial status
    console.log("Resetting all users to initial status...");
    await db
      .update(users)
      .set({
        credits: 100,
        playerValue: 1,
        valueFloor: 1,
        wasReset: 1,
        blockSellUntil: null,
        blockSellBy: null,
        estimatedDeletionAt: null,
        updatedAt: new Date(),
      });
    console.log("✓ All users reset to initial status");

    // Step 5: Verify the reset
    const userCount = await db.select({ count: sql<number>`count(*)` }).from(users);
    const ownershipCount = await db.select({ count: sql<number>`count(*)` }).from(ownership);
    const transactionCount = await db.select({ count: sql<number>`count(*)` }).from(transactions);
    const messageCount = await db.select({ count: sql<number>`count(*)` }).from(messages);

    console.log("\n=== Reset Summary ===");
    console.log(`Users in database: ${userCount[0].count}`);
    console.log(`Ownership records: ${ownershipCount[0].count}`);
    console.log(`Transactions: ${transactionCount[0].count}`);
    console.log(`Messages: ${messageCount[0].count}`);
    console.log("\n✓ All players reset to initial status successfully!");
    console.log("- No owners (all ownership cleared)");
    console.log("- $100 credits for each user");
    console.log("- $1 value for each user");

    process.exit(0);
  } catch (error) {
    console.error("Error resetting players:", error);
    process.exit(1);
  }
}

resetAllPlayers();