/**
 * Finish a stalled game reset.
 *
 * The deployed `triggerGameReset.ts` aborted mid-sequence (avatar_reveals FK
 * blocker) — ownership/transactions/messages were wiped, but NPCs, humans and
 * goddesses were not reset. This script performs ONLY the missing steps, in
 * the same order as the fixed action, and is idempotent (re-running on an
 * already-reset world is a no-op).
 *
 * Winner is read from the latest `hall_of_fame` row by default.
 * Pass `--winner-id=<n>` to override.
 *
 * Run: npx tsx scripts/finish-stalled-reset.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "../src/db";
import {
  users,
  rewardHistory,
  avatarReveals,
  hallOfFame,
  gameHistory,
} from "../src/db/schema";
import { sql, eq, and, desc, notInArray } from "drizzle-orm";
import { GODDESS_USERNAMES, GODDESS_VALUES } from "../src/lib/goddesses";

function parseWinnerIdFlag(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--winner-id="));
  if (!arg) return null;
  const n = Number(arg.split("=")[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function step(label: string, fn: () => Promise<void>) {
  process.stdout.write(`→ ${label} ... `);
  try {
    await fn();
    console.log("OK");
  } catch (err) {
    console.log("FAILED");
    console.error(`  error:`, err);
    throw err;
  }
}

async function main() {
  console.log("=== Finish Stalled Game Reset ===\n");

  // Resolve the winner id.
  let winnerId = parseWinnerIdFlag();
  let winnerUsername: string | null = null;

  if (winnerId) {
    const [row] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, winnerId));
    if (!row) throw new Error(`User ${winnerId} not found`);
    winnerUsername = row.username;
  } else {
    const [latest] = await db
      .select({ userId: hallOfFame.userId, username: hallOfFame.username, wonAt: hallOfFame.wonAt })
      .from(hallOfFame)
      .orderBy(desc(hallOfFame.wonAt))
      .limit(1);
    if (!latest) throw new Error("No hall_of_fame rows — nothing to finish");
    winnerId = latest.userId;
    winnerUsername = latest.username;
    console.log(
      `Winner from hall_of_fame: ${winnerUsername} (id=${winnerId}, wonAt=${latest.wonAt.toISOString()})`
    );
  }

  if (!winnerId || !winnerUsername) throw new Error("Failed to resolve winner");
  console.log();

  // 1. Delete all avatar_reveals (FK blocker + meaningless post-reset).
  await step("delete avatar_reveals", async () => {
    await db.delete(avatarReveals);
  });

  // 2. Hard-delete all non-goddess NPCs (+ their reward_history).
  const nonGoddessNpcs = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(and(eq(users.isNpc, 1), eq(users.isProtected, 0)));

  console.log(`  found ${nonGoddessNpcs.length} non-goddess NPCs`);

  if (nonGoddessNpcs.length > 0) {
    const npcIds = nonGoddessNpcs.map((n) => n.id);

    await step("delete reward_history for NPCs", async () => {
      await db
        .delete(rewardHistory)
        .where(sql`${rewardHistory.userId} IN (${sql.join(npcIds, sql`, `)})`);
    });

    await step(`hard-delete ${nonGoddessNpcs.length} NPC users`, async () => {
      await db.delete(users).where(sql`${users.id} IN (${sql.join(npcIds, sql`, `)})`);
    });

    await step("insert npc_mass_deletion audit row", async () => {
      await db.insert(gameHistory).values({
        eventType: "npc_mass_deletion",
        actorId: winnerId!,
        targetId: null,
        targetUsername: null,
        details: JSON.stringify({
          reason: "game_win_reset_finisher",
          winnerId,
          winnerUsername,
          deletedCount: nonGoddessNpcs.length,
          deletedUsernames: nonGoddessNpcs.map((n) => n.username),
          note: "Completed via scripts/finish-stalled-reset.ts after avatar_reveals FK aborted the cron reset",
        }),
      });
    });
  }

  // 3. Delete reward_history for all non-goddess players (humans).
  await step("delete reward_history for non-goddess users", async () => {
    await db
      .delete(rewardHistory)
      .where(
        sql`${rewardHistory.userId} IN (SELECT id FROM users WHERE username != ALL(ARRAY[${sql.join(
          GODDESS_USERNAMES.map((u) => sql`${u}`),
          sql`, `
        )}]))`
      );
  });

  // 4. Reset all humans to initial state.
  const resetNow = new Date();
  await step("reset all non-goddess users to initial state", async () => {
    await db
      .update(users)
      .set({
        credits: 100,
        playerValue: 1,
        valueFloor: 1,
        wasReset: 2,
        blockSellUntil: null,
        blockSellBy: null,
        estimatedDeletionAt: null,
        ownerlessAt: null,
        lastOwnershipDecayAt: null,
        lastRankBonusAt: null,
        lastLoginRewardAt: null,
        lastDividendAt: resetNow,
        hireSlots: 20,
        purchaseCount: 0,
        updatedAt: resetNow,
      })
      .where(notInArray(users.username, GODDESS_USERNAMES));
  });

  // 5. Winner does not get the "world reset" toast (they already got the win toast).
  await step("clear winner.wasReset", async () => {
    await db.update(users).set({ wasReset: 0 }).where(eq(users.id, winnerId!));
  });

  // 6. Restore goddesses to their original values.
  for (const [username, originalValue] of Object.entries(GODDESS_VALUES)) {
    await step(`restore goddess '${username}' to ${originalValue}`, async () => {
      await db
        .update(users)
        .set({
          playerValue: originalValue,
          valueFloor: originalValue,
          credits: 100,
          blockSellUntil: null,
          blockSellBy: null,
          estimatedDeletionAt: null,
          ownerlessAt: null,
          isProtected: 1,
          purchaseCount: 0,
          updatedAt: new Date(),
        })
        .where(eq(users.username, username));
    });
  }

  // 7. Try to fire the game-won pusher broadcast so live clients refresh.
  //    Uses pusher-server if PUSHER_APP_ID is configured; otherwise skipped.
  if (process.env.PUSHER_APP_ID) {
    await step("broadcast game-won on game-global", async () => {
      const { pusher } = await import("../src/lib/pusher-server");
      await pusher.trigger("game-global", "game-won", {
        winnerUsername,
        winnerId,
        message: `🏆 ${winnerUsername} has collected all 6 Goddesses and WON THE GAME! The world has been reset!`,
      });
    });
  } else {
    console.log("→ broadcast game-won ... SKIPPED (PUSHER_APP_ID not set locally)");
  }

  console.log("\n✓ Finished stalled reset.");
  console.log("  Run `npx tsx scripts/diagnose-reset.ts` to confirm.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
