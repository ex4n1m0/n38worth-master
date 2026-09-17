import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { unsplashAvatarUrl } from "@/lib/hotlink-avatar";
import { recordSignup } from "@/lib/analytics";

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY?.trim() || "";

const QUICKPLAY_QUERIES = [
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
  // Lust
  "seductive portrait",
  "alluring model photo",
  "glamour night portrait",
  // Cyber
  "cyberpunk portrait",
  "neon lights person",
  "digital aesthetic portrait",
  // Future
  "futuristic portrait",
  "sci-fi inspired model",
  "space age fashion",
  // Techno
  "techno club portrait",
  "electronic music aesthetic",
  "rave culture portrait",
  // Dance
  "dance portrait photography",
  "dancer movement photo",
  "contemporary dance model",
];

function generateRandomUsername(): string {
  const adjectives = [
    "Swift", "Bold", "Lucky", "Chill", "Epic", "Witty", "Brave", "Prime",
    "Keen", "Sly", "Deft", "Wise", "Zany", "Vivid", "Rad", "Cool",
    "Sleek", "Prime", "Elite", "Mega", "Ultra", "Hyper", "Turbo", "Apex",
    "Neon", "Pixel", "Cyber", "Astro", "Nova", "Blaze", "Storm", "Frost",
    "Shadow", "Iron", "Steel", "Golden", "Silver", "Cosmic", "Lunar", "Solar",
  ];
  const nouns = [
    "Trader", "Wolf", "Shark", "Hawk", "Eagle", "Tiger", "Lion", "Bear",
    "Fox", "Ace", "King", "Boss", "Pro", "Star", "Ninja", "Pilot",
    "Kernel", "Chief", "Alpha", "Rider", "Hunter", "Ranger", "Phantom", "Viper",
    "Falcon", "Raven", "Phoenix", "Glitch", "Titan", "Rebel", "Maverick", "Nomad",
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 999) + 1;
  return `${adj}${noun}${num}`;
}

export async function POST() {
  try {
    if (!UNSPLASH_ACCESS_KEY) {
      console.error("UNSPLASH_ACCESS_KEY is not configured");
      return NextResponse.json(
        { error: "Server misconfiguration: UNSPLASH_ACCESS_KEY is not set" },
        { status: 500 }
      );
    }

    // Fetch a random person image from Unsplash
    // Increased to 8 attempts for better quality with production quota (5000 calls/hour)
    let avatarUrl: string | null = null;
    try {
      for (let photoAttempt = 0; photoAttempt < 8; photoAttempt++) {
        try {
          const query = QUICKPLAY_QUERIES[Math.floor(Math.random() * QUICKPLAY_QUERIES.length)];
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
            // Check rate limit headers for monitoring
            const remaining = unsplashRes.headers.get("X-Ratelimit-Remaining");
            if (remaining !== null && parseInt(remaining) < 100) {
              console.warn(`Unsplash rate limit remaining: ${remaining} requests`);
            }
            console.error(`Unsplash API error (quickplay attempt ${photoAttempt + 1}):`, unsplashRes.status);
            // Continue trying on 404/422 but break on auth/rate limit errors
            if (unsplashRes.status === 404 || unsplashRes.status === 422) {
              continue;
            }
            break; // Stop on rate limit / auth errors
          }
        } catch (fetchError) {
          console.error(`Unsplash fetch error (quickplay attempt ${photoAttempt + 1}):`, fetchError);
          continue; // Network error — try again
        }
      }
    } catch {
      // Continue without avatar if Unsplash fails entirely
    }

    // Generate a unique username
    let username = generateRandomUsername();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username));

      if (existing.length === 0) break;
      username = generateRandomUsername();
      attempts++;
    }

    if (attempts >= 10) {
      return NextResponse.json(
        { error: "Could not generate a unique username. Please try again." },
        { status: 500 }
      );
    }

    // Generate a random password
    const randomPassword = `qp_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const passwordHash = await bcrypt.hash(randomPassword, 12);

    // Create the quick play player
    const startingCredits = 100;
    const [newPlayer] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        avatarUrl,
        credits: startingCredits,
        isActive: 1,
        isVerified: 0,
      })
      .returning({ id: users.id, username: users.username });

    // Attribute the quick-play signup to its acquisition channel (best-effort).
    await recordSignup(newPlayer.username);

    console.log(`Quick play player "${username}" (id: ${newPlayer.id}) created successfully.`);

    return NextResponse.json({
      success: true,
      username: newPlayer.username,
      password: randomPassword,
    });
  } catch (error) {
    console.error("Quick play error:", error);
    return NextResponse.json(
      { error: "Failed to create quick play account" },
      { status: 500 }
    );
  }
}
