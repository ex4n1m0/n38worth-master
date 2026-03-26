import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { downloadAndCompressAvatar } from "@/lib/compress-avatar";

const UNSPLASH_ACCESS_KEY = "JnznSdPgkBkZDiNn37x1-tWo77X077dqXp-zCB5DT_M";

function generateRandomUsername(): string {
  const adjectives = [
    "Swift", "Bold", "Lucky", "Chill", "Epic", "Witty", "Brave", "Noble",
    "Keen", "Sly", "Deft", "Wise", "Zany", "Vivid", "Rad", "Cool",
    "Sleek", "Prime", "Elite", "Mega", "Ultra", "Hyper", "Turbo", "Apex",
    "Neon", "Pixel", "Cyber", "Astro", "Nova", "Blaze", "Storm", "Frost",
    "Shadow", "Iron", "Steel", "Golden", "Silver", "Cosmic", "Lunar", "Solar",
  ];
  const nouns = [
    "Trader", "Wolf", "Shark", "Hawk", "Eagle", "Tiger", "Lion", "Bear",
    "Fox", "Ace", "King", "Boss", "Pro", "Star", "Ninja", "Pilot",
    "Knight", "Chief", "Alpha", "Rider", "Hunter", "Ranger", "Phantom", "Viper",
    "Falcon", "Raven", "Phoenix", "Dragon", "Titan", "Rebel", "Maverick", "Nomad",
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 999) + 1;
  return `${adj}${noun}${num}`;
}

export async function POST() {
  try {
    // Fetch a random person image from Unsplash
    let avatarUrl: string | null = null;
    try {
      for (let photoAttempt = 0; photoAttempt < 5; photoAttempt++) {
        try {
          const unsplashRes = await fetch(
            `https://api.unsplash.com/photos/random?query=person+portrait+face&orientation=squarish&content_filter=high`,
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
            console.error(`Unsplash API error (quickplay attempt ${photoAttempt + 1}):`, unsplashRes.status);
            continue; // Try next attempt instead of stopping
          }
        } catch (fetchError) {
          console.error(`Unsplash fetch error (quickplay attempt ${photoAttempt + 1}):`, fetchError);
          continue; // Network error — try again
        }
      }
    } catch {
      // Continue without avatar if Unsplash fails entirely
    }

    // Download and compress the Unsplash image to ≤ 100 KB WebP data URL
    if (avatarUrl) {
      const compressedAvatarUrl = await downloadAndCompressAvatar(avatarUrl);
      if (compressedAvatarUrl) {
        avatarUrl = compressedAvatarUrl;
      }
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
