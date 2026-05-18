/**
 * Diagnose the state of the most recent game reset.
 *
 * Read-only. Prints:
 *   - Latest hall_of_fame entry (recorded winner)
 *   - Table counts (ownership, transactions, messages, avatar_reveals,
 *     reward_history, users, non-goddess NPCs)
 *   - Sample human rows (credits / playerValue / valueFloor / wasReset)
 *   - Goddess rows (playerValue / valueFloor / credits / isProtected)
 *   - Latest `game_won` and `npc_mass_deletion` game_history events
 *   - Countdown state + last-processed-start marker
 *
 * Run: npx tsx scripts/diagnose-reset.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../src/db";
import {
  users,
  ownership,
  transactions,
  messages,
  avatarReveals,
  rewardHistory,
  hallOfFame,
  gameHistory,
} from "../src/db/schema";
import { sql, eq, and, desc, inArray } from "drizzle-orm";
import { GODDESS_USERNAMES } from "../src/lib/goddesses";
import {
  getCountdownState,
  getLastProcessedCountdownStart,
} from "../src/lib/goddess-countdown";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countAll(name: string, table: any) {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(table);
  return { name, count: Number(row.count) };
}

async function main() {
  console.log("=== Game Reset Diagnostic ===\n");

  // 1. Latest hall_of_fame entry
  const [latestWin] = await db
    .select()
    .from(hallOfFame)
    .orderBy(desc(hallOfFame.wonAt))
    .limit(1);

  if (latestWin) {
    console.log("Latest hall_of_fame entry:");
    console.log(`  userId=${latestWin.userId}  username=${latestWin.username}  wonAt=${latestWin.wonAt.toISOString()}`);
  } else {
    console.log("No hall_of_fame rows found.");
  }
  console.log();

  // 2. Table counts
  const counts = await Promise.all([
    countAll("users", users),
    countAll("ownership", ownership),
    countAll("transactions", transactions),
    countAll("messages", messages),
    countAll("avatar_reveals", avatarReveals),
    countAll("reward_history", rewardHistory),
  ]);

  const [nonGoddessNpcRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.isNpc, 1), eq(users.isProtected, 0)));

  const [humanRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.isNpc, 0));

  console.log("Table counts:");
  for (const c of counts) console.log(`  ${c.name.padEnd(18)} ${c.count}`);
  console.log(`  ${"(npcs non-goddess)".padEnd(18)} ${Number(nonGoddessNpcRow.count)}`);
  console.log(`  ${"(humans)".padEnd(18)} ${Number(humanRow.count)}`);
  console.log();

  // 3. Sample humans
  const sampleHumans = await db
    .select({
      id: users.id,
      username: users.username,
      credits: users.credits,
      playerValue: users.playerValue,
      valueFloor: users.valueFloor,
      wasReset: users.wasReset,
      lastRankBonusAt: users.lastRankBonusAt,
    })
    .from(users)
    .where(eq(users.isNpc, 0))
    .orderBy(desc(users.credits))
    .limit(6);
  console.log("Top humans by credits:");
  console.table(sampleHumans);

  // 4. Goddess rows
  const goddessRows = await db
    .select({
      id: users.id,
      username: users.username,
      playerValue: users.playerValue,
      valueFloor: users.valueFloor,
      credits: users.credits,
      isProtected: users.isProtected,
      isNpc: users.isNpc,
    })
    .from(users)
    .where(inArray(users.username, GODDESS_USERNAMES));
  console.log("\nGoddess rows:");
  console.table(goddessRows);

  // 5. Latest game_history for reset events
  const resetHistory = await db
    .select({
      id: gameHistory.id,
      eventType: gameHistory.eventType,
      actorId: gameHistory.actorId,
      targetUsername: gameHistory.targetUsername,
      createdAt: gameHistory.createdAt,
      details: gameHistory.details,
    })
    .from(gameHistory)
    .where(inArray(gameHistory.eventType, ["game_won", "npc_mass_deletion"]))
    .orderBy(desc(gameHistory.createdAt))
    .limit(6);
  console.log("\nRecent reset-related game_history:");
  for (const h of resetHistory) {
    const details =
      h.details && h.details.length > 120 ? h.details.slice(0, 117) + "..." : h.details;
    console.log(
      `  [${h.createdAt.toISOString()}] ${h.eventType.padEnd(18)} actor=${h.actorId} target=${h.targetUsername ?? "-"}  ${details ?? ""}`
    );
  }

  // 6. Countdown state
  const state = await getCountdownState();
  const lastProcessed = await getLastProcessedCountdownStart();
  console.log("\nCountdown state:");
  console.log(`  active=${state.active}  userId=${state.userId}  startedAt=${state.startedAt}  remainingSeconds=${state.remainingSeconds}`);
  console.log(`  lastProcessedCountdownStart=${lastProcessed}`);

  // 7. Summary heuristic
  console.log("\n=== Heuristic Summary ===");
  const ownershipCount = counts.find((c) => c.name === "ownership")!.count;
  const avatarRevealCount = counts.find((c) => c.name === "avatar_reveals")!.count;
  const npcRemaining = Number(nonGoddessNpcRow.count);

  const goddessValuesCorrect = goddessRows.every((g) => {
    const expected: Record<string, number> = {
      "Goddess of Wealth": 100_000,
      "Goddess of Knowledge": 1_000_000,
      "Goddess of Fate": 10_000_000,
      "Goddess of Time": 100_000_000,
      "Goddess of War": 1_000_000_000,
      "Goddess": 10_000_000_000,
    };
    return Number(g.playerValue) === expected[g.username];
  });

  const [humansAtFloorRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(sql`is_npc = 0 AND credits = 100 AND player_value = 1 AND value_floor = 1`);
  const humansAtFloor = Number(humansAtFloorRow.count);
  const totalHumans = Number(humanRow.count);

  console.log(`  ownership cleared:            ${ownershipCount === 0 ? "YES" : `NO (${ownershipCount})`}`);
  console.log(`  avatar_reveals cleared:       ${avatarRevealCount === 0 ? "YES" : `NO (${avatarRevealCount})`}`);
  console.log(`  non-goddess NPCs deleted:     ${npcRemaining === 0 ? "YES" : `NO (${npcRemaining} left)`}`);
  console.log(`  humans at initial state:      ${humansAtFloor}/${totalHumans}`);
  console.log(`  goddesses restored:           ${goddessValuesCorrect ? "YES" : "NO"}`);
  console.log(`  countdown cleared:            ${state.userId === 0 && state.startedAt === 0 ? "YES" : "NO"}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Diagnostic error:", err);
  process.exit(1);
});
