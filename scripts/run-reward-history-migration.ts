import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Running reward history migration...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "reward_history" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" integer NOT NULL REFERENCES "users"("id"),
      "type" text NOT NULL,
      "amount" double precision NOT NULL,
      "details" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_reward_history_user" ON "reward_history" ("user_id")
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_reward_history_created" ON "reward_history" ("created_at")
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "idx_reward_history_user_created" ON "reward_history" ("user_id", "created_at")
  `);

  console.log("✅ reward_history table created successfully!");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
