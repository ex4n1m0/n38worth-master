import { db } from "@/db";
import { users, gameSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  AGENT_ROSTER,
  AGENT_USERNAME,
  type AgentDefinition,
} from "@/lib/agent/roster";

export {
  AGENT_ROSTER,
  AGENT_USERNAME,
  AGENT_AVATAR_URL,
  AGENT_USERNAMES,
  getAgentDefinition,
  isAgentUsername,
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

/** Ensures the complete AGI roster and returns definitions paired with IDs. */
export async function ensureAgents(): Promise<Array<AgentDefinition & { id: number }>> {
  const ids = await Promise.all(AGENT_ROSTER.map((agent) => ensureAgent(agent)));
  return AGENT_ROSTER.map((agent, index) => ({ ...agent, id: ids[index] }));
}
