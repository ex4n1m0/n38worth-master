import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, desc, notInArray } from "drizzle-orm";
import { claimLoginReward } from "@/lib/login-reward";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";

const HOURS_24_IN_MS = 24 * 60 * 60 * 1000;
const GODDESS_OF_WEALTH_USERNAME = "Goddess of Wealth";

/**
 * Compute the login reward preview for a given claimer (GET only).
 * The actual claim logic lives in src/lib/login-reward.ts (shared with the
 * mission system's auto-claim on first 20-card unlock).
 */
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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    const result = await claimLoginReward(userId);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        reward: result.reward,
      });
    }

    // Not successful — figure out the right response shape
    if (result.alreadyClaimed) {
      const [fresh] = await db
        .select({ lastLoginRewardAt: users.lastLoginRewardAt })
        .from(users)
        .where(eq(users.id, userId));
      const last = fresh?.lastLoginRewardAt ?? new Date();
      const timeRemaining = Math.max(
        0,
        HOURS_24_IN_MS - (Date.now() - last.getTime())
      );
      return NextResponse.json({
        success: false,
        message: result.message,
        alreadyClaimed: true,
        timeRemaining: {
          hours: Math.floor(timeRemaining / (60 * 60 * 1000)),
          minutes: Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000)),
          totalMs: timeRemaining,
        },
        nextRewardAt: new Date(last.getTime() + HOURS_24_IN_MS),
      });
    }

    if (result.isLeader) {
      return NextResponse.json({
        success: false,
        message: result.message,
        isLeader: true,
        reward: 0,
      });
    }

    return NextResponse.json({ success: false, message: result.message });
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
