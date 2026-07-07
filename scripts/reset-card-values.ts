import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { inArray, eq } from "drizzle-orm";
import { GODDESS_USERNAMES, GODDESS_VALUES } from "../src/lib/goddesses";
import { BONUS_CARD_USERNAMES, BONUS_CARD_VALUES } from "../src/lib/bonus-cards";

/**
 * One-time admin fix: reset every goddess and bonus card's playerValue back to
 * its floor (base) value. Goddesses use GODDESS_VALUES, bonus cards use
 * BONUS_CARD_VALUES. Values no longer grow on purchase/use (see purchaseCore.ts,
 * purchasePlayer.ts and bonus-card-price.ts), so this brings any already-inflated
 * cards back to floor. Ownership is left untouched.
 *
 * Run:  npx tsx scripts/reset-card-values.ts         (dry run — prints only)
 *       npx tsx scripts/reset-card-values.ts --apply  (performs the changes)
 */
function floorFor(username: string): number | null {
  if (GODDESS_USERNAMES.includes(username)) return GODDESS_VALUES[username] ?? null;
  if (BONUS_CARD_USERNAMES.includes(username)) return BONUS_CARD_VALUES[username] ?? null;
  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const cards = await db
    .select({
      id: users.id,
      username: users.username,
      playerValue: users.playerValue,
    })
    .from(users)
    .where(inArray(users.username, [...GODDESS_USERNAMES, ...BONUS_CARD_USERNAMES]));

  if (cards.length === 0) {
    console.log("No goddesses or bonus cards found.");
    process.exit(0);
  }

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — reset goddess/bonus card values to floor:\n`);
  const toUpdate: { id: number; username: string; floor: number }[] = [];
  for (const c of cards) {
    const floor = floorFor(c.username);
    if (floor === null) {
      console.log(`  • ${c.username} (id ${c.id}): no known floor — skipped`);
      continue;
    }
    const changed = c.playerValue !== floor;
    console.log(
      `  • ${c.username} (id ${c.id}): value ${c.playerValue.toLocaleString()} → floor ${floor.toLocaleString()}` +
        (changed ? "" : " (already at floor)")
    );
    if (changed) toUpdate.push({ id: c.id, username: c.username, floor });
  }

  if (!apply) {
    console.log(`\nDry run only. ${toUpdate.length} card(s) would change. Re-run with --apply to perform.\n`);
    process.exit(0);
  }

  for (const u of toUpdate) {
    await db
      .update(users)
      .set({ playerValue: u.floor, updatedAt: new Date() })
      .where(eq(users.id, u.id));
  }

  console.log(`\n✅ Reset ${toUpdate.length} card value(s) to floor.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
