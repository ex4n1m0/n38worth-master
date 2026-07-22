/**
 * Tiered offline ownership decay.
 *
 * Players who are offline lose their cheapest NPC cards at a rate determined
 * by how many total cards they own:
 *
 *   Over 6000 cards  → 1 card every 10 minutes
 *   5000–6000        → 1 card every 20 minutes
 *   4000–5000        → 1 card every 30 minutes
 *   3000–4000        → 1 card every 40 minutes
 *   2000–3000        → 1 card every 50 minutes
 *   1000–2000        → 1 card every 60 minutes
 *   500–1000         → 1 card every 6 hours
 *   0–500            → no decay
 *
 * Cards are released cheapest-first (by playerValue ascending).  Goddesses
 * (isProtected = 1) are treated the same as regular NPCs — their ownership is
 * released and the NPC becomes ownerless again.
 *
 * The cron should run every 10 minutes (the smallest interval).  Each run:
 *   1. Finds active humans whose lastOnlineAt is > 10 min ago (offline).
 *   2. Counts their total owned cards to determine the tier.
 *   3. Calculates how many intervals have elapsed since the decay anchor.
 *   4. Releases that many cheapest NPC cards.
 *   5. Advances lastOwnershipDecayAt so fractional time carries over.
 */

import { db } from "@/db";
import { users, ownership, gameHistory } from "@/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

export interface DecayPerUser {
  userId: number;
  username: string;
  totalOwned: number;
  tier: string;
  cardsReleased: number;
  releasedUsernames: string[];
}

export interface DecayRunResult {
  usersProcessed: number;
  totalReleased: number;
  perUser: DecayPerUser[];
}

/** A player is "offline" if their lastOnlineAt is older than this. */
const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

interface Tier {
  min: number;
  intervalMs: number;
  label: string;
}

/** Decay tiers, sorted from highest card count to lowest. */
const TIERS: Tier[] = [
  { min: 6000, intervalMs: 10 * 60 * 1000, label: "6000+ (10 min)" },
  { min: 5000, intervalMs: 20 * 60 * 1000, label: "5000-6000 (20 min)" },
  { min: 4000, intervalMs: 30 * 60 * 1000, label: "4000-5000 (30 min)" },
  { min: 3000, intervalMs: 40 * 60 * 1000, label: "3000-4000 (40 min)" },
  { min: 2000, intervalMs: 50 * 60 * 1000, label: "2000-3000 (50 min)" },
  { min: 1000, intervalMs: 60 * 60 * 1000, label: "1000-2000 (60 min)" },
  { min: 500, intervalMs: 6 * 60 * 60 * 1000, label: "500-1000 (6 hours)" },
  { min: 0, intervalMs: Infinity, label: "0-500 (no decay)" },
];

function getTier(ownedCount: number): Tier {
  for (const tier of TIERS) {
    if (ownedCount >= tier.min) return tier;
  }
  return TIERS[TIERS.length - 1];
}

/**
 * Find all offline human players and release their cheapest NPC cards based on
 * the tiered decay schedule.
 *
 * @param dryRun if true, computes the plan but does not mutate anything.
 */
export async function runOwnershipDecay(dryRun = false): Promise<DecayRunResult> {
  const now = new Date();
  const nowMs = now.getTime();
  const offlineCutoff = new Date(nowMs - OFFLINE_THRESHOLD_MS);

  // Find all active humans who are currently offline.
  const candidates = await db
    .select({
      id: users.id,
      username: users.username,
      lastOnlineAt: users.lastOnlineAt,
      lastOwnershipDecayAt: users.lastOwnershipDecayAt,
    })
    .from(users)
    .where(
      and(
        eq(users.isActive, 1),
        eq(users.isNpc, 0),
        sql`${users.lastOnlineAt} < ${offlineCutoff}`
      )
    );

  const perUser: DecayPerUser[] = [];
  let totalReleased = 0;
  let usersProcessed = 0;

  // Bulk-fetch total owned-card counts for all offline candidates in one query
  // instead of N+1. Individual NPC fetches and deletes below still happen per user
  // that actually has cards to release.
  const candidateIds = candidates.map((u) => u.id);
  const ownedCountMap = new Map<number, number>();
  if (candidateIds.length > 0) {
    const ownedCounts = await db
      .select({
        ownerId: ownership.ownerId,
        count: sql<number>`COUNT(*)::int`.as("owned_count"),
      })
      .from(ownership)
      .where(inArray(ownership.ownerId, candidateIds))
      .groupBy(ownership.ownerId);
    for (const row of ownedCounts) {
      ownedCountMap.set(row.ownerId, Number(row.count));
    }
  }

  for (const user of candidates) {
    const lastOnlineMs = new Date(user.lastOnlineAt).getTime();
    const lastDecayMs = user.lastOwnershipDecayAt
      ? new Date(user.lastOwnershipDecayAt).getTime()
      : 0;

    // Anchor: if the player was online after the last decay, reset to
    // lastOnlineAt (start a new offline period).  Otherwise continue from
    // the last decay so fractional time carries over.
    const anchorMs = Math.max(lastOnlineMs, lastDecayMs);

    const totalOwned = ownedCountMap.get(user.id) ?? 0;

    const tier = getTier(totalOwned);
    if (tier.intervalMs === Infinity) continue; // 0-500 cards, no decay

    // How many intervals have elapsed since the anchor?
    const elapsedMs = nowMs - anchorMs;
    const cardsToRelease = Math.floor(elapsedMs / tier.intervalMs);
    if (cardsToRelease < 1) continue;

    // Fetch NPC-owned cards, cheapest first (playerValue ascending).
    // Tiebreak by purchasedAt ascending (oldest among equal-value cards).
    const ownedNpcs = await db
      .select({
        ownershipId: ownership.id,
        ownedId: ownership.ownedId,
        ownedUsername: users.username,
        isProtected: users.isProtected,
        playerValue: users.playerValue,
        purchasedAt: ownership.purchasedAt,
      })
      .from(ownership)
      .innerJoin(users, eq(users.id, ownership.ownedId))
      .where(and(eq(ownership.ownerId, user.id), eq(users.isNpc, 1)))
      .orderBy(asc(users.playerValue), asc(ownership.purchasedAt));

    if (ownedNpcs.length === 0) continue;

    // Can't release more than we own.
    const releaseCount = Math.min(cardsToRelease, ownedNpcs.length);
    const toRelease = ownedNpcs.slice(0, releaseCount);

    const releasedUsernames: string[] = [];

    if (!dryRun) {
      for (const row of toRelease) {
        // Release ownership — keep all NPCs alive.
        await db.delete(ownership).where(eq(ownership.id, row.ownershipId));
        await db
          .update(users)
          .set({ ownerlessAt: now })
          .where(eq(users.id, row.ownedId));
        releasedUsernames.push(row.ownedUsername);
      }

      // Advance the anchor by exactly (releaseCount * interval) so the
      // remaining fractional time carries over to the next run.
      const newLastDecayMs = anchorMs + releaseCount * tier.intervalMs;
      await db
        .update(users)
        .set({ lastOwnershipDecayAt: new Date(newLastDecayMs) })
        .where(eq(users.id, user.id));

      // Audit row.
      await db.insert(gameHistory).values({
        eventType: "ownership_decay",
        actorId: null,
        targetId: user.id,
        targetUsername: user.username,
        details: JSON.stringify({
          reason: "tiered_offline_decay",
          totalOwned,
          tier: tier.label,
          cardsReleased: releaseCount,
          releasedUsernames,
        }),
      });
    } else {
      for (const row of toRelease) {
        releasedUsernames.push(row.ownedUsername);
      }
    }

    perUser.push({
      userId: user.id,
      username: user.username,
      totalOwned,
      tier: tier.label,
      cardsReleased: releaseCount,
      releasedUsernames,
    });
    totalReleased += releaseCount;
    usersProcessed++;
  }

  return { usersProcessed, totalReleased, perUser };
}
