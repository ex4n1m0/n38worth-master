import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { BONUS_CARD_USERNAMES, BONUS_CARD_IMAGES } from "@/lib/bonus-cards";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check which bonus cards already exist
    const existingCards = await db
      .select({ username: users.username })
      .from(users)
      .where(inArray(users.username, BONUS_CARD_USERNAMES));

    const existingUsernames = new Set(existingCards.map(c => c.username));
    const cardsToCreate = BONUS_CARD_USERNAMES.filter(
      username => !existingUsernames.has(username)
    );

    if (cardsToCreate.length === 0) {
      return NextResponse.json({ 
        message: "All bonus cards already exist", 
        created: [],
        alreadyExist: Array.from(existingUsernames)
      });
    }

    // Create missing bonus cards
    const createdCards = [];
    for (const username of cardsToCreate) {
      const [newCard] = await db
        .insert(users)
        .values({
          username,
          avatarUrl: BONUS_CARD_IMAGES[username],
          isNpc: 1,
          isProtected: 1,
          playerValue: 0,
          credits: 0,
        })
        .returning({ id: users.id, username: users.username });
      
      createdCards.push(newCard);
    }

    return NextResponse.json({
      message: `Created ${createdCards.length} bonus card(s)`,
      created: createdCards,
      alreadyExist: Array.from(existingUsernames),
    });
  } catch (error) {
    console.error("Failed to initialize bonus cards:", error);
    return NextResponse.json(
      { error: "Failed to initialize bonus cards" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const existingCards = await db
      .select({ 
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        playerValue: users.playerValue,
      })
      .from(users)
      .where(inArray(users.username, BONUS_CARD_USERNAMES));

    return NextResponse.json({
      bonusCards: existingCards,
      expected: BONUS_CARD_USERNAMES,
      missing: BONUS_CARD_USERNAMES.filter(
        username => !existingCards.some(c => c.username === username)
      ),
    });
  } catch (error) {
    console.error("Failed to check bonus cards:", error);
    return NextResponse.json(
      { error: "Failed to check bonus cards" },
      { status: 500 }
    );
  }
}
