import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function verify() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'users'
    AND column_name IN ('avatar_completed', 'onboarding_npcs', 'onboarding_owned_count', 'onboarding_complete')
    ORDER BY column_name
  `;
  console.log("Onboarding columns found:", rows.length);
  for (const row of rows) {
    console.log(`  ✅ ${row.column_name} (${row.data_type}) default: ${row.column_default}`);
  }
}

verify().catch(console.error);
