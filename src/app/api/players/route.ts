import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql, ilike, desc, asc, and } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const search = searchParams.get("search") || "";
  const sort = searchParams.get("sort") || "last-online";
  const hasOwner = searchParams.get("hasOwner") || "";
  const hasPlayers = searchParams.get("hasPlayers") || "";
  const playerType = searchParams.get("playerType") || "";
  const offset = (page - 1) * limit;

  try {
    // Build WHERE conditions
    const conditions = [];
    if (search) {
      conditions.push(ilike(users.username, `%${search}%`));
    }
    if (hasOwner === "true") {
      conditions.push(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id") > 0`);
    }
    if (hasPlayers === "true") {
      conditions.push(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id") > 0`);
    }
    if (playerType === "human") {
      conditions.push(eq(users.isNpc, 0));
    } else if (playerType === "card") {
      conditions.push(eq(users.isNpc, 1));
    }

    const whereClause = conditions.length > 0
      ? and(...conditions)
      : undefined;

    // SQL subqueries for counts and portfolio value (avoids N+1 queries)
    const ownerCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`;
    const ownedCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`;
    const portfolioExpr = sql<number>`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value) FROM ownership o2 JOIN users u2 ON o2.owned_id = u2.id WHERE o2.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o3 WHERE o3.owned_id = "users"."id"), 1)`;

    // Common select fields with computed columns
    const selectFields = {
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      playerValue: users.playerValue,
      valueFloor: users.valueFloor,
      credits: users.credits,
      blockSellUntil: users.blockSellUntil,
      estimatedDeletionAt: users.estimatedDeletionAt,
      isActive: users.isActive,
      createdAt: users.createdAt,
      totalOnlineMinutes: users.totalOnlineMinutes,
      lastOnlineAt: users.lastOnlineAt,
      isVerified: users.isVerified,
      playerType: sql<string>`CASE WHEN "users"."is_npc" = 1 THEN 'card' ELSE 'human' END`,
      photoAuthorName: users.photoAuthorName,
      photoAuthorUrl: users.photoAuthorUrl,
      photoSourceUrl: users.photoSourceUrl,
      ownerCount: ownerCountExpr.as("owner_count"),
      ownedCount: ownedCountExpr.as("owned_count"),
      portfolioValue: portfolioExpr.as("portfolio_value"),
    };

    let playersList;

    if (sort === "most-owned") {
      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      playersList = await filtered
        .orderBy(desc(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`), desc(users.playerValue))
        .limit(limit)
        .offset(offset);
    } else if (sort === "most-players") {
      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      playersList = await filtered
        .orderBy(desc(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`), desc(users.playerValue))
        .limit(limit)
        .offset(offset);
    } else if (sort === "online-cheapest") {
      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      playersList = await filtered
        .orderBy(desc(users.lastOnlineAt), asc(users.playerValue))
        .limit(limit)
        .offset(offset);
    } else {
      const orderBy =
        sort === "newest"
          ? desc(users.createdAt)
          : sort === "last-online"
            ? desc(users.lastOnlineAt)
            : sort === "name"
              ? asc(users.username)
              : sort === "cheapest"
                ? asc(users.playerValue)
                : sort === "credits"
                  ? desc(users.credits)
                  : desc(users.playerValue);

      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      playersList = await filtered.orderBy(orderBy).limit(limit).offset(offset);
    }

    // Map results — all computed fields already included, no extra queries needed
    const playersWithCounts = playersList.map((player) => ({
      ...player,
      ownerCount: Number(player.ownerCount),
      ownedCount: Number(player.ownedCount),
      portfolioValue: Math.round(Number(player.portfolioValue) * 100) / 100,
      estimatedDeletionAt: null,
    }));

    // Get total count with same filters (single query)
    const countBase = db.select({ count: sql<number>`count(*)` }).from(users);
    const countFiltered = whereClause ? countBase.where(whereClause) : countBase;
    const [{ count: total }] = await countFiltered;

    return NextResponse.json({
      players: playersWithCounts,
      total: Number(total),
      page,
      totalPages: Math.ceil(Number(total) / limit),
    });
  } catch (error) {
    console.error("Players API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch players" },
      { status: 500 }
    );
  }
}
