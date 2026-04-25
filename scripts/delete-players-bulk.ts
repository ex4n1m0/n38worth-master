import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import {
  users,
  ownership,
  transactions,
  messages,
  gameHistory,
  rewardHistory,
  hallOfFame,
} from "../src/db/schema";
import { inArray, or, sql } from "drizzle-orm";

async function main() {
  const argNames = process.argv.slice(2);
  if (argNames.length === 0) {
    console.error("Usage: npx tsx scripts/delete-players-bulk.ts <username1> <username2> ...");
    process.exit(1);
  }

  // Case-insensitive match against provided usernames
  const lowered = argNames.map((n) => n.toLowerCase());
  const found = await db
    .select({
      id: users.id,
      username: users.username,
      isProtected: users.isProtected,
    })
    .from(users)
    .where(inArray(sql`lower(${users.username})`, lowered));

  const byLower = new Map(found.map((u) => [u.username.toLowerCase(), u]));
  const missing = lowered.filter((n) => !byLower.has(n));
  if (missing.length) {
    console.warn(`⚠️  Not found: ${missing.join(", ")}`);
  }

  const targets = found.filter((u) => u.isProtected === 0);
  const protectedOnes = found.filter((u) => u.isProtected === 1);
  if (protectedOnes.length) {
    console.warn(`⚠️  Skipping protected: ${protectedOnes.map((p) => p.username).join(", ")}`);
  }

  if (targets.length === 0) {
    console.log("Nothing to delete.");
    process.exit(0);
  }

  const ids = targets.map((t) => t.id);
  console.log(`Deleting ${targets.length} players: ${targets.map((t) => t.username).join(", ")}`);

  // neon-http driver doesn't support transactions; run sequentially.
  const tx = db;
  {
    // Release NPCs owned by these users back to ownerless + reset value
    const ownedNpcs = await tx
      .select({ ownedId: ownership.ownedId, isNpc: users.isNpc })
      .from(ownership)
      .innerJoin(users, sql`${users.id} = ${ownership.ownedId}`)
      .where(inArray(ownership.ownerId, ids));

    for (const r of ownedNpcs) {
      await tx
        .update(users)
        .set({
          playerValue: sql`value_floor`,
          updatedAt: new Date(),
          ...(r.isNpc === 1 ? { ownerlessAt: new Date() } : {}),
        })
        .where(sql`${users.id} = ${r.ownedId}`);
    }

    // Log history
    for (const t of targets) {
      await tx.insert(gameHistory).values({
        eventType: "player_deletion",
        actorId: null,
        targetId: t.id,
        targetUsername: t.username,
        details: JSON.stringify({ reason: "admin_bulk_deletion" }),
      });
    }

    // Delete dependents
    await tx.delete(ownership).where(
      or(inArray(ownership.ownerId, ids), inArray(ownership.ownedId, ids))
    );
    await tx.delete(transactions).where(
      or(inArray(transactions.buyerId, ids), inArray(transactions.targetId, ids))
    );
    await tx.delete(messages).where(
      or(inArray(messages.senderId, ids), inArray(messages.recipientId, ids))
    );
    await tx.delete(rewardHistory).where(inArray(rewardHistory.userId, ids));
    await tx.delete(hallOfFame).where(inArray(hallOfFame.userId, ids));

    await tx.delete(users).where(inArray(users.id, ids));
  }

  console.log(`✅ Deleted ${targets.length} players.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
