"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { ownership, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { sellPlayer } from "@/actions/discardPlayer";

export async function discardAllPlayers() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const sellerId = parseInt(session.user.id);

  try {
    // Get all owned players with their current values
    const ownedRecords = await db
      .select({
        ownershipId: ownership.id,
        ownedId: ownership.ownedId,
        playerValue: users.playerValue,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(eq(ownership.ownerId, sellerId));

    if (ownedRecords.length === 0) {
      return { error: "You don't own any players" };
    }

    // Compute total cost: sum of all players' values (100% upfront)
    const totalCost = ownedRecords.reduce(
      (sum, r) => sum + (r.playerValue ?? 0),
      0
    );

    // Check seller can afford the upfront cost
    const [seller] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, sellerId));

    if (!seller || Number(seller.credits) < totalCost) {
      return { error: `Insufficient credits. You need ${totalCost}¢ to discard all players.` };
    }

    // Deduct 100% upfront from seller
    await db
      .update(users)
      .set({ credits: sql`GREATEST(credits - ${totalCost}, 0)` })
      .where(eq(users.id, sellerId));

    let discarded = 0;
    let skipped = 0;
    let totalCreditsEarned = 0;
    const errors: string[] = [];

    // Discard each player one by one using the existing sellPlayer logic
    for (const record of ownedRecords) {
      const result = await sellPlayer(record.ownedId);

      if (result.error) {
        errors.push(result.error);
        skipped++;
      } else {
        discarded++;
        totalCreditsEarned += result.sellPrice ?? 0;
      }
    }

    return {
      success: true,
      discardedCount: discarded,
      skippedCount: skipped,
      totalCreditsEarned,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error("Discard all error:", error);
    return { error: "Discard all failed. Please try again." };
  }
}
