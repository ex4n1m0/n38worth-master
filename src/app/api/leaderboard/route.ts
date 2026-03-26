import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "value";

  try {
    const portfolioSql = sql<number>`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1)`;

    // Count total players for leaderboard prize calculations
    const [countResult] = await db
      .select({ totalPlayers: sql<number>`COUNT(*)` })
      .from(users);
    const totalPlayers = Number(countResult?.totalPlayers ?? 0);

    const playerTypeSql = sql<string>`CASE WHEN ${users.isNpc} = 1 THEN 'card' ELSE 'human' END`;

    if (type === "value") {
      const topPlayers = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          playerValue: users.playerValue,
          valueFloor: users.valueFloor,
          credits: users.credits,
          isActive: users.isActive,
          lastOnlineAt: users.lastOnlineAt,
          createdAt: users.createdAt,
          isVerified: users.isVerified,
          playerType: playerTypeSql,
          portfolioValue: portfolioSql.as("portfolio_value"),
          ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o5 WHERE o5.owned_id = "users"."id")`.as("owner_count"),
        })
        .from(users)
        .orderBy(desc(users.playerValue))
        .limit(50);

      const players = topPlayers.map((p) => ({
        ...p,
        estimatedDeletionAt: null,
      }));

      return NextResponse.json({ players, type, totalPlayers });
    }

    if (type === "portfolio") {
      const portfolioLeaders = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          playerValue: users.playerValue,
          valueFloor: users.valueFloor,
          credits: users.credits,
          isActive: users.isActive,
          lastOnlineAt: users.lastOnlineAt,
          createdAt: users.createdAt,
          isVerified: users.isVerified,
          playerType: playerTypeSql,
          portfolioValue:
            sql<number>`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1)`.as(
              "portfolio_value"
            ),
          ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o5 WHERE o5.owned_id = "users"."id")`.as("owner_count"),
        })
        .from(users)
        .orderBy(
          desc(
            sql`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1)`
          )
        )
        .limit(50);

      const players = portfolioLeaders.map((p) => ({
        ...p,
        estimatedDeletionAt: null,
      }));

      return NextResponse.json({ players, type, totalPlayers });
    }

    if (type === "owners") {
      const mostOwned = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          playerValue: users.playerValue,
          valueFloor: users.valueFloor,
          credits: users.credits,
          isActive: users.isActive,
          lastOnlineAt: users.lastOnlineAt,
          createdAt: users.createdAt,
          isVerified: users.isVerified,
          playerType: playerTypeSql,
          ownerCount: sql<number>`count(${ownership.id})`.as("owner_count"),
          portfolioValue: sql<number>`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value) FROM ownership o2 JOIN users u2 ON o2.owned_id = u2.id WHERE o2.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1)`.as("portfolio_value"),
        })
        .from(users)
        .leftJoin(ownership, eq(users.id, ownership.ownedId))
        .groupBy(users.id)
        .orderBy(desc(sql`count(${ownership.id})`))
        .limit(50);

      const players = mostOwned.map((p) => ({
        ...p,
        estimatedDeletionAt: null,
      }));

      return NextResponse.json({ players, type, totalPlayers });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    console.error("Leaderboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}