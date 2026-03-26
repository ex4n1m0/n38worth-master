import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log("Adding totalOnlineMinutes column to users table...");

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_online_minutes integer DEFAULT 0 NOT NULL`;

  console.log("✅ Column added successfully!");

  // Seed existing users with an estimate based on account age (10% of total minutes since creation)
  // This gives established players a reasonable starting point
  console.log("Seeding existing users with estimated online minutes...");
  await sql`
    UPDATE users
    SET total_online_minutes = GREATEST(0,
      EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 * 0.05
    )::integer
    WHERE total_online_minutes = 0
  `;

  console.log("✅ Seeded existing users with estimated online time!");
}

main().catch(console.error);
