import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS create_npc_batch_remaining INTEGER NOT NULL DEFAULT 0
  `);
  console.log("✅ Added create_npc_batch_remaining column to users table");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
