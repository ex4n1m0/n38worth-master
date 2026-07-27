import { db } from "@/db";
import { users, gameSettings } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  GODDESS_ROSTER,
  REMOVED_AGENT_USERNAMES,
  type AgentDefinition,
} from "@/lib/agent/roster";
import { GODDESS_VALUES } from "@/lib/goddesses";

export {
  GODDESS_ROSTER,
  GODDESS_AGENT_USERNAMES,
  REMOVED_AGENT_USERNAMES,
  AI_PLAYER_USERNAMES,
  getAutonomousPlayerDefinition,
  isRemovedAgentUsername,
  isAIPlayerUsername,
  type AgentDefinition,
} from "@/lib/agent/roster";

function idKey(username: string): string {
  return `agent_user_id_${username.toLowerCase()}`;
}

/** Deactivates the historical support account if an old database still has it. */
export async function deactivateRemovedAgents(): Promise<number> {
  const updated = await db
    .update(users)
    .set({ isActive: 0, updatedAt: new Date() })
    .where(
      and(
        inArray(users.username, [...REMOVED_AGENT_USERNAMES]),
        eq(users.isActive, 1)
      )
    )
    .returning({ id: users.id });
  return updated.length;
}

/**
 * Ensures a goddess exists as an autonomous AI player and returns her user id.
 *
 * NON-DESTRUCTIVE on the goddess card: this never flips isNpc and never
 * overwrites her avatar / playerValue / valueFloor / isProtected / credits /
 * hireSlots. It only marks her as an active, fully-onboarded player so the
 * runner treats her like any other autonomous player. Goddesses are expected
 * to already exist (seeded by scripts/create-goddess-npcs.ts and preserved
 * across resets via isProtected=1); a missing goddess is created with her
 * canonical value as a fallback so the world stays playable.
 */
export async function ensureGoddess(definition: AgentDefinition): Promise<number> {
  const key = idKey(definition.username);
  const [cached] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, key))
    .limit(1);

  if (cached?.value) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, cached.value))
      .limit(1);
    if (existing) {
      // Keep her card state intact; only refresh "is a real, active player" flags.
      await db
        .update(users)
        .set({ isActive: 1, avatarCompleted: 1, onboardingComplete: 1, updatedAt: new Date() })
        .where(eq(users.id, existing.id));
      return existing.id;
    }
  }

  const [byName] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, definition.username))
    .limit(1);

  let goddessId: number;
  if (byName) {
    goddessId = byName.id;
    await db
      .update(users)
      .set({ isActive: 1, avatarCompleted: 1, onboardingComplete: 1, updatedAt: new Date() })
      .where(eq(users.id, goddessId));
  } else {
    // Fallback: a goddess should already exist. Create her with the canonical
    // value so the world is still playable if the seed script hasn't run yet.
    const originalValue = GODDESS_VALUES[definition.username] ?? 1;
    const [created] = await db
      .insert(users)
      .values({
        username: definition.username,
        passwordHash: null,
        avatarUrl: null,
        avatarCompleted: 1,
        credits: 100,
        playerValue: originalValue,
        valueFloor: originalValue,
        isActive: 1,
        isVerified: 0,
        isNpc: 1,
        isProtected: 1,
        onboardingComplete: 1,
      })
      .returning({ id: users.id });
    goddessId = created.id;
  }

  await db
    .insert(gameSettings)
    .values({ settingKey: key, settingValue: goddessId })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: goddessId, updatedAt: new Date() },
    });

  return goddessId;
}

/** Ensures the complete autonomous roster — now only the six goddesses. */
export async function ensureAgents(): Promise<Array<AgentDefinition & { id: number }>> {
  await deactivateRemovedAgents();
  const ids = await Promise.all(GODDESS_ROSTER.map((def) => ensureGoddess(def)));
  return GODDESS_ROSTER.map((def, index) => ({ ...def, id: ids[index] }));
}
