import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { unsplashAvatarUrl } from "@/lib/hotlink-avatar";

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY?.trim() || "";

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

    if (!UNSPLASH_ACCESS_KEY) {
      console.error("UNSPLASH_ACCESS_KEY is not configured");
      return NextResponse.json(
        { error: "Server misconfiguration: UNSPLASH_ACCESS_KEY is not set" },
        { status: 500 }
      );
    }

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
            // Hotlinked 256px square webp from Unsplash's CDN (see hotlink-avatar).
            const hotlinked = unsplashAvatarUrl(unsplashData.urls);
            if (hotlinked) {
              avatarUrl = hotlinked;
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

    const [preState] = await db
      .select({
        onboardingStarted: users.onboardingStarted,
        onboardingNpcs: users.onboardingNpcs,
      })
      .from(users)
      .where(eq(users.id, userId));
    const isFirstOnboarding =
      preState?.onboardingStarted === 0 &&
      ((preState?.onboardingNpcs as number[]) || []).length === 0;

    await db
      .update(users)
      .set({
        avatarUrl,
        avatarCompleted: 1,
        onboardingStarted: 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return NextResponse.json({
      success: true,
      avatarUrl,
      firstUpload: isFirstOnboarding,
      starterNpcIds: [],
    });
  } catch (error) {
    console.error("Random avatar error:", error);
    return NextResponse.json(
      { error: "Failed to generate random avatar" },
      { status: 500 }
    );
  }
}