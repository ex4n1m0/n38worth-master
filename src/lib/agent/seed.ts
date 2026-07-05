import { db } from "@/db";
import { users, gameSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const AGENT_USERNAME = "Agent";
export const AGENT_AVATAR_URL = "/aiplayer.png";
const AGENT_ID_KEY = "agent_user_id";

/**
 * Ensures the special "Agent" player exists and returns its user id.
 *
 * The Agent is a normal, vulnerable human-type player (isNpc=0): it appears on
 * the leaderboard, can be hired/owned by others, and is reset on a game win.
 * Its id is cached in `game_settings` so we avoid a username lookup each tick.
 */
export async function ensureAgent(): Promise<number> {
  // 1. Try the cached id first.
  const [cached] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, AGENT_ID_KEY))
    .limit(1);

  if (cached?.value) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, cached.value))
      .limit(1);
    if (existing) return existing.id;
  }

  // 2. Fall back to a username lookup (id may have changed after a reset/reseed).
  const [byName] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, AGENT_USERNAME))
    .limit(1);

  let agentId: number;
  if (byName) {
    agentId = byName.id;
    // Keep the avatar/flags correct in case the row was reset.
    await db
      .update(users)
      .set({ avatarUrl: AGENT_AVATAR_URL, avatarCompleted: 1, isNpc: 0, isActive: 1 })
      .where(eq(users.id, agentId));
  } else {
    // 3. Create the Agent as a normal player with the standard 100 starting credits.
    const [created] = await db
      .insert(users)
      .values({
        username: AGENT_USERNAME,
        passwordHash: null,
        avatarUrl: AGENT_AVATAR_URL,
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

  // Cache the id for subsequent ticks.
  await db
    .insert(gameSettings)
    .values({ settingKey: AGENT_ID_KEY, settingValue: agentId })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: agentId, updatedAt: new Date() },
    });

  return agentId;
}
