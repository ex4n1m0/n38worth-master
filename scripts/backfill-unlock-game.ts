/**
 * One-time backfill for the new "Own 20 cards to unlock the Game" mission.
 *
 * With the new 8-mission system, mission 0 (threshold 20) was added before
 * the existing missions. This shifts all existing mission levels by 1:
 *   old level 0 → new level 0 (still working on missions)
 *   old level 1 → new level 2 (completed old mission 0, now completed missions 0+1)
 *   old level N → new level N+1
 *
 * Also upgrades hire_slots to 50 for any user who owns 20+ cards (completed
 * the new mission 0).
 *
 * Usage:
 *   npx tsx scripts/backfill-unlock-game.ts --dry   # preview
 *   npx tsx scripts/backfill-unlock-game.ts          # apply
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const dry = process.argv.includes("--dry");
  console.log(
    dry
      ? "DRY RUN — no writes will be performed."
      : "APPLYING — mutations will be written to the database."
  );

  // 1. Shift mission levels: all active humans with mission_level >= 1 get +1.
  const usersToShift = await sql`
    SELECT id, username, mission_level
    FROM users
    WHERE is_npc = 0 AND is_active = 1 AND mission_level >= 1
    ORDER BY mission_level DESC
  `;
  console.log(`\nUsers with missionLevel >= 1 to shift +1: ${usersToShift.length}`);
  for (const u of usersToShift) {
    console.log(`  ${u.username}: level ${u.mission_level} → ${u.mission_level + 1}`);
  }

  // 2. Upgrade hire slots to 50 for users with 20+ owned cards.
  const usersToUpgrade = await sql`
    SELECT u.id, u.username, u.mission_level, u.hire_slots,
           (SELECT COUNT(*) FROM ownership o WHERE o.owner_id = u.id) as owned_count
    FROM users u
    WHERE u.is_npc = 0 AND u.is_active = 1
      AND u.hire_slots < 50
      AND (SELECT COUNT(*) FROM ownership o WHERE o.owner_id = u.id) >= 20
    ORDER BY owned_count DESC
  `;
  console.log(`\nUsers with 20+ cards to upgrade hire slots to 50: ${usersToUpgrade.length}`);
  for (const u of usersToUpgrade) {
    console.log(`  ${u.username}: ${u.owned_count} cards, hire_slots ${u.hire_slots} → 50`);
  }

  if (!dry) {
    // Apply mission level shifts
    for (const u of usersToShift) {
      await sql`UPDATE users SET mission_level = ${u.mission_level + 1} WHERE id = ${u.id}`;
    }
    console.log(`\nShifted ${usersToShift.length} users' mission levels.`);

    // Apply hire slot upgrades
    for (const u of usersToUpgrade) {
      await sql`UPDATE users SET hire_slots = 50 WHERE id = ${u.id}`;
    }
    console.log(`Upgraded ${usersToUpgrade.length} users' hire slots to 50.`);
  } else {
    console.log(`\nDry run — would shift ${usersToShift.length} levels and upgrade ${usersToUpgrade.length} hire slots.`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
