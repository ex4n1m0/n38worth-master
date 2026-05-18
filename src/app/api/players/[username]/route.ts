import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// Visibility: NPCs always visible; humans must have avatar uploaded.
const visibleSql = sql`("users"."is_npc" = 1 OR ("users"."avatar_url" IS NOT NULL AND "users"."avatar_completed" = 1))`;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  // When ?lite=1 is passed, the owners/ownedPlayers lists are returned without
  // avatar_url (base64 data URIs are stored inline on users and can total
  // tens of MB for a single user, breaking both the Neon HTTP 10 MB response
  // cap and Vercel's ~4.5 MB function payload cap).
  const lite = new URL(req.url).searchParams.get("lite") === "1";

  try {
    // SQL subquery for portfolio value — reusable across queries
    // Count ALL owned players, multiply each by (1 + number of players they own)
    const portfolioValueExpr = sql<number>`LEAST(("users"."player_value"::numeric + COALESCE((SELECT SUM(u2.player_value::numeric * (1 + (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id))) FROM ownership o_pv JOIN users u2 ON o_pv.owned_id = u2.id WHERE o_pv.owner_id = "users"."id"), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o_oc WHERE o_oc.owned_id = "users"."id"), 1), 9007199254740991)`;

    const [player] = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        avatarCompleted: users.avatarCompleted,
        isNpc: users.isNpc,
        playerValue: users.playerValue,
        valueFloor: users.valueFloor,
        credits: users.credits,
        estimatedDeletionAt: users.estimatedDeletionAt,
        isActive: users.isActive,
        createdAt: users.createdAt,
        totalOnlineMinutes: users.totalOnlineMinutes,
        lastOnlineAt: users.lastOnlineAt,
        isVerified: users.isVerified,
        playerType: sql<string>`CASE WHEN "users"."is_npc" = 1 THEN 'card' ELSE 'human' END`,
        purchaseCount: users.purchaseCount,
        bio: users.bio,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`.as("owner_count"),
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`.as("owned_count"),
        portfolioValue: portfolioValueExpr.as("portfolio_value"),
        blockSellUntil: sql<string | null>`(SELECT to_char(o.block_sell_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM ownership o WHERE o.owned_id = "users"."id" AND o.block_sell_until > NOW() ORDER BY o.block_sell_until DESC LIMIT 1)`.as("block_sell_until"),
      })
      .from(users)
      .where(eq(users.username, username));

    if (!player) {
      return NextResponse.json(
        { error: "Player not found" },
        { status: 404 }
      );
    }

    // Hide players without avatars unless the viewer is that player themselves.
    const session = await auth();
    const viewerId = session?.user?.id ? Number(session.user.id) : null;
    const isHidden =
      player.isNpc === 0 && (!player.avatarUrl || player.avatarCompleted !== 1);
    if (isHidden && viewerId !== player.id) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // avatarUrl is NULL in lite mode to keep response under Neon HTTP 10 MB cap.
    const avatarUrlSel = lite
      ? sql<string | null>`NULL`.as("avatar_url")
      : users.avatarUrl;

    // Get owners (people who own this player) — all computed in a single query
    const owners = await db
      .select({
        ownershipId: ownership.id,
        id: users.id,
        username: users.username,
        avatarUrl: avatarUrlSel,
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
        purchaseCount: users.purchaseCount,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o2 WHERE o2.owned_id = "users"."id")`.as("owner_count"),
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = "users"."id")`.as("owned_count"),
        portfolioValue: portfolioValueExpr.as("portfolio_value"),
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownerId, users.id))
      .where(and(eq(ownership.ownedId, player.id), visibleSql))
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
        avatarUrl: avatarUrlSel,
        playerValue: users.playerValue,
        credits: users.credits,
        purchasePrice: ownership.purchasePrice,
        lastOnlineAt: users.lastOnlineAt,
        createdAt: users.createdAt,
        totalOnlineMinutes: users.totalOnlineMinutes,
        blockSellUntil: ownership.blockSellUntil,
        blockSellBy: ownership.blockSellBy,
        lastBoostAt: ownership.lastBoostAt,
        avatarRevealUntil: ownership.avatarRevealUntil,
        isVerified: users.isVerified,
        playerType: sql<string>`CASE WHEN "users"."is_npc" = 1 THEN 'card' ELSE 'human' END`,
        purchaseCount: users.purchaseCount,
        bio: users.bio,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o2 WHERE o2.owned_id = "users"."id")`.as("owner_count"),
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = "users"."id")`.as("owned_count"),
        portfolioValue: portfolioValueExpr.as("portfolio_value"),
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(and(eq(ownership.ownerId, player.id), visibleSql))
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
      // Calculate minutes until credits decay to 1: ln(credits) / (-ln(0.99))
      // Each 1% decay happens every 1 minute
      const minutesUntilDeletion = Math.ceil(Math.log(player.credits) / (-Math.log(0.99)));
      estimatedDeletionAt = new Date(Date.now() + minutesUntilDeletion * 60 * 1000);
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
