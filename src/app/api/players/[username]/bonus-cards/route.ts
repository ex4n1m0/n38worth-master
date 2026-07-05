import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, inArray, and } from "drizzle-orm";
import { BONUS_CARD_USERNAMES, BONUS_CARD_POWERS, BONUS_CARD_IMAGES } from "@/lib/bonus-cards";
import { GODDESS_USERNAMES, GODDESS_POWERS } from "@/lib/goddesses";

const GODDESS_IMAGES: Record<string, string> = {
  "Goddess of Wealth":    "/GODDESS.png",
  "Goddess of Knowledge": "/GODDESS.png",
  "Goddess of Fate":      "/GODDESS.png",
  "Goddess of Time":      "/GODDESS.png",
  "Goddess of War":       "/GODDESS.png",
  "Goddess":              "/GODDESS.png",
};

const ALL_SPECIAL_USERNAMES = [...BONUS_CARD_USERNAMES, ...GODDESS_USERNAMES];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  try {
    // Find the user by username
    const [targetUser] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.username, username));

    if (!targetUser) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Fetch bonus cards and goddess cards owned by this user
    const ownedBonusCards = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        playerValue: users.playerValue,
        valueFloor: users.valueFloor,
        blockSellUntil: sql<string | null>`(SELECT to_char(o.block_sell_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM ownership o WHERE o.owned_id = "users"."id" AND o.owner_id = ${targetUser.id} AND o.block_sell_until > NOW() ORDER BY o.block_sell_until DESC LIMIT 1)`.as("block_sell_until"),
      })
      .from(users)
      .innerJoin(ownership, eq(ownership.ownedId, users.id))
      .where(
        and(
          inArray(users.username, ALL_SPECIAL_USERNAMES),
          eq(ownership.ownerId, targetUser.id)
        )
      );

    // Map to include power descriptions and images (bonus cards first, then goddesses)
    const bonusCardsWithDetails = ownedBonusCards.map((card) => ({
      ...card,
      powerDescription:
        BONUS_CARD_POWERS[card.username] ||
        GODDESS_POWERS[card.username] ||
        "",
      image:
        BONUS_CARD_IMAGES[card.username] ||
        GODDESS_IMAGES[card.username] ||
        "/Bonus_Own.png",
    }));

    return NextResponse.json({
      bonusCards: bonusCardsWithDetails,
    });
  } catch (error) {
    console.error("Player bonus cards API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bonus cards" },
      { status: 500 }
    );
  }
}
