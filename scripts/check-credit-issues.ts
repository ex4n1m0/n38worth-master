import { db } from "../src/db";
import { users, transactions, ownership, gameHistory } from "../src/db/schema";
import { sql, eq, desc, and, gte, lte, isNull, not } from "drizzle-orm";

async function checkCreditIssues() {
  console.log("=== Checking for Credit Issues ===\n");

  // 1. Check for users with very low or negative credits
  console.log("1. Users with very low credits (< 0):");
  const lowCreditUsers = await db
    .select({
      id: users.id,
      username: users.username,
      credits: users.credits,
      playerValue: users.playerValue,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(lte(users.credits, 0))
    .orderBy(users.credits);

  if (lowCreditUsers.length === 0) {
    console.log("   ✓ No users with negative or zero credits found\n");
  } else {
    console.log(`   Found ${lowCreditUsers.length} users with credits <= 0:`);
    lowCreditUsers.forEach((user) => {
      console.log(`   - ${user.username} (ID: ${user.id}): ${user.credits} credits, value: ${user.playerValue}`);
    });
    console.log();
  }

  // 2. Check for recent transactions (last 24 hours)
  console.log("2. Recent transactions (last 24 hours):");
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentTransactions = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      buyerId: transactions.buyerId,
      targetId: transactions.targetId,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .orderBy(desc(transactions.createdAt))
    .limit(20);

  console.log(`   Found ${recentTransactions.length} transactions in last 24 hours:`);
  recentTransactions.forEach((tx) => {
    console.log(`   - TX #${tx.id}: ${tx.type} ${tx.amount} credits (buyer: ${tx.buyerId}, target: ${tx.targetId}) at ${tx.createdAt}`);
  });
  console.log();

  // 3. Check for high-value transactions (>= 1 billion)
  console.log("3. High-value transactions (>= 1,000,000,000 credits):");
  const highValueTxns = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      buyerId: transactions.buyerId,
      targetId: transactions.targetId,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(gte(transactions.amount, 1000000000))
    .orderBy(desc(transactions.amount))
    .limit(10);

  if (highValueTxns.length === 0) {
    console.log("   ✓ No transactions with value >= 1 billion found\n");
  } else {
    console.log(`   Found ${highValueTxns.length} high-value transactions:`);
    highValueTxns.forEach((tx) => {
      console.log(`   - TX #${tx.id}: ${tx.type} ${tx.amount.toLocaleString()} credits (buyer: ${tx.buyerId}, target: ${tx.targetId}) at ${tx.createdAt}`);
    });
    console.log();
  }

  // 4. Check for players with very high values (>= 1 billion)
  console.log("4. Players with very high values (>= 1,000,000,000):");
  const highValuePlayers = await db
    .select({
      id: users.id,
      username: users.username,
      playerValue: users.playerValue,
      credits: users.credits,
    })
    .from(users)
    .where(gte(users.playerValue, 1000000000))
    .orderBy(desc(users.playerValue))
    .limit(10);

  if (highValuePlayers.length === 0) {
    console.log("   ✓ No players with value >= 1 billion found\n");
  } else {
    console.log(`   Found ${highValuePlayers.length} players with value >= 1 billion:`);
    highValuePlayers.forEach((player) => {
      console.log(`   - ${player.username} (ID: ${player.id}): value ${player.playerValue.toLocaleString()}, credits ${player.credits.toLocaleString()}`);
    });
    console.log();
  }

  // 5. Check game history for failed purchases
  console.log("5. Recent game history events:");
  const recentHistory = await db
    .select({
      id: gameHistory.id,
      eventType: gameHistory.eventType,
      actorId: gameHistory.actorId,
      targetId: gameHistory.targetId,
      targetUsername: gameHistory.targetUsername,
      details: gameHistory.details,
      createdAt: gameHistory.createdAt,
    })
    .from(gameHistory)
    .where(eq(gameHistory.eventType, "purchase"))
    .orderBy(desc(gameHistory.createdAt))
    .limit(20);

  console.log(`   Found ${recentHistory.length} purchase events:`);
  recentHistory.forEach((event) => {
    console.log(`   - Event #${event.id}: ${event.eventType} by ${event.actorId} on ${event.targetUsername} at ${event.createdAt}`);
    if (event.details) {
      try {
        const details = JSON.parse(event.details);
        console.log(`     Details: ${JSON.stringify(details)}`);
      } catch (e) {
        console.log(`     Details: ${event.details}`);
      }
    }
  });
  console.log();

  // 6. Check for orphaned ownership records
  console.log("6. Checking for orphaned ownership records:");
  const orphanedOwnerships = await db
    .select({
      ownershipId: ownership.id,
      ownerId: ownership.ownerId,
      ownedId: ownership.ownedId,
    })
    .from(ownership)
    .leftJoin(users, eq(ownership.ownerId, users.id))
    .where(isNull(users.id))
    .limit(10);

  if (orphanedOwnerships.length === 0) {
    console.log("   ✓ No orphaned ownership records found\n");
  } else {
    console.log(`   Found ${orphanedOwnerships.length} orphaned ownership records:`);
    orphanedOwnerships.forEach((record) => {
      console.log(`   - Ownership #${record.ownershipId}: owner ${record.ownerId} owns ${record.ownedId}`);
    });
    console.log();
  }

  // 7. Summary statistics
  console.log("7. Database Summary Statistics:");
  const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(users);
  const totalTransactions = await db.select({ count: sql<number>`count(*)` }).from(transactions);
  const totalOwnerships = await db.select({ count: sql<number>`count(*)` }).from(ownership);
  
  console.log(`   Total users: ${totalUsers[0].count}`);
  console.log(`   Total transactions: ${totalTransactions[0].count}`);
  console.log(`   Total ownerships: ${totalOwnerships[0].count}`);
  console.log();

  console.log("=== Check Complete ===");
}

checkCreditIssues().catch(console.error);