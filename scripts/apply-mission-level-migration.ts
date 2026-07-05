import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  // Add mission_level column if it does not exist
  await db.execute(sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS mission_level INTEGER NOT NULL DEFAULT 0
  `);
  console.log("Added mission_level column to users table");

  const result = await db.execute(sql`
    SELECT COUNT(*) as count FROM users WHERE mission_level = 0
  `);
  console.log("Users with mission_level = 0:", result.rows[0].count);

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
