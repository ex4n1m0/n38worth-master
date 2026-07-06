import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership } from "../src/db/schema";
import { inArray, eq } from "drizzle-orm";
import { GODDESS_USERNAMES } from "../src/lib/goddesses";

/**
 * One-time admin fix: reset every goddess's playerValue down to its value_floor
 * and RELEASE it from any current owner (delete the ownership record + clear the
 * goddess row's block fields). Read-only inspection is printed first.
 *
 * Run:  npx tsx scripts/reset-goddesses.ts        (dry run — prints only)
 *       npx tsx scripts/reset-goddesses.ts --apply (performs the changes)
 */
async function main() {
  const apply = process.argv.includes("--apply");

  const goddesses = await db
    .select({
      id: users.id,
      username: users.username,
      playerValue: users.playerValue,
      valueFloor: users.valueFloor,
    })
    .from(users)
    .where(inArray(users.username, GODDESS_USERNAMES));

  if (goddesses.length === 0) {
    console.log("No goddesses found.");
    process.exit(0);
  }

  const ids = goddesses.map((g) => g.id);
  const owners = await db
    .select({
      ownedId: ownership.ownedId,
      ownerId: ownership.ownerId,
      ownerName: users.username,
    })
    .from(ownership)
    .innerJoin(users, eq(users.id, ownership.ownerId))
    .where(inArray(ownership.ownedId, ids));
  const ownerByGoddess = new Map(owners.map((o) => [o.ownedId, o]));

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — goddess reset to floor + release:\n`);
  for (const g of goddesses) {
    const o = ownerByGoddess.get(g.id);
    console.log(
      `  • ${g.username} (id ${g.id}): value ${g.playerValue.toLocaleString()} → floor ${g.valueFloor.toLocaleString()}` +
        (o ? ` | owned by ${o.ownerName} (id ${o.ownerId}) → released` : " | ownerless")
    );
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to perform these changes.\n");
    process.exit(0);
  }

  // 1. Reset each goddess's value to its floor and clear block fields.
  for (const g of goddesses) {
    await db
      .update(users)
      .set({
        playerValue: g.valueFloor,
        blockSellUntil: null,
        blockSellBy: null,
        blockUnbreakableUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, g.id));
  }

  // 2. Release all goddesses from their owners.
  const released = await db
    .delete(ownership)
    .where(inArray(ownership.ownedId, ids));

  console.log(`\n✅ Reset ${goddesses.length} goddess value(s) to floor and released them from owners.`);
  console.log(`   Ownership rows removed: ${(released as { rowCount?: number }).rowCount ?? "n/a"}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
