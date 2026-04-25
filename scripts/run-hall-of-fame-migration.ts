import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function runMigration() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log("Running Hall of Fame migration...");

  await sql`
    CREATE TABLE IF NOT EXISTS "hall_of_fame" (
      "id" SERIAL PRIMARY KEY,
      "user_id" INTEGER NOT NULL,
      "username" VARCHAR(30) NOT NULL,
      "won_at" TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `;

  console.log("✅ hall_of_fame table created successfully!");
  process.exit(0);
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
