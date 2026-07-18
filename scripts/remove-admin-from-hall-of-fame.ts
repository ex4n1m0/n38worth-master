import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { hallOfFame } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { ADMIN_USERNAMES } from "../src/lib/admins";

/**
 * One-time cleanup: remove admin (owner) accounts from the Hall of Fame.
 *
 * The owner is the game operator and should never be listed as a "champion"
 * even if they triggered a real win during testing. Going forward, the game
 * reset logic (triggerGameReset) also skips recording admin wins, so this
 * script only needs to run once to clean up any past entries.
 *
 * Run:  npx tsx scripts/remove-admin-from-hall-of-fame.ts          (dry run)
 *       npx tsx scripts/remove-admin-from-hall-of-fame.ts --apply   (deletes)
 */
async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — remove admin accounts from Hall of Fame\n`);

  for (const adminUsername of ADMIN_USERNAMES) {
    const entries = await db
      .select({ id: hallOfFame.id, username: hallOfFame.username, wonAt: hallOfFame.wonAt })
      .from(hallOfFame)
      .where(eq(hallOfFame.username, adminUsername));

    console.log(`  "${adminUsername}": ${entries.length} entr${entries.length === 1 ? "y" : "ies"} in Hall of Fame`);
    for (const e of entries) {
      console.log(`    id=${e.id} wonAt=${e.wonAt.toISOString()}`);
    }

    if (apply && entries.length > 0) {
      await db.delete(hallOfFame).where(eq(hallOfFame.username, adminUsername));
      console.log(`    ✅ Deleted ${entries.length} entr${entries.length === 1 ? "y" : "ies"}.`);
    }
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to delete these entries.\n");
  } else {
    console.log("\nDone.\n");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
