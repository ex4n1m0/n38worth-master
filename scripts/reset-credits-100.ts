import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { sql } from "drizzle-orm";

async function resetCredits() {
  console.log("Resetting all players' credits to $100 and clearing lastLoginRewardAt...");

  try {
    // Get current state before reset
    const [before] = await db
      .select({
        totalPlayers: sql<number>`COUNT(*)`,
        totalCredits: sql<number>`COALESCE(SUM(credits), 0)`,
      })
      .from(users);

    console.log(`\nBefore reset:`);
    console.log(`  Total players: ${before.totalPlayers}`);
    console.log(`  Total economy: ${Number(before.totalCredits).toLocaleString()}¢`);

    // Reset all players credits to 100 and clear login reward timestamp
    await db
      .update(users)
      .set({
        credits: 100,
        lastLoginRewardAt: null,
        updatedAt: new Date(),
      });

    // Verify
    const [after] = await db
      .select({
        totalPlayers: sql<number>`COUNT(*)`,
        totalCredits: sql<number>`COALESCE(SUM(credits), 0)`,
      })
      .from(users);

    console.log(`\nAfter reset:`);
    console.log(`  Total players: ${after.totalPlayers}`);
    console.log(`  Total economy: ${Number(after.totalCredits).toLocaleString()}¢`);
    console.log(`\n✓ All players reset to $100 credits`);
    console.log(`✓ All lastLoginRewardAt cleared (everyone can claim new reward)`);

    process.exit(0);
  } catch (error) {
    console.error("Error resetting credits:", error);
    process.exit(1);
  }
}

resetCredits();
