import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { createOnboardingNpcsForUser } from "@/lib/onboarding-npc";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    // Check if already assigned
    const [user] = await db
      .select({
        onboardingNpcs: users.onboardingNpcs,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existingNpcs = (user.onboardingNpcs as number[]) || [];
    if (existingNpcs.length > 0) {
      return NextResponse.json({ npcIds: existingNpcs, alreadyAssigned: true });
    }

    // Grab 3 NPCs from the pre-generated pool (avoids Unsplash rate limits)
    const poolNpcs = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isOnboardingPool, 1))
      .limit(3);

    let npcIds: number[] = [];

    if (poolNpcs.length === 3) {
      // Claim these NPCs from the pool
      npcIds = poolNpcs.map((npc) => npc.id);
      await db
        .update(users)
        .set({ isOnboardingPool: 0 })
        .where(
          sql`${users.id} IN (${npcIds.join(",")})`
        );

      console.log(`Assigned ${npcIds.length} pool NPCs to user ${userId}`);
    } else {
      console.warn(`Pool has ${poolNpcs.length}/3 NPCs needed. Creating ${3 - poolNpcs.length} more on-the-fly with avatars.`);
      // Claim whatever pool NPCs are available first
      const claimedIds = poolNpcs.map((npc) => npc.id);
      if (claimedIds.length > 0) {
        await db
          .update(users)
          .set({ isOnboardingPool: 0 })
          .where(sql`${users.id} IN (${claimedIds.join(",")})`);
      }
      // Create the remainder on-the-fly WITH avatars via Unsplash
      const needed = 3 - claimedIds.length;
      const freshIds = await createOnboardingNpcsForUser(needed);
      npcIds = [...claimedIds, ...freshIds];
    }

    // Store the NPC IDs in the user's onboarding state
    await db
      .update(users)
      .set({
        onboardingNpcs: npcIds,
      })
      .where(eq(users.id, userId));

    return NextResponse.json({
      npcIds,
      assigned: true,
      message: poolNpcs.length === 3
        ? "Assigned 3 starter NPCs from pool!"
        : "Created 3 starter NPCs (pool was empty)!",
    });
  } catch (error) {
    console.error("NPC assignment error:", error);
    return NextResponse.json(
      { error: "Failed to assign onboarding NPCs" },
      { status: 500 }
    );
  }
}