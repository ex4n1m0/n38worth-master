import { db } from "@/db";
import { users, gameSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  AGENT_ROSTER,
  GODDESS_ROSTER,
  AGENT_USERNAME,
  type AgentDefinition,
} from "@/lib/agent/roster";
import { GODDESS_VALUES } from "@/lib/goddesses";

export {
  AGENT_ROSTER,
  GODDESS_ROSTER,
  AGENT_USERNAME,
  AGENT_AVATAR_URL,
  AGENT_USERNAMES,
  GODDESS_AGENT_USERNAMES,
  AI_PLAYER_USERNAMES,
  getAgentDefinition,
  getAutonomousPlayerDefinition,
  isAgentUsername,
  isAIPlayerUsername,
  type AgentDefinition,
} from "@/lib/agent/roster";

function idKey(username: string): string {
  return `agent_user_id_${username.toLowerCase()}`;
}

/** Ensures one AGI player exists and returns its user id. */
export async function ensureAgent(definition: AgentDefinition = AGENT_ROSTER[0]): Promise<number> {
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
      await db
        .update(users)
        .set({ avatarUrl: definition.avatarUrl, avatarCompleted: 1, isNpc: 0, isActive: 1, onboardingComplete: 1 })
        .where(eq(users.id, existing.id));
      return existing.id;
    }
  }

  const [byName] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, definition.username))
    .limit(1);

  let agentId: number;
  if (byName) {
    agentId = byName.id;
    await db
      .update(users)
      .set({ avatarUrl: definition.avatarUrl, avatarCompleted: 1, isNpc: 0, isActive: 1, onboardingComplete: 1 })
      .where(eq(users.id, agentId));
  } else {
    const [created] = await db
      .insert(users)
      .values({
        username: definition.username,
        passwordHash: null,
        avatarUrl: definition.avatarUrl,
        avatarCompleted: 1,
        credits: 100,
        playerValue: 1,
        valueFloor: 1,
        isActive: 1,
        isVerified: 0,
        isNpc: 0,
        onboardingComplete: 1,
      })
      .returning({ id: users.id });
    agentId = created.id;
  }

  await db
    .insert(gameSettings)
    .values({ settingKey: key, settingValue: agentId })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: agentId, updatedAt: new Date() },
    });

  if (definition.username === AGENT_USERNAME) {
    await db
      .insert(gameSettings)
      .values({ settingKey: "agent_user_id", settingValue: agentId })
      .onConflictDoUpdate({
        target: gameSettings.settingKey,
        set: { settingValue: agentId, updatedAt: new Date() },
      });
  }

  return agentId;
}

/**
 * Ensures a goddess exists as an autonomous AI player and returns her user id.
 *
 * NON-DESTRUCTIVE on the goddess card: unlike ensureAgent, this never flips
 * isNpc, never overwrites her avatar / playerValue / valueFloor / isProtected /
 * credits / hireSlots. It only marks her as an active, fully-onboarded player
 * (isActive / avatarCompleted / onboardingComplete) so the runner and chat
 * treat her like any other AI actor. Goddesses are expected to already exist
 * (seeded by scripts/create-goddess-npcs.ts and preserved across resets via
 * isProtected=1); a missing goddess is created with her canonical value as a
 * fallback so the world stays playable.
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

/**
 * Ensures the complete autonomous AI roster — the 6 AGIs AND the 6 goddesses —
 * and returns definitions paired with IDs. The cron rotates through all 12
 * round-robin, so each AI player (agent or goddess) gets the same gameplay and
 * chat logic on its turn.
 */
export async function ensureAgents(): Promise<Array<AgentDefinition & { id: number }>> {
  const defs = [...AGENT_ROSTER, ...GODDESS_ROSTER];
  const ids = await Promise.all(
    defs.map((def) => (def.isGoddess ? ensureGoddess(def) : ensureAgent(def)))
  );
  return defs.map((def, index) => ({ ...def, id: ids[index] }));
}
