/**
 * Idle-user ownership decay.
 *
 * Rule: if a human user is offline for more than 24 hours, they lose 1 owned
 * NPC per additional hour of offline time, starting with the oldest purchase.
 *
 * - Only NPC-owned rows are affected (human ownerships are left alone).
 * - Goddesses (isProtected=1) are RELEASED (ownership row removed and goddess
 *   marked ownerless) but the goddess user itself is never deleted.
 * - Regular NPCs are HARD DELETED via deleteNpcCascade.
 * - `lastOwnershipDecayAt` on the idle user advances by `hoursToDecay * 1h`
 *   from the anchor, so fractional hours carry over to the next run.
 * - Silent: no Pusher events, no toasts. One `game_history` row per user.
 */

import { db } from "@/db";
import { users, ownership, gameHistory } from "@/db/schema";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { deleteNpcCascade } from "@/lib/deleteNpc";

export interface DecayPerUser {
  userId: number;
  username: string;
  hoursOffline: number;
  ownedNpcs: number;
  hoursToDecay: number;
  releasedGoddessUsernames: string[];
  deletedNpcUsernames: string[];
}

export interface DecayRunResult {
  usersProcessed: number;
  totalDeleted: number;
  totalReleasedGoddesses: number;
  perUser: DecayPerUser[];
}

const HOUR_MS = 60 * 60 * 1000;
const IDLE_THRESHOLD_HOURS = 24;

/**
 * Find all candidate idle users and process them.
 *
 * @param dryRun if true, computes the plan but does not mutate anything.
 */
export async function runOwnershipDecay(dryRun = false): Promise<DecayRunResult> {
  const now = new Date();
  const nowMs = now.getTime();

  // Candidates: active humans whose lastOnlineAt is older than 24h.
  const cutoff = new Date(nowMs - IDLE_THRESHOLD_HOURS * HOUR_MS);

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
        sql`${users.lastOnlineAt} < ${cutoff}`
      )
    );

  const perUser: DecayPerUser[] = [];
  let totalDeleted = 0;
  let totalReleasedGoddesses = 0;
  let usersProcessed = 0;

  for (const user of candidates) {
    const lastOnlineMs = new Date(user.lastOnlineAt).getTime();
    const hoursOffline = (nowMs - lastOnlineMs) / HOUR_MS;

    // Anchor: the later of (lastOnlineAt + 24h) and lastOwnershipDecayAt.
    const idleThresholdMs = lastOnlineMs + IDLE_THRESHOLD_HOURS * HOUR_MS;
    const lastDecayMs = user.lastOwnershipDecayAt
      ? new Date(user.lastOwnershipDecayAt).getTime()
      : 0;
    const anchorMs = Math.max(idleThresholdMs, lastDecayMs);

    if (anchorMs > nowMs) continue; // not yet eligible

    const rawHoursToDecay = Math.floor((nowMs - anchorMs) / HOUR_MS);
    if (rawHoursToDecay < 1) continue;

    // Fetch this user's NPC-owned rows, oldest first. Pull up to the full
    // NPC count so we can release everything in one catch-up pass.
    const owned = await db
      .select({
        ownershipId: ownership.id,
        ownedId: ownership.ownedId,
        ownedUsername: users.username,
        isProtected: users.isProtected,
        purchasedAt: ownership.purchasedAt,
      })
      .from(ownership)
      .innerJoin(users, eq(users.id, ownership.ownedId))
      .where(and(eq(ownership.ownerId, user.id), eq(users.isNpc, 1)))
      .orderBy(asc(ownership.purchasedAt));

    if (owned.length === 0) continue;

    const hoursToDecay = Math.min(rawHoursToDecay, owned.length);
    const toReleaseRows = owned.slice(0, hoursToDecay);

    const releasedGoddessUsernames: string[] = [];
    const deletedNpcUsernames: string[] = [];

    if (!dryRun) {
      for (const row of toReleaseRows) {
        if (row.isProtected === 1) {
          // Release only — keep the goddess NPC alive.
          await db.delete(ownership).where(eq(ownership.id, row.ownershipId));
          await db
            .update(users)
            .set({ ownerlessAt: now })
            .where(eq(users.id, row.ownedId));
          releasedGoddessUsernames.push(row.ownedUsername);
          totalReleasedGoddesses++;
        } else {
          // Hard-delete non-protected NPC (deleteNpcCascade removes ownership too).
          await deleteNpcCascade(row.ownedId, row.ownedUsername, "idle_owner_decay", {
            idleOwnerId: user.id,
            idleOwnerUsername: user.username,
            hoursOffline: Math.round(hoursOffline * 10) / 10,
          });
          deletedNpcUsernames.push(row.ownedUsername);
          totalDeleted++;
        }
      }

      // Advance the anchor by exactly hoursToDecay hours (not to `now`) so
      // fractional time carries over.
      const newLastDecayMs = anchorMs + hoursToDecay * HOUR_MS;
      await db
        .update(users)
        .set({ lastOwnershipDecayAt: new Date(newLastDecayMs) })
        .where(eq(users.id, user.id));

      // One summary audit row per idle user.
      await db.insert(gameHistory).values({
        eventType: "ownership_decay",
        actorId: null,
        targetId: user.id,
        targetUsername: user.username,
        details: JSON.stringify({
          reason: "offline_24h_plus_hourly_decay",
          hoursOffline: Math.round(hoursOffline * 10) / 10,
          hoursApplied: hoursToDecay,
          deletedNpcs: deletedNpcUsernames,
          releasedGoddesses: releasedGoddessUsernames,
        }),
      });
    } else {
      for (const row of toReleaseRows) {
        if (row.isProtected === 1) releasedGoddessUsernames.push(row.ownedUsername);
        else deletedNpcUsernames.push(row.ownedUsername);
      }
    }

    perUser.push({
      userId: user.id,
      username: user.username,
      hoursOffline: Math.round(hoursOffline * 10) / 10,
      ownedNpcs: owned.length,
      hoursToDecay,
      releasedGoddessUsernames,
      deletedNpcUsernames,
    });
    usersProcessed++;
  }

  // Keep TS happy about unused import if this file is reshaped later.
  void desc;
  void isNotNull;

  return { usersProcessed, totalDeleted, totalReleasedGoddesses, perUser };
}
