import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// Humans must have an avatar to be visible; NPCs always visible.
// Used inside `and(...)` — combine with isNpc=0 checks to form: human + has avatar.
const humanVisibleSql = sql`("users"."avatar_url" IS NOT NULL AND "users"."avatar_completed" = 1)`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "value";

  try {
    // Get current user session to determine their rank positions
    const session = await auth();
    const currentUsername = session?.user?.name;

    const portfolioSql = sql<number>`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value * (1 + (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id))) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1)`;
    const ownerNameSql = sql<string | null>`(SELECT u.username FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;

    // Count total players for leaderboard prize calculations (exclude NPCs)
    const [countResult] = await db
      .select({ totalPlayers: sql<number>`COUNT(*)` })
      .from(users)
      .where(and(eq(users.isNpc, 0), humanVisibleSql));
    const totalPlayers = Number(countResult?.totalPlayers ?? 0);

    // Get user's current rank positions in all categories
    let userPositions: Record<string, number> = {};
    if (currentUsername) {
      // Get user's data
      const [currentUser] = await db
        .select({
          id: users.id,
          username: users.username,
          playerValue: users.playerValue,
          credits: users.credits,
          createdAt: users.createdAt,
          portfolioValue: portfolioSql.as("portfolio_value"),
          ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`.as("owner_count"),
          ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`.as("owned_count"),
          ownerName: ownerNameSql,
        })
        .from(users)
        .where(eq(users.username, currentUsername));

      if (currentUser) {
        // Calculate positions in each category
        const ownedCount = Number(currentUser.ownedCount);
        const ageDays = Math.floor((Date.now() - new Date(currentUser.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        const credits = Number(currentUser.credits);
        const playerValue = Number(currentUser.playerValue);
        const portfolioValue = Number(currentUser.portfolioValue);

        // Empire position (owned players count)
        const [empirePosition] = await db
          .select({ position: sql<number>`COUNT(*) + 1` })
          .from(users)
          .where(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = users.id) > ${ownedCount} AND users.is_npc = 0 AND users.avatar_url IS NOT NULL AND users.avatar_completed = 1`);

        // Legacy position (account age)
        const [legacyPosition] = await db
          .select({ position: sql<number>`COUNT(*) + 1` })
          .from(users)
          .where(sql`users.created_at < ${currentUser.createdAt} AND users.is_npc = 0 AND users.avatar_url IS NOT NULL AND users.avatar_completed = 1`);

        // Credits position
        const [creditsPosition] = await db
          .select({ position: sql<number>`COUNT(*) + 1` })
          .from(users)
          .where(sql`users.credits > ${credits} AND users.is_npc = 0 AND users.avatar_url IS NOT NULL AND users.avatar_completed = 1`);

        // Value position
        const [valuePosition] = await db
          .select({ position: sql<number>`COUNT(*) + 1` })
          .from(users)
          .where(sql`users.player_value > ${playerValue} AND users.is_npc = 0 AND users.avatar_url IS NOT NULL AND users.avatar_completed = 1`);

        // Portfolio position
        const [portfolioPosition] = await db
          .select({ position: sql<number>`COUNT(*) + 1` })
          .from(users)
          .where(sql`(users.player_value + COALESCE((SELECT SUM(u2.player_value * (1 + (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id))) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = users.id), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = users.id), 1) > ${portfolioValue} AND users.is_npc = 0 AND users.avatar_url IS NOT NULL AND users.avatar_completed = 1`);

        userPositions = {
          empire: Number(empirePosition?.position ?? 1),
          legacy: Number(legacyPosition?.position ?? 1),
          credits: Number(creditsPosition?.position ?? 1),
          value: Number(valuePosition?.position ?? 1),
          portfolio: Number(portfolioPosition?.position ?? 1),
        };
      }
    }

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
          purchaseCount: users.purchaseCount,
          photoScore: users.photoScore,
          portfolioValue: portfolioSql.as("portfolio_value"),
          ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o5 WHERE o5.owned_id = "users"."id")`.as("owner_count"),
          ownerName: ownerNameSql,
        })
        .from(users)
        .where(and(eq(users.isNpc, 0), humanVisibleSql))
        .orderBy(desc(users.playerValue))
        .limit(50);

      const players = topPlayers.map((p) => ({
        ...p,
        estimatedDeletionAt: null,
        ownerName: p.ownerName,
      }));

      return NextResponse.json({ players, type, totalPlayers, userPositions });
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
          purchaseCount: users.purchaseCount,
          photoScore: users.photoScore,
          portfolioValue:
            sql<number>`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value * (1 + (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id))) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1)`.as(
              "portfolio_value"
            ),
          ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o5 WHERE o5.owned_id = "users"."id")`.as("owner_count"),
          ownerName: ownerNameSql,
        })
        .from(users)
        .where(and(eq(users.isNpc, 0), humanVisibleSql))
        .orderBy(
          desc(
            sql`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value * (1 + (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id))) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1)`
          )
        )
        .limit(50);

      const players = portfolioLeaders.map((p) => ({
        ...p,
        estimatedDeletionAt: null,
        ownerName: p.ownerName,
      }));

      return NextResponse.json({ players, type, totalPlayers, userPositions });
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
          purchaseCount: users.purchaseCount,
          photoScore: users.photoScore,
          ownerCount: sql<number>`count(${ownership.id})`.as("owner_count"),
          portfolioValue: sql<number>`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value * (1 + (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id))) FROM ownership o2 JOIN users u2 ON o2.owned_id = u2.id WHERE o2.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1)`.as("portfolio_value"),
          ownerName: ownerNameSql,
        })
        .from(users)
        .leftJoin(ownership, eq(users.id, ownership.ownedId))
        .where(and(eq(users.isNpc, 0), humanVisibleSql))
        .groupBy(users.id)
        .orderBy(desc(sql`count(${ownership.id})`))
        .limit(50);

      const players = mostOwned.map((p) => ({
        ...p,
        estimatedDeletionAt: null,
        ownerName: p.ownerName,
      }));

      return NextResponse.json({ players, type, totalPlayers, userPositions });
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