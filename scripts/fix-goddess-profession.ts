import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { inArray, and, isNotNull } from "drizzle-orm";
import { GODDESS_USERNAMES } from "../src/lib/goddesses";

/**
 * One-off data fix: goddesses must never have a profession (they are not
 * combo-eligible cards). A stray non-null `profession` on a goddess makes it
 * surface when sorting/filtering owned players by profession. This nulls the
 * profession for every goddess. Idempotent — safe to re-run.
 *
 * Usage: npx tsx scripts/fix-goddess-profession.ts
 */
async function main() {
  // Show current state for the audit trail.
  const before = await db
    .select({ id: users.id, username: users.username, profession: users.profession })
    .from(users)
    .where(inArray(users.username, GODDESS_USERNAMES));

  console.log("Goddess rows (before):");
  for (const g of before) {
    console.log(`  - ${g.username} (id=${g.id}) profession=${g.profession ?? "null"}`);
  }

  const offenders = before.filter((g) => g.profession != null);
  if (offenders.length === 0) {
    console.log("\nNo goddess has a profession. Nothing to do.");
    process.exit(0);
  }

  const updated = await db
    .update(users)
    .set({ profession: null })
    .where(and(inArray(users.username, GODDESS_USERNAMES), isNotNull(users.profession)))
    .returning({ id: users.id, username: users.username });

  console.log(`\n✅ Cleared profession on ${updated.length} goddess row(s):`);
  for (const u of updated) console.log(`  - ${u.username} (id=${u.id})`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
