import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// Visibility predicate: NPCs are always visible; humans must have an avatar uploaded.
const visibleSql = sql`("users"."is_npc" = 1 OR ("users"."avatar_url" IS NOT NULL AND "users"."avatar_completed" = 1))`;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const playerId = parseInt(id);

    if (isNaN(playerId)) {
      return NextResponse.json({ error: "Invalid player ID" }, { status: 400 });
    }

    const ownerCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`;
    const ownedCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`;
    const portfolioExpr = sql<number>`("users"."player_value" + COALESCE((SELECT SUM(u2.player_value) FROM ownership o2 JOIN users u2 ON o2.owned_id = u2.id WHERE o2.owner_id = "users"."id" AND (SELECT COUNT(*) FROM ownership o4 WHERE o4.owner_id = u2.id) > 0), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o3 WHERE o3.owned_id = "users"."id"), 1)`;
    const ownerNameExpr = sql<string | null>`(SELECT u.username FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;
    const ownerValueExpr = sql<number | null>`(SELECT u.player_value FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;

    const [player] = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        avatarCompleted: users.avatarCompleted,
        playerValue: users.playerValue,
        valueFloor: users.valueFloor,
        credits: users.credits,
        isActive: users.isActive,
        isNpc: users.isNpc,
        createdAt: users.createdAt,
        lastOnlineAt: users.lastOnlineAt,
        blockSellUntil: users.blockSellUntil,
        estimatedDeletionAt: users.estimatedDeletionAt,
        isVerified: users.isVerified,
        totalOnlineMinutes: users.totalOnlineMinutes,
        onboardingCreatedBy: users.onboardingCreatedBy,
        playerType: sql<string>`CASE WHEN "users"."is_npc" = 1 THEN 'card' ELSE 'human' END`,
        photoAuthorName: users.photoAuthorName,
        photoAuthorUrl: users.photoAuthorUrl,
        photoSourceUrl: users.photoSourceUrl,
        ownerCount: ownerCountExpr.as("owner_count"),
        ownedCount: ownedCountExpr.as("owned_count"),
        portfolioValue: portfolioExpr.as("portfolio_value"),
        ownerName: ownerNameExpr.as("owner_name"),
        ownerValue: ownerValueExpr.as("owner_value"),
      })
      .from(users)
      .where(eq(users.id, playerId));

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Hide players without avatars unless the viewer is that player.
    const session = await auth();
    const viewerId = session?.user?.id ? Number(session.user.id) : null;
    const isHidden =
      player.isNpc === 0 && (!player.avatarUrl || player.avatarCompleted !== 1);
    if (isHidden && viewerId !== player.id) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Hide onboarding NPCs from other players until the creator completes onboarding.
    // Onboarding NPCs have onboardingCreatedBy set. They're only visible to:
    // 1. The creator (onboardingCreatedBy === viewerId)
    // 2. Everyone, once the creator has completed onboarding (creator.onboardingComplete = 1)
    // 3. Everyone, if the creator no longer exists (deleted account) — orphans become public
    if (player.onboardingCreatedBy && player.onboardingCreatedBy !== viewerId) {
      const [creator] = await db
        .select({ onboardingComplete: users.onboardingComplete })
        .from(users)
        .where(eq(users.id, player.onboardingCreatedBy));
      // Only hide if creator EXISTS and hasn't completed onboarding.
      // If creator no longer exists (deleted account), the NPC is visible to everyone.
      if (creator && creator.onboardingComplete !== 1) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }
    }

    // Get owners
    const owners = await db
      .select({
        ownershipId: ownership.id,
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        playerValue: users.playerValue,
        purchasePrice: ownership.purchasePrice,
        blockSellUntil: ownership.blockSellUntil,
        blockSellBy: ownership.blockSellBy,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownerId, users.id))
      .where(and(eq(ownership.ownedId, playerId), visibleSql));

    // Get owned players
    const ownedPlayers = await db
      .select({
        ownershipId: ownership.id,
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        playerValue: users.playerValue,
        purchasePrice: ownership.purchasePrice,
        blockSellUntil: ownership.blockSellUntil,
        blockSellBy: ownership.blockSellBy,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(and(eq(ownership.ownerId, playerId), visibleSql));

    return NextResponse.json({
      ...player,
      ownerCount: Number(player.ownerCount),
      ownedCount: Number(player.ownedCount),
      portfolioValue: Math.round(Number(player.portfolioValue) * 100) / 100,
      ownerName: player.ownerName,
      ownerValue: player.ownerValue !== null ? Number(player.ownerValue) : null,
      owners,
      ownedPlayers,
    });
  } catch (error) {
    console.error("Player fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch player" },
      { status: 500 }
    );
  }
}