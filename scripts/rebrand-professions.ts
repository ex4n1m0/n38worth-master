import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

/**
 * One-time rebrand migration: rewrite the `users.profession` column from the
 * old dark-fantasy profession names to the sci-fi rebrand names.
 *
 *   Rift Binder        → Cryptographer
 *   Hexblade Courier   → Zero-Day
 *   Scrap Alchemist    → Overclocker
 *   Spirit Archivist   → Cache Keeper
 *   Iron Choir Marshal → Server Marshal
 *   Plague Cartographer→ Bot Herder
 *
 * Idempotent: rows already carrying a new name (or a NULL profession) are
 * left untouched, so re-running is safe. Run once at deploy time:
 *
 *   npm run rebrand:professions
 */

const PROFESSION_RENAMES: Record<string, string> = {
  "Rift Binder": "Cryptographer",
  "Hexblade Courier": "Zero-Day",
  "Scrap Alchemist": "Overclocker",
  "Spirit Archivist": "Cache Keeper",
  "Iron Choir Marshal": "Server Marshal",
  "Plague Cartographer": "Bot Herder",
};

async function main() {
  console.log("Rebranding professions on user rows...");

  let total = 0;
  for (const [oldName, newName] of Object.entries(PROFESSION_RENAMES)) {
    // Count first for an auditable log.
    const countResult = await db.execute(
      sql`SELECT COUNT(*)::int AS n FROM users WHERE profession = ${oldName}`
    );
    const n = Number((countResult.rows[0] as { n: number } | undefined)?.n ?? 0);
    if (n === 0) {
      console.log(`  • ${oldName} → ${newName}: no rows (already migrated?)`);
      continue;
    }

    await db.execute(
      sql`UPDATE users SET profession = ${newName}, updated_at = now() WHERE profession = ${oldName}`
    );
    console.log(`  • ${oldName} → ${newName}: ${n} row(s) updated`);
    total += n;
  }

  // Sanity: no row should still carry a legacy name.
  const leftover = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM users WHERE profession = ANY(${sql.raw(
      `ARRAY[${Object.keys(PROFESSION_RENAMES)
        .map((n) => `'${n.replace(/'/g, "''")}'`)
        .join(",")}]`
    )}::varchar(30)[])`
  );
  const left = Number((leftover.rows[0] as { n: number } | undefined)?.n ?? 0);
  if (left > 0) {
    console.error(`⚠ ${left} row(s) still carry legacy profession names — inspect manually.`);
    process.exit(1);
  }

  console.log(`✅ Done. ${total} row(s) rebranded.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
