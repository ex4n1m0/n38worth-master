import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function runMigration() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Running onboarding migration...");

  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_completed" integer DEFAULT 0 NOT NULL`;
  console.log("✅ Added avatar_completed");

  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_npcs" jsonb DEFAULT '[]'::jsonb NOT NULL`;
  console.log("✅ Added onboarding_npcs");

  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_owned_count" integer DEFAULT 0 NOT NULL`;
  console.log("✅ Added onboarding_owned_count");

  await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_complete" integer DEFAULT 0 NOT NULL`;
  console.log("✅ Added onboarding_complete");

  console.log("\n🎉 Migration complete! All onboarding columns added.");
}

runMigration().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
