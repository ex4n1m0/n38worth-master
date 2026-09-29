"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL, capPlayerValue } from "@/lib/safeguards";

const REVEAL_DURATION_MS = 10 * 60 * 60 * 1000; // 10 hours per card use (10 presses)
const MAX_REVEAL_MS = 12 * 60 * 60 * 1000; // 12-hour hard cap
const REVEAL_PRESSES = 10; // 10 reveal presses per player
const REVEAL_COST_MULTIPLIER = 10; // 10 × playerValue
const CREDITS_TO_PLAYER_RATIO = 0.90; // 90% of cost goes to player
const VALUE_MULTIPLIER = 1.10; // 10% value increase per press
const SERVICE_FEE = 1000; // 1,000¢ service fee

export async function massReveal() {
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
        avatarRevealUntil: ownership.avatarRevealUntil,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(eq(ownership.ownerId, ownerId));

    if (ownedRecords.length === 0) {
      return { error: "You don't own any buildings" };
    }

    // Sort by cheapest first (ascending playerValue)
    const sorted = [...ownedRecords].sort((a, b) => a.playerValue - b.playerValue);

    // Calculate per-player cost: 10 × playerValue
    const playersWithCost = sorted.map((p) => ({
      ...p,
      cost: Math.max(1, Math.round(REVEAL_COST_MULTIPLIER * p.playerValue)),
    }));

    const totalCost = SERVICE_FEE + playersWithCost.reduce((sum, p) => sum + p.cost, 0);

    // Check if owner can afford
    if (owner.credits < totalCost) {
      // Budget: pay for cheapest first until money runs out
      let remaining = owner.credits - SERVICE_FEE;
      if (remaining <= 0) {
        return { error: `Not enough capital. Need at least ${SERVICE_FEE}¢ service fee.` };
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
        return { error: `Not enough capital for the grand opening. Cheapest building needs ${playersWithCost[0].cost}¢.` };
      }

      // Execute partial reveal
      const totalSpent = SERVICE_FEE + processable.reduce((s, p) => s + p.cost, 0);
      const now = Date.now();

      await db
        .update(users)
        .set({
          credits: sql`credits - ${totalSpent}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ownerId));

      for (const p of processable) {
        await applyRevealToPlayer(p, now, owner.username);
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
        revealedCount: processable.length,
        totalCount: ownedRecords.length,
        totalSpent,
        partial: true,
      };
    }

    // Full reveal — can afford all
    const now = Date.now();

    await db
      .update(users)
      .set({
        credits: sql`credits - ${totalCost}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ownerId));

    for (const p of playersWithCost) {
      await applyRevealToPlayer(p, now, owner.username);
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
      revealedCount: ownedRecords.length,
      totalCount: ownedRecords.length,
      totalSpent: totalCost,
      partial: false,
    };
  } catch (error) {
    console.error("Mass reveal error:", error);
    return { error: "Mass reveal failed. Please try again." };
  }
}

/**
 * Apply 10 reveal presses to a single player:
 * - Deduct 10×playerValue from owner (already deducted globally)
 * - Credit 90% to player
 * - Bump value by 1.10^10 (compounded)
 * - Extend avatarRevealUntil by 10h (capped at 12h)
 */
async function applyRevealToPlayer(
  p: { ownedId: number; ownershipId: number; playerValue: number; avatarRevealUntil: Date | string | null },
  now: number,
  ownerUsername: string
) {
  const creditsToPlayer = Math.round(REVEAL_COST_MULTIPLIER * p.playerValue * CREDITS_TO_PLAYER_RATIO);

  // Compound value: value × 1.10^10
  const newValue = capPlayerValue(Math.round(p.playerValue * Math.pow(VALUE_MULTIPLIER, REVEAL_PRESSES)));

  // Credit the target player
  await db
    .update(users)
    .set({
      credits: sql`LEAST(credits + ${creditsToPlayer}, ${sql.raw(MAX_CREDITS_SQL)})`,
      playerValue: newValue,
      updatedAt: new Date(),
    })
    .where(eq(users.id, p.ownedId));

  // Extend avatar reveal by 10 hours (capped at 12h)
  const currentRevealEnd = p.avatarRevealUntil && new Date(p.avatarRevealUntil) > new Date()
    ? new Date(p.avatarRevealUntil).getTime()
    : now;

  const remainingRevealMs = Math.max(0, currentRevealEnd - now);
  let addMs = REVEAL_DURATION_MS;
  if (remainingRevealMs + addMs > MAX_REVEAL_MS) {
    addMs = Math.max(0, MAX_REVEAL_MS - remainingRevealMs);
  }

  if (addMs <= 0) return;

  const newRevealExpiry = new Date(currentRevealEnd + addMs);

  await db
    .update(ownership)
    .set({
      avatarRevealUntil: newRevealExpiry,
      lastBoostAt: new Date(now),
    })
    .where(eq(ownership.id, p.ownershipId));
}