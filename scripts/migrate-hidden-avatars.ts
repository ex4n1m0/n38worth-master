/**
 * One-shot data migration: normalize placeholder avatars to /hidden.png.
 *
 * Updates any user whose avatar_url is the old placeholder (/hiddencard.png)
 * or the legacy default (n38worth2may.png) to use /hidden.png instead.
 *
 * Run: npx tsx scripts/migrate-hidden-avatars.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config(); // also load .env if present
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const NEW_SRC = "/hidden.png";

async function main() {
  // Preview what we're about to change.
  const before = (await sql`
    SELECT avatar_url, COUNT(*)::int AS count
    FROM users
    WHERE avatar_url = '/hiddencard.png'
       OR avatar_url LIKE '%n38worth2may.png'
    GROUP BY avatar_url
    ORDER BY count DESC;
  `) as Array<{ avatar_url: string; count: number }>;

  if (before.length === 0) {
    console.log("Nothing to migrate — no matching placeholder avatars found.");
    return;
  }

  console.log("Rows to update:");
  for (const r of before) {
    console.log(`  ${r.avatar_url} → ${NEW_SRC}  (${r.count})`);
  }

  const updated = (await sql`
    UPDATE users
    SET avatar_url = ${NEW_SRC}, updated_at = NOW()
    WHERE avatar_url = '/hiddencard.png'
       OR avatar_url LIKE '%n38worth2may.png'
    RETURNING id;
  `) as Array<{ id: number }>;

  console.log(`\nMigrated ${updated.length} user(s) to ${NEW_SRC}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
