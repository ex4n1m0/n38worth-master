/**
 * Manual trigger / dry-run for the tiered offline ownership decay.
 *
 * Usage:
 *   npx tsx scripts/decay-offline-ownership.ts            # apply
 *   npx tsx scripts/decay-offline-ownership.ts --dry      # preview only
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { runOwnershipDecay } from "../src/lib/ownershipDecay";

async function main() {
  const dry = process.argv.includes("--dry");
  console.log(
    dry
      ? "DRY RUN — no writes will be performed."
      : "APPLYING — mutations will be written to the database."
  );

  const result = await runOwnershipDecay(dry);

  console.log("");
  console.log("================ SUMMARY ================");
  console.log(`Users processed:  ${result.usersProcessed}`);
  console.log(`Cards released:   ${result.totalReleased}`);
  console.log("");

  if (result.perUser.length === 0) {
    console.log("No eligible offline users with cards to decay.");
    return;
  }

  const sorted = [...result.perUser].sort((a, b) => b.cardsReleased - a.cardsReleased);
  for (const u of sorted) {
    console.log(
      `  ${u.username} (id=${u.userId}) — ${u.totalOwned} cards, tier: ${u.tier}, releasing ${u.cardsReleased}`
    );
    if (u.releasedUsernames.length > 0) {
      console.log(
        `       released (${u.releasedUsernames.length}): ${u.releasedUsernames.slice(0, 10).join(", ")}${
          u.releasedUsernames.length > 10 ? ", ..." : ""
        }`
      );
    }
  }
}

main().catch((err) => {
  console.error("Decay script failed:", err);
  process.exit(1);
});
