import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

// One-off: apply drizzle/0019_add_ownership_renamed_at.sql
async function main() {
  await db.execute(
    sql`ALTER TABLE ownership ADD COLUMN IF NOT EXISTS renamed_at timestamp`
  );
  console.log("Applied: ownership.renamed_at column added (or already existed).");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
