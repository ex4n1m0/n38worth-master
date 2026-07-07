import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  GODDESS_USERNAMES,
  MOST_EXPENSIVE_GODDESS,
  MOST_EXPENSIVE_GODDESS_ECONOMY_SHARE,
  MOST_EXPENSIVE_GODDESS_MIN_VALUE,
} from "@/lib/goddesses";
import { BONUS_CARD_USERNAMES, BONUS_CARD_VALUES } from "@/lib/bonus-cards";

// Each press extends the partnership by 10 minutes. The cost equals the
// goddess's current value and is BURNED (removed from the economy — not paid to
// anyone). The goddess card's value is left unchanged.
const EXTEND_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerId = parseInt(session.user.id);

  try {
    const { targetId } = await req.json();
    if (!targetId || typeof targetId !== "number") {
      return NextResponse.json({ error: "Invalid goddess" }, { status: 400 });
    }

    // Load the goddess being extended.
    const [target] = await db
      .select({ id: users.id, username: users.username, playerValue: users.playerValue })
      .from(users)
      .where(eq(users.id, targetId));

    if (!target) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    const isGoddess = GODDESS_USERNAMES.includes(target.username);
    const isBonusCard = BONUS_CARD_USERNAMES.includes(target.username);
    if (!isGoddess && !isBonusCard) {
      return NextResponse.json({ error: "Only goddess or bonus card partnerships can be extended" }, { status: 400 });
    }

    // You can only extend a partnership you own.
    const [ownershipRecord] = await db
      .select()
      .from(ownership)
      .where(eq(ownership.ownedId, targetId));

    if (!ownershipRecord || ownershipRecord.ownerId !== ownerId) {
      return NextResponse.json(
        { error: "You can only extend a partnership you currently hold" },
        { status: 403 }
      );
    }

    // Load the buyer's credits.
    const [buyer] = await db
      .select({ credits: users.credits, username: users.username })
      .from(users)
      .where(eq(users.id, ownerId));

    if (!buyer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Cost = the card's current value (mirrors the displayed hire cost).
    let cost: number;
    if (target.username === MOST_EXPENSIVE_GODDESS) {
      const [econ] = await db
        .select({
          total: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 THEN credits ELSE 0 END), 0)`,
        })
        .from(users);
      cost = Math.max(
        MOST_EXPENSIVE_GODDESS_MIN_VALUE,
        Math.floor(Number(econ.total) * MOST_EXPENSIVE_GODDESS_ECONOMY_SHARE)
      );
    } else if (isBonusCard) {
      // Bonus cards are pinned to their floor value; clamp to the base so the
      // cost matches what the market shows.
      cost = Math.max(Number(target.playerValue), BONUS_CARD_VALUES[target.username] ?? 1000);
    } else {
      cost = Number(target.playerValue);
    }

    if (buyer.credits < cost) {
      return NextResponse.json(
        { error: `Extending costs ${cost}¢. You don't have enough credits.` },
        { status: 400 }
      );
    }

    // Burn the cost from the buyer's credits (removed from the economy — not
    // credited to anyone). The goddess value is intentionally left unchanged.
    await db
      .update(users)
      .set({ credits: sql`GREATEST(credits - ${cost}, 0)` })
      .where(eq(users.id, ownerId));

    // Extend the partnership: add 10 minutes onto the later of now / current end.
    const now = Date.now();
    const currentEnd = ownershipRecord.blockSellUntil
      ? new Date(ownershipRecord.blockSellUntil).getTime()
      : 0;
    const newEnd = new Date(Math.max(now, currentEnd) + EXTEND_MS);

    await db
      .update(ownership)
      .set({ blockSellUntil: newEnd, blockSellBy: buyer.username })
      .where(eq(ownership.id, ownershipRecord.id));

    return NextResponse.json({
      success: true,
      cost,
      addedMinutes: 10,
      blockSellUntil: newEnd.toISOString(),
    });
  } catch (error) {
    console.error("Extend partnership error:", error);
    return NextResponse.json({ error: "Failed to extend partnership" }, { status: 500 });
  }
}
