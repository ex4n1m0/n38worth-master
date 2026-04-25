import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function runMigration() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log("Running multi-account detection migration...");

  // Add new columns to users table
  console.log("Adding multi_account_warnings column to users...");
  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "multi_account_warnings" integer DEFAULT 0 NOT NULL`;

  console.log("Adding multi_account_penalized column to users...");
  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "multi_account_penalized" integer DEFAULT 0 NOT NULL`;

  // Create ip_sessions table
  console.log("Creating ip_sessions table...");
  await sql`
    CREATE TABLE IF NOT EXISTS "ip_sessions" (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "ip_address" varchar(45) NOT NULL,
      "last_seen_at" timestamp DEFAULT now() NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `;

  console.log("Creating ip_sessions indexes...");
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "idx_ip_sessions_user_ip" ON "ip_sessions" ("user_id", "ip_address")`;
  await sql`CREATE INDEX IF NOT EXISTS "idx_ip_sessions_ip" ON "ip_sessions" ("ip_address")`;
  await sql`CREATE INDEX IF NOT EXISTS "idx_ip_sessions_last_seen" ON "ip_sessions" ("last_seen_at")`;

  // Create multi_account_incidents table
  console.log("Creating multi_account_incidents table...");
  await sql`
    CREATE TABLE IF NOT EXISTS "multi_account_incidents" (
      "id" serial PRIMARY KEY,
      "ip_address" varchar(45) NOT NULL,
      "user_id_1" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "user_id_2" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "action" varchar(20) NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `;

  console.log("Creating multi_account_incidents indexes...");
  await sql`CREATE INDEX IF NOT EXISTS "idx_multi_account_ip" ON "multi_account_incidents" ("ip_address")`;
  await sql`CREATE INDEX IF NOT EXISTS "idx_multi_account_user1" ON "multi_account_incidents" ("user_id_1")`;
  await sql`CREATE INDEX IF NOT EXISTS "idx_multi_account_user2" ON "multi_account_incidents" ("user_id_2")`;
  await sql`CREATE INDEX IF NOT EXISTS "idx_multi_account_created" ON "multi_account_incidents" ("created_at")`;

  console.log("✅ Multi-account detection migration complete!");
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
