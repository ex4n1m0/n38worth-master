import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { inArray } from "drizzle-orm";
import { BONUS_CARD_USERNAMES, BONUS_CARD_VALUES } from "../src/lib/bonus-cards";

async function main() {
  console.log("Resetting bonus card playerValue to original values...");

  try {
    // Reset each bonus card to its constant BONUS_CARD_VALUES entry (1000 each).
    // Done as individual updates rather than one batch UPDATE so each card
    // gets its own canonical value from the constants file.
    for (const username of BONUS_CARD_USERNAMES) {
      const baseValue = BONUS_CARD_VALUES[username] ?? 1000;
      const result = await db
        .update(users)
        .set({
          playerValue: baseValue,
          updatedAt: new Date(),
        })
        .where(inArray(users.username, [username]));

      console.log(`  • ${username} → ${baseValue}¢`, result);
    }

    console.log("✅ Bonus card playerValue reset successfully!");
  } catch (error) {
    console.error("Error resetting bonus card values:", error);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
