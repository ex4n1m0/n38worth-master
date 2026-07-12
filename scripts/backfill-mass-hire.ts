/**
 * One-time backfill: award the Mass Hire card to existing users who have
 * missionLevel >= 1 (completed at least the old first mission at 1000 cards)
 * but don't own the Mass Hire card yet.
 *
 * With the new 7-mission system, mission 0 (50 cards) awards Mass Hire.
 * Users who already had missionLevel >= 1 skipped mission 0, so they need
 * Mass Hire awarded retroactively.
 *
 * Usage:
 *   npx tsx scripts/backfill-mass-hire.ts --dry   # preview
 *   npx tsx scripts/backfill-mass-hire.ts          # apply
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

  // Find the Mass Hire card user ID
  const [massHire] = await sql`SELECT id FROM users WHERE username = 'Mass Hire' LIMIT 1`;
  if (!massHire) {
    console.error("Mass Hire card not found in database");
    process.exit(1);
  }
  const massHireId = massHire.id;
  console.log(`Mass Hire card user ID: ${massHireId}`);

  // Find users with missionLevel >= 1 who don't own Mass Hire
  const users = await sql`
    SELECT u.id, u.username, u.mission_level
    FROM users u
    WHERE u.is_npc = 0
      AND u.is_active = 1
      AND u.mission_level >= 1
      AND NOT EXISTS (
        SELECT 1 FROM ownership o
        WHERE o.owner_id = u.id AND o.owned_id = ${massHireId}
      )
    ORDER BY u.mission_level DESC
  `;

  console.log(`\nFound ${users.length} users who need Mass Hire backfill:`);
  for (const u of users) {
    console.log(`  ${u.username} (id=${u.id}, missionLevel=${u.mission_level})`);
  }

  if (users.length === 0) {
    console.log("No users need backfill.");
    process.exit(0);
  }

  if (!dry) {
    for (const u of users) {
      // Check if Mass Hire already has an owner
      const [currentOwner] = await sql`
        SELECT o.id, o.owner_id FROM ownership o
        WHERE o.owned_id = ${massHireId}
      `;

      if (currentOwner) {
        // Pay the current owner the card's value, then transfer
        const [card] = await sql`SELECT player_value FROM users WHERE id = ${massHireId}`;
        const cost = card.player_value;

        await sql`UPDATE users SET credits = LEAST(credits + ${cost}, 9999999999999999) WHERE id = ${currentOwner.owner_id}`;
        await sql`DELETE FROM ownership WHERE id = ${currentOwner.id}`;
        console.log(`  Transferred Mass Hire from user ${currentOwner.owner_id} to ${u.username} (paid ${cost}¢)`);
      } else {
        console.log(`  Awarded Mass Hire to ${u.username} (no previous owner)`);
      }

      // Award to the user
      const blockExpiry = new Date(Date.now() + 30 * 60 * 1000);
      await sql`
        INSERT INTO ownership (owner_id, owned_id, purchase_price, block_sell_until, block_sell_by, block_unbreakable_until)
        VALUES (${u.id}, ${massHireId}, 0, ${blockExpiry}, ${u.username}, ${blockExpiry})
      `;
    }
    console.log(`\nDone! Awarded Mass Hire to ${users.length} users.`);
  } else {
    console.log(`\nDry run — would award Mass Hire to ${users.length} users.`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
