import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users, ownership, gameSettings } from "../src/db/schema";
import { inArray, eq, sql } from "drizzle-orm";
import { GODDESS_USERNAMES } from "../src/lib/goddesses";
import { MISSIONS } from "../src/lib/missions-data";

/** Zero a game_settings key (used to clear the win-countdown state). */
async function zeroSetting(key: string): Promise<void> {
  await db
    .insert(gameSettings)
    .values({ settingKey: key, settingValue: 0, updatedAt: new Date() })
    .onConflictDoUpdate({ target: gameSettings.settingKey, set: { settingValue: 0, updatedAt: new Date() } });
}

/**
 * One-time reset to make the goddess race fair after the mission-threshold
 * change:
 *   1. RELEASE every goddess from its current owner (delete goddess ownership
 *      rows) so all 6 goddesses become ownerless / up for grabs again.
 *   2. RECOMPUTE each real player's mission_level from the number of cards they
 *      own RIGHT NOW against the current ladder (1000/2000/3000/4000/5000/6000),
 *      so goddesses are unlocked strictly by present card count.
 *   3. CLEAR any active "own all 6 goddesses" win countdown (nobody owns 6 now).
 *
 * Run:  npx tsx scripts/reset-goddesses.ts          (dry run — prints only)
 *       npx tsx scripts/reset-goddesses.ts --apply   (performs the changes)
 */

/** mission_level = how many ladder thresholds this card count meets. */
function levelForCount(count: number): number {
  return MISSIONS.filter((m) => count >= m.threshold).length;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`\n${apply ? "APPLYING" : "DRY RUN"} — reset goddesses\n`);

  // 1. Goddess card ids.
  const goddesses = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.username, GODDESS_USERNAMES));
  const goddessIds = goddesses.map((g) => g.id);

  // Current goddess ownership (who holds what).
  const held = goddessIds.length
    ? await db
        .select({ ownerId: ownership.ownerId, ownedId: ownership.ownedId })
        .from(ownership)
        .where(inArray(ownership.ownedId, goddessIds))
    : [];
  console.log(`  Goddess cards: ${goddesses.map((g) => g.username).join(", ") || "none"}`);
  console.log(`  Goddess ownership rows to release: ${held.length}`);

  // 2. Recompute mission_level for all real players (isNpc = 0) from their
  //    CURRENT owned-card count (includes goddesses — "cards at this moment").
  const players = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isNpc, 0));

  const ownedCounts = await db
    .select({ ownerId: ownership.ownerId, count: sql<number>`COUNT(*)::int`.as("count") })
    .from(ownership)
    .groupBy(ownership.ownerId);
  const countMap = new Map(ownedCounts.map((r) => [r.ownerId, Number(r.count)]));

  // Group players by their new mission level for batched updates + a summary.
  const byLevel = new Map<number, number[]>();
  for (const p of players) {
    const level = levelForCount(countMap.get(p.id) ?? 0);
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(p.id);
  }
  console.log(`  Recomputing mission_level for ${players.length} players:`);
  for (let lvl = 0; lvl <= MISSIONS.length; lvl++) {
    const n = byLevel.get(lvl)?.length ?? 0;
    if (n > 0) console.log(`    level ${lvl} (>= ${lvl > 0 ? MISSIONS[lvl - 1].threshold : 0} cards): ${n} players`);
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to perform these changes.\n");
    process.exit(0);
  }

  // Apply 1: release goddesses.
  if (goddessIds.length) {
    await db.delete(ownership).where(inArray(ownership.ownedId, goddessIds));
    console.log(`\n✅ Released ${held.length} goddess ownership row(s).`);
  }

  // Apply 2: set recomputed mission levels.
  for (const [level, ids] of byLevel) {
    if (ids.length) {
      await db.update(users).set({ missionLevel: level }).where(inArray(users.id, ids));
    }
  }
  console.log(`✅ Recomputed mission_level for ${players.length} players.`);

  // Apply 3: clear any active win countdown + grace window (nobody owns 6 now).
  for (const key of [
    "goddess_countdown_user_id",
    "goddess_countdown_start",
    "goddess_countdown_duration_snapshot",
    "goddess_countdown_grace_user_id",
    "goddess_countdown_grace_prev_start",
    "goddess_countdown_grace_prev_duration",
    "goddess_countdown_grace_expires_at",
  ]) {
    await zeroSetting(key);
  }
  console.log("✅ Cleared the goddess win countdown.\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
