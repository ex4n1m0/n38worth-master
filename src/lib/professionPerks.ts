import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { PROFESSIONS, PROFESSION_PERKS } from "@/lib/professions";

/**
 * Profession perks ("Firmware Perks") — each profession grants a passive benefit
 * to a player while they either ARE that profession or OWN at least one card
 * with it. Binary (doesn't stack per card). Selling a profession combo gives
 * up the perks of the sold professions until the player rebuilds.
 *
 * Perk table (rarer profession = stronger perk):
 *   Cryptographer  (5%)  — Deep Encryption:  block-sells last +50% longer (1.5h/press)
 *   Zero-Day       (6%)  — Exploit Chain:    break fees 20% cheaper (hard-lock 1000× unaffected)
 *   Overclocker    (7%)  — Turbo Boost:      pump costs 10% less, still doubles value
 *   Cache Keeper   (8%)  — Cached Dividends: daily login reward +25% (bonus minted)
 *   Server Marshal (9%)  — Extra Racks:      +2 hire slots
 *   Bot Herder    (10%)  — Wider Botnet:     Mass Hire grabs +1 extra card
 */

export { PROFESSION_PERKS };

const PROFESSION_NAMES = PROFESSIONS.map((p) => p.name);

/**
 * Returns the set of professions whose perks are active for `userId`:
 * the user's own profession plus the distinct professions of all cards
 * they currently own.
 */
export async function getProfessionPerks(userId: number): Promise<Set<string>> {
  const [self] = await db
    .select({ profession: users.profession })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const ownedRows = await db
    .selectDistinct({ profession: users.profession })
    .from(ownership)
    .innerJoin(users, eq(ownership.ownedId, users.id))
    .where(and(eq(ownership.ownerId, userId), isNotNull(users.profession), inArray(users.profession, PROFESSION_NAMES)));

  const active = new Set<string>();
  if (self?.profession && PROFESSION_NAMES.includes(self.profession)) {
    active.add(self.profession);
  }
  for (const row of ownedRows) {
    if (row.profession) active.add(row.profession);
  }
  return active;
}

/** Convenience: check a single perk. */
export async function hasProfessionPerk(userId: number, profession: string): Promise<boolean> {
  const perks = await getProfessionPerks(userId);
  return perks.has(profession);
}
