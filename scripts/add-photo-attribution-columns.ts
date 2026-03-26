import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  // Add photo attribution columns if they don't exist
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS photo_author_name TEXT,
    ADD COLUMN IF NOT EXISTS photo_author_url TEXT,
    ADD COLUMN IF NOT EXISTS photo_source_url TEXT
  `);
  console.log("✅ Added photo_author_name, photo_author_url, photo_source_url columns to users table");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
