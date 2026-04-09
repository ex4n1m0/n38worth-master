import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Adding last_login_reward_at column to users table...");

  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS last_login_reward_at TIMESTAMP
  `);

  console.log("Successfully added last_login_reward_at column!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });