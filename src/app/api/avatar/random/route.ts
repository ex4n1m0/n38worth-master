import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { downloadAndCompressAvatar } from "@/lib/compress-avatar";
import { createOnboardingNpcsForUser } from "@/lib/onboarding-npc";

const UNSPLASH_ACCESS_KEY = "JnznSdPgkBkZDiNn37x1-tWo77X077dqXp-zCB5DT_M";

const AVATAR_QUERIES = [
  // Fashion
  "fashion model portrait",
  "luxury fashion model",
  "high fashion editorial",
  // Fun
  "fun portrait smile",
  "happy person lifestyle",
  "party vibes portrait",
  // Action
  "action portrait photography",
  "dynamic pose model",
  "athletic portrait",
  // Cyber
  "cyberpunk portrait",
  "neon lights person",
  "digital aesthetic portrait",
  // Futuristic
  "futuristic portrait",
  "sci-fi inspired model",
  "space age fashion",
];

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = Number(session.user.id);

    // Fetch a random person image from Unsplash
    let avatarUrl: string | null = null;
    try {
      for (let photoAttempt = 0; photoAttempt < 8; photoAttempt++) {
        try {
          const query = AVATAR_QUERIES[Math.floor(Math.random() * AVATAR_QUERIES.length)];
          const unsplashRes = await fetch(
            `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=squarish`,
            {
              headers: {
                Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
              },
            }
          );

          if (unsplashRes.ok) {
            const unsplashData = await unsplashRes.json();
            const candidateUrl = unsplashData.urls?.regular || unsplashData.urls?.small || unsplashData.urls?.thumb || null;
            if (candidateUrl) {
              avatarUrl = candidateUrl;
              break;
            }
          } else {
            console.error(`Unsplash API error (attempt ${photoAttempt + 1}):`, unsplashRes.status);
            if (unsplashRes.status === 404 || unsplashRes.status === 422) {
              continue;
            }
            break;
          }
        } catch (fetchError) {
          console.error(`Unsplash fetch error (attempt ${photoAttempt + 1}):`, fetchError);
          continue;
        }
      }
    } catch {
      // Continue without avatar if Unsplash fails entirely
    }

    if (!avatarUrl) {
      return NextResponse.json(
        { error: "Could not fetch a random avatar from Unsplash" },
        { status: 500 }
      );
    }

    // Download and compress the Unsplash image to ≤ 100 KB WebP data URL
    const compressedAvatarUrl = await downloadAndCompressAvatar(avatarUrl);
    if (compressedAvatarUrl) {
      avatarUrl = compressedAvatarUrl;
    }

    // Update the user's avatar
    await db
      .update(users)
      .set({
        avatarUrl,
        avatarCompleted: 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Assign onboarding NPCs from pre-generated pool (avoids Unsplash rate limits)
    const [user] = await db
      .select({ onboardingNpcs: users.onboardingNpcs })
      .from(users)
      .where(eq(users.id, userId));

    const existingNpcs = (user?.onboardingNpcs as number[]) || [];
    if (existingNpcs.length === 0) {
      // Grab 3 NPCs from the pre-generated pool
      const poolNpcs = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.isOnboardingPool, 1))
        .limit(3);

      if (poolNpcs.length === 3) {
        // Claim these NPCs from the pool
        const npcIds = poolNpcs.map((npc) => npc.id);
        await db
          .update(users)
          .set({ isOnboardingPool: 0 })
          .where(
            sql`${users.id} IN (${npcIds.join(",")})`
          );

        // Store the NPC IDs in the user's onboarding state
        await db
          .update(users)
          .set({ onboardingNpcs: npcIds })
          .where(eq(users.id, userId));

        console.log(`Assigned ${npcIds.length} pool NPCs to user ${userId}`);
      } else {
        console.warn(`Pool has ${poolNpcs.length}/3 NPCs needed. Creating ${3 - poolNpcs.length} more on-the-fly with avatars.`);
        // Claim whatever pool NPCs are available first
        const claimedIds: number[] = poolNpcs.map((npc) => npc.id);
        if (claimedIds.length > 0) {
          await db
            .update(users)
            .set({ isOnboardingPool: 0 })
            .where(sql`${users.id} IN (${claimedIds.join(",")})`);
        }
        // Create the remainder on-the-fly WITH avatars via Unsplash
        const needed = 3 - claimedIds.length;
        const freshIds = await createOnboardingNpcsForUser(needed);
        const npcIds = [...claimedIds, ...freshIds];
        await db
          .update(users)
          .set({ onboardingNpcs: npcIds })
          .where(eq(users.id, userId));
      }
    }

    return NextResponse.json({
      success: true,
      avatarUrl,
    });
  } catch (error) {
    console.error("Random avatar error:", error);
    return NextResponse.json(
      { error: "Failed to generate random avatar" },
      { status: 500 }
    );
  }
}