import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Adding block_unbreakable_until column to ownership table...");

  try {
    await db.execute(
      sql`ALTER TABLE ownership ADD COLUMN IF NOT EXISTS block_unbreakable_until timestamp;`
    );
    console.log("✅ Column block_unbreakable_until added successfully!");
  } catch (error) {
    console.error("Error adding column:", error);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
