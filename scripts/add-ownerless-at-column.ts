import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Adding ownerless_at column to users table...");
  
  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ownerless_at timestamp;`);
    console.log("✅ Column ownerless_at added successfully!");
  } catch (error) {
    console.error("Error adding column:", error);
  }
  
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});