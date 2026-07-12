/**
 * One-time backfill: add 50 hire slots per completed mission for existing users.
 *
 * With the new system, each mission completion adds 50 hire slots (stacking).
 * Existing users who completed missions before this change only got the upgrade
 * from mission 0 (20→50). This script adds the missing 50 slots for each
 * additional mission they've completed.
 *
 * Formula: hire_slots = 20 + (mission_level * 50)
 * (mission_level = number of missions completed)
 *
 * Usage:
 *   npx tsx scripts/backfill-hire-slots.ts --dry   # preview
 *   npx tsx scripts/backfill-hire-slots.ts          # apply
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const BASE_SLOTS = 20;
const SLOTS_PER_MISSION = 50;

async function main() {
  const dry = process.argv.includes("--dry");
  console.log(
    dry
      ? "DRY RUN — no writes will be performed."
      : "APPLYING — mutations will be written to the database."
  );

  // Find all active humans with mission_level >= 1
  const users = await sql`
    SELECT id, username, mission_level, hire_slots
    FROM users
    WHERE is_npc = 0 AND is_active = 1 AND mission_level >= 1
    ORDER BY mission_level DESC
  `;

  console.log(`\nUsers with mission_level >= 1: ${users.length}`);
  const toUpgrade: typeof users = [];
  for (const u of users) {
    const targetSlots = BASE_SLOTS + u.mission_level * SLOTS_PER_MISSION;
    if (u.hire_slots < targetSlots) {
      console.log(`  ${u.username}: level=${u.mission_level}, current=${u.hire_slots} → ${targetSlots} (+${targetSlots - u.hire_slots})`);
      toUpgrade.push(u);
    }
  }
  if (toUpgrade.length === 0) console.log("  (all users already have enough slots)");

  if (!dry) {
    for (const u of toUpgrade) {
      const targetSlots = BASE_SLOTS + u.mission_level * SLOTS_PER_MISSION;
      await sql`UPDATE users SET hire_slots = ${targetSlots} WHERE id = ${u.id}`;
    }
    console.log(`\nUpgraded ${toUpgrade.length} users' hire slots.`);
  } else {
    console.log(`\nDry run — would upgrade ${toUpgrade.length} users.`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
