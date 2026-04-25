import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, rewardHistory } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { capCredits } from "@/lib/safeguards";

const HOURS_24_IN_MS = 24 * 60 * 60 * 1000;

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
    const lastReward = user.lastLoginRewardAt;

    // Check if 24 hours have passed since last reward
    if (lastReward) {
      const timeSinceLastReward = now.getTime() - lastReward.getTime();
      
      if (timeSinceLastReward < HOURS_24_IN_MS) {
        // Calculate time remaining
        const timeRemaining = HOURS_24_IN_MS - timeSinceLastReward;
        const hoursRemaining = Math.floor(timeRemaining / (60 * 60 * 1000));
        const minutesRemaining = Math.floor(
          (timeRemaining % (60 * 60 * 1000)) / (60 * 1000)
        );

        return NextResponse.json({
          success: false,
          message: "Login reward already claimed",
          alreadyClaimed: true,
          timeRemaining: {
            hours: hoursRemaining,
            minutes: minutesRemaining,
            totalMs: timeRemaining,
          },
          nextRewardAt: new Date(lastReward.getTime() + HOURS_24_IN_MS),
        });
      }
    }

    // Calculate reward as 1% of total economy (sum of all players' credits)
    const [economyResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(credits), 0)` })
      .from(users);
    const totalEconomy = Number(economyResult?.total ?? 0);
    const rewardAmount = Math.round(totalEconomy * 0.01 * 100) / 100;

    // Award the login reward (cap to prevent overflow)
    const newCredits = capCredits(Math.round((user.credits + rewardAmount) * 100) / 100);

    await db
      .update(users)
      .set({
        credits: newCredits,
        lastLoginRewardAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    // Log to reward history
    try {
      await db.insert(rewardHistory).values({
        userId,
        type: "login_reward",
        amount: rewardAmount,
        details: JSON.stringify({ totalEconomy }),
      });
    } catch (historyError) {
      console.error("Reward history insert error (login):", historyError);
    }

    return NextResponse.json({
      success: true,
      message: "Login reward claimed!",
      reward: rewardAmount,
      newBalance: newCredits,
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
      const timeSinceLastReward = now.getTime() - lastReward.getTime();
      
      if (timeSinceLastReward < HOURS_24_IN_MS) {
        canClaim = false;
        timeRemaining = HOURS_24_IN_MS - timeSinceLastReward;
        nextRewardAt = new Date(lastReward.getTime() + HOURS_24_IN_MS);
      }
    }

    // Calculate reward as 1% of total economy (sum of all players' credits)
    const [economyResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(credits), 0)` })
      .from(users);
    const totalEconomy = Number(economyResult?.total ?? 0);
    const rewardAmount = Math.round(totalEconomy * 0.01 * 100) / 100;

    return NextResponse.json({
      canClaim,
      lastClaimedAt: lastReward,
      timeRemaining,
      nextRewardAt,
      rewardAmount,
    });
  } catch (error) {
    console.error("Login reward status error:", error);
    return NextResponse.json(
      { error: "Failed to get login reward status" },
      { status: 500 }
    );
  }
}