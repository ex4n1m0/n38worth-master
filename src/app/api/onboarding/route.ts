import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { OnboardingState } from "@/types/onboarding";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    let avatarCompleted = false;
    let onboardingComplete = false;
    let profession: string | null = null;
    // Default to "done" so a missing tutorial_completed column (migration not
    // run yet) never surfaces the tutorial to anyone.
    let tutorialCompleted = 1;

    try {
      const [user] = await db
        .select({
          avatarCompleted: users.avatarCompleted,
          onboardingComplete: users.onboardingComplete,
          onboardingStarted: users.onboardingStarted,
          avatarUrl: users.avatarUrl,
          playerValue: users.playerValue,
          totalOnlineMinutes: users.totalOnlineMinutes,
          profession: users.profession,
          tutorialCompleted: users.tutorialCompleted,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (user) {
        avatarCompleted = user.avatarCompleted === 1;
        onboardingComplete = user.onboardingComplete === 1;
        profession = user.profession ?? null;
        tutorialCompleted = user.tutorialCompleted;

        console.log(`[onboarding] userId=${userId} avatarCompleted=${avatarCompleted} onboardingComplete=${onboardingComplete} onboardingStarted=${user.onboardingStarted} profession=${profession}`);

        if (!avatarCompleted && user.avatarUrl && user.avatarUrl.startsWith("data:")) {
          avatarCompleted = true;
          await db
            .update(users)
            .set({ avatarCompleted: 1 })
            .where(eq(users.id, userId));
        }

        const hasCustomAvatar = !!user.avatarUrl && user.avatarUrl.startsWith("data:");
        const hasGameActivity = user.playerValue > 1 || user.totalOnlineMinutes > 0;
        const isLikelyExistingPlayer = user.onboardingStarted === 0 && (hasCustomAvatar || hasGameActivity);
        if (!onboardingComplete && isLikelyExistingPlayer) {
          onboardingComplete = true;
          avatarCompleted = true;
          await db
            .update(users)
            .set({ onboardingComplete: 1, avatarCompleted: 1 })
            .where(eq(users.id, userId));
        }
      }
    } catch (dbError) {
      console.log("Onboarding columns may not exist, skipping onboarding:", dbError);
      avatarCompleted = true;
      onboardingComplete = true;
    }

    const state: OnboardingState = {
      avatarCompleted,
      marketUnlocked: avatarCompleted,
      starterNpcIds: [],
      starterNpcOwnedCount: 0,
      onboardingComplete,
      profession,
      professionSelected: !!profession,
      tutorialCompleted,
    };

    console.log(`[onboarding] RETURNING userId=${userId} state=${JSON.stringify(state)}`);
    return NextResponse.json(state);
  } catch (error) {
    console.error("Onboarding fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch onboarding state" },
      { status: 500 }
    );
  }
}