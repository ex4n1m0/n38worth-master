/**
 * Server-side pricing helpers for bonus cards.
 *
 * Every bonus card (except "+10 Player Slots", which uses the slot-upgrade
 * price) has a single shared price stored on its `users` row. The price starts
 * at its base value (BONUS_CARD_VALUES) and DOUBLES globally on each hire/use.
 */

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PG_BIGINT_MAX } from "@/lib/safeguards";
import { BONUS_CARD_VALUES, BONUS_CARD_IMAGES, doublesOnUse } from "@/lib/bonus-cards";

export { doublesOnUse };

/**
 * Read a bonus card's current global price (its DB `playerValue`), never below
 * its base value. Returns the card id so callers can update it afterwards.
 *
 * Self-healing: if the card row does not exist yet (e.g. action cards that were
 * never seeded) it is created at the base value so the doubling has somewhere
 * to persist. The returned price is clamped to the base value so a card whose
 * value was reset below the base (e.g. released to floor on an owner deletion)
 * still starts doubling from the base rather than from the stale low value.
 */
export async function getBonusCardPrice(
  username: string
): Promise<{ id: number; price: number } | null> {
  const base = BONUS_CARD_VALUES[username] ?? 1000;

  let [card] = await db
    .select({ id: users.id, playerValue: users.playerValue })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!card) {
    try {
      [card] = await db
        .insert(users)
        .values({
          username,
          avatarUrl: BONUS_CARD_IMAGES[username] ?? null,
          isNpc: 1,
          isProtected: 1,
          playerValue: base,
          credits: 0,
        })
        .returning({ id: users.id, playerValue: users.playerValue });
    } catch {
      // Lost a create race (unique username) — read the row that now exists.
      [card] = await db
        .select({ id: users.id, playerValue: users.playerValue })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
    }
  }

  if (!card) return null;

  const price = card.playerValue && card.playerValue >= base ? card.playerValue : base;
  return { id: card.id, price };
}

/**
 * Double a bonus card's global price (capped at the bigint limit). Pass the
 * current price you already charged so the next hire/use costs 2×.
 */
export async function doubleBonusCardPrice(cardId: number, currentPrice: number): Promise<void> {
  const doubled = BigInt(Math.max(0, Math.round(currentPrice))) * BigInt(2);
  const capped = doubled <= PG_BIGINT_MAX ? Number(doubled) : currentPrice;
  await db
    .update(users)
    .set({ playerValue: capped, updatedAt: new Date() })
    .where(eq(users.id, cardId));
}
