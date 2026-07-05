import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { downloadAndCompressAvatar } from "@/lib/compress-avatar";
import { generateNpcNameFromMeta, generateRandomNpcName, type NpcPhotoMeta } from "@/lib/npc-names";

// Unsplash credentials must be provided via env. No hardcoded fallback — a
// missing key should cause a clear failure rather than silently leaking a
// committed credential.
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY?.trim() || "";

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

interface NpcAvatar {
  avatarUrl: string;
  photoAuthorName: string | null;
  photoAuthorUrl: string | null;
  photoSourceUrl: string | null;
  photoScore: number;
  tags?: Array<{ title?: string | null }> | null;
  altDescription?: string | null;
  description?: string | null;
}

async function fetchNpcAvatar(): Promise<NpcAvatar | null> {
  if (!UNSPLASH_ACCESS_KEY) {
    console.error("UNSPLASH_ACCESS_KEY not set; cannot create onboarding NPC");
    return null;
  }

  const queryOffset = Math.floor(Math.random() * ONBOARDING_QUERIES.length);

  // Try every query once — one attempt per keyword in the pool.
  for (let i = 0; i < ONBOARDING_QUERIES.length; i++) {
    const query = ONBOARDING_QUERIES[(i + queryOffset) % ONBOARDING_QUERIES.length];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      // Fetch a batch (one request, same rate-limit cost) so we can prefer the
      // highest-liked / best-looking photo.
      const unsplashRes = await fetch(
        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=squarish&count=12`,
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
      // `count` returns an array; rank by likes so the best-looking photo wins.
      const batch = (Array.isArray(unsplashData) ? unsplashData : [unsplashData])
        .filter(Boolean)
        .sort((a, b) => (Number(b?.likes ?? 0) || 0) - (Number(a?.likes ?? 0) || 0));

      for (const photo of batch) {
        const candidateUrl =
          photo.urls?.regular || photo.urls?.small || photo.urls?.thumb;
        if (!candidateUrl) continue;

        const compressed = await downloadAndCompressAvatar(candidateUrl);
        const finalUrl = compressed || candidateUrl;

        const sourceUrl = photo.links?.html
          ? `${photo.links.html}?utm_source=networth&utm_medium=referral`
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
        if (photo.links?.download_location) {
          fetch(photo.links.download_location, {
            headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
          }).catch((err) => console.error("Unsplash download event failed:", err));
        }

        return {
          avatarUrl: finalUrl,
          photoAuthorName:
            photo.user?.name || photo.user?.username || null,
          photoAuthorUrl: photo.user?.links?.html
            ? `${photo.user.links.html}?utm_source=networth&utm_medium=referral`
            : null,
          photoSourceUrl: sourceUrl,
          photoScore: Number(photo.likes ?? 0) || 0,
          tags: photo.tags,
          altDescription: photo.alt_description,
          description: photo.description,
        };
      }
      // No usable photo in this batch — try the next query.
      continue;
    } catch (err) {
      console.error(`Unsplash fetch error (attempt ${i + 1}):`, err);
      continue;
    }
  }

  console.error("All Unsplash attempts failed or returned duplicates; cannot create onboarding NPC");
  return null;
}

async function generateUniqueUsername(meta: NpcPhotoMeta | null): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const username =
      attempt === 0 ? generateNpcNameFromMeta(meta) : generateRandomNpcName();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));
    if (existing.length === 0) return username;
  }
  return null;
}

/**
 * Create a single onboarding NPC with an Unsplash avatar. Fails (returns null)
 * if Unsplash is unavailable or returns only duplicates.
 * @param isPool If true, creates NPC in the pre-generated pool (isOnboardingPool = 1).
 *               If false, creates NPC already assigned to a player (isOnboardingPool = 0).
 * @param createdByUserId The user ID who created this NPC (for visibility restriction).
 *                        Only this user can see the NPC until they complete onboarding.
 * @returns the created NPC id, or null if a unique username could not be generated.
 */
export async function createOnboardingNpcWithAvatar(
  isPool: boolean = false,
  createdByUserId?: number
): Promise<number | null> {
  const avatar = await fetchNpcAvatar();
  if (!avatar) return null;

  const username = await generateUniqueUsername({
    tags: avatar.tags,
    altDescription: avatar.altDescription,
    description: avatar.description,
  });
  if (!username) {
    console.error("Could not generate unique onboarding NPC username");
    return null;
  }

  // NPCs are always created WITHOUT a profession (hidden card) by design.
  const profession: string | null = null;

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
      onboardingCreatedBy: createdByUserId,
      photoAuthorName: avatar.photoAuthorName,
      photoAuthorUrl: avatar.photoAuthorUrl,
      photoSourceUrl: avatar.photoSourceUrl,
      photoScore: avatar.photoScore,
      profession,
    })
    .returning({ id: users.id, username: users.username });

  console.log(
    `Created onboarding NPC "${newNpc.username}" (id: ${newNpc.id}, pool: ${isPool}, createdBy: ${createdByUserId ?? 'none'}${profession ? `, profession: ${profession}` : ''})`
  );
  return newNpc.id;
}

/**
 * Create up to `count` onboarding NPCs with avatars for immediate assignment
 * to a user. Returns the list of created NPC ids (may be shorter than `count`
 * if Unsplash fails for some).
 * @param count Number of NPCs to create
 * @param userId The user ID who will own these NPCs (for visibility restriction)
 */
export async function createOnboardingNpcsForUser(count: number, userId: number): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const id = await createOnboardingNpcWithAvatar(false, userId);
    if (id) ids.push(id);
    // Small delay between Unsplash requests to be respectful
    if (i < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return ids;
}

/**
 * Assigns 3 onboarding NPCs to a user after their first avatar upload.
 *
 * - Uses the pre-generated onboarding pool first (fast, no external API calls).
 * - Falls back to Unsplash creation only when the pool is empty.
 * - Skips work entirely if the user already has onboarding NPCs assigned.
 * - Always sets `onboardingStarted = 1` so the onboarding state machine knows
 *   this is a brand-new player (and won't auto-complete onboarding due to the
 *   "looks like an existing player" heuristic in /api/onboarding).
 *
 * Returns the list of NPC ids assigned to the user (may be empty if Unsplash
 * is down AND the pool is empty — caller should treat this as best-effort).
 */
export async function assignOnboardingNpcsToUser(userId: number): Promise<number[]> {
  // Skip if already assigned
  const [user] = await db
    .select({ onboardingNpcs: users.onboardingNpcs })
    .from(users)
    .where(eq(users.id, userId));

  const existing = (user?.onboardingNpcs as number[]) || [];
  if (existing.length > 0) {
    // Already assigned — just ensure the onboardingStarted flag is set
    await db
      .update(users)
      .set({ onboardingStarted: 1 })
      .where(eq(users.id, userId));
    return existing;
  }

  // 1. Try the pre-generated pool first (no Unsplash hit, instant)
  const poolNpcs = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isOnboardingPool, 1))
    .limit(3);

  const claimedIds: number[] = poolNpcs.map((n) => n.id);

  if (claimedIds.length > 0) {
    // Claim from pool and set the creator so this user can see their NPCs.
    // Reset playerValue/valueFloor to 1 — pool NPCs may have accumulated value
    // over time (crons, game mechanics) and must always cost 1¢ for new players.
    await db
      .update(users)
      .set({
        isOnboardingPool: 0,
        onboardingCreatedBy: userId,
        playerValue: 1,
        valueFloor: 1,
      })
      .where(sql`${users.id} IN (${sql.join(claimedIds, sql`, `)})`);
  }

  // 2. Top up to 3 via Unsplash if the pool was short
  const needed = 3 - claimedIds.length;
  let freshIds: number[] = [];
  if (needed > 0) {
    try {
      freshIds = await createOnboardingNpcsForUser(needed, userId);
    } catch (err) {
      console.error("assignOnboardingNpcsToUser: Unsplash fallback failed:", err);
    }
  }

  let npcIds = [...claimedIds, ...freshIds];

  // 3. Hard fallback: if pool+Unsplash still left us short, create simple NPCs
  //    with the default hidden-card avatar so the NPC step always has 3 entries.
  const stillNeeded = 3 - npcIds.length;
  if (stillNeeded > 0) {
    console.log(`assignOnboardingNpcsToUser: pool+Unsplash only gave ${npcIds.length}/3 for user ${userId}. Creating ${stillNeeded} fallback NPCs.`);
    const fallbackIds: number[] = [];
    for (let i = 0; i < stillNeeded; i++) {
      const fallbackUsername = await generateUniqueUsername(null);
      if (!fallbackUsername) continue;
      try {
        const [fallbackNpc] = await db
          .insert(users)
          .values({
            username: fallbackUsername,
            passwordHash: null,
            avatarUrl: "/hidden.png",
            playerValue: 1,
            valueFloor: 1,
            credits: 0,
            isActive: 1,
            isVerified: 0,
            isNpc: 1,
            isOnboardingPool: 0,
            onboardingCreatedBy: userId,
            profession: null,
          })
          .returning({ id: users.id });
        fallbackIds.push(fallbackNpc.id);
      } catch (err) {
        console.error("assignOnboardingNpcsToUser: fallback NPC creation failed:", err);
      }
    }
    npcIds = [...npcIds, ...fallbackIds];
  }

  // 4. Always mark onboarding as started so the user isn't later treated as an
  //    existing player (which would auto-complete and skip the starter NPCs).
  await db
    .update(users)
    .set({
      onboardingNpcs: npcIds,
      onboardingStarted: 1,
    })
    .where(eq(users.id, userId));

  console.log(
    `Assigned ${npcIds.length} onboarding NPCs to user ${userId} (${claimedIds.length} from pool, ${freshIds.length} fresh)`
  );

  return npcIds;
}