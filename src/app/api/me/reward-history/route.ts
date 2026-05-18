import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { rewardHistory } from "@/db/schema";
import { eq, desc, lt, and, sql, count } from "drizzle-orm";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    const [{ deletedCount }] = await db
      .select({ deletedCount: count() })
      .from(rewardHistory)
      .where(eq(rewardHistory.userId, userId));

    await db.delete(rewardHistory).where(eq(rewardHistory.userId, userId));

    return NextResponse.json({ success: true, deletedCount: Number(deletedCount) });
  } catch (error) {
    console.error("Reward history clear error:", error);
    return NextResponse.json(
      { error: "Failed to clear reward history" },
      { status: 500 }
    );
  }
}

const PAGE_SIZE = 50;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);
  const { searchParams } = new URL(req.url);
  const cursorParam = searchParams.get("cursor");

  try {
    const conditions = cursorParam
      ? and(
          eq(rewardHistory.userId, userId),
          lt(rewardHistory.id, parseInt(cursorParam))
        )
      : eq(rewardHistory.userId, userId);

    const rows = await db
      .select({
        id: rewardHistory.id,
        type: rewardHistory.type,
        amount: rewardHistory.amount,
        details: rewardHistory.details,
        createdAt: rewardHistory.createdAt,
      })
      .from(rewardHistory)
      .where(conditions)
      .orderBy(desc(rewardHistory.id))
      .limit(PAGE_SIZE + 1);

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // Only include aggregated totals by type on the FIRST page (no cursor)
    // so the SummaryBar accurately reflects ALL history, not just loaded slice.
    let totalsByType: Record<string, { count: number; total: number }> | undefined;
    if (!cursorParam) {
      const aggRows = await db
        .select({
          type: rewardHistory.type,
          count: sql<number>`COUNT(*)::int`,
          total: sql<number>`COALESCE(SUM(${rewardHistory.amount}), 0)`,
        })
        .from(rewardHistory)
        .where(eq(rewardHistory.userId, userId))
        .groupBy(rewardHistory.type);

      totalsByType = {};
      for (const r of aggRows) {
        totalsByType[r.type] = {
          count: Number(r.count),
          total: Number(r.total),
        };
      }
    }

    return NextResponse.json({ rewards: items, nextCursor, totalsByType });
  } catch (error) {
    console.error("Reward history fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch reward history" },
      { status: 500 }
    );
  }
}
