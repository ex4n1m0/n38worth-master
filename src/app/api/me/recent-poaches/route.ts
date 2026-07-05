import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { rewardHistory } from "@/db/schema";
import { eq, and, desc, gt } from "drizzle-orm";

/**
 * Lightweight feed of the current user's most recent "poach" events — i.e. the
 * `purchase_income` reward-history rows written when one of the player's owned
 * cards is hired away by someone else (see `purchaseCore`).
 *
 * Used by the client-side POACHED-effect polling fallback (`usePoachFallback`)
 * so the steal animation still fires even when Pusher is unconfigured or down.
 * Intentionally minimal (indexed query, no aggregation) so it is cheap to poll.
 *
 * Query param:
 *   sinceId — only return rows with id greater than this (default 0). Pass the
 *             last-seen id to fetch just the new poaches.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);
  const { searchParams } = new URL(req.url);
  const sinceId = parseInt(searchParams.get("sinceId") ?? "0") || 0;

  try {
    const rows = await db
      .select({
        id: rewardHistory.id,
        amount: rewardHistory.amount,
        details: rewardHistory.details,
        createdAt: rewardHistory.createdAt,
      })
      .from(rewardHistory)
      .where(
        and(
          eq(rewardHistory.userId, userId),
          eq(rewardHistory.type, "purchase_income"),
          gt(rewardHistory.id, sinceId)
        )
      )
      .orderBy(desc(rewardHistory.id))
      .limit(10);

    const poaches = rows.map((r) => {
      let buyer = "Someone";
      let player = "your card";
      if (r.details) {
        try {
          const d = JSON.parse(r.details) as {
            buyerUsername?: string;
            playerUsername?: string;
          };
          if (d.buyerUsername) buyer = d.buyerUsername;
          if (d.playerUsername) player = d.playerUsername;
        } catch {
          // Ignore malformed details — fall back to defaults.
        }
      }
      return {
        id: r.id,
        amount: Number(r.amount),
        buyer,
        player,
        createdAt: r.createdAt,
      };
    });

    return NextResponse.json({ poaches });
  } catch (error) {
    console.error("Recent poaches fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recent poaches" },
      { status: 500 }
    );
  }
}
