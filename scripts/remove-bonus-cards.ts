import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership, gameSettings, transactions, rewardHistory, avatarReveals, messages } from "../src/db/schema";
import { inArray, sql, eq, or } from "drizzle-orm";

/**
 * One-time cleanup for the "bonus cards removed from the game" change.
 *
 *   1. Delete every bonus-card user row and any ownership rows referencing them.
 *   2. Realign the mission ladder: the first mission (which awarded the 3 bonus
 *      cards) was removed, so every later mission dropped one index. We decrement
 *      each player's mission_level by 1 (clamped >= 0) exactly ONCE, guarded by a
 *      game_settings marker so re-running is safe.
 *
 * Run:  npx tsx scripts/remove-bonus-cards.ts         (dry run — prints only)
 *       npx tsx scripts/remove-bonus-cards.ts --apply  (performs the changes)
 */
const BONUS_CARD_USERNAMES = [
  "Bonus Own Value",
  "Bonus Owned Players",
  "Bonus Player Slot",
  "Mass Hire",
  "Create NPC",
  "+10 Player Slots",
  "10-Min Knowledge",
];

const MIGRATION_KEY = "bonus_cards_removed_migration";

async function main() {
  const apply = process.argv.includes("--apply");

  const cards = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.username, BONUS_CARD_USERNAMES));

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — remove bonus cards:\n`);
  console.log(
    cards.length
      ? `  Bonus-card rows: ${cards.map((c) => `${c.username}(#${c.id})`).join(", ")}`
      : "  No bonus-card rows found."
  );

  const [migrated] = await db
    .select({ v: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, MIGRATION_KEY))
    .limit(1);
  const alreadyMigrated = !!migrated;
  console.log(
    alreadyMigrated
      ? "  mission_level realign: already done (skipping)."
      : "  mission_level realign: will decrement every player's mission_level by 1 (>= 0)."
  );

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to perform these changes.\n");
    process.exit(0);
  }

  const ids = cards.map((c) => c.id);
  if (ids.length > 0) {
    // Clear all rows that reference these users via non-cascading FKs, then the
    // users themselves. (ipSessions / multiAccountIncidents cascade; gameHistory
    // has no FK.)
    await db.delete(ownership).where(inArray(ownership.ownedId, ids));
    await db.delete(ownership).where(inArray(ownership.ownerId, ids));
    await db.delete(transactions).where(or(inArray(transactions.buyerId, ids), inArray(transactions.targetId, ids)));
    await db.delete(rewardHistory).where(inArray(rewardHistory.userId, ids));
    await db.delete(avatarReveals).where(or(inArray(avatarReveals.viewerId, ids), inArray(avatarReveals.targetId, ids)));
    await db.delete(messages).where(or(inArray(messages.senderId, ids), inArray(messages.recipientId, ids)));
    await db.delete(users).where(inArray(users.id, ids));
    console.log(`\n✅ Deleted ${ids.length} bonus-card row(s) + their ownership/history/message records.`);
  }

  if (!alreadyMigrated) {
    await db.update(users).set({ missionLevel: sql`GREATEST(mission_level - 1, 0)` });
    await db
      .insert(gameSettings)
      .values({ settingKey: MIGRATION_KEY, settingValue: 1 })
      .onConflictDoNothing({ target: gameSettings.settingKey });
    console.log("✅ Realigned mission_level (decremented by 1, clamped >= 0) and set migration marker.");
  }

  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
