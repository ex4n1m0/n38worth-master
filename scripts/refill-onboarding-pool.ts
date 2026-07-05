import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq, sql, or } from "drizzle-orm";
import { downloadAndCompressAvatar } from "../src/lib/compress-avatar";

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY?.trim() || "";

const POOL_SIZE = 3; // Keep 3 NPCs ready in the pool

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
  "Happy", "Lucky", "Sunny", "Golden", "Silver", "Crystal", "Diamond", "Star"
];

const ONBOARDING_NOUNS = [
  "Player", "Trader", "Investor", "Merchant", "Dealer", "Broker", "Agent", "Runner",
  "Hunter", "Gatherer", "Collector", "Keeper", "Guardian", "Watcher", "Seeker", "Finder",
  "Dreamer", "Thinker", "Worker", "Builder", "Maker", "Creator", "Explorer", "Pioneer"
];

function generateOnboardingNpcName(): string {
  const adj = ONBOARDING_ADJECTIVES[Math.floor(Math.random() * ONBOARDING_ADJECTIVES.length)];
  const noun = ONBOARDING_NOUNS[Math.floor(Math.random() * ONBOARDING_NOUNS.length)];
  const num = Math.floor(Math.random() * 999) + 1;
  return `${adj}${noun}${num}`;
}

async function createPoolNpc(): Promise<boolean> {
  // Fetch a random avatar from Unsplash
  let avatarUrl: string | null = null;
  let photoAuthorName: string | null = null;
  let photoAuthorUrl: string | null = null;
  let photoSourceUrl: string | null = null;

  const queryOffset = Math.floor(Math.random() * ONBOARDING_QUERIES.length);
  for (let i = 0; i < 4 && !avatarUrl; i++) {
    const query = ONBOARDING_QUERIES[(i + queryOffset) % ONBOARDING_QUERIES.length];
    try {
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

      if (!unsplashRes.ok) {
        console.error(`Unsplash API error (attempt ${i + 1}):`, unsplashRes.status);
        if (unsplashRes.status === 404 || unsplashRes.status === 422) {
          continue;
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
      const finalUrl = compressed || candidateUrl;

      // Check for duplicates
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
        // Trigger Unsplash download event
        if (unsplashData.links?.download_location) {
          fetch(unsplashData.links.download_location, {
            headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
          }).catch((err) => console.error("Unsplash download event failed:", err));
        }
      }
    } catch (fetchError) {
      console.error(`Unsplash fetch error (attempt ${i + 1}):`, fetchError);
      continue;
    }
  }

  if (!avatarUrl) {
    console.error("Could not fetch avatar from Unsplash");
    return false;
  }

  // Generate unique username
  let username = generateOnboardingNpcName();
  let nameAttempts = 0;
  while (nameAttempts < 10) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    if (existing.length === 0) break;
    username = generateOnboardingNpcName();
    nameAttempts++;
  }

  if (nameAttempts >= 10) {
    console.error("Could not generate unique username");
    return false;
  }

  // Create NPC with isOnboardingPool = 1
  const [newNpc] = await db
    .insert(users)
    .values({
      username,
      passwordHash: null,
      avatarUrl,
      playerValue: 1,
      credits: 0,
      isActive: 1,
      isVerified: 0,
      isNpc: 1,
      isOnboardingPool: 1,
      photoAuthorName,
      photoAuthorUrl,
      photoSourceUrl,
    })
    .returning({ id: users.id, username: users.username });

  console.log(`Created pool NPC "${newNpc.username}" (id: ${newNpc.id})`);
  return true;
}

async function main() {
  if (!UNSPLASH_ACCESS_KEY) {
    throw new Error("UNSPLASH_ACCESS_KEY is not set (add it to .env.local)");
  }
  console.log("Checking onboarding NPC pool...\n");

  // Count current pool NPCs
  const poolNpcs = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.isOnboardingPool, 1));

  console.log(`Pool size: ${poolNpcs.length}/${POOL_SIZE}`);

  if (poolNpcs.length >= POOL_SIZE) {
    console.log("Pool is full. No action needed.");
    process.exit(0);
  }

  const needed = POOL_SIZE - poolNpcs.length;
  console.log(`Need to create ${needed} more pool NPC(s).\n`);

  let created = 0;
  for (let i = 0; i < needed; i++) {
    const success = await createPoolNpc();
    if (success) {
      created++;
    }
    // Small delay between Unsplash requests to be respectful
    if (i < needed - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(`\nDone! Created ${created}/${needed} pool NPC(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});