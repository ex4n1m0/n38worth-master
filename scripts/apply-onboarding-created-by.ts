/**
 * Apply the 0007 migration: add onboarding_created_by column to users table.
 * Uses the neon-http driver (same as the app) which works with both pooled
 * and direct Neon URLs over HTTPS.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = neon(process.env.DATABASE_URL);

  console.log("Adding onboarding_created_by column to users table...");
  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_created_by" INTEGER`;
  console.log("✓ Column added");

  console.log("Adding index idx_users_onboarding_created_by...");
  await sql`CREATE INDEX IF NOT EXISTS "idx_users_onboarding_created_by" ON "users"("onboarding_created_by")`;
  console.log("✓ Index added");

  // Verify the column exists
  const result = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'onboarding_created_by'
  `;
  console.log("\nVerification:", result);

  console.log("\n✅ Migration 0007_add_onboarding_created_by complete!");
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
