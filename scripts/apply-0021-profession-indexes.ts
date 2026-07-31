import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

// One-off: apply drizzle/0021_add_profession_indexes.sql
async function main() {
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_users_profession ON users(profession) WHERE profession IS NOT NULL`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_game_history_actor_type ON game_history(actor_id, event_type)`
  );
  console.log("Applied: profession + game_history(actor_id, event_type) indexes created (or already existed).");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
