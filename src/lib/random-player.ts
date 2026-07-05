import { db } from "@/db";
import { users } from "@/db/schema";
import { sql, eq, ne, or, and } from "drizzle-orm";
import { downloadAndCompressAvatar } from "@/lib/compress-avatar";
import { AGENT_USERNAME } from "@/lib/agent/seed";
import { generateNpcNameFromMeta, generateRandomNpcName, type NpcPhotoMeta } from "@/lib/npc-names";

/**
 * Tunables for the dynamic NPC-creation cadence.
 *
 * The scheduled random-player cron normally fires every 3 minutes (see
 * vercel.json). On each tick it consults `getCreationContext()` below to
 * decide whether it should actually create an NPC.
 */
// A human is considered "online" if their lastOnlineAt heartbeat is within
// this many minutes. The /api/me heartbeat is hit on most page loads, and
// online-time accumulation uses a 10-minute window — we use a slightly
// looser 15-minute window here to avoid flapping between online/idle modes
// when a player briefly tabs away.
export const ONLINE_THRESHOLD_MINUTES = 15;
// Interval between NPC creations when at least one human is online.
// The cron ticks every minute (`*/1 * * * *` in vercel.json); we set this just
// under 1 minute so normal cron jitter never skips a tick — i.e. one NPC per
// minute while anyone is online.
export const ACTIVE_INTERVAL_MINUTES = 0.9;
// Interval between NPC creations when nobody is online.
export const IDLE_INTERVAL_MINUTES = 30;
// On the idle→online transition we want to create immediately, but still
// keep a tiny safety gap so we don't accidentally double-create if the cron
// ran a few seconds ago for some other reason.
export const MIN_GAP_ON_WAKE_MINUTES = 1;

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

/**
 * Counts active human users whose `lastOnlineAt` heartbeat is within the
 * online threshold. NPCs and deactivated accounts are excluded.
 *
 * The AI Agent is also excluded: it is an `isNpc=0` player that refreshes its
 * own `lastOnlineAt` every turn, so counting it would create a self-sustaining
 * "online" state that kept the random-NPC cron firing every minute even when
 * no real human is present.
 */
export async function countOnlineHumans(): Promise<number> {
  const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MINUTES * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(users)
    .where(
      and(
        eq(users.isNpc, 0),
        eq(users.isActive, 1),
        ne(users.username, AGENT_USERNAME),
        sql`${users.lastOnlineAt} >= ${cutoff}`
      )
    );
  return Number(row?.count ?? 0);
}

/**
 * Resolves the NPC-creation cadence.
 *
 * Fixed at ONE NPC every 30 minutes (`IDLE_INTERVAL_MINUTES`) regardless of
 * whether any humans are online. The online-human count is still reported for
 * the cron response payload, but no longer affects the interval, and `mode`
 * is always "idle" so the cron's idle→online wake-path never fires.
 *
 * Onboarding NPC provisioning does NOT go through this path — onboarding
 * always gets its starter NPCs regardless of this cadence.
 */
export async function getCreationContext(): Promise<{
  onlineHumans: number;
  intervalMinutes: number;
  mode: "online" | "idle";
}> {
  const onlineHumans = await countOnlineHumans();
  return {
    onlineHumans,
    intervalMinutes: IDLE_INTERVAL_MINUTES,
    mode: "idle",
  };
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
    let photoMeta: NpcPhotoMeta | null = null;
    let photoScore = 0;

    const queryOffset = Math.floor(Math.random() * PORTRAIT_QUERIES.length);
    // Try every query once — one attempt per keyword in the pool.
    const MAX_ATTEMPTS = PORTRAIT_QUERIES.length;
    let rateLimited = false;
    let skipReason: "download" | "duplicate" | "unsplash_error" | null = null;

    for (let i = 0; i < MAX_ATTEMPTS && !avatarUrl; i++) {
      const query = PORTRAIT_QUERIES[(i + queryOffset) % PORTRAIT_QUERIES.length];
      try {
        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        // Fetch a BATCH of random photos in a single request (same rate-limit
        // cost as one) so we can prefer the best-looking / highest-liked one.
        const unsplashRes = await fetch(
          `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=squarish&count=12`,
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
          console.error(`Unsplash API error (attempt ${i + 1}/${MAX_ATTEMPTS}): HTTP ${unsplashRes.status}`);
          skipReason = "unsplash_error";
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
        // `count` returns an array; a bare request returns a single object.
        // Rank the batch by likes (highest-scoring photo first) and take the
        // first candidate that is unique and compresses successfully.
        const batch = (Array.isArray(unsplashData) ? unsplashData : [unsplashData])
          .filter(Boolean)
          .sort((a, b) => (Number(b?.likes ?? 0) || 0) - (Number(a?.likes ?? 0) || 0));

        for (const photo of batch) {
          const candidateUrl =
            photo.urls?.regular || photo.urls?.small || photo.urls?.thumb;
          if (!candidateUrl) continue;

          const compressed = await downloadAndCompressAvatar(candidateUrl);
          if (!compressed) {
            // Don't store a hot-linked Unsplash CDN URL — it can rot and we
            // lose the offline-safe data URL we normally serve.
            skipReason = "download";
            continue;
          }
          const finalUrl = compressed;

          // Check for duplicates using both avatarUrl and photoSourceUrl (Unsplash photo ID).
          // NOTE: this is best-effort — there's no DB unique constraint, so a
          // concurrent creation could still race past this check. Acceptable at
          // current volume; add a unique index on photo_source_url to harden.
          const sourceUrl = photo.links?.html
            ? `${photo.links.html}?utm_source=networth&utm_medium=referral`
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

          if (duplicate) {
            skipReason = "duplicate";
            continue;
          }

          // Found a unique, usable photo (highest-liked available in this batch)
          avatarUrl = finalUrl;
          photoAuthorName = photo.user?.name || photo.user?.username || null;
          photoAuthorUrl = photo.user?.links?.html
            ? `${photo.user.links.html}?utm_source=networth&utm_medium=referral`
            : null;
          photoSourceUrl = sourceUrl;
          photoMeta = {
            tags: photo.tags,
            altDescription: photo.alt_description,
            description: photo.description,
          };
          photoScore = Number(photo.likes ?? 0) || 0;
          // Trigger Unsplash download event (required by API guidelines).
          // We await this (with a short timeout) so the request completes
          // before the serverless invocation ends. Previously this was
          // fire-and-forget, which on Vercel's runtime would often be killed
          // mid-flight — violating Unsplash's attribution requirement.
          if (photo.links?.download_location) {
            try {
              const dlController = new AbortController();
              const dlTimeout = setTimeout(() => dlController.abort(), 5000);
              await fetch(photo.links.download_location, {
                headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
                signal: dlController.signal,
              });
              clearTimeout(dlTimeout);
            } catch (err) {
              console.error("Unsplash download event failed:", err);
            }
          }
          console.log(
            `Unsplash avatar selected using query "${query}" (likes=${photoScore}) on attempt ${i + 1}/${MAX_ATTEMPTS}`
          );
          break;
        }
      } catch (fetchError) {
        console.error(`Unsplash fetch error (attempt ${i + 1}/${MAX_ATTEMPTS}):`, fetchError);
        continue;
      }
    }

    if (!avatarUrl) {
      const reason = rateLimited
        ? "rate_limit"
        : skipReason === "duplicate"
          ? `all ${MAX_ATTEMPTS} attempts returned duplicate photos (DB has many NPCs)`
          : skipReason === "download"
            ? `failed to download/compress all ${MAX_ATTEMPTS} candidate images`
            : skipReason === "unsplash_error"
              ? "Unsplash API returned errors on all attempts"
              : `exhausted ${MAX_ATTEMPTS} attempts without finding a usable photo`;
      console.error(`createRandomPlayer failed: ${reason}`);
      return {
        success: false,
        message: `Could not fetch a unique avatar image from Unsplash (${reason})`,
      };
    }

    // NPCs are always created WITHOUT a profession (hidden card) by design.
    const profession: string | null = null;

    // Create the player, relying on the DB's unique constraint on username to
    // detect collisions atomically instead of the racy SELECT-then-INSERT
    // pattern. Retry up to 10 times with a fresh name on conflict.
    const startingCredits = 100;
    let newPlayer: { id: number; username: string } | undefined;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 10 && !newPlayer; attempt++) {
      // First attempt tries a name derived from the photo metadata. If that
      // collides (small keyword pool), fall back to the classic random name
      // generator whose pool is far larger, reducing repeated collisions.
      const username =
        attempt === 0 ? generateNpcNameFromMeta(photoMeta) : generateRandomNpcName();
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
            photoScore,
            profession,
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
              `Unsplash photo already used by another NPC (race with concurrent creation). Giving up so the next tick retries with a new photo.`
            );
            return {
              success: false,
              message:
                "Unsplash photo was claimed by a concurrent NPC creation; retry on next tick",
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

    console.log(`Random player "${newPlayer.username}" (id: ${newPlayer.id}) created successfully${profession ? ` with profession: ${profession}` : ""}.`);

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