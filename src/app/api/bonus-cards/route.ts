import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { BONUS_CARD_IMAGES, BONUS_CARD_USERNAMES, BONUS_CARD_VALUES } from "@/lib/bonus-cards";

export async function GET() {
  try {
    const session = await auth();
    const currentUserId = session?.user?.id ? Number(session.user.id) : null;

    // SQL subqueries for counts and ownership info
    const ownerCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`;
    const ownedCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`;
    const ownerNameExpr = sql<string | null>`(SELECT u.username FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;
    const ownerValueExpr = sql<number | null>`(SELECT u.player_value FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;

    // Fetch all bonus cards
    const bonusCards = await db
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
        photoAuthorName: users.photoAuthorName,
        photoAuthorUrl: users.photoAuthorUrl,
        photoSourceUrl: users.photoSourceUrl,
        purchaseCount: users.purchaseCount,
        ownerCount: ownerCountExpr.as("owner_count"),
        ownedCount: ownedCountExpr.as("owned_count"),
        ownerName: ownerNameExpr.as("owner_name"),
        ownerValue: ownerValueExpr.as("owner_value"),
      })
      .from(users)
      .where(inArray(users.username, BONUS_CARD_USERNAMES));

    const normalizedBonusCards = bonusCards
      .map((card) => {
        const isActionCard =
          card.username === "Mass Hire" ||
          card.username === "Create NPC" ||
          card.username === "+10 Player Slots" ||
          card.username === "10-Min Knowledge";
        const ownerCount = isActionCard ? 0 : Number(card.ownerCount);
        const baseValue = BONUS_CARD_VALUES[card.username] || 0;
        // Current global price: the card's live DB value, which doubles on each
        // hire/use. Never below the base value.
        const currentValue = Number(card.playerValue) >= baseValue ? Number(card.playerValue) : baseValue;
        // "originalValue" is the base price (shown as the "Original" stat).
        const originalValue = baseValue;

        return {
          ...card,
          playerValue: currentValue,
          ownerCount,
          ownedCount: Number(card.ownedCount),
          ownerName: isActionCard ? null : card.ownerName,
          ownerValue: isActionCard ? null : card.ownerValue !== null ? Number(card.ownerValue) : null,
          originalValue,
        };
      });

    for (const username of ["Mass Hire", "Create NPC", "+10 Player Slots", "10-Min Knowledge"]) {
      if (!normalizedBonusCards.some((card) => card.username === username)) {
        normalizedBonusCards.push({
          id: username === "Mass Hire" ? -1 : username === "Create NPC" ? -2 : username === "+10 Player Slots" ? -3 : -4,
          username,
          avatarUrl: BONUS_CARD_IMAGES[username],
          playerValue: BONUS_CARD_VALUES[username],
          valueFloor: 0,
          credits: 0,
          blockSellUntil: null,
          estimatedDeletionAt: null,
          isActive: 1,
          createdAt: new Date(),
          totalOnlineMinutes: 0,
          lastOnlineAt: new Date(),
          isVerified: 0,
          playerType: "card",
          photoAuthorName: null,
          photoAuthorUrl: null,
          photoSourceUrl: null,
          purchaseCount: 0,
          ownerCount: 0,
          ownedCount: 0,
          ownerName: null,
          ownerValue: null,
          originalValue: BONUS_CARD_VALUES[username],
        });
      }
    }

    // Sort bonus cards by their original values (descending)
    const sortedBonusCards = normalizedBonusCards
      .sort((a, b) => b.originalValue - a.originalValue);

    return NextResponse.json({
      bonusCards: sortedBonusCards,
      currentUserId,
    });
  } catch (error) {
    console.error("Bonus cards API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bonus cards" },
      { status: 500 }
    );
  }
}
