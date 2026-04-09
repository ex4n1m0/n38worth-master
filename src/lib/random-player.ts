import { db } from "@/db";
import { users } from "@/db/schema";
import { sql, eq, or } from "drizzle-orm";
import { downloadAndCompressAvatar } from "@/lib/compress-avatar";

const UNSPLASH_ACCESS_KEY = "JnznSdPgkBkZDiNn37x1-tWo77X077dqXp-zCB5DT_M";

const PORTRAIT_QUERIES = [
  // Fashion
  "luxury fashion model",
  "high fashion editorial",
  "runway model",
  "fashion photography",
  "street style fashion",
  "haute couture",
  "fashion influencer",
  "glamour model",
  "vogue style",
  "fashion portrait",
  // Fun
  "fun portrait smile",
  "happy person lifestyle",
  "joyful candid photo",
  "party vibes portrait",
  "cheerful model",
  // Action
  "action portrait photography",
  "dynamic pose model",
  "athletic portrait",
  "sporty lifestyle photo",
  "energetic movement portrait",
  // Lust
  "seductive portrait",
  "alluring model photo",
  "sultry editorial",
  "sensual portrait photography",
  "glamour night portrait",
  // Cyber
  "cyberpunk portrait",
  "neon lights person",
  "futuristic cyber model",
  "digital aesthetic portrait",
  "cyber style photography",
  // Future
  "futuristic portrait",
  "sci-fi inspired model",
  "space age fashion",
  "future aesthetic portrait",
  "avant garde futuristic",
  // Techno
  "techno club portrait",
  "electronic music aesthetic",
  "rave culture portrait",
  "techno style model",
  "underground music portrait",
  // Dance
  "dance portrait photography",
  "dancer movement photo",
  "ballet portrait elegant",
  "contemporary dance model",
  "dance performance portrait",
];

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

/**
 * Creates a single random NPC player with an Unsplash avatar.
 * Called by the cron job once every 3 minutes.
 * @param customQuery - Optional custom Unsplash search term.
 * Returns the created player info or null on failure.
 */
export async function createRandomPlayer(customQuery?: string): Promise<{
  success: boolean;
  message: string;
  player?: { id: number; username: string; avatarUrl: string };
}> {
  try {
    // Fetch a unique random image for the avatar
    // Strategy: Try Unsplash first (2 attempts to conserve rate limit)
    let avatarUrl: string | null = null;
    let photoAuthorName: string | null = null;
    let photoAuthorUrl: string | null = null;
    let photoSourceUrl: string | null = null;

    // --- Attempt 1: Unsplash (increased to 6 attempts for better quality with production quota) ---
    // Use custom query if provided (with content_filter=low), otherwise random from PORTRAIT_QUERIES (with content_filter=high)
    const useCustomQuery = customQuery && customQuery.trim().length > 0;
    const sanitizedQuery = useCustomQuery
      ? customQuery!.trim().slice(0, 100).replace(/[<>]/g, "")
      : null;

    const queryOffset = Math.floor(Math.random() * PORTRAIT_QUERIES.length);
    for (let i = 0; i < 6 && !avatarUrl; i++) {
      const query = useCustomQuery
        ? sanitizedQuery!
        : PORTRAIT_QUERIES[(i + queryOffset) % PORTRAIT_QUERIES.length];
      try {
        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        // For custom queries, don't filter by orientation to get more relevant results
        const orientationParam = useCustomQuery ? "" : "&orientation=squarish";
        const unsplashRes = await fetch(
          `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}${orientationParam}`,
          {
            headers: {
              Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
            },
            signal: controller.signal,
          }
        );

        clearTimeout(timeout);

        if (!unsplashRes.ok) {
          // Check rate limit headers for monitoring
          const remaining = unsplashRes.headers.get("X-Ratelimit-Remaining");
          if (remaining !== null && parseInt(remaining) < 100) {
            console.warn(`Unsplash rate limit remaining: ${remaining} requests`);
          }
          console.error(`Unsplash API error (attempt ${i + 1}):`, unsplashRes.status);
          // Continue trying on 404 (no results for query) but break on auth/rate limit errors
          if (unsplashRes.status === 404 || unsplashRes.status === 422) {
            continue;
          }
          break; // Stop on rate limit / auth errors
        }

        const unsplashData = await unsplashRes.json();
        const candidateUrl =
          unsplashData.urls?.regular ||
          unsplashData.urls?.small ||
          unsplashData.urls?.thumb;

        if (!candidateUrl) continue;

        const compressed = await downloadAndCompressAvatar(candidateUrl);
        const finalUrl = compressed || candidateUrl;

        // Check for duplicates using both avatarUrl and photoSourceUrl (Unsplash photo ID)
        const sourceUrl = unsplashData.links?.html
          ? `${unsplashData.links.html}?utm_source=networth&utm_medium=referral`
          : null;

        const [duplicate] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            or(
              eq(users.avatarUrl, finalUrl),
              sourceUrl ? eq(users.photoSourceUrl, sourceUrl) : sql`false`
            )
          )
          .limit(1);

        if (!duplicate) {
          avatarUrl = finalUrl;
          // Capture Unsplash attribution data
          photoAuthorName = unsplashData.user?.name || unsplashData.user?.username || null;
          photoAuthorUrl = unsplashData.user?.links?.html
            ? `${unsplashData.user.links.html}?utm_source=networth&utm_medium=referral`
            : null;
          photoSourceUrl = sourceUrl;
          // Trigger Unsplash download event (required by API guidelines)
          if (unsplashData.links?.download_location) {
            fetch(unsplashData.links.download_location, {
              headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
            }).catch((err) => console.error("Unsplash download event failed:", err));
          }
        }
      } catch (fetchError) {
        console.error(`Unsplash fetch error (attempt ${i + 1}):`, fetchError);
        // Continue to next attempt instead of breaking on network errors
        continue;
      }
    }

    if (!avatarUrl) {
      return {
        success: false,
        message: "Could not fetch a fashion avatar image from Unsplash after multiple attempts",
      };
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
      return {
        success: false,
        message: "Could not generate a unique username after 10 attempts",
      };
    }

    // Create the random player (NPC — no password)
    const startingCredits = 100;
    const [newPlayer] = await db
      .insert(users)
      .values({
        username,
        passwordHash: null,
        avatarUrl,
        credits: startingCredits,
        isActive: 1,
        isVerified: 0,
        isNpc: 1,
        photoAuthorName,
        photoAuthorUrl,
        photoSourceUrl,
      })
      .returning({ id: users.id, username: users.username });

    console.log(`Random player "${username}" (id: ${newPlayer.id}) created successfully.`);

    return {
      success: true,
      message: `Random player "${username}" created with Unsplash avatar.`,
      player: {
        id: newPlayer.id,
        username: newPlayer.username,
        avatarUrl,
      },
    };
  } catch (error) {
    console.error("Random player creation error:", error);
    return { success: false, message: "Failed to create random player" };
  }
}

