import { db } from "@/db";
import { users, ownership, gameSettings } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { GODDESS_USERNAMES } from "@/lib/goddesses";

export interface GoddessPowers {
  hasWealth: boolean;
  hasKnowledge: boolean;
  hasFate: boolean;
  hasTime: boolean;
  hasWar: boolean;
  hasAll: boolean;
  temporaryKnowledgeUntil: string | null;
  /** Which powers the user has manually disabled (toggled off). */
  disabledPowers: string[];
}

/** Bitmask positions for each goddess power (stored in game_settings). */
const POWER_BITS: Record<string, number> = {
  "Goddess of Wealth": 1 << 0,
  "Goddess of Knowledge": 1 << 1,
  "Goddess of Fate": 1 << 2,
  "Goddess of Time": 1 << 3,
  "Goddess of War": 1 << 4,
  "Goddess": 1 << 5,
};

function powersDisabledKey(userId: number) {
  return `goddess_powers_off_${userId}`;
}

/** Returns the bitmask of disabled powers for the user (0 = none disabled). */
export async function getDisabledPowersMask(userId: number): Promise<number> {
  const [row] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, powersDisabledKey(userId)))
    .limit(1);
  return row ? Number(row.value) : 0;
}

/** Returns the list of goddess names whose powers the user has toggled off. */
export async function getDisabledPowers(userId: number): Promise<string[]> {
  const mask = await getDisabledPowersMask(userId);
  return Object.entries(POWER_BITS)
    .filter(([, bit]) => (mask & bit) !== 0)
    .map(([name]) => name);
}

/**
 * Toggles a goddess power on/off for the user.
 * Returns the new disabled state (true = now disabled).
 */
export async function toggleGoddessPower(
  userId: number,
  goddessName: string
): Promise<boolean> {
  const bit = POWER_BITS[goddessName];
  if (!bit) throw new Error(`Unknown goddess: ${goddessName}`);

  const currentMask = await getDisabledPowersMask(userId);
  const isDisabled = (currentMask & bit) !== 0;
  const newMask = isDisabled ? currentMask & ~bit : currentMask | bit;

  await db
    .insert(gameSettings)
    .values({ settingKey: powersDisabledKey(userId), settingValue: newMask })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: newMask, updatedAt: new Date() },
    });

  return !isDisabled; // true = now disabled
}

/**
 * Returns which goddess powers are active for a given user.
 * Holding "Goddess" (Goddess of Creation) activates all powers.
 * Powers the user has manually toggled off are deactivated.
 */
export async function getGoddessPowers(userId: number): Promise<GoddessPowers> {
  const [user] = await db
    .select({ temporaryKnowledgeUntil: users.temporaryKnowledgeUntil })
    .from(users)
    .where(eq(users.id, userId));

  const goddessRows = await db
    .select({ username: users.username })
    .from(ownership)
    .innerJoin(users, eq(ownership.ownedId, users.id))
    .where(
      and(
        eq(ownership.ownerId, userId),
        inArray(users.username, GODDESS_USERNAMES)
      )
    );

  const owned = new Set(goddessRows.map((r) => r.username));

  const hasAll = owned.has("Goddess");
  const temporaryKnowledgeUntil = user?.temporaryKnowledgeUntil ?? null;
  const hasTemporaryKnowledge = !!(
    temporaryKnowledgeUntil && new Date(temporaryKnowledgeUntil) > new Date()
  );

  // Fetch user's disabled powers bitmask.
  const disabledMask = await getDisabledPowersMask(userId);
  const isDisabled = (name: string) => (disabledMask & (POWER_BITS[name] ?? 0)) !== 0;

  // "Goddess" toggle controls whether the all-powers grant is active.
  const allPowerDisabled = isDisabled("Goddess");
  const effectiveHasAll = hasAll && !allPowerDisabled;

  return {
    hasWealth: (effectiveHasAll || owned.has("Goddess of Wealth")) && !isDisabled("Goddess of Wealth"),
    hasKnowledge: (effectiveHasAll || owned.has("Goddess of Knowledge") || hasTemporaryKnowledge) && !isDisabled("Goddess of Knowledge"),
    hasFate: (effectiveHasAll || owned.has("Goddess of Fate")) && !isDisabled("Goddess of Fate"),
    hasTime: (effectiveHasAll || owned.has("Goddess of Time")) && !isDisabled("Goddess of Time"),
    hasWar: (effectiveHasAll || owned.has("Goddess of War")) && !isDisabled("Goddess of War"),
    hasAll: effectiveHasAll,
    temporaryKnowledgeUntil: temporaryKnowledgeUntil?.toISOString() ?? null,
    disabledPowers: Object.entries(POWER_BITS)
      .filter(([, bit]) => (disabledMask & bit) !== 0)
      .map(([name]) => name),
  };
}
