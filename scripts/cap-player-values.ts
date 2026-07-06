import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { sql, gt } from "drizzle-orm";
import { MAX_PLAYER_VALUE, MAX_PLAYER_VALUE_SQL } from "../src/lib/safeguards";

/**
 * One-time fix: bring any player whose value grew above the new MAX_PLAYER_VALUE
 * ceiling (1e12) back down to the ceiling.
 *
 * Before the ceiling existed, values could grow toward Number.MAX_SAFE_INTEGER
 * (9,007,199,254,740,991). Once a value nears that number, the purchase cost
 * (value × up to 6 block-hours) exceeds the maximum credits any player can hold,
 * so the card becomes impossible to buy. Clamping over-cap values to 1e12 makes
 * those cards purchasable again while keeping all arithmetic in the lossless
 * integer range.
 */
async function main() {
  console.log(
    `Capping player values above MAX_PLAYER_VALUE (${MAX_PLAYER_VALUE.toLocaleString()})...`
  );

  try {
    // Report affected players first for an auditable log.
    const overCap = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
      })
      .from(users)
      .where(gt(users.playerValue, MAX_PLAYER_VALUE));

    if (overCap.length === 0) {
      console.log("✅ No players above the ceiling — nothing to fix.");
      process.exit(0);
    }

    console.log(`Found ${overCap.length} player(s) above the ceiling:`);
    for (const p of overCap) {
      console.log(
        `  • ${p.username} (id ${p.id}): ${p.playerValue.toLocaleString()} → ${MAX_PLAYER_VALUE.toLocaleString()}`
      );
    }

    // Single set-based UPDATE clamps every over-cap row to the ceiling.
    await db
      .update(users)
      .set({
        playerValue: MAX_PLAYER_VALUE,
        updatedAt: new Date(),
      })
      .where(gt(users.playerValue, MAX_PLAYER_VALUE));

    // Safety: keep value_floor at or below the ceiling too, so a future
    // "release to floor" can never re-introduce an over-cap value.
    await db.execute(
      sql`UPDATE users SET value_floor = ${sql.raw(MAX_PLAYER_VALUE_SQL)} WHERE value_floor > ${sql.raw(MAX_PLAYER_VALUE_SQL)}`
    );

    console.log(`✅ Capped ${overCap.length} player(s) to the ceiling.`);
  } catch (error) {
    console.error("Error capping player values:", error);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
