"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { ownership } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sellPlayer } from "@/actions/discardPlayer";

export async function discardAllPlayers() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const sellerId = parseInt(session.user.id);

  try {
    // Get all owned players
    const ownedRecords = await db
      .select({
        ownershipId: ownership.id,
        ownedId: ownership.ownedId,
        blockSellUntil: ownership.blockSellUntil,
      })
      .from(ownership)
      .where(eq(ownership.ownerId, sellerId));

    if (ownedRecords.length === 0) {
      return { error: "You don't own any players" };
    }

    let discarded = 0;
    let skipped = 0;
    let totalCreditsEarned = 0;
    const errors: string[] = [];

    // Discard each player one by one using the existing sellPlayer logic
    for (const record of ownedRecords) {
      // Skip blocked players
      if (record.blockSellUntil && new Date(record.blockSellUntil) > new Date()) {
        skipped++;
        continue;
      }

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
