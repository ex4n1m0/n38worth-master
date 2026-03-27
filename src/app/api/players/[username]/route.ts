import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  try {
    // SQL subquery for portfolio value — reusable across queries
    const portfolioValueExpr = sql<number>`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value) FROM ownership o_pv JOIN users u2 ON o_pv.owned_id = u2.id WHERE o_pv.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o_oc WHERE o_oc.owned_id = "users"."id"), 1)`;

    const [player] = await db
      .select({
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
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`.as("owner_count"),
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`.as("owned_count"),
        portfolioValue: portfolioValueExpr.as("portfolio_value"),
      })
      .from(users)
      .where(eq(users.username, username));

    if (!player) {
      return NextResponse.json(
        { error: "Player not found" },
        { status: 404 }
      );
    }

    // Get owners (people who own this player) — all computed in a single query
    const owners = await db
      .select({
        ownershipId: ownership.id,
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        playerValue: users.playerValue,
        credits: users.credits,
        lastOnlineAt: users.lastOnlineAt,
        createdAt: users.createdAt,
        totalOnlineMinutes: users.totalOnlineMinutes,
        purchasePrice: ownership.purchasePrice,
        blockSellUntil: ownership.blockSellUntil,
        blockSellBy: ownership.blockSellBy,
        isVerified: users.isVerified,
        playerType: sql<string>`CASE WHEN "users"."is_npc" = 1 THEN 'card' ELSE 'human' END`,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o2 WHERE o2.owned_id = "users"."id")`.as("owner_count"),
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = "users"."id")`.as("owned_count"),
        portfolioValue: portfolioValueExpr.as("portfolio_value"),
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownerId, users.id))
      .where(eq(ownership.ownedId, player.id))
      .orderBy(desc(users.lastOnlineAt));

    const ownersWithMeta = owners.map((o) => ({
      ...o,
      ownerCount: Number(o.ownerCount),
      ownedCount: Number(o.ownedCount),
      portfolioValue: Math.round(Number(o.portfolioValue) * 100) / 100,
      estimatedDeletionAt: null,
    }));

    // Get owned players (players this person owns) — all computed in a single query
    const ownedPlayersRaw = await db
      .select({
        ownershipId: ownership.id,
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        playerValue: users.playerValue,
        credits: users.credits,
        purchasePrice: ownership.purchasePrice,
        lastOnlineAt: users.lastOnlineAt,
        createdAt: users.createdAt,
        totalOnlineMinutes: users.totalOnlineMinutes,
        blockSellUntil: ownership.blockSellUntil,
        blockSellBy: ownership.blockSellBy,
        isVerified: users.isVerified,
        playerType: sql<string>`CASE WHEN "users"."is_npc" = 1 THEN 'card' ELSE 'human' END`,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o2 WHERE o2.owned_id = "users"."id")`.as("owner_count"),
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = "users"."id")`.as("owned_count"),
        portfolioValue: portfolioValueExpr.as("portfolio_value"),
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(eq(ownership.ownerId, player.id))
      .orderBy(desc(users.lastOnlineAt));

    const ownedPlayers = ownedPlayersRaw.map((p) => ({
      ...p,
      ownerCount: Number(p.ownerCount),
      ownedCount: Number(p.ownedCount),
      portfolioValue: Math.round(Number(p.portfolioValue) * 100) / 100,
      estimatedDeletionAt: null,
    }));

    // Only NPC players without an owner get deletion countdown
    const playerOwnerCount = Number(player.ownerCount);
    const isNpcWithoutOwner = player.playerType === 'card' && playerOwnerCount === 0;
    let estimatedDeletionAt: Date | null = null;
    if (isNpcWithoutOwner && player.credits > 1 && player.lastOnlineAt) {
      const hoursUntilDeletion = Math.ceil(Math.log(player.credits) / (-Math.log(0.99)));
      estimatedDeletionAt = new Date(Date.now() + hoursUntilDeletion * 60 * 60 * 1000);
    } else if (isNpcWithoutOwner && player.credits <= 1) {
      estimatedDeletionAt = new Date();
    }

    return NextResponse.json({
      ...player,
      ownerCount: playerOwnerCount,
      ownedCount: Number(player.ownedCount),
      portfolioValue: Math.round(Number(player.portfolioValue) * 100) / 100,
      estimatedDeletionAt,
      owners: ownersWithMeta,
      ownedPlayers,
    });
  } catch (error) {
    console.error("Player API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch player" },
      { status: 500 }
    );
  }
}
