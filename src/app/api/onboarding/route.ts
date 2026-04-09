import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { OnboardingState } from "@/types/onboarding";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    // Try to fetch onboarding state - columns may not exist yet
    let avatarCompleted = false;
    let starterNpcIds: number[] = [];
    let onboardingComplete = false;
    let actualOwnedCount = 0;

    try {
      const [user] = await db
        .select({
          avatarCompleted: users.avatarCompleted,
          onboardingNpcs: users.onboardingNpcs,
          onboardingOwnedCount: users.onboardingOwnedCount,
          onboardingComplete: users.onboardingComplete,
          avatarUrl: users.avatarUrl,
          playerValue: users.playerValue,
          totalOnlineMinutes: users.totalOnlineMinutes,
        })
        .from(users)
        .where(eq(users.id, userId));

      if (user) {
        starterNpcIds = (user.onboardingNpcs as number[]) || [];
        avatarCompleted = user.avatarCompleted === 1;
        onboardingComplete = user.onboardingComplete === 1;

        // For players who have a custom uploaded avatar (data: URL) but avatarCompleted is 0,
        // auto-fix the flag. This handles edge cases where the flag wasn't set properly.
        // Note: Unsplash URLs don't count - only data: URLs mean the user uploaded their own.
        if (!avatarCompleted && user.avatarUrl && user.avatarUrl.startsWith("data:")) {
          avatarCompleted = true;
          await db
            .update(users)
            .set({ avatarCompleted: 1 })
            .where(eq(users.id, userId));
        }

        // For existing/current players: if they have no onboarding NPCs assigned,
        // they were created before the onboarding system existed.
        // Automatically mark onboarding as complete so they don't see the onboarding flow.
        // New players always get NPCs assigned during their first avatar upload.
        // We distinguish existing players from brand-new ones by checking for any activity:
        // having a custom uploaded avatar (data: URL), a player value > 1, or any online time.
        // Note: Unsplash avatar URLs don't count since all new players get one by default.
        const hasCustomAvatar = !!user.avatarUrl && user.avatarUrl.startsWith("data:");
        const isExistingPlayer = hasCustomAvatar || user.playerValue > 1 || user.totalOnlineMinutes > 0;
        if (!onboardingComplete && (!starterNpcIds || starterNpcIds.length === 0) && isExistingPlayer) {
          onboardingComplete = true;
          avatarCompleted = true;
          await db
            .update(users)
            .set({ onboardingComplete: 1, avatarCompleted: 1 })
            .where(eq(users.id, userId));
        }

        // Recalculate owned count from ownership table to ensure accuracy
        if (starterNpcIds.length > 0) {
          const ownedNpcs = await db
            .select({ ownedId: ownership.ownedId })
            .from(ownership)
            .where(eq(ownership.ownerId, userId));

          const ownedIds = new Set(ownedNpcs.map((o) => o.ownedId));
          actualOwnedCount = starterNpcIds.filter((id) => ownedIds.has(id)).length;

          // Update the count in DB if it's different
          if (actualOwnedCount !== user.onboardingOwnedCount) {
            await db
              .update(users)
              .set({
                onboardingOwnedCount: actualOwnedCount,
                onboardingComplete: actualOwnedCount >= 3 ? 1 : 0,
              })
              .where(eq(users.id, userId));
          }
        }
      }
    } catch (dbError) {
      // Onboarding columns may not exist yet - mark as complete for all existing players
      // since the onboarding system isn't fully set up
      console.log("Onboarding columns may not exist, skipping onboarding:", dbError);
      avatarCompleted = true;
      onboardingComplete = true;
    }

    const state: OnboardingState = {
      avatarCompleted,
      marketUnlocked: avatarCompleted,
      starterNpcIds,
      starterNpcOwnedCount: Math.min(actualOwnedCount, 3),
      onboardingComplete: onboardingComplete || actualOwnedCount >= 3,
    };

    return NextResponse.json(state);
  } catch (error) {
    console.error("Onboarding fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch onboarding state" },
      { status: 500 }
    );
  }
}
