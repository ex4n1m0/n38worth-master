import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../src/db";
import { users, ownership, transactions, messages } from "../src/db/schema";
import { sql, eq, notInArray } from "drizzle-orm";

const GODDESS_USERNAMES = ["Morríghan", "Athena", "Freyja", "Ishtar", "Inanna"];

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

    // Step 4: Reset ALL players EXCEPT goddess NPCs to initial status
    console.log("Resetting all players (except goddess NPCs) to initial status...");
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
        // Clear onboarding state so players don't get stuck in onboarding
        // after ownership records are deleted
        onboardingNpcs: [],
        onboardingOwnedCount: 0,
        onboardingComplete: 0,
        avatarCompleted: 0,
        updatedAt: new Date(),
      })
      .where(notInArray(users.username, GODDESS_USERNAMES));
    console.log("✓ All non-goddess players reset to initial status (including onboarding)");

    // Step 4b: Clear ownership-related fields on goddess NPCs too
    console.log("Clearing sell blocks on goddess NPCs...");
    await db
      .update(users)
      .set({
        blockSellUntil: null,
        blockSellBy: null,
        estimatedDeletionAt: null,
        updatedAt: new Date(),
      })
      .where(sql`${users.username} IN (${sql.join(GODDESS_USERNAMES.map(n => sql`${n}`), sql`, `)})`);
    console.log("✓ Goddess NPCs ownership fields cleared (values preserved)");

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
    console.log("- $100 credits for each non-NPC user");
    console.log("- $1 value for each non-NPC user");
    console.log("- Goddess NPCs keep their original values");

    process.exit(0);
  } catch (error) {
    console.error("Error resetting players:", error);
    process.exit(1);
  }
}

resetAllPlayers();