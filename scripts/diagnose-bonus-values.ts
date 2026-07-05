import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership } from "../src/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { BONUS_CARD_USERNAMES, BONUS_CARD_VALUES } from "../src/lib/bonus-cards";

async function main() {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      playerValue: users.playerValue,
      isNpc: users.isNpc,
      ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = ${users.id})`,
    })
    .from(users)
    .where(inArray(users.username, BONUS_CARD_USERNAMES));

  const found = new Set(rows.map((r) => r.username));

  console.log("=== Bonus card DB rows ===");
  for (const name of BONUS_CARD_USERNAMES) {
    const r = rows.find((x) => x.username === name);
    const base = BONUS_CARD_VALUES[name] ?? 1000;
    if (!r) {
      console.log(`MISSING   ${name.padEnd(20)} (base ${base}) -- NO DB ROW => doubling cannot persist`);
    } else {
      const mult = (r.playerValue / base).toFixed(2);
      console.log(
        `OK        ${name.padEnd(20)} id=${r.id} value=${r.playerValue} (base ${base}, x${mult}) owners=${r.ownerCount}`
      );
    }
  }

  const missing = BONUS_CARD_USERNAMES.filter((n) => !found.has(n));
  console.log("\nMissing rows:", missing.length ? missing.join(", ") : "none");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
