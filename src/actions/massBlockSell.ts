"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, count } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL, capPlayerValue } from "@/lib/safeguards";

const BLOCK_SELL_DURATION_MS = 10 * 60 * 60 * 1000; // 10 hours per card use
const MAX_BLOCK_MS = 12 * 60 * 60 * 1000; // 12-hour hard cap
const BLOCK_PRESSES = 10; // 10 block presses per player
const VALUE_MULTIPLIER = 1.10; // 10% value increase per press
const CREDITS_TO_PLAYER_RATIO = 0.90; // 90% of cost goes to player
const SERVICE_FEE = 1000; // 1,000¢ service fee

export async function massBlockSell() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const ownerId = parseInt(session.user.id);

  try {
    // Get owner info
    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, ownerId));

    if (!owner) {
      return { error: "Owner not found" };
    }

    // Get all ownership records where user is the owner, joined with user data for values
    const ownedRecords = await db
      .select({
        ownershipId: ownership.id,
        ownedId: ownership.ownedId,
        playerValue: users.playerValue,
        playerUsername: users.username,
        blockSellUntil: ownership.blockSellUntil,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(eq(ownership.ownerId, ownerId));

    if (ownedRecords.length === 0) {
      return { error: "You don't own any players" };
    }

    // Calculate total cost: service fee + 10x value per player
    // Each player: cost = 10 * playerValue (10 hours of block)
    let totalCost = SERVICE_FEE;

    // Sort by cheapest first (ascending playerValue)
    const sorted = [...ownedRecords].sort((a, b) => a.playerValue - b.playerValue);

    // Calculate per-player cost & total
    const playersWithCost = sorted.map((p) => ({
      ...p,
      cost: Math.max(1, Math.round(10 * p.playerValue)),
    }));

    totalCost += playersWithCost.reduce((sum, p) => sum + p.cost, 0);

    // Check if owner can afford
    if (owner.credits < totalCost) {
      // Can't afford all — find budget: pay for cheapest first until money runs out
      let remaining = owner.credits - SERVICE_FEE;
      if (remaining <= 0) {
        return { error: `Not enough credits. Need at least ${SERVICE_FEE}¢ service fee.` };
      }

      const processable: typeof playersWithCost = [];
      for (const p of playersWithCost) {
        if (p.cost <= remaining) {
          processable.push(p);
          remaining -= p.cost;
        } else {
          break;
        }
      }

      if (processable.length === 0) {
        return { error: `Not enough credits to block any players. Cheapest player needs ${playersWithCost[0].cost}¢.` };
      }

      // Execute partial block
      const totalSpent = SERVICE_FEE + processable.reduce((s, p) => s + p.cost, 0);
      const now = Date.now();

      // Deduct from owner
      await db
        .update(users)
        .set({
          credits: sql`credits - ${totalSpent}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ownerId));

      // Process each player
      for (const p of processable) {
        const currentBlockEnd = p.blockSellUntil && new Date(p.blockSellUntil) > new Date()
          ? new Date(p.blockSellUntil).getTime()
          : now;

        const remainingBlockMs = Math.max(0, currentBlockEnd - now);
        let addMs = BLOCK_SELL_DURATION_MS;
        if (remainingBlockMs + addMs > MAX_BLOCK_MS) {
          addMs = Math.max(0, MAX_BLOCK_MS - remainingBlockMs);
        }

        if (addMs <= 0) continue;

        const newExpiresAt = new Date(currentBlockEnd + addMs);

        await db
          .update(ownership)
          .set({
            blockSellUntil: newExpiresAt,
            blockSellBy: owner.username,
          })
          .where(eq(ownership.id, p.ownershipId));

        // Pay the owned player + bump value (compound 10 presses)
        const creditsToPlayer = Math.round(p.cost * CREDITS_TO_PLAYER_RATIO);
        const newValue = capPlayerValue(Math.round(p.playerValue * Math.pow(VALUE_MULTIPLIER, BLOCK_PRESSES)));
        await db
          .update(users)
          .set({
            credits: sql`LEAST(credits + ${creditsToPlayer}, ${sql.raw(MAX_CREDITS_SQL)})`,
            playerValue: newValue,
          })
          .where(eq(users.id, p.ownedId));
      }

      try {
        await pusher.trigger(`player-${ownerId}`, "credits-updated", {
          newCredits: owner.credits - totalSpent,
        });
      } catch (e) {
        // Pusher errors are non-critical
      }

      return {
        success: true,
        blockedCount: processable.length,
        totalCount: ownedRecords.length,
        totalSpent,
        partial: true,
      };
    }

    // Full block — can afford all
    const now = Date.now();

    // Deduct from owner
    await db
      .update(users)
      .set({
        credits: sql`credits - ${totalCost}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ownerId));

    // Process each player (cheapest first)
    for (const p of playersWithCost) {
      const currentBlockEnd = p.blockSellUntil && new Date(p.blockSellUntil) > new Date()
        ? new Date(p.blockSellUntil).getTime()
        : now;

      const remainingBlockMs = Math.max(0, currentBlockEnd - now);
      let addMs = BLOCK_SELL_DURATION_MS;
      if (remainingBlockMs + addMs > MAX_BLOCK_MS) {
        addMs = Math.max(0, MAX_BLOCK_MS - remainingBlockMs);
      }

      if (addMs <= 0) continue;

      const newExpiresAt = new Date(currentBlockEnd + addMs);

      await db
        .update(ownership)
        .set({
          blockSellUntil: newExpiresAt,
          blockSellBy: owner.username,
        })
        .where(eq(ownership.id, p.ownershipId));

      // Pay the owned player + bump value (compound 10 presses)
      const creditsToPlayer = Math.round(p.cost * CREDITS_TO_PLAYER_RATIO);
      const newValue = capPlayerValue(Math.round(p.playerValue * Math.pow(VALUE_MULTIPLIER, BLOCK_PRESSES)));
      await db
        .update(users)
        .set({
          credits: sql`LEAST(credits + ${creditsToPlayer}, ${sql.raw(MAX_CREDITS_SQL)})`,
          playerValue: newValue,
        })
        .where(eq(users.id, p.ownedId));
    }

    try {
      await pusher.trigger(`player-${ownerId}`, "credits-updated", {
        newCredits: owner.credits - totalCost,
      });
    } catch (e) {
      // Pusher errors are non-critical
    }

    return {
      success: true,
      blockedCount: ownedRecords.length,
      totalCount: ownedRecords.length,
      totalSpent: totalCost,
      partial: false,
    };
  } catch (error) {
    console.error("Mass block sell error:", error);
    return { error: "Mass block sell failed. Please try again." };
  }
}