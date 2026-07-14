import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

const visibleSql = sql`("users"."is_npc" = 1 OR ("users"."avatar_url" IS NOT NULL AND "users"."avatar_completed" = 1))`;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const url = new URL(req.url);

  const lite = url.searchParams.get("lite") === "1";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const maxLimit = lite ? 1000 : 50;
  const limit = Math.min(maxLimit, parseInt(url.searchParams.get("limit") || "50"));
  const offset = (page - 1) * limit;

  try {
    const portfolioValueExpr = sql<number>`("users"."player_value"::numeric + COALESCE((SELECT SUM(u2.player_value::numeric) FROM ownership o_pv JOIN users u2 ON o_pv.owned_id = u2.id WHERE o_pv.owner_id = "users"."id"), 0))`;
    const ownerNameExpr = sql<string | null>`(SELECT u.username FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;
    const ownerValueExpr = sql<number | null>`(SELECT u.player_value FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;
    const blockSellUntilExpr = sql<string | null>`(SELECT to_char(o.block_sell_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM ownership o WHERE o.owned_id = "users"."id" AND o.block_sell_until > NOW() ORDER BY o.block_sell_until DESC LIMIT 1)`;
    const avatarRevealUntilExpr = sql<string | null>`GREATEST(
      (SELECT to_char(o.avatar_reveal_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM ownership o WHERE o.owned_id = "users"."id" AND o.avatar_reveal_until > NOW() ORDER BY o.avatar_reveal_until DESC LIMIT 1),
      (SELECT to_char(ar.reveal_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM avatar_reveals ar WHERE ar.target_id = "users"."id" AND ar.reveal_until > NOW() ORDER BY ar.reveal_until DESC LIMIT 1)
    )`;

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
        onboardingCreatedBy: users.onboardingCreatedBy,
        playerType: sql<string>`CASE WHEN "users"."is_npc" = 1 THEN 'card' ELSE 'human' END`,
        purchaseCount: users.purchaseCount,
        photoScore: users.photoScore,
        bio: users.bio,
        profession: users.profession,
        photoAuthorName: users.photoAuthorName,
        photoAuthorUrl: users.photoAuthorUrl,
        photoSourceUrl: users.photoSourceUrl,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`.as("owner_count"),
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`.as("owned_count"),
        portfolioValue: portfolioValueExpr.as("portfolio_value"),
        ownerName: ownerNameExpr.as("owner_name"),
        ownerValue: ownerValueExpr.as("owner_value"),
        blockSellUntil: blockSellUntilExpr.as("block_sell_until"),
        avatarRevealUntil: avatarRevealUntilExpr.as("avatar_reveal_until"),
      })
      .from(users)
      .where(eq(users.username, username));

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const session = await auth();
    const viewerId = session?.user?.id ? Number(session.user.id) : null;
    const isHidden = player.isNpc === 0 && (!player.avatarUrl || player.avatarCompleted !== 1);
    if (isHidden && viewerId !== player.id) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    if (player.onboardingCreatedBy && player.onboardingCreatedBy !== viewerId) {
      const [creator] = await db
        .select({ onboardingComplete: users.onboardingComplete })
        .from(users)
        .where(eq(users.id, player.onboardingCreatedBy));
      if (creator && creator.onboardingComplete !== 1) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }
    }

    const avatarUrlSel = lite
      ? sql<string | null>`NULL`.as("avatar_url")
      : users.avatarUrl;

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
        blockSellUntil: blockSellUntilExpr.as("block_sell_until"),
        blockSellBy: ownership.blockSellBy,
        avatarRevealUntil: avatarRevealUntilExpr.as("avatar_reveal_until"),
        isVerified: users.isVerified,
        playerType: sql<string>`CASE WHEN "users"."is_npc" = 1 THEN 'card' ELSE 'human' END`,
        purchaseCount: users.purchaseCount,
        photoScore: users.photoScore,
        profession: users.profession,
        bio: users.bio,
        photoAuthorName: users.photoAuthorName,
        photoAuthorUrl: users.photoAuthorUrl,
        photoSourceUrl: users.photoSourceUrl,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o2 WHERE o2.owned_id = "users"."id")`.as("owner_count"),
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = "users"."id")`.as("owned_count"),
        portfolioValue: portfolioValueExpr.as("portfolio_value"),
        ownerName: ownerNameExpr.as("owner_name"),
        ownerValue: ownerValueExpr.as("owner_value"),
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
      ownerValue: o.ownerValue !== null ? Number(o.ownerValue) : null,
      estimatedDeletionAt: null,
    }));

    const [ownedCountResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(and(eq(ownership.ownerId, player.id), visibleSql));

    const totalOwned = Number(ownedCountResult.count);

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
        blockSellUntil: blockSellUntilExpr.as("block_sell_until"),
        blockSellBy: ownership.blockSellBy,
        permBlockUntil: ownership.permBlockUntil,
        lastBoostAt: ownership.lastBoostAt,
        avatarRevealUntil: avatarRevealUntilExpr.as("avatar_reveal_until"),
        isVerified: users.isVerified,
        playerType: sql<string>`CASE WHEN "users"."is_npc" = 1 THEN 'card' ELSE 'human' END`,
        purchaseCount: users.purchaseCount,
        photoScore: users.photoScore,
        bio: users.bio,
        profession: users.profession,
        photoAuthorName: users.photoAuthorName,
        photoAuthorUrl: users.photoAuthorUrl,
        photoSourceUrl: users.photoSourceUrl,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o2 WHERE o2.owned_id = "users"."id")`.as("owner_count"),
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = "users"."id")`.as("owned_count"),
        portfolioValue: portfolioValueExpr.as("portfolio_value"),
        ownerName: ownerNameExpr.as("owner_name"),
        ownerValue: ownerValueExpr.as("owner_value"),
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(and(eq(ownership.ownerId, player.id), visibleSql))
      .orderBy(desc(users.lastOnlineAt))
      .limit(limit)
      .offset(offset);

    const ownedPlayers = ownedPlayersRaw.map((p) => ({
      ...p,
      ownerCount: Number(p.ownerCount),
      ownedCount: Number(p.ownedCount),
      portfolioValue: Math.round(Number(p.portfolioValue) * 100) / 100,
      ownerValue: p.ownerValue !== null ? Number(p.ownerValue) : null,
      estimatedDeletionAt: null,
    }));

    const playerOwnerCount = Number(player.ownerCount);
    const isNpcWithoutOwner = player.playerType === "card" && playerOwnerCount === 0;
    let estimatedDeletionAt: Date | null = null;
    if (isNpcWithoutOwner && player.credits > 1 && player.lastOnlineAt) {
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
      ownerValue: player.ownerValue !== null ? Number(player.ownerValue) : null,
      estimatedDeletionAt,
      owners: ownersWithMeta,
      ownedPlayers,
      pagination: {
        page,
        limit,
        total: totalOwned,
        totalPages: Math.ceil(totalOwned / limit),
        hasMore: page * limit < totalOwned,
      },
    });
  } catch (error) {
    console.error("Player API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch player" },
      { status: 500 }
    );
  }
}