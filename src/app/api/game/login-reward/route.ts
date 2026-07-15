import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, rewardHistory } from "@/db/schema";
import { and, eq, lte, or, isNull, sql, desc } from "drizzle-orm";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { getProfessionPerks } from "@/lib/professionPerks";

const HOURS_24_IN_MS = 24 * 60 * 60 * 1000;
const GODDESS_OF_WEALTH_USERNAME = "Goddess of Wealth";

/**
 * Compute the login reward for a given claimer.
 *
 * The reward equals the Goddess of Wealth card's CURRENT value, transferred
 * from the richest HUMAN player (isNpc = 0 — this excludes NPC cards,
 * goddesses, and bonus cards, which are all isNpc = 1). It's a transfer, not
 * minted. To give everyone else a chance to catch up, the richest human gets
 * NOTHING: if the claimer IS that player, the reward is 0. Both GET (preview)
 * and POST (claim) use this so they stay in sync.
 */
async function computeLoginReward(claimerId: number) {
  // The single wealthiest HUMAN player (excludes NPC cards, goddesses, bonus cards).
  const [richest] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isNpc, 0), eq(users.isActive, 1)))
    .orderBy(desc(users.credits))
    .limit(1);

  // Richest human gets no reward (can't transfer to themselves); also nothing
  // to give if there are no other eligible human players.
  if (!richest || richest.id === claimerId) {
    return { rewardAmount: 0, sourceUserId: null };
  }

  // Reward amount = the Goddess of Wealth card's current value.
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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    // Get user's current state
    const [user] = await db
      .select({
        id: users.id,
        credits: users.credits,
        lastLoginRewardAt: users.lastLoginRewardAt,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: "Account is not active" },
        { status: 403 }
      );
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - HOURS_24_IN_MS);

    // Fast pre-check so we can return a friendly countdown. The authoritative
    // guard is the conditional UPDATE below, which makes claiming atomic.
    if (user.lastLoginRewardAt && user.lastLoginRewardAt > cutoff) {
      const timeRemaining = Math.max(
        0,
        HOURS_24_IN_MS - (now.getTime() - user.lastLoginRewardAt.getTime())
      );
      return NextResponse.json({
        success: false,
        message: "Login reward already claimed",
        alreadyClaimed: true,
        timeRemaining: {
          hours: Math.floor(timeRemaining / (60 * 60 * 1000)),
          minutes: Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000)),
          totalMs: timeRemaining,
        },
        nextRewardAt: new Date(
          user.lastLoginRewardAt.getTime() + HOURS_24_IN_MS
        ),
      });
    }

    const { rewardAmount, sourceUserId } = await computeLoginReward(userId);

    // The richest human earns nothing — this gives everyone else a chance to
    // catch up. Don't consume their daily claim in that case, so they can claim
    // a real reward once they're no longer on top.
    if (rewardAmount <= 0 || sourceUserId === null) {
      return NextResponse.json({
        success: false,
        message: "You're the top player — no reward to claim while you're #1.",
        isLeader: true,
        reward: 0,
      });
    }

    // Spirit Archivist perk (Recorded Fortunes): +25% login reward. The bonus
    // is minted on top — only the base amount is deducted from the source, so
    // the richest player isn't drained extra.
    const perks = await getProfessionPerks(userId);
    const archivistBonus = perks.has("Spirit Archivist")
      ? Math.round(rewardAmount * 0.25 * 100) / 100
      : 0;
    const totalReward = rewardAmount + archivistBonus;

    // Atomic claim: only awards + stamps the timestamp if the 24h window has
    // actually elapsed. Two concurrent requests can't both match this WHERE
    // clause, so double-claims are impossible even without a transaction.
    const claimed = await db
      .update(users)
      .set({
        credits: sql`LEAST(${users.credits} + ${totalReward}, ${sql.raw(
          MAX_CREDITS_SQL
        )})`,
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
      // Lost the race — someone/something already claimed within the window.
      const [fresh] = await db
        .select({ lastLoginRewardAt: users.lastLoginRewardAt })
        .from(users)
        .where(eq(users.id, userId));
      const last = fresh?.lastLoginRewardAt ?? now;
      return NextResponse.json({
        success: false,
        message: "Login reward already claimed",
        alreadyClaimed: true,
        nextRewardAt: new Date(last.getTime() + HOURS_24_IN_MS),
      });
    }

    // Deduct the reward from the wealthiest other player (money is transferred,
    // not created). Guarded so we never push them below the amount they hold.
    if (rewardAmount > 0 && sourceUserId !== null) {
      await db
        .update(users)
        .set({
          credits: sql`GREATEST(${users.credits} - ${rewardAmount}, 0)`,
          updatedAt: now,
        })
        .where(eq(users.id, sourceUserId));
    }

    // Log to reward history
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

    return NextResponse.json({
      success: true,
      message: "Login reward claimed!",
      reward: totalReward,
      newBalance: Number(claimed[0].credits),
      claimedAt: now,
      nextRewardAt: new Date(now.getTime() + HOURS_24_IN_MS),
    });
  } catch (error) {
    console.error("Login reward error:", error);
    return NextResponse.json(
      { error: "Failed to process login reward" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    const [user] = await db
      .select({
        id: users.id,
        lastLoginRewardAt: users.lastLoginRewardAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    const lastReward = user.lastLoginRewardAt;
    let canClaim = true;
    let timeRemaining = null;
    let nextRewardAt = null;

    if (lastReward) {
      const timeSinceLastReward = Math.max(
        0,
        now.getTime() - lastReward.getTime()
      );

      if (timeSinceLastReward < HOURS_24_IN_MS) {
        canClaim = false;
        timeRemaining = HOURS_24_IN_MS - timeSinceLastReward;
        nextRewardAt = new Date(lastReward.getTime() + HOURS_24_IN_MS);
      }
    }

    // Preview uses the same computation as the claim. The claim (POST) is
    // authoritative — the economy can shift between viewing and claiming, so
    // the awarded amount is always recomputed at claim time.
    const { rewardAmount, sourceUserId } = await computeLoginReward(userId);
    // The current leader (richest player) has no reward to claim.
    const isLeader = rewardAmount <= 0 || sourceUserId === null;

    return NextResponse.json({
      canClaim: canClaim && !isLeader,
      isLeader,
      lastClaimedAt: lastReward,
      timeRemaining,
      nextRewardAt,
      rewardAmount,
      rewardIntervalMs: HOURS_24_IN_MS,
    });
  } catch (error) {
    console.error("Login reward status error:", error);
    return NextResponse.json(
      { error: "Failed to get login reward status" },
      { status: 500 }
    );
  }
}
