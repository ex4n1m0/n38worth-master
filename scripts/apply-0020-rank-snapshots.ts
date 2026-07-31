import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

// One-off: apply drizzle/0020_add_user_rank_snapshots.sql
async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_rank_snapshots (
      user_id integer PRIMARY KEY,
      empire_rank integer NOT NULL,
      legacy_rank integer NOT NULL,
      credits_rank integer NOT NULL,
      value_rank integer NOT NULL,
      portfolio_rank integer NOT NULL,
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  console.log("Applied: user_rank_snapshots table created (or already existed).");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
