/**
 * Shared 10-minute cooldown for the three pinned bonus cards
 * (Mass Hire, 10 Slots, Reveal).
 *
 * Cooldown ends are stored in `game_settings` as epoch SECONDS — the
 * `setting_value` column is a 32-bit integer, so milliseconds would overflow.
 */

import { db } from "@/db";
import { gameSettings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

/** Every bonus card shares the same 10-minute cooldown between uses. */
export const BONUS_CARD_COOLDOWN_MS = 10 * 60 * 1000;

export type BonusCard = "massHire" | "slots" | "reveal";

/** `mass_hire_last_` is the pre-existing key prefix — kept for continuity. */
const KEY_PREFIX: Record<BonusCard, string> = {
  massHire: "mass_hire_last_",
  slots: "slots_cd_",
  reveal: "reveal_cd_",
};

export function bonusCooldownKey(card: BonusCard, userId: number): string {
  return `${KEY_PREFIX[card]}${userId}`;
}

/** Epoch-SECONDS timestamp when the card becomes usable again (0 = never used). */
export async function getBonusCooldownEnd(card: BonusCard, userId: number): Promise<number> {
  const [row] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, bonusCooldownKey(card, userId)))
    .limit(1);
  return row ? Number(row.value) : 0;
}

/** All three cooldown ends in one query (epoch seconds). */
export async function getAllBonusCooldownEnds(
  userId: number
): Promise<Record<BonusCard, number>> {
  const cards: BonusCard[] = ["massHire", "slots", "reveal"];
  const keys = cards.map((c) => bonusCooldownKey(c, userId));
  const rows = await db
    .select({ key: gameSettings.settingKey, value: gameSettings.settingValue })
    .from(gameSettings)
    .where(inArray(gameSettings.settingKey, keys));

  const byKey = new Map(rows.map((r) => [r.key, Number(r.value)]));
  return {
    massHire: byKey.get(bonusCooldownKey("massHire", userId)) ?? 0,
    slots: byKey.get(bonusCooldownKey("slots", userId)) ?? 0,
    reveal: byKey.get(bonusCooldownKey("reveal", userId)) ?? 0,
  };
}

/** Starts the cooldown. Returns the new end timestamp (epoch seconds). */
export async function setBonusCooldown(
  card: BonusCard,
  userId: number,
  durationMs: number = BONUS_CARD_COOLDOWN_MS
): Promise<number> {
  const endsAtSec = Math.floor(Date.now() / 1000) + Math.floor(durationMs / 1000);
  await db
    .insert(gameSettings)
    .values({ settingKey: bonusCooldownKey(card, userId), settingValue: endsAtSec })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: endsAtSec, updatedAt: new Date() },
    });
  return endsAtSec;
}

/**
 * Returns a "3m 12s" style string for the remaining cooldown, or null when the
 * card is ready to use.
 */
export async function checkBonusCooldown(
  card: BonusCard,
  userId: number
): Promise<string | null> {
  const endsAtSec = await getBonusCooldownEnd(card, userId);
  const nowSec = Math.floor(Date.now() / 1000);
  if (endsAtSec <= nowSec) return null;
  const remaining = endsAtSec - nowSec;
  return `${Math.floor(remaining / 60)}m ${remaining % 60}s`;
}
