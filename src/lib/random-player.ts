import { db } from "@/db";
import { users, ownership, transactions, messages } from "@/db/schema";
import { sql, eq, and, or } from "drizzle-orm";
import { downloadAndCompressAvatar } from "@/lib/compress-avatar";

const UNSPLASH_ACCESS_KEY = "JnznSdPgkBkZDiNn37x1-tWo77X077dqXp-zCB5DT_M";
const PEXELS_API_KEY = "GFaOCSJqSdJaNrEb9Cw9YHgQnjhJjFMurBpVmsZBFYn7bB0jK1bsMB5h";

const PORTRAIT_QUERIES = [
  "woman in lingerie",
  "women lingerie",
  "lingerie model",
  "sexy girl in lingerie",
  "lingerie fashion",
  "black lingerie woman",
  "white lingerie woman",
  "red lingerie model",
  "lace lingerie woman",
  "sheer lingerie",
  "sensual portrait woman",
  "boudoir photography",
  "boudoir woman lingerie",
  "intimate portrait woman",
  "bedroom portrait woman",
  "woman on bed lingerie",
  "moody lighting lingerie",
  "low light boudoir",
  "soft light boudoir",
  "glamour portrait woman",
  "slim female body lingerie",
  "fit woman lingerie",
  "curvy woman lingerie",
  "female body silhouette",
  "female body in shadow",
  "back of woman lingerie",
  "woman torso lingerie",
  "female figure lingerie",
  "close up lingerie details",
  "close up female body lingerie",
  "crop torso lingerie",
  "woman legs lingerie",
  "sitting woman lingerie",
  "standing woman lingerie side view",
  "mirror selfie lingerie",
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
 * Called by the cron job once per day.
 * Returns the created player info or null on failure.
 */
export async function createRandomPlayer(): Promise<{
  success: boolean;
  message: string;
  player?: { id: number; username: string; avatarUrl: string };
}> {
  try {
    // Fetch a unique random image for the avatar
    // Strategy: Try Unsplash first (2 attempts to conserve rate limit),
    // then Pexels as fallback, then picsum.photos as last resort
    let avatarUrl: string | null = null;
    let photoAuthorName: string | null = null;
    let photoAuthorUrl: string | null = null;
    let photoSourceUrl: string | null = null;

    // --- Attempt 1: Unsplash (max 2 attempts to conserve rate limit) ---
    const queryOffset = Math.floor(Math.random() * PORTRAIT_QUERIES.length);
    for (let i = 0; i < 2 && !avatarUrl; i++) {
      const query = PORTRAIT_QUERIES[(i + queryOffset) % PORTRAIT_QUERIES.length];
      try {
        const unsplashRes = await fetch(
          `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=squarish&content_filter=low`,
          {
            headers: {
              Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
            },
          }
        );

        if (!unsplashRes.ok) {
          console.error(`Unsplash API error (attempt ${i + 1}):`, unsplashRes.status);
          break; // Don't retry on rate limit / auth errors
        }

        const unsplashData = await unsplashRes.json();
        const candidateUrl =
          unsplashData.urls?.regular ||
          unsplashData.urls?.small ||
          unsplashData.urls?.thumb;

        if (!candidateUrl) continue;

        const compressed = await downloadAndCompressAvatar(candidateUrl);
        const finalUrl = compressed || candidateUrl;

        const [duplicate] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.avatarUrl, finalUrl))
          .limit(1);

        if (!duplicate) {
          avatarUrl = finalUrl;
          // Capture Unsplash attribution data
          photoAuthorName = unsplashData.user?.name || unsplashData.user?.username || null;
          photoAuthorUrl = unsplashData.user?.links?.html
            ? `${unsplashData.user.links.html}?utm_source=networth&utm_medium=referral`
            : null;
          photoSourceUrl = unsplashData.links?.html
            ? `${unsplashData.links.html}?utm_source=networth&utm_medium=referral`
            : null;
          // Trigger Unsplash download event (required by API guidelines)
          if (unsplashData.links?.download_location) {
            fetch(unsplashData.links.download_location, {
              headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
            }).catch(() => {});
          }
        }
      } catch (fetchError) {
        console.error(`Unsplash fetch error (attempt ${i + 1}):`, fetchError);
        break;
      }
    }

    // --- Attempt 2: Pexels API fallback (max 3 attempts) ---
    if (!avatarUrl) {
      console.log("Unsplash unavailable, trying Pexels...");
      const pexelsQueries = ["woman portrait", "fashion model", "beauty", "girl portrait", "glamour"];
      const pexelsQuery = pexelsQueries[Math.floor(Math.random() * pexelsQueries.length)];
      const randomPage = Math.floor(Math.random() * 20) + 1;

      for (let i = 0; i < 3 && !avatarUrl; i++) {
        try {
          const pexelsRes = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(pexelsQuery)}&per_page=15&page=${randomPage + i}`,
            {
              headers: {
                Authorization: PEXELS_API_KEY,
              },
            }
          );

          if (!pexelsRes.ok) {
            console.error(`Pexels API error (attempt ${i + 1}):`, pexelsRes.status);
            break;
          }

          const pexelsData = await pexelsRes.json();
          const photos = pexelsData.photos || [];

          if (photos.length === 0) continue;

          // Pick a random photo from the results
          const photo = photos[Math.floor(Math.random() * photos.length)];
          const candidateUrl = photo.src?.medium || photo.src?.small || photo.src?.portrait;

          if (!candidateUrl) continue;

          const compressed = await downloadAndCompressAvatar(candidateUrl);
          const finalUrl = compressed || candidateUrl;

          const [duplicate] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.avatarUrl, finalUrl))
            .limit(1);

          if (!duplicate) {
            avatarUrl = finalUrl;
            // Capture Pexels attribution data
            photoAuthorName = photo.photographer || null;
            photoAuthorUrl = photo.photographer_url || null;
            photoSourceUrl = photo.url || null;
          }
        } catch (fetchError) {
          console.error(`Pexels fetch error (attempt ${i + 1}):`, fetchError);
          continue;
        }
      }
    }

    // --- Attempt 3: picsum.photos as last resort (no API key needed) ---
    if (!avatarUrl) {
      console.log("Pexels unavailable, trying picsum.photos...");
      for (let i = 0; i < 5 && !avatarUrl; i++) {
        try {
          const randomId = Math.floor(Math.random() * 1000) + 1;
          const picsumUrl = `https://picsum.photos/id/${randomId}/512/512`;

          const compressed = await downloadAndCompressAvatar(picsumUrl);
          if (!compressed) continue;

          const [duplicate] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.avatarUrl, compressed))
            .limit(1);

          if (!duplicate) {
            avatarUrl = compressed;
            // Fetch picsum info to get author and original Unsplash URL
            try {
              const infoRes = await fetch(`https://picsum.photos/id/${randomId}/info`);
              if (infoRes.ok) {
                const info = await infoRes.json();
                photoAuthorName = info.author || null;
                photoSourceUrl = info.url || `https://picsum.photos/id/${randomId}/512/512`;
              } else {
                photoSourceUrl = `https://picsum.photos/id/${randomId}/512/512`;
              }
            } catch {
              photoSourceUrl = `https://picsum.photos/id/${randomId}/512/512`;
            }
          }
        } catch (fetchError) {
          console.error(`Picsum fetch error (attempt ${i + 1}):`, fetchError);
          continue;
        }
      }
    }

    if (!avatarUrl) {
      return {
        success: false,
        message: "Could not fetch a unique avatar image from any source",
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

/**
 * Delete NPC (card) players that have no owners and were created more than 7 days ago.
 * Called by the same cron job that creates random players.
 */
export async function cleanupUnownedNpcs(): Promise<{
  deleted: number;
  usernames: string[];
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Find NPC players with no owners, created more than 7 days ago
  const staleNpcs = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(
      and(
        eq(users.isNpc, 1),
        sql`${users.createdAt} < ${sevenDaysAgo}`,
        sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = ${users.id}) = 0`
      )
    );

  const deletedUsernames: string[] = [];

  for (const npc of staleNpcs) {
    try {
      // Remove any ownerships where this NPC owns other players
      await db.delete(ownership).where(eq(ownership.ownerId, npc.id));
      // Remove all transactions involving this NPC
      await db.delete(transactions).where(
        or(eq(transactions.buyerId, npc.id), eq(transactions.targetId, npc.id))
      );
      // Remove all messages involving this NPC
      await db.delete(messages).where(
        or(eq(messages.senderId, npc.id), eq(messages.recipientId, npc.id))
      );
      // Delete the NPC user
      await db.delete(users).where(eq(users.id, npc.id));

      deletedUsernames.push(npc.username);
    } catch (err) {
      console.error(`Failed to delete NPC "${npc.username}" (id: ${npc.id}):`, err);
    }
  }

  if (deletedUsernames.length > 0) {
    console.log(`Cleaned up ${deletedUsernames.length} unowned NPC(s): ${deletedUsernames.join(", ")}`);
  }

  return { deleted: deletedUsernames.length, usernames: deletedUsernames };
}