/**
 * One-off remediation script: force a game win for a specific user.
 *
 * Use when the goddess-countdown cron failed to process an expired countdown
 * (e.g. Vercel plan didn't allow per-minute crons, CRON_SECRET mismatch, or
 * a transient DB error caused the reset to be skipped).
 *
 * Usage:
 *   npx tsx scripts/force-game-win.ts <userId>
 *   npx tsx scripts/force-game-win.ts --username <username>
 *
 * The script verifies the user actually owns all 5 goddesses RIGHT NOW before
 * calling `triggerGameReset`. Pass --force to bypass the ownership check
 * (dangerous — only use if you manually verified and ownership rows are
 * already in an odd state).
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../src/db";
import { users, ownership } from "../src/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { GODDESS_USERNAMES } from "../src/lib/goddesses";
import { triggerGameReset } from "../src/actions/triggerGameReset";

async function main() {
  const args = process.argv.slice(2);
  let userId: number | null = null;
  let username: string | null = null;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--username") {
      username = args[++i];
    } else if (a === "--force") {
      force = true;
    } else if (/^\d+$/.test(a)) {
      userId = parseInt(a, 10);
    }
  }

  if (!userId && !username) {
    console.error(
      "Usage: npx tsx scripts/force-game-win.ts <userId> [--force]\n" +
        "   or: npx tsx scripts/force-game-win.ts --username <username> [--force]"
    );
    process.exit(1);
  }

  // Resolve user
  const [winner] = await db
    .select({
      id: users.id,
      username: users.username,
      isActive: users.isActive,
      multiAccountPenalized: users.multiAccountPenalized,
    })
    .from(users)
    .where(userId ? eq(users.id, userId) : eq(users.username, username!));

  if (!winner) {
    console.error(`User not found: ${userId ?? username}`);
    process.exit(1);
  }

  console.log(`Candidate winner: ${winner.username} (id=${winner.id})`);
  console.log(
    `  isActive=${winner.isActive} multiAccountPenalized=${winner.multiAccountPenalized}`
  );

  if (winner.isActive !== 1 || winner.multiAccountPenalized === 1) {
    console.error("User is not eligible (inactive or penalized). Aborting.");
    if (!force) process.exit(1);
    console.warn("--force passed, continuing anyway.");
  }

  // Verify ownership of all 5 goddesses
  const goddesses = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.username, GODDESS_USERNAMES));

  console.log(`\nFound ${goddesses.length} goddess NPCs in the DB:`);
  for (const g of goddesses) console.log(`  - ${g.username} (id=${g.id})`);

  const goddessIds = goddesses.map((g) => g.id);

  const ownedGoddesses = await db
    .select({ ownedId: ownership.ownedId })
    .from(ownership)
    .where(
      and(
        eq(ownership.ownerId, winner.id),
        inArray(ownership.ownedId, goddessIds)
      )
    );

  console.log(
    `\n${winner.username} currently owns ${ownedGoddesses.length}/5 goddesses.`
  );

  if (ownedGoddesses.length < 5 && !force) {
    console.error("Ownership check failed. Pass --force to override. Aborting.");
    process.exit(1);
  }

  // Call the reset
  console.log("\nCalling triggerGameReset()...");
  const result = await triggerGameReset(winner.id, winner.username);

  console.log("\nResult:", JSON.stringify(result, null, 2));

  // Quick sanity summary
  const [{ count: userCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users);
  const [{ count: npcCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.isNpc, 1));
  const [{ count: ownershipCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ownership);

  console.log("\n=== Post-reset state ===");
  console.log(`Total users:       ${userCount}`);
  console.log(`NPCs (goddesses):  ${npcCount} (expected 5)`);
  console.log(`Ownership rows:    ${ownershipCount} (expected 0)`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Force-game-win failed:", err);
  process.exit(1);
});
