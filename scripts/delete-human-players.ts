import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { sql } from "drizzle-orm";
import { purgeUser } from "../src/lib/purgeUser";
import { ADMIN_USERNAMES } from "../src/lib/admins";
import { AI_PLAYER_USERNAMES } from "../src/lib/agent/roster";

/**
 * One-time admin cleanup: delete ALL human players (is_npc = 0) EXCEPT:
 *   - Hall of Champions winners (rows in hall_of_fame),
 *   - admins (ADMIN_USERNAMES, e.g. IgorCarlier),
 *   - autonomous goddesses (AI_PLAYER_USERNAMES / isProtected — purgeUser
 *     refuses protected rows anyway).
 *
 * Deletion goes through purgeUser() so the cascade matches the self-delete
 * and cron flows: owners are refunded half the player's value, owned players
 * are released (value reset to floor, NPCs flagged ownerless), FK rows are
 * removed, and an account_deletion row lands in game_history.
 *
 * Usage:
 *   npx tsx scripts/delete-human-players.ts --dry-run   (list only)
 *   npx tsx scripts/delete-human-players.ts             (actually delete)
 */
async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  if (isDryRun) {
    console.log("DRY RUN MODE - No deletions will be performed\n");
  }

  const keepUsernames = [...ADMIN_USERNAMES, ...AI_PLAYER_USERNAMES].map((u) =>
    u.toLowerCase()
  );

  const candidates = await db
    .select({
      id: users.id,
      username: users.username,
      credits: users.credits,
      playerValue: users.playerValue,
      lastOnlineAt: users.lastOnlineAt,
    })
    .from(users)
    .where(
      sql`${users.isNpc} = 0
        AND ${users.isProtected} = 0
        AND LOWER(${users.username}) NOT IN (${sql.join(keepUsernames.map((u) => sql`${u}`), sql`, `)})
        AND ${users.id} NOT IN (SELECT user_id FROM hall_of_fame)`
    );

  if (candidates.length === 0) {
    console.log("No human players match the deletion criteria.");
    process.exit(0);
  }

  console.log(`Found ${candidates.length} human player(s) to delete (excluding Hall of Champions winners and admins):\n`);
  for (const p of candidates) {
    console.log(
      `  ID: ${p.id}  |  ${p.username}  |  value: ${p.playerValue}  |  credits: ${p.credits}  |  last online: ${p.lastOnlineAt ?? "never"}`
    );
  }

  if (isDryRun) {
    console.log(`\n[DRY RUN] Would delete ${candidates.length} player(s). Run without --dry-run to proceed.`);
  } else {
    console.log(`\nDeleting ${candidates.length} player(s)...\n`);
    let deleted = 0;
    for (const p of candidates) {
      try {
        const ok = await purgeUser(p.id, "admin_purge_humans");
        if (ok) {
          deleted++;
          console.log(`  Deleted: ${p.username} (ID: ${p.id})`);
        } else {
          console.log(`  Skipped (protected or missing): ${p.username} (ID: ${p.id})`);
        }
      } catch (err) {
        console.error(`  Failed to delete ${p.username} (ID: ${p.id}):`, err);
      }
    }
    console.log(`\nDone. Deleted ${deleted}/${candidates.length} player(s).`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Script error:", err);
  process.exit(1);
});
