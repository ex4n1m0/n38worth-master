import { db } from "../src/db";
import { ownership, users } from "../src/db/schema";
import { sql, inArray } from "drizzle-orm";
import { GODDESS_USERNAMES } from "../src/lib/goddesses";

/**
 * One-time fix: removes Fate seals (blockSellBy = 'Goddess of Fate') from
 * goddess cards. Goddesses should never have been sealed — their value is
 * pinned and they have their own unbreakable block during the initial window.
 */
async function fix() {
  // Find goddess user IDs
  const goddessIds = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.username, GODDESS_USERNAMES));

  if (goddessIds.length === 0) {
    console.log("No goddesses found.");
    process.exit(0);
  }

  const ids = goddessIds.map((g) => g.id);

  // Remove Fate seals from goddesses
  const result = await db
    .update(ownership)
    .set({ blockSellUntil: null, blockSellBy: null })
    .where(
      sql`${ownership.blockSellBy} = 'Goddess of Fate' AND ${ownership.ownedId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
    )
    .returning({ id: ownership.id, ownedId: ownership.ownedId });

  console.log(`Removed Fate seals from ${result.length} goddess ownership records.`);
  process.exit(0);
}

fix().catch((e) => {
  console.error(e);
  process.exit(1);
});
