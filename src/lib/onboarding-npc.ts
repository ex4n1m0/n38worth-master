import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { downloadAndCompressAvatar } from "@/lib/compress-avatar";

const UNSPLASH_ACCESS_KEY =
  process.env.UNSPLASH_ACCESS_KEY?.trim() ||
  "JnznSdPgkBkZDiNn37x1-tWo77X077dqXp-zCB5DT_M";

const ONBOARDING_QUERIES = [
  "fashion model portrait",
  "luxury fashion model",
  "high fashion editorial",
  "fun portrait smile",
  "happy person lifestyle",
  "action portrait photography",
  "dynamic pose model",
  "cyberpunk portrait",
  "neon lights person",
  "futuristic portrait",
  "sci-fi inspired model",
  "space age fashion",
];

const ONBOARDING_ADJECTIVES = [
  "Fresh", "New", "Starter", "Beginner", "Rookie", "Novice", "Basic", "Simple",
  "Quick", "Swift", "Bright", "Smart", "Wise", "Bold", "Brave", "Kind",
  "Happy", "Lucky", "Sunny", "Golden", "Silver", "Crystal", "Diamond", "Star",
];

const ONBOARDING_NOUNS = [
  "Player", "Trader", "Investor", "Merchant", "Dealer", "Broker", "Agent", "Runner",
  "Hunter", "Gatherer", "Collector", "Keeper", "Guardian", "Watcher", "Seeker", "Finder",
  "Dreamer", "Thinker", "Worker", "Builder", "Maker", "Creator", "Explorer", "Pioneer",
];

function generateOnboardingNpcName(): string {
  const adj = ONBOARDING_ADJECTIVES[Math.floor(Math.random() * ONBOARDING_ADJECTIVES.length)];
  const noun = ONBOARDING_NOUNS[Math.floor(Math.random() * ONBOARDING_NOUNS.length)];
  const num = Math.floor(Math.random() * 999) + 1;
  return `${adj}${noun}${num}`;
}

interface UnsplashAvatar {
  avatarUrl: string;
  photoAuthorName: string | null;
  photoAuthorUrl: string | null;
  photoSourceUrl: string | null;
}

async function fetchUnsplashAvatar(): Promise<UnsplashAvatar | null> {
  if (!UNSPLASH_ACCESS_KEY) return null;

  const queryOffset = Math.floor(Math.random() * ONBOARDING_QUERIES.length);

  for (let i = 0; i < 4; i++) {
    const query = ONBOARDING_QUERIES[(i + queryOffset) % ONBOARDING_QUERIES.length];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const unsplashRes = await fetch(
        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=squarish`,
        {
          headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!unsplashRes.ok) {
        console.error(`Unsplash API error (attempt ${i + 1}):`, unsplashRes.status);
        if (unsplashRes.status === 404 || unsplashRes.status === 422) continue;
        return null;
      }

      const unsplashData = await unsplashRes.json();
      const candidateUrl =
        unsplashData.urls?.regular ||
        unsplashData.urls?.small ||
        unsplashData.urls?.thumb;
      if (!candidateUrl) continue;

      const compressed = await downloadAndCompressAvatar(candidateUrl);
      const finalUrl = compressed || candidateUrl;

      const sourceUrl = unsplashData.links?.html
        ? `${unsplashData.links.html}?utm_source=networth&utm_medium=referral`
        : null;

      // Duplicate check
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
      if (duplicate) continue;

      // Trigger Unsplash download event (fire and forget)
      if (unsplashData.links?.download_location) {
        fetch(unsplashData.links.download_location, {
          headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
        }).catch((err) => console.error("Unsplash download event failed:", err));
      }

      return {
        avatarUrl: finalUrl,
        photoAuthorName:
          unsplashData.user?.name || unsplashData.user?.username || null,
        photoAuthorUrl: unsplashData.user?.links?.html
          ? `${unsplashData.user.links.html}?utm_source=networth&utm_medium=referral`
          : null,
        photoSourceUrl: sourceUrl,
      };
    } catch (err) {
      console.error(`Unsplash fetch error (attempt ${i + 1}):`, err);
      continue;
    }
  }

  return null;
}

async function generateUniqueUsername(): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const username = generateOnboardingNpcName();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    if (existing.length === 0) return username;
  }
  return null;
}

/**
 * Create a single onboarding NPC with an Unsplash avatar.
 * @param isPool If true, creates NPC in the pre-generated pool (isOnboardingPool = 1).
 *               If false, creates NPC already assigned to a player (isOnboardingPool = 0).
 * @returns the created NPC id, or null if creation failed (e.g. Unsplash unavailable).
 */
export async function createOnboardingNpcWithAvatar(
  isPool: boolean = false
): Promise<number | null> {
  const avatar = await fetchUnsplashAvatar();
  if (!avatar) {
    console.error("Could not fetch avatar from Unsplash for onboarding NPC");
    return null;
  }

  const username = await generateUniqueUsername();
  if (!username) {
    console.error("Could not generate unique onboarding NPC username");
    return null;
  }

  const [newNpc] = await db
    .insert(users)
    .values({
      username,
      passwordHash: null,
      avatarUrl: avatar.avatarUrl,
      playerValue: 1,
      credits: 0,
      isActive: 1,
      isVerified: 0,
      isNpc: 1,
      isOnboardingPool: isPool ? 1 : 0,
      photoAuthorName: avatar.photoAuthorName,
      photoAuthorUrl: avatar.photoAuthorUrl,
      photoSourceUrl: avatar.photoSourceUrl,
    })
    .returning({ id: users.id, username: users.username });

  console.log(
    `Created onboarding NPC "${newNpc.username}" (id: ${newNpc.id}, pool: ${isPool})`
  );
  return newNpc.id;
}

/**
 * Create up to `count` onboarding NPCs with avatars for immediate assignment
 * to a user. Returns the list of created NPC ids (may be shorter than `count`
 * if Unsplash fails for some).
 */
export async function createOnboardingNpcsForUser(count: number): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const id = await createOnboardingNpcWithAvatar(false);
    if (id) ids.push(id);
    // Small delay between Unsplash requests to be respectful
    if (i < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return ids;
}
