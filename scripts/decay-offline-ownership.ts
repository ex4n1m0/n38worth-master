/**
 * One-off backfill for the idle-ownership-decay rule.
 *
 * For every human user offline > 24h, release / delete owned NPCs at a rate of
 * 1 per hour starting with the oldest purchase. Goddesses are released only;
 * other NPCs are hard-deleted. The anchor `last_ownership_decay_at` is
 * advanced so subsequent hourly cron runs pick up where this left off.
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
      ? "🟡 DRY RUN — no writes will be performed."
      : "🔴 APPLYING — mutations will be written to the database."
  );

  const result = await runOwnershipDecay(dry);

  console.log("");
  console.log("================ SUMMARY ================");
  console.log(`Users processed:           ${result.usersProcessed}`);
  console.log(`NPCs hard-deleted:         ${result.totalDeleted}`);
  console.log(`Goddesses released:        ${result.totalReleasedGoddesses}`);
  console.log("");

  if (result.perUser.length === 0) {
    console.log("No eligible idle users with NPC holdings.");
    return;
  }

  const sorted = [...result.perUser].sort((a, b) => b.hoursToDecay - a.hoursToDecay);
  for (const u of sorted) {
    console.log(
      `  • ${u.username} (id=${u.userId}) — offline ${u.hoursOffline}h, ownedNpcs=${u.ownedNpcs}, decaying ${u.hoursToDecay}`
    );
    if (u.deletedNpcUsernames.length > 0) {
      console.log(
        `       deleted (${u.deletedNpcUsernames.length}): ${u.deletedNpcUsernames.slice(0, 10).join(", ")}${
          u.deletedNpcUsernames.length > 10 ? ", …" : ""
        }`
      );
    }
    if (u.releasedGoddessUsernames.length > 0) {
      console.log(
        `       released goddesses (${u.releasedGoddessUsernames.length}): ${u.releasedGoddessUsernames.join(", ")}`
      );
    }
  }
}

main().catch((err) => {
  console.error("Decay script failed:", err);
  process.exit(1);
});
