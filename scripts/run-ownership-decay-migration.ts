import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Running ownership-decay migration (adds users.last_ownership_decay_at)...");

  await db.execute(sql`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "last_ownership_decay_at" timestamp
  `);

  console.log("✅ users.last_ownership_decay_at added (or already existed).");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
