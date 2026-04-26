import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  // Add onboarding_started column if it doesn't exist
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS onboarding_started INTEGER NOT NULL DEFAULT 0
  `);
  console.log("✅ Added onboarding_started column to users table");

  // Verify the column was added
  const result = await db.execute(sql`
    SELECT COUNT(*) as count FROM users WHERE onboarding_started = 0
  `);
  console.log("📊 Users with onboarding_started = 0:", result.rows[0].count);

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
