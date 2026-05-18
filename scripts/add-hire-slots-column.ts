import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  // Add hire_slots column if it doesn't exist
  await db.execute(sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS hire_slots INTEGER NOT NULL DEFAULT 20
  `);
  console.log("✅ Added hire_slots column to users table");

  // Seed existing users: GREATEST(20, ceil(owned_count / 10) * 10)
  const result = await db.execute(sql`
    UPDATE users u
    SET hire_slots = GREATEST(
      20,
      CEIL((
        SELECT COUNT(*) FROM ownership o WHERE o.owner_id = u.id
      )::numeric / 10.0) * 10
    )
  `);
  console.log("✅ Seeded hire_slots for existing users, rows affected:", result.rowCount);

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
