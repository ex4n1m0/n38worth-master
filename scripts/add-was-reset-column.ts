import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  // Add was_reset column if it doesn't exist
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS was_reset INTEGER NOT NULL DEFAULT 0
  `);
  
  console.log("✅ Added was_reset column to users table");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
