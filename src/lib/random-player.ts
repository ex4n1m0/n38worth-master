import { db } from "@/db";
import { users } from "@/db/schema";
import { sql, eq, or, and, notInArray } from "drizzle-orm";
import { downloadAndCompressAvatar } from "@/lib/compress-avatar";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";
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
// Interval between NPC creations when at least one human is online: ~3 minutes.
// The cron ticks every minute (`*/1 * * * *` in vercel.json); we set this just
// under 3 so normal cron jitter never pushes creation onto the following tick
// (which would stretch it toward 4 min). Effectively one NPC every 3 minutes
// while anyone is online.
export const ACTIVE_INTERVAL_MINUTES = 2.9;
// Interval between NPC creations when nobody is online: one NPC every 30 minutes.
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

// Broad, high-yield portrait queries. Each of these matches a large pool of
// squarish portraits on Unsplash, so we find fresh (never-used) photos easily
// and almost never hit a 404/empty result. Narrow multi-word "vibe" queries
// (e.g. "space age fashion") were removed — they matched tiny pools, 404'd
// often, and exhausted the unique-photo pool quickly.
// No query keywords — we fetch completely random photos from Unsplash's entire
// library. This gives us access to millions of photos instead of a narrow pool
// of portrait results that gets exhausted after a few thousand NPCs.
// See: https://unsplash.com/documentation#get-a-random-photo

/**
 * Counts active human users whose `lastOnlineAt` heartbeat is within the
 * online threshold. NPCs and deactivated accounts are excluded.
 *
 * The removed support Agent is also excluded so an old database row can never
 * create a self-sustaining "online" state without a real human present.
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
        notInArray(users.username, [...REMOVED_AGENT_USERNAMES]),
        sql`${users.lastOnlineAt} >= ${cutoff}`
      )
    );
  return Number(row?.count ?? 0);
}

/**
 * Returns the highest owned-player count among all humans (excluding NPCs and
 * the removed Agent). Used by goddesses to avoid getting too far ahead of real players.
 */
export async function getTopHumanOwnedCount(): Promise<number> {
  // Literal "users"."id" — drizzle renders `${users.id}` unqualified in raw
  // SQL select fields of no-join queries, breaking the correlated subquery.
  const ownedCount = sql<number>`(SELECT COUNT(*)::int FROM ownership o WHERE o.owner_id = "users"."id")`;
  const [row] = await db
    .select({ count: ownedCount.as("owned_count") })
    .from(users)
    .where(and(eq(users.isNpc, 0), notInArray(users.username, [...REMOVED_AGENT_USERNAMES])))
    .orderBy(sql`${ownedCount} DESC`)
    .limit(1);
  return Number(row?.count ?? 0);
}

/**
 * Resolves the NPC-creation cadence based on whether any real humans are online:
 *   - online (>= 1 human): one NPC every ~3 minutes (`ACTIVE_INTERVAL_MINUTES`).
 *   - idle (nobody online): one NPC every 30 minutes (`IDLE_INTERVAL_MINUTES`).
 *
 * Returning `mode: "online"` when humans are present also re-enables the cron's
 * idle→online wake-path, so the first NPC lands promptly when someone shows up
 * instead of waiting out a leftover idle interval.
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
  const online = onlineHumans > 0;
  return {
    onlineHumans,
    intervalMinutes: online ? ACTIVE_INTERVAL_MINUTES : IDLE_INTERVAL_MINUTES,
    mode: online ? "online" : "idle",
  };
}

// Shape returned by the avatar-source helper below.
interface AvatarFetch {
  avatarUrl: string;
  photoAuthorName: string | null;
  photoAuthorUrl: string | null;
  photoSourceUrl: string | null;
  photoMeta: NpcPhotoMeta | null;
  photoScore: number;
}
// Human-readable failure reason, surfaced in the cron log + the returned
// `message` field. Kept as a tuple return so the caller can log without
// inspecting internals.
type AvatarFetchResult =
  | { ok: true; data: AvatarFetch }
  | { ok: false; reason: string };

// Portrait-style queries used when generating NPC avatars. We rotate through
// several phrases instead of relying on the single word "model" because
// `/photos/random?query=...` can return 404/empty for ambiguous one-word terms
// (likely flagged or filtered by Unsplash's content-safety/search pool).
const NPC_PHOTO_QUERIES = [
  "fashion model portrait",
  "portrait photography",
  "studio portrait model",
  "editorial portrait",
  "lifestyle portrait",
  "model portrait",
];

/**
 * Avatar source: Unsplash `/photos/random?count=30`. Fetches a batch
 * of 30 random photos, shuffles, and returns the first one that compresses and
 * isn't a duplicate. Triggers the Unsplash download event for attribution.
 *
 * `query` can be a single term or an array of terms. When an array is supplied,
 * a random term is used for each attempt, widening the pool and avoiding a
 * single failing keyword. When omitted, photos are completely random from
 * Unsplash's entire library.
 */
async function fetchUnsplashAvatar(query?: string | string[]): Promise<AvatarFetchResult> {
  if (!UNSPLASH_ACCESS_KEY) {
    return { ok: false, reason: "UNSPLASH_ACCESS_KEY is not configured" };
  }

  const queries = Array.isArray(query) ? query : query ? [query] : [];

  const MAX_ATTEMPTS = 4;
  let rateLimited = false;
  let authError = false;
  let skipReason: "download" | "duplicate" | "unsplash_error" | null = null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const selectedQuery = queries.length > 0
      ? queries[Math.floor(Math.random() * queries.length)]
      : undefined;
    const queryString = selectedQuery ? `&query=${encodeURIComponent(selectedQuery)}` : "";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const unsplashRes = await fetch(
        `https://api.unsplash.com/photos/random?count=30${queryString}`,
        {
          headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

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
        console.error(`Unsplash API error (attempt ${i + 1}/${MAX_ATTEMPTS}, query="${selectedQuery ?? "none"}"): HTTP ${unsplashRes.status}`);
        skipReason = "unsplash_error";
        if (unsplashRes.status === 404 || unsplashRes.status === 422) continue;
        if (unsplashRes.status === 429) rateLimited = true;
        if (unsplashRes.status === 401 || unsplashRes.status === 403) authError = true;
        break;
      }

      const unsplashData = await unsplashRes.json();
      const batch = (Array.isArray(unsplashData) ? unsplashData : [unsplashData])
        .filter(Boolean)
        .sort(() => Math.random() - 0.5);

      if (batch.length === 0) {
        console.warn(`Unsplash returned empty photo batch (attempt ${i + 1}/${MAX_ATTEMPTS}, query="${selectedQuery ?? "none"}")`);
        skipReason = "unsplash_error";
        continue;
      }

      for (const photo of batch) {
        const candidateUrl =
          photo.urls?.regular || photo.urls?.small || photo.urls?.thumb;
        if (!candidateUrl) continue;

        const compressed = await downloadAndCompressAvatar(candidateUrl);
        if (!compressed) {
          skipReason = "download";
          continue;
        }
        const finalUrl = compressed;

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

        // Trigger Unsplash download event (required by API guidelines).
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
        console.log(`Unsplash random avatar selected (query="${selectedQuery ?? "none"}", likes=${Number(photo.likes ?? 0)}) on attempt ${i + 1}/${MAX_ATTEMPTS}`);
        return {
          ok: true,
          data: {
            avatarUrl: finalUrl,
            photoAuthorName: photo.user?.name || photo.user?.username || null,
            photoAuthorUrl: photo.user?.links?.html
              ? `${photo.user.links.html}?utm_source=networth&utm_medium=referral`
              : null,
            photoSourceUrl: sourceUrl,
            photoMeta: {
              tags: photo.tags,
              altDescription: photo.alt_description,
              description: photo.description,
            },
            photoScore: Number(photo.likes ?? 0) || 0,
          },
        };
      }
    } catch (fetchError) {
      console.error(`Unsplash fetch error (attempt ${i + 1}/${MAX_ATTEMPTS}):`, fetchError);
      continue;
    }
  }

  const reason = authError
    ? "auth_error (invalid/unauthorized UNSPLASH_ACCESS_KEY)"
    : rateLimited
      ? "rate_limit (Unsplash hourly limit hit)"
      : skipReason === "duplicate"
        ? "all attempts returned duplicate photos"
        : skipReason === "download"
          ? "failed to download/compress all candidate images"
          : skipReason === "unsplash_error"
            ? "Unsplash API returned errors on all attempts"
            : "exhausted all attempts without finding a usable photo";
  return { ok: false, reason };
}

/**
 * Creates a single random NPC player.
 *
 * Avatar source: Unsplash random photos. First tries a set of portrait-style
 * queries (including "model" variants) to get portrait-like results. If that
 * fails (no matches, all duplicates, rate limit), retries with no keyword
 * (completely random from Unsplash's entire library). If Unsplash fails
 * entirely, falls back to picsum.photos as a last resort so NPC creation never
 * stalls. Called by the scheduled cron job.
 *
 * Returns the created player info or a failure reason.
 */
export async function createRandomPlayer(): Promise<{
  success: boolean;
  message: string;
  player?: { id: number; username: string; avatarUrl: string };
}> {

  try {
    let avatarUrl: string | null = null;
    let photoAuthorName: string | null = null;
    let photoAuthorUrl: string | null = null;
    let photoSourceUrl: string | null = null;
    let photoMeta: NpcPhotoMeta | null = null;
    let photoScore = 0;
    let lastFailReason = "no source attempted";

    // First attempt: portrait-style queries (rotated) for avatar photos.
    const modelResult = await fetchUnsplashAvatar(NPC_PHOTO_QUERIES);
    if (modelResult.ok) {
      ({
        avatarUrl,
        photoAuthorName,
        photoAuthorUrl,
        photoSourceUrl,
        photoMeta,
        photoScore,
      } = modelResult.data);
    } else {
      lastFailReason = `unsplash(portrait queries): ${modelResult.reason}`;
      console.warn(`Unsplash portrait queries failed: ${modelResult.reason}. Retrying without keyword.`);
    }

    // Second attempt: no keyword (completely random photos).
    if (!avatarUrl) {
      const randomResult = await fetchUnsplashAvatar();
      if (randomResult.ok) {
        ({
          avatarUrl,
          photoAuthorName,
          photoAuthorUrl,
          photoSourceUrl,
          photoMeta,
          photoScore,
        } = randomResult.data);
      } else {
        lastFailReason = `unsplash: ${randomResult.reason}`;
        console.warn(`Unsplash random (no keyword) failed: ${randomResult.reason}`);
      }
    }

    if (!avatarUrl) {
      // Unsplash failed. Last resort: picsum.photos with a random seed —
      // unique every time, no rate limits, no API key. Ensures NPC creation
      // never stalls.
      console.warn(
        `Unsplash avatar source failed (${lastFailReason}). Falling back to picsum.photos.`
      );
      try {
        const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const compressed = await downloadAndCompressAvatar(
          `https://picsum.photos/seed/${seed}/200/200`
        );
        if (compressed) {
          avatarUrl = compressed;
          photoAuthorName = "Lorem Picsum";
          photoAuthorUrl = "https://picsum.photos/";
          photoSourceUrl = `picsum-${seed}`;
          photoMeta = null;
          photoScore = 0;
          console.log("NPC avatar created using picsum.photos fallback");
        }
      } catch (fallbackError) {
        console.error("picsum.photos fallback also failed:", fallbackError);
      }
    }

    if (!avatarUrl) {
      console.error(`createRandomPlayer failed: ${lastFailReason}`);
      return {
        success: false,
        message: `Could not fetch a unique avatar image (${lastFailReason})`,
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
          //     invocation grabbed the same avatar photo (Unsplash) →
          //     give up cleanly so the caller retries on the next tick).
          if (/photo_source_url/i.test(msg)) {
            console.warn(
              `Avatar photo already used by another NPC (race with concurrent creation). Giving up so the next tick retries with a new photo.`
            );
            return {
              success: false,
              message:
                "Avatar photo was claimed by a concurrent NPC creation; retry on next tick",
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
      message: `Random player "${newPlayer.username}" created with avatar (source: ${photoSourceUrl?.startsWith("picsum-") ? "picsum" : "Unsplash"}).`,
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