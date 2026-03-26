import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  // Add is_npc column if it doesn't exist
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS is_npc INTEGER NOT NULL DEFAULT 0
  `);
  console.log("✅ Added is_npc column to users table");

  // Backfill: mark existing NPCs (no password, no facebook, no google = NPC)
  const result = await db.execute(sql`
    UPDATE users 
    SET is_npc = 1 
    WHERE password_hash IS NULL 
      AND facebook_id IS NULL 
      AND google_id IS NULL
      AND is_npc = 0
  `);
  console.log("✅ Backfilled existing NPCs with is_npc = 1, rows affected:", result.rowCount);

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
