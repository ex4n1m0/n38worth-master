import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  GODDESS_USERNAMES,
  GODDESS_VALUES,
  MOST_EXPENSIVE_GODDESS,
  MOST_EXPENSIVE_GODDESS_ECONOMY_SHARE,
  MOST_EXPENSIVE_GODDESS_MIN_VALUE,
} from "@/lib/goddesses";

export async function GET() {
  try {
    const session = await auth();
    const currentUserId = session?.user?.id ? Number(session.user.id) : null;

    // SQL subqueries for counts and ownership info
    const ownerCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`;
    const ownedCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`;
    const portfolioExpr = sql<number>`LEAST(("users"."player_value"::numeric + COALESCE((SELECT SUM(u2.player_value::numeric) FROM ownership o2 JOIN users u2 ON o2.owned_id = u2.id WHERE o2.owner_id = "users"."id" AND (SELECT COUNT(*) FROM ownership o4 WHERE o4.owner_id = u2.id) > 0), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o3 WHERE o3.owned_id = "users"."id"), 1), 9007199254740991)`;
    const ownerNameExpr = sql<string | null>`(SELECT u.username FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;
    const ownerValueExpr = sql<number | null>`(SELECT u.player_value FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;

    // Fetch all goddesses
    const goddesses = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        playerValue: users.playerValue,
        valueFloor: users.valueFloor,
        credits: users.credits,
        blockSellUntil: sql<string | null>`(SELECT to_char(o.block_sell_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM ownership o WHERE o.owned_id = "users"."id" AND o.block_sell_until > NOW() ORDER BY o.purchased_at DESC LIMIT 1)`.as("block_sell_until"),
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
        purchaseCount: users.purchaseCount,
        ownerCount: ownerCountExpr.as("owner_count"),
        ownedCount: ownedCountExpr.as("owned_count"),
        portfolioValue: portfolioExpr.as("portfolio_value"),
        ownerName: ownerNameExpr.as("owner_name"),
        ownerValue: ownerValueExpr.as("owner_value"),
      })
      .from(users)
      .where(inArray(users.username, GODDESS_USERNAMES));

    // Total economy = sum of non-NPC players' credits. Used to price the most
    // expensive goddess as a share of the economy (see purchasePlayer.ts).
    const [econ] = await db
      .select({
        total: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 THEN credits ELSE 0 END), 0)`,
      })
      .from(users);
    const totalEconomy = Number(econ.total);
    const mostExpensiveGoddessCost = Math.max(
      MOST_EXPENSIVE_GODDESS_MIN_VALUE,
      Math.floor(totalEconomy * MOST_EXPENSIVE_GODDESS_ECONOMY_SHARE)
    );

    // Sort goddesses by their original values (descending)
    const sortedGoddesses = goddesses
      .map((goddess) => {
        const ownerCount = Number(goddess.ownerCount);
        const originalValue = GODDESS_VALUES[goddess.username] || 0;
        const hireCost =
          goddess.username === MOST_EXPENSIVE_GODDESS
            ? mostExpensiveGoddessCost
            : Number(goddess.playerValue);

        return {
          ...goddess,
          ownerCount,
          ownedCount: Number(goddess.ownedCount),
          portfolioValue: Math.round(Number(goddess.portfolioValue) * 100) / 100,
          ownerName: goddess.ownerName,
          ownerValue: goddess.ownerValue !== null ? Number(goddess.ownerValue) : null,
          originalValue,
          hireCost,
        };
      })
      .sort((a, b) => b.originalValue - a.originalValue);

    return NextResponse.json({
      goddesses: sortedGoddesses,
      currentUserId,
    });
  } catch (error) {
    console.error("Goddesses API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch goddesses" },
      { status: 500 }
    );
  }
}