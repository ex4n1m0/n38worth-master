/**
 * Server-side login reward claim logic — shared by the /api/game/login-reward
 * endpoint and the mission system (auto-claim on first 20-card unlock).
 *
 * The reward equals the Goddess of Wealth card's CURRENT value, transferred
 * from the richest HUMAN player. The richest human gets nothing (can't
 * transfer to themselves). Cache Keeper perk adds +25% (minted on top).
 */
import { db } from "@/db";
import { users, rewardHistory } from "@/db/schema";
import { and, eq, lte, or, isNull, sql, desc, notInArray } from "drizzle-orm";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";
import { getProfessionPerks } from "@/lib/professionPerks";

const HOURS_24_IN_MS = 24 * 60 * 60 * 1000;
const GODDESS_OF_WEALTH_USERNAME = "Goddess of Wealth";

async function computeLoginReward(claimerId: number) {
  const [richest] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isNpc, 0), eq(users.isActive, 1), notInArray(users.username, [...REMOVED_AGENT_USERNAMES])))
    .orderBy(desc(users.credits))
    .limit(1);

  if (!richest || richest.id === claimerId) {
    return { rewardAmount: 0, sourceUserId: null };
  }

  const [goddess] = await db
    .select({ value: users.playerValue })
    .from(users)
    .where(eq(users.username, GODDESS_OF_WEALTH_USERNAME))
    .limit(1);

  const rewardAmount = Math.max(0, Math.round(Number(goddess?.value ?? 0) * 100) / 100);

  return {
    rewardAmount,
    sourceUserId: rewardAmount > 0 ? richest.id : null,
  };
}

export interface ClaimResult {
  success: boolean;
  reward: number;
  message: string;
  alreadyClaimed?: boolean;
  isLeader?: boolean;
}

/**
 * Claim the daily login reward for a user. Atomically stamps the 24h cooldown
 * via a conditional UPDATE, so concurrent calls can't double-claim.
 *
 * Returns { success: true, reward } on a successful claim, or
 * { success: false, ... } with a reason if the claim can't be made
 * (already claimed within 24h, user is the richest, etc.).
 */
export async function claimLoginReward(userId: number): Promise<ClaimResult> {
  const [user] = await db
    .select({
      id: users.id,
      lastLoginRewardAt: users.lastLoginRewardAt,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) return { success: false, reward: 0, message: "User not found" };
  if (!user.isActive) return { success: false, reward: 0, message: "Account not active" };

  const now = new Date();
  const cutoff = new Date(now.getTime() - HOURS_24_IN_MS);

  if (user.lastLoginRewardAt && user.lastLoginRewardAt > cutoff) {
    return { success: false, reward: 0, message: "Already claimed", alreadyClaimed: true };
  }

  const { rewardAmount, sourceUserId } = await computeLoginReward(userId);

  if (rewardAmount <= 0 || sourceUserId === null) {
    return { success: false, reward: 0, message: "You're #1 — no reward", isLeader: true };
  }

  const perks = await getProfessionPerks(userId);
  const archivistBonus = perks.has("Cache Keeper")
    ? Math.round(rewardAmount * 0.25 * 100) / 100
    : 0;
  const totalReward = rewardAmount + archivistBonus;

  const claimed = await db
    .update(users)
    .set({
      credits: sql`LEAST(${users.credits} + ${totalReward}, ${sql.raw(MAX_CREDITS_SQL)})`,
      lastLoginRewardAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(users.id, userId),
        or(
          isNull(users.lastLoginRewardAt),
          lte(users.lastLoginRewardAt, cutoff)
        )
      )
    )
    .returning({ credits: users.credits });

  if (claimed.length === 0) {
    return { success: false, reward: 0, message: "Already claimed", alreadyClaimed: true };
  }

  // Deduct from the wealthiest other player (transfer, not mint).
  if (rewardAmount > 0 && sourceUserId !== null) {
    await db
      .update(users)
      .set({
        credits: sql`GREATEST(${users.credits} - ${rewardAmount}, 0)`,
        updatedAt: now,
      })
      .where(eq(users.id, sourceUserId));
  }

  try {
    await db.insert(rewardHistory).values({
      userId,
      type: "login_reward",
      amount: totalReward,
      details: JSON.stringify({ sourceUserId, source: "goddess_of_wealth_value", archivistBonus }),
    });
  } catch (historyError) {
    console.error("Reward history insert error (login):", historyError);
  }

  return { success: true, reward: totalReward, message: "Login reward claimed!" };
}
