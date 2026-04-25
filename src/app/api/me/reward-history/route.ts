import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { rewardHistory } from "@/db/schema";
import { eq, desc, lt, and } from "drizzle-orm";

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

    return NextResponse.json({ rewards: items, nextCursor });
  } catch (error) {
    console.error("Reward history fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch reward history" },
      { status: 500 }
    );
  }
}
