import { db } from "@/db";
import { users, gameSettings } from "@/db/schema";
import { sql, eq, or, and, notInArray } from "drizzle-orm";
import { downloadAndCompressAvatar } from "@/lib/compress-avatar";
import { AGENT_USERNAMES } from "@/lib/agent/roster";
import { generateNpcNameFromMeta, generateRandomNpcName, type NpcPhotoMeta } from "@/lib/npc-names";
import { fetchRandomMoviePoster } from "@/lib/movie-artwork";

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
        notInArray(users.username, AGENT_USERNAMES),
        sql`${users.lastOnlineAt} >= ${cutoff}`
      )
    );
  return Number(row?.count ?? 0);
}

/**
 * Returns the highest owned-player count among all humans (excluding NPCs and
 * the Agent). Used by the Agent to avoid getting too far ahead of real players.
 */
export async function getTopHumanOwnedCount(): Promise<number> {
  // Literal "users"."id" — drizzle renders `${users.id}` unqualified in raw
  // SQL select fields of no-join queries, breaking the correlated subquery.
  const ownedCount = sql<number>`(SELECT COUNT(*)::int FROM ownership o WHERE o.owner_id = "users"."id")`;
  const [row] = await db
    .select({ count: ownedCount.as("owned_count") })
    .from(users)
    .where(and(eq(users.isNpc, 0), notInArray(users.username, AGENT_USERNAMES)))
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

// ── Avatar source alternation ────────────────────────────────────────────
//
// NPC avatars alternate between Unsplash (the original source) and TMDB movie
// posters (the add-on). A single integer in `game_settings` records the parity:
//   0 → next creation uses Unsplash
//   1 → next creation uses TMDB
// The flag flips after each creation attempt, so over time the split is ~50/50.
// If the chosen source fails (network error, all duplicates, rate limit), the
// creation falls back to the OTHER source for that tick — but the parity still
// flips, keeping the long-run ratio close to 1:1.
const PARITY_KEY = "npc_source_parity";

async function getParity(): Promise<0 | 1> {
  const [row] = await db
    .select({ value: gameSettings.settingValue })
    .from(gameSettings)
    .where(eq(gameSettings.settingKey, PARITY_KEY))
    .limit(1);
  // Treat null/missing as 0 (Unsplash first, matching prior behavior).
  return (row?.value ?? 0) === 1 ? 1 : 0;
}

async function flipParity(): Promise<void> {
  const current = await getParity();
  await db
    .insert(gameSettings)
    .values({ settingKey: PARITY_KEY, settingValue: current === 0 ? 1 : 0 })
    .onConflictDoUpdate({
      target: gameSettings.settingKey,
      set: { settingValue: current === 0 ? 1 : 0, updatedAt: new Date() },
    });
}

// Shape returned by both avatar-source helpers below.
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

/**
 * Original avatar source: Unsplash `/photos/random?count=30`. Fetches a batch
 * of 30 random photos, shuffles, and returns the first one that compresses and
 * isn't a duplicate. Triggers the Unsplash download event for attribution.
 */
async function fetchUnsplashAvatar(): Promise<AvatarFetchResult> {
  if (!UNSPLASH_ACCESS_KEY) {
    return { ok: false, reason: "UNSPLASH_ACCESS_KEY is not configured" };
  }

  const MAX_ATTEMPTS = 4;
  let rateLimited = false;
  let authError = false;
  let skipReason: "download" | "duplicate" | "unsplash_error" | null = null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const unsplashRes = await fetch(
        `https://api.unsplash.com/photos/random?count=30`,
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
        console.error(`Unsplash API error (attempt ${i + 1}/${MAX_ATTEMPTS}): HTTP ${unsplashRes.status}`);
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
        console.log(`Unsplash random avatar selected (likes=${Number(photo.likes ?? 0)}) on attempt ${i + 1}/${MAX_ATTEMPTS}`);
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
 * Add-on avatar source: TMDB movie posters. Fetches one random popular movie
 * poster, downloads/compresses it, and dedup-checks against `photo_source_url`
 * (which has a unique index). Returns null on any failure so the caller can
 * fall back to Unsplash for this tick.
 */
async function fetchTmdbAvatar(): Promise<AvatarFetchResult> {
  const poster = await fetchRandomMoviePoster();
  if (!poster) {
    return { ok: false, reason: "TMDB returned no usable movie poster" };
  }

  const compressed = await downloadAndCompressAvatar(poster.imageUrl);
  if (!compressed) {
    return { ok: false, reason: "TMDB poster failed to download/compress" };
  }

  // Dedup by photo_source_url (tmdb-<path>) — the unique index will also
  // enforce this atomically, but the pre-check avoids a wasted insert attempt.
  const [duplicate] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.photoSourceUrl, poster.photoSourceUrl))
    .limit(1);
  if (duplicate) {
    return { ok: false, reason: "TMDB poster already used by another NPC" };
  }

  console.log(`TMDB movie poster selected: "${poster.title}" (${poster.photoSourceUrl})`);
  return {
    ok: true,
    data: {
      avatarUrl: compressed,
      photoAuthorName: poster.photoAuthorName,
      photoAuthorUrl: poster.photoAuthorUrl,
      photoSourceUrl: poster.photoSourceUrl,
      photoMeta: poster.photoMeta,
      photoScore: poster.photoScore,
    },
  };
}

/**
 * Creates a single random NPC player.
 *
 * Avatar source alternates between Unsplash and TMDB movie posters on each
 * call (see the `npc_source_parity` setting above). If the chosen source fails,
 * the other is tried as a fallback for that tick. Called by the scheduled cron
 * job.
 *
 * Returns the created player info or a failure reason.
 */
export async function createRandomPlayer(): Promise<{
  success: boolean;
  message: string;
  player?: { id: number; username: string; avatarUrl: string };
}> {

  try {
    // Avatar source alternation: read parity, try the chosen source first,
    // fall back to the other source if it fails, then flip parity for next
    // time. The picsum.photos last-resort fallback runs if BOTH sources fail.
    const parity = await getParity();
    const primary = parity === 0 ? fetchUnsplashAvatar : fetchTmdbAvatar;
    const fallback = parity === 0 ? fetchTmdbAvatar : fetchUnsplashAvatar;
    const primaryLabel = parity === 0 ? "unsplash" : "tmdb";
    const fallbackLabel = parity === 0 ? "tmdb" : "unsplash";

    // Always flip parity so the next tick uses the other source — even when
    // we fall back. This keeps the long-run split close to 1:1.
    await flipParity();

    let avatarUrl: string | null = null;
    let photoAuthorName: string | null = null;
    let photoAuthorUrl: string | null = null;
    let photoSourceUrl: string | null = null;
    let photoMeta: NpcPhotoMeta | null = null;
    let photoScore = 0;
    let lastFailReason = "no source attempted";

    const primaryResult = await primary();
    if (primaryResult.ok) {
      ({
        avatarUrl,
        photoAuthorName,
        photoAuthorUrl,
        photoSourceUrl,
        photoMeta,
        photoScore,
      } = primaryResult.data);
    } else {
      lastFailReason = `${primaryLabel}: ${primaryResult.reason}`;
      console.warn(`Primary avatar source (${primaryLabel}) failed: ${primaryResult.reason}. Trying fallback (${fallbackLabel}).`);
      const fallbackResult = await fallback();
      if (fallbackResult.ok) {
        ({
          avatarUrl,
          photoAuthorName,
          photoAuthorUrl,
          photoSourceUrl,
          photoMeta,
          photoScore,
        } = fallbackResult.data);
      } else {
        lastFailReason = `${primaryLabel}: ${primaryResult.reason}; ${fallbackLabel}: ${fallbackResult.reason}`;
      }
    }

    if (!avatarUrl) {
      // Both primary and fallback sources failed. Last resort: picsum.photos
      // with a random seed — unique every time, no rate limits, no API key.
      // Not a movie poster or a portrait, but ensures NPC creation never stalls.
      console.warn(
        `Both avatar sources failed (${lastFailReason}). Falling back to picsum.photos.`
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
          //     invocation grabbed the same avatar photo (Unsplash or TMDB) →
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
      message: `Random player "${newPlayer.username}" created with avatar (source: ${photoSourceUrl?.startsWith("tmdb-") ? "TMDB" : photoSourceUrl?.startsWith("picsum-") ? "picsum" : "Unsplash"}).`,
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