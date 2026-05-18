import { db } from "@/db";
import { users } from "@/db/schema";
import { sql, eq, or } from "drizzle-orm";
import { downloadAndCompressAvatar } from "@/lib/compress-avatar";

// Unsplash credentials must be provided via env. No hardcoded fallback — a
// missing key should cause a clear failure rather than silently leaking a
// committed credential.
//
// We .trim() because Vercel's `vercel env add` CLI tends to append a newline
// to values piped over stdin, and a newline in an HTTP header value is a hard
// error (RFC 7230 §3.2.4). Trimming here is defensive, cheap, and invisible.
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY?.trim() || "";

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
 * Returns the minimum interval (in minutes) that should elapse between
 * scheduled random-player creations, based on the current NPC population.
 *
 *   0-599   : every 10 minutes
 *   >=600   : every 24 hours (1 per day to replace deleted ownerless NPCs)
 *
 * Onboarding NPC provisioning does NOT go through this path — onboarding
 * always gets its 3 starter NPCs regardless of the cap.
 */
export function getCreationIntervalMinutes(npcCount: number): number {
  if (npcCount >= 600) return 24 * 60;
  return 10;
}

/**
 * Creates a single random NPC player with an Unsplash avatar.
 * Called by the scheduled cron job.
 *
 * Returns the created player info or a failure reason.
 */
export async function createRandomPlayer(): Promise<{
  success: boolean;
  message: string;
  player?: { id: number; username: string; avatarUrl: string };
}> {

  try {
    if (!UNSPLASH_ACCESS_KEY) {
      console.error("UNSPLASH_ACCESS_KEY is not configured");
      return {
        success: false,
        message: "Server misconfiguration: UNSPLASH_ACCESS_KEY is not set",
      };
    }

    // Fetch a unique random image for the avatar from Unsplash.
    let avatarUrl: string | null = null;
    let photoAuthorName: string | null = null;
    let photoAuthorUrl: string | null = null;
    let photoSourceUrl: string | null = null;

    const queryOffset = Math.floor(Math.random() * PORTRAIT_QUERIES.length);
    const MAX_ATTEMPTS = 6;
    let rateLimited = false;

    for (let i = 0; i < MAX_ATTEMPTS && !avatarUrl; i++) {
      const query = PORTRAIT_QUERIES[(i + queryOffset) % PORTRAIT_QUERIES.length];
      try {
        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const unsplashRes = await fetch(
          `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=squarish`,
          {
            headers: {
              Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
            },
            signal: controller.signal,
          }
        );

        clearTimeout(timeout);

        // Respect rate-limit headers: bail out as soon as we know we're dry.
        const remainingHeader = unsplashRes.headers.get("X-Ratelimit-Remaining");
        const remaining = remainingHeader !== null ? parseInt(remainingHeader, 10) : null;
        if (remaining !== null && !Number.isNaN(remaining)) {
          if (remaining <= 0) {
            console.warn("Unsplash rate limit exhausted — aborting retries");
            rateLimited = true;
            break;
          }
          if (remaining < 100) {
            console.warn(`Unsplash rate limit low: ${remaining} requests remaining`);
          }
        }

        if (!unsplashRes.ok) {
          console.error(`Unsplash API error (attempt ${i + 1}):`, unsplashRes.status);
          // 404/422 are per-query issues — try another query.
          // 429 is rate-limit, 401/403 are auth — stop retrying.
          if (unsplashRes.status === 404 || unsplashRes.status === 422) {
            continue;
          }
          if (unsplashRes.status === 429) {
            rateLimited = true;
          }
          break;
        }

        const unsplashData = await unsplashRes.json();
        const candidateUrl =
          unsplashData.urls?.regular ||
          unsplashData.urls?.small ||
          unsplashData.urls?.thumb;

        if (!candidateUrl) continue;

        const compressed = await downloadAndCompressAvatar(candidateUrl);
        if (!compressed) {
          // Don't store a hot-linked Unsplash CDN URL — it can rot and we
          // lose the offline-safe data URL we normally serve.
          console.warn(
            `Failed to compress Unsplash avatar on attempt ${i + 1}; trying next candidate`
          );
          continue;
        }
        const finalUrl = compressed;

        // Check for duplicates using both avatarUrl and photoSourceUrl (Unsplash photo ID).
        // NOTE: this is best-effort — there's no DB unique constraint, so a
        // concurrent creation could still race past this check. Acceptable at
        // current volume; add a unique index on photo_source_url to harden.
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
          photoAuthorName = unsplashData.user?.name || unsplashData.user?.username || null;
          photoAuthorUrl = unsplashData.user?.links?.html
            ? `${unsplashData.user.links.html}?utm_source=networth&utm_medium=referral`
            : null;
          photoSourceUrl = sourceUrl;
          // Trigger Unsplash download event (required by API guidelines).
          // We await this (with a short timeout) so the request completes
          // before the serverless invocation ends. Previously this was
          // fire-and-forget, which on Vercel's runtime would often be killed
          // mid-flight — violating Unsplash's attribution requirement.
          if (unsplashData.links?.download_location) {
            try {
              const dlController = new AbortController();
              const dlTimeout = setTimeout(() => dlController.abort(), 5000);
              await fetch(unsplashData.links.download_location, {
                headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
                signal: dlController.signal,
              });
              clearTimeout(dlTimeout);
            } catch (err) {
              console.error("Unsplash download event failed:", err);
            }
          }
          console.log(`Unsplash avatar selected using query "${query}"`);
        }
      } catch (fetchError) {
        console.error(`Unsplash fetch error (attempt ${i + 1}):`, fetchError);
        continue;
      }
    }

    if (!avatarUrl) {
      return {
        success: false,
        message: rateLimited
          ? "Unsplash rate limit reached — please try again later"
          : "Could not fetch a fashion avatar image from Unsplash after multiple attempts",
      };
    }

    // Create the player, relying on the DB's unique constraint on username to
    // detect collisions atomically instead of the racy SELECT-then-INSERT
    // pattern. Retry up to 10 times with a fresh name on conflict.
    const startingCredits = 100;
    let newPlayer: { id: number; username: string } | undefined;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 10 && !newPlayer; attempt++) {
      const username = generateRandomUsername();
      try {
        const [row] = await db
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
        newPlayer = row;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        // Postgres unique-violation SQLSTATE 23505 or message containing "unique"
        const isUniqueViolation = msg.includes("23505") || /unique/i.test(msg);
        if (isUniqueViolation) {
          // Distinguish between the two unique constraints we can hit:
          //   - users.username (collision → retry with a fresh name)
          //   - idx_users_photo_source_url_unique (another concurrent cron
          //     invocation grabbed the same Unsplash photo → give up cleanly
          //     so the caller can retry on the next tick with a new photo).
          if (/photo_source_url/i.test(msg)) {
            console.warn(
              `Unsplash photo already used by another NPC (race with concurrent creation). Aborting this tick.`
            );
            return {
              success: false,
              message:
                "Unsplash photo was claimed by a concurrent creation; will retry on next cron tick",
            };
          }
          console.warn(
            `Username collision for "${username}" on attempt ${attempt + 1}, retrying…`
          );
          continue;
        }
        // Unknown error — don't keep hammering.
        throw err;
      }
    }

    if (!newPlayer) {
      const errDetail =
        lastError instanceof Error ? lastError.message : String(lastError);
      console.error(
        "Could not generate a unique username after 10 attempts",
        lastError
      );
      return {
        success: false,
        message: `Could not generate a unique username after 10 attempts (last error: ${errDetail || "unknown"})`,
      };
    }

    console.log(`Random player "${newPlayer.username}" (id: ${newPlayer.id}) created successfully.`);

    return {
      success: true,
      message: `Random player "${newPlayer.username}" created with Unsplash avatar.`,
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
