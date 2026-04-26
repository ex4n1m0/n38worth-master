import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { downloadAndCompressAvatar } from "@/lib/compress-avatar";
import { createOnboardingNpcWithAvatar } from "@/lib/onboarding-npc";

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

    // Create 3 fresh onboarding NPCs with unique avatars for this user.
    // This is a best-effort side task — failures must NOT fail the avatar request,
    // since the avatar itself has already been persisted above.
    try {
      const [user] = await db
        .select({ onboardingNpcs: users.onboardingNpcs })
        .from(users)
        .where(eq(users.id, userId));

      const existingNpcs = (user?.onboardingNpcs as number[]) || [];
      if (existingNpcs.length === 0) {
        // Create 3 NPCs in parallel for faster creation
        const npcPromises = [
          createOnboardingNpcWithAvatar(false),
          createOnboardingNpcWithAvatar(false),
          createOnboardingNpcWithAvatar(false),
        ];
        const npcIds = (await Promise.all(npcPromises)).filter((id): id is number => id !== null);

        if (npcIds.length > 0) {
          // Store the NPC IDs in the user's onboarding state
          await db
            .update(users)
            .set({
              onboardingNpcs: npcIds,
              onboardingStarted: 1,
            })
            .where(eq(users.id, userId));

          console.log(`Created ${npcIds.length} fresh NPCs for user ${userId}`);
        }

        // Note: If fewer than 3 NPCs created (Unsplash failure), user can retry by generating a new random avatar
      }
    } catch (npcErr) {
      // Non-fatal: avatar has already been saved. Log and continue.
      console.error("Onboarding NPC creation failed (non-fatal):", npcErr);
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