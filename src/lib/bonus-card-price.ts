/**
 * Server-side pricing helpers for bonus cards.
 *
 * Every bonus card has a single shared price. Prices are pinned to their floor
 * (base) value from BONUS_CARD_VALUES and no longer grow — the old "doubles
 * globally on each hire/use" behaviour has been removed, so cards always cost
 * their base value. ("+10 Player Slots" uses the separate slot-upgrade price.)
 */

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BONUS_CARD_VALUES, BONUS_CARD_IMAGES, doublesOnUse } from "@/lib/bonus-cards";

export { doublesOnUse };

/**
 * Read a bonus card's price. Prices are pinned to the card's floor (base) value
 * from BONUS_CARD_VALUES — they no longer grow — so this always returns the base
 * value regardless of any stale stored `playerValue`. Returns the card id so
 * callers can still reference the row.
 *
 * Self-healing: if the card row does not exist yet (e.g. action cards that were
 * never seeded) it is created at the base value.
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

  // Prices are pinned to the floor — always charge the base value.
  return { id: card.id, price: base };
}

/**
 * No-op: bonus card prices no longer grow. Previously this doubled the card's
 * global price on each hire/use; that behaviour has been removed so prices stay
 * at their floor (base) value. Kept as a no-op so existing call sites don't need
 * to change.
 */
export async function doubleBonusCardPrice(_cardId: number, _currentPrice: number): Promise<void> {
  // Intentionally does nothing — prices are pinned to their floor value.
}
