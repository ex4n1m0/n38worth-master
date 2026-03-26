import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../src/db";
import { users, ownership, transactions, messages } from "../src/db/schema";
import { sql } from "drizzle-orm";

async function verifyReset() {
  console.log("Verifying reset results...\n");

  try {
    // Check sample users
    const sampleUsers = await db
      .select({
        username: users.username,
        credits: users.credits,
        playerValue: users.playerValue,
        valueFloor: users.valueFloor,
        wasReset: users.wasReset,
      })
      .from(users)
      .limit(5);

    console.log("Sample users after reset:");
    sampleUsers.forEach((u) => {
      console.log(
        `  ${u.username}: credits=${u.credits}, value=${u.playerValue}, floor=${u.valueFloor}, wasReset=${u.wasReset}`
      );
    });

    // Check counts
    const userCount = await db.select({ count: sql<number>`count(*)` }).from(users);
    const ownershipCount = await db.select({ count: sql<number>`count(*)` }).from(ownership);
    const transactionCount = await db.select({ count: sql<number>`count(*)` }).from(transactions);
    const messageCount = await db.select({ count: sql<number>`count(*)` }).from(messages);

    console.log("\n=== Verification Summary ===");
    console.log(`Total users: ${userCount[0].count}`);
    console.log(`Ownership records: ${ownershipCount[0].count} (should be 0)`);
    console.log(`Transactions: ${transactionCount[0].count} (should be 0)`);
    console.log(`Messages: ${messageCount[0].count} (should be 0)`);

    // Verify all users have correct values
    const incorrectUsers = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(
        sql`credits != 100 OR player_value != 1 OR value_floor != 1`
      );

    if (incorrectUsers[0].count > 0) {
      console.log(`\n⚠️  Warning: ${incorrectUsers[0].count} users have incorrect values!`);
    } else {
      console.log("\n✓ All users have correct values (100 credits, $1 value)");
    }

    console.log("\n✓ Reset verification complete!");
    process.exit(0);
  } catch (error) {
    console.error("Error verifying reset:", error);
    process.exit(1);
  }
}

verifyReset();