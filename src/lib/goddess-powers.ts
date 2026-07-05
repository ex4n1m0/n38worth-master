import { db } from "@/db";
import { users, ownership } from "@/db/schema";
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
}

/**
 * Returns which goddess powers are active for a given user.
 * Holding "Goddess" (Goddess of Creation) activates all powers.
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

  return {
    hasWealth: hasAll || owned.has("Goddess of Wealth"),
    hasKnowledge: hasAll || owned.has("Goddess of Knowledge") || hasTemporaryKnowledge,
    hasFate: hasAll || owned.has("Goddess of Fate"),
    hasTime: hasAll || owned.has("Goddess of Time"),
    hasWar: hasAll || owned.has("Goddess of War"),
    hasAll,
    temporaryKnowledgeUntil: temporaryKnowledgeUntil?.toISOString() ?? null,
  };
}
