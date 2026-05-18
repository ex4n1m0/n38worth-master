import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, count, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { BONUS_CARD_USERNAMES } from "@/lib/bonus-cards";

const MIN_OWNED = 10;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    // Check if user has at least 10 hired players
    const [{ ownedCount }] = await db
      .select({ ownedCount: count(ownership.id) })
      .from(ownership)
      .where(eq(ownership.ownerId, userId));

    if (ownedCount < MIN_OWNED) {
      return NextResponse.json(
        { error: `You need to own at least ${MIN_OWNED} players to see bonus cards` },
        { status: 403 }
      );
    }

    // Fetch bonus cards with ownership info
    const bonusCards = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        playerValue: users.playerValue,
        valueFloor: users.valueFloor,
        credits: users.credits,
        ownerCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`.as("owner_count"),
        ownedCount: sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`.as("owned_count"),
        blockSellUntil: sql<string | null>`(SELECT to_char(o.block_sell_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM ownership o WHERE o.owned_id = "users"."id" AND o.block_sell_until > NOW() ORDER BY o.block_sell_until DESC LIMIT 1)`.as("block_sell_until"),
        ownerName: sql<string | null>`(SELECT u.username FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`.as("owner_name"),
        ownerValue: sql<number | null>`(SELECT u.player_value FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`.as("owner_value"),
      })
      .from(users)
      .where(inArray(users.username, BONUS_CARD_USERNAMES));

    return NextResponse.json({
      bonusCards: bonusCards.map((card) => ({
        ...card,
        ownerCount: Number(card.ownerCount),
        ownedCount: Number(card.ownedCount),
        ownerValue: card.ownerValue !== null ? Number(card.ownerValue) : null,
      })),
    });
  } catch (error) {
    console.error("Bonus cards API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bonus cards" },
      { status: 500 }
    );
  }
}
