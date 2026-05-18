import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, gameHistory } from "@/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { purchasePlayer } from "@/actions/purchasePlayer";

const RESTORE_FEE = 1000;

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const buyerId = parseInt(session.user.id);

    // Get all lost players for this user (same logic as lost-players route)
    const lostEventsRaw = await db
      .select({ targetId: gameHistory.targetId })
      .from(gameHistory)
      .where(
        and(
          eq(gameHistory.eventType, "purchase"),
          sql`(${gameHistory.details}::jsonb->>'previousOwnerId')::int = ${buyerId}`
        )
      )
      .orderBy(sql`${gameHistory.createdAt} DESC`)
      .limit(2000);

    // Deduplicate
    const seenIds = new Set<number>();
    const dedupedIds: number[] = [];
    for (const row of lostEventsRaw) {
      if (row.targetId && !seenIds.has(row.targetId)) {
        seenIds.add(row.targetId);
        dedupedIds.push(row.targetId);
      }
    }

    if (dedupedIds.length === 0) {
      return NextResponse.json({ error: "No lost players to restore" }, { status: 400 });
    }

    // Build set of players the buyer already owns (exclude them)
    const viewerOwnership = await db
      .select({ ownedId: ownership.ownedId })
      .from(ownership)
      .where(eq(ownership.ownerId, buyerId));
    const viewerOwnedIds = new Set(viewerOwnership.map((o) => o.ownedId));

    // Fetch player data for all deduped IDs
    const playerRows = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        isNpc: users.isNpc,
        avatarUrl: users.avatarUrl,
        avatarCompleted: users.avatarCompleted,
      })
      .from(users)
      .where(inArray(users.id, dedupedIds));

    // Filter: exclude hidden humans, exclude already-owned, exclude self
    const eligible = playerRows.filter((p) => {
      if (p.id === buyerId) return false;
      const hidden = p.isNpc === 0 && (!p.avatarUrl || p.avatarCompleted !== 1);
      if (hidden) return false;
      if (viewerOwnedIds.has(p.id)) return false;
      return true;
    });

    if (eligible.length === 0) {
      return NextResponse.json({ error: "No eligible lost players to restore" }, { status: 400 });
    }

    // Get buyer's current credits
    const [buyer] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, buyerId));

    if (!buyer) {
      return NextResponse.json({ error: "Buyer not found" }, { status: 400 });
    }

    let remainingCredits = Number(buyer.credits);

    // Check if user can afford at least the fee
    if (remainingCredits < RESTORE_FEE) {
      return NextResponse.json(
        { error: `Insufficient credits. You need at least ₡${RESTORE_FEE} for the restore fee.` },
        { status: 400 }
      );
    }

    // Deduct the flat ₡1000 fee upfront
    remainingCredits -= RESTORE_FEE;
    await db
      .update(users)
      .set({ credits: sql`GREATEST(credits - ${RESTORE_FEE}, 0)` })
      .where(eq(users.id, buyerId));

    // Sort eligible players by playerValue (cheapest first)
    const sortedEligible = eligible.sort((a, b) => (a.playerValue ?? 0) - (b.playerValue ?? 0));

    // Purchase each player sequentially until we run out of credits
    let hired = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const player of sortedEligible) {
      const playerCost = player.playerValue ?? 0;

      // Stop if we can't afford this player
      if (remainingCredits < playerCost) {
        break;
      }

      const result = await purchasePlayer(player.id);
      if (result.error) {
        // Skip players that can't be purchased for non-cost reasons (already owned, etc.)
        // Continue to next player
        errors.push(`${player.username}: ${result.error}`);
        skipped++;
      } else {
        hired++;
        remainingCredits -= playerCost;
      }
    }

    return NextResponse.json({
      success: true,
      hiredCount: hired,
      skippedCount: skipped,
      fee: RESTORE_FEE,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Restore all API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
