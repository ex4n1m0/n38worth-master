import { db } from "@/db";
import { users, ownership, bounties } from "@/db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { isRemovedAgentUsername } from "@/lib/agent/roster";

/**
 * BOUNTY BOARD — escrowed public contracts on other players' cards
 * (GAME_INTEGRATION_STUDY §5B).
 *
 * This layer productizes the ALREADY-EXISTING poach economy: everything a
 * bounty pays out moves through the normal purchase flow, so no price formula
 * changes. Money movements:
 *   post    → creator pays reward + burned listing fee (escrowed in the row)
 *   settle  → inside buyPlayerCore success: foreclose bounties pay the taker,
 *             deliver bounties refund the creator
 *   expire  → lazy sweep on board reads refunds the creator
 *   cancel  → creator refunds themselves (fee stays burned)
 */
export const BOUNTY_LISTING_FEE_RATE = 0.02;
export const BOUNTY_MIN_REWARD = 100;
export const BOUNTY_MAX_REWARD = 1e9;
export const BOUNTY_DURATION_MS = 48 * 60 * 60 * 1000;
export const BOUNTY_MAX_OPEN_PER_CREATOR = 5;
export const BOUNTY_BOARD_LIMIT = 50;

export type BountyType = "foreclose" | "deliver";
export const BOUNTY_TYPES: BountyType[] = ["foreclose", "deliver"];

export function bountyListingFee(reward: number): number {
  return Math.max(1, Math.floor(reward * BOUNTY_LISTING_FEE_RATE));
}

export function isBountyType(value: unknown): value is BountyType {
  return value === "foreclose" || value === "deliver";
}

export interface CreateBountyResult {
  success?: true;
  error?: string;
  bounty?: {
    id: number;
    type: BountyType;
    targetUsername: string;
    rewardCredits: number;
    feeCredits: number;
    expiresAt: string;
  };
}

export async function createBounty(
  creatorId: number,
  type: BountyType,
  targetUsername: string,
  reward: number
): Promise<CreateBountyResult> {
  if (!Number.isFinite(reward)) {
    return { error: "Invalid reward" };
  }
  // Credits move as whole ¢ through escrow/settle/refund — reject fractions.
  reward = Math.floor(reward);
  if (reward < BOUNTY_MIN_REWARD) {
    return { error: `Minimum bounty is ${BOUNTY_MIN_REWARD}¢` };
  }
  if (reward > BOUNTY_MAX_REWARD) {
    return { error: `Maximum bounty is ${BOUNTY_MAX_REWARD}¢` };
  }
  const fee = bountyListingFee(reward);

  const [creator] = await db
    .select({ id: users.id, username: users.username, credits: users.credits })
    .from(users)
    .where(eq(users.id, creatorId));
  if (!creator) return { error: "Creator not found" };

  const normalized = targetUsername.trim();
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(normalized)) {
    return { error: "Invalid target username" };
  }
  if (normalized.toLowerCase() === creator.username.toLowerCase()) {
    return { error: "You cannot put a bounty on yourself" };
  }

  const [target] = await db
    .select({
      id: users.id,
      username: users.username,
      isActive: users.isActive,
      isOnboardingPool: users.isOnboardingPool,
    })
    .from(users)
    .where(eq(users.username, normalized));
  if (!target || isRemovedAgentUsername(target.username)) {
    return { error: "Target not found" };
  }
  if (!target.isActive || target.isOnboardingPool) {
    return { error: "Target not found" };
  }

  // The card's CURRENT ownership defines which bounty types make sense.
  const [currentOwnership] = await db
    .select({ ownerId: ownership.ownerId })
    .from(ownership)
    .where(eq(ownership.ownedId, target.id));

  if (type === "foreclose") {
    // Needs a landlord to foreclose FROM — and that landlord isn't the creator.
    if (!currentOwnership) {
      return { error: `${target.username} has no landlord to foreclose from` };
    }
    if (currentOwnership.ownerId === creatorId) {
      return { error: "You already own this building" };
    }
  } else {
    // Deliver: the creator wants to OWN it — it must not already be theirs.
    if (currentOwnership?.ownerId === creatorId) {
      return { error: "You already own this building" };
    }
  }

  const [openCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bounties)
    .where(and(eq(bounties.creatorId, creatorId), eq(bounties.status, "open")));
  if (Number(openCount.count) >= BOUNTY_MAX_OPEN_PER_CREATOR) {
    return { error: `You can have at most ${BOUNTY_MAX_OPEN_PER_CREATOR} open bounties` };
  }

  const totalCost = reward + fee;
  if (Number(creator.credits) < totalCost) {
    return { error: `Not enough capital. Need ${totalCost}¢ (${reward}¢ escrow + ${fee}¢ listing fee)` };
  }

  // Escrow: deduct reward + fee atomically only while the balance still covers it.
  const spent = await db
    .update(users)
    .set({ credits: sql`credits - ${totalCost}`, updatedAt: new Date() })
    .where(and(eq(users.id, creatorId), sql`credits >= ${totalCost}`))
    .returning({ id: users.id });
  if (spent.length === 0) {
    return { error: "Not enough capital" };
  }

  const [row] = await db
    .insert(bounties)
    .values({
      creatorId,
      type,
      targetUserId: target.id,
      targetUsername: target.username,
      rewardCredits: reward,
      feeCredits: fee,
      status: "open",
      expiresAt: new Date(Date.now() + BOUNTY_DURATION_MS),
    })
    .returning();

  return {
    success: true,
    bounty: {
      id: row.id,
      type: row.type as BountyType,
      targetUsername: row.targetUsername,
      rewardCredits: row.rewardCredits,
      feeCredits: row.feeCredits,
      expiresAt: row.expiresAt.toISOString(),
    },
  };
}

export async function cancelBounty(creatorId: number, bountyId: number) {
  const refunded = await db
    .update(bounties)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(
      and(
        eq(bounties.id, bountyId),
        eq(bounties.creatorId, creatorId),
        eq(bounties.status, "open")
      )
    )
    .returning({ reward: bounties.rewardCredits });
  if (refunded.length === 0) {
    return { error: "Bounty not found or no longer open" };
  }
  await db
    .update(users)
    .set({ credits: sql`LEAST(credits + ${refunded[0].reward}, ${sql.raw(MAX_CREDITS_SQL)})` })
    .where(eq(users.id, creatorId));
  return { success: true as const, refunded: refunded[0].reward };
}

/**
 * Lazy expiry sweep — called on board reads. Refunds every open bounty past
 * its deadline. (No cron: reads are frequent enough and the sweep is one
 * UPDATE … RETURNING.)
 */
export async function expireOpenBounties(): Promise<number> {
  const expired = await db
    .update(bounties)
    .set({ status: "expired", completedAt: new Date() })
    .where(and(eq(bounties.status, "open"), sql`${bounties.expiresAt} <= now()`))
    .returning({ creatorId: bounties.creatorId, reward: bounties.rewardCredits });

  for (const row of expired) {
    await db
      .update(users)
      .set({ credits: sql`LEAST(credits + ${row.reward}, ${sql.raw(MAX_CREDITS_SQL)})` })
      .where(eq(users.id, row.creatorId));
    try {
      await pusher.trigger(`player-${row.creatorId}`, "bounty-update", {
        status: "expired",
        refunded: row.reward,
      });
    } catch {
      // never fail the sweep on Pusher
    }
  }
  return expired.length;
}

/**
 * Settlement hook — called from buyPlayerCore AFTER a successful purchase.
 * Never throws (mirrors the missions hook pattern): a bounty failure must not
 * fail or roll back a completed hire.
 *
 *  - foreclose bounties on the purchased card (creator ≠ buyer) pay the BUYER
 *    — every open bounty on the target pays out, so stacked bounties stack.
 *  - deliver bounties by the BUYER on this card complete: escrow returns.
 */
export async function settleBountiesOnPurchase(input: {
  buyerId: number;
  buyerUsername: string;
  targetId: number;
  targetUsername: string;
  hadPreviousOwner: boolean;
}): Promise<void> {
  try {
    if (input.hadPreviousOwner) {
      const paid = await db
        .update(bounties)
        .set({ status: "completed", takerId: input.buyerId, completedAt: new Date() })
        .where(
          and(
            eq(bounties.targetUserId, input.targetId),
            eq(bounties.type, "foreclose"),
            eq(bounties.status, "open"),
            sql`${bounties.creatorId} <> ${input.buyerId}`
          )
        )
        .returning({ id: bounties.id, creatorId: bounties.creatorId, reward: bounties.rewardCredits });

      for (const row of paid) {
        await db
          .update(users)
          .set({ credits: sql`LEAST(credits + ${row.reward}, ${sql.raw(MAX_CREDITS_SQL)})` })
          .where(eq(users.id, input.buyerId));
        try {
          await Promise.all([
            pusher.trigger(`player-${input.buyerId}`, "bounty-claimed", {
              amount: row.reward,
              targetUsername: input.targetUsername,
            }),
            pusher.trigger(`player-${row.creatorId}`, "bounty-completed", {
              takerUsername: input.buyerUsername,
              targetUsername: input.targetUsername,
              amount: row.reward,
            }),
          ]);
        } catch {
          // Pusher failure never fails settlement
        }
      }
    }

    const returned = await db
      .update(bounties)
      .set({ status: "completed", takerId: input.buyerId, completedAt: new Date() })
      .where(
        and(
          eq(bounties.targetUserId, input.targetId),
          eq(bounties.type, "deliver"),
          eq(bounties.status, "open"),
          eq(bounties.creatorId, input.buyerId)
        )
      )
      .returning({ id: bounties.id, reward: bounties.rewardCredits });

    for (const row of returned) {
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${row.reward}, ${sql.raw(MAX_CREDITS_SQL)})` })
        .where(eq(users.id, input.buyerId));
    }
  } catch (error) {
    console.error("Bounty settlement error (purchase not affected):", error);
  }
}

export interface BoardBounty {
  id: number;
  type: BountyType;
  targetUsername: string;
  targetAvatarUrl: string | null;
  targetValue: number;
  ownerUsername: string | null;
  rewardCredits: number;
  creatorUsername: string;
  expiresAt: string;
}

export async function getBountyBoard() {
  await expireOpenBounties();

  const creator = alias(users, "creator");
  const rows = await db
    .select({
      id: bounties.id,
      type: bounties.type,
      targetUsername: bounties.targetUsername,
      targetAvatarUrl: users.avatarUrl,
      targetValue: users.playerValue,
      rewardCredits: bounties.rewardCredits,
      creatorUsername: creator.username,
      expiresAt: bounties.expiresAt,
      ownerId: ownership.ownerId,
    })
    .from(bounties)
    .innerJoin(users, eq(bounties.targetUserId, users.id))
    .innerJoin(creator, eq(creator.id, bounties.creatorId))
    .leftJoin(ownership, eq(ownership.ownedId, users.id))
    .where(eq(bounties.status, "open"))
    .orderBy(desc(bounties.rewardCredits))
    .limit(BOUNTY_BOARD_LIMIT);

  const ownerIds = [...new Set(rows.map((r) => r.ownerId).filter((x): x is number => x != null))];
  const owners = ownerIds.length
    ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, ownerIds))
    : [];
  const ownerNames = new Map(owners.map((o) => [o.id, o.username]));

  const board: BoardBounty[] = rows.map((r) => ({
    id: r.id,
    type: r.type as BountyType,
    targetUsername: r.targetUsername,
    targetAvatarUrl: r.targetAvatarUrl,
    targetValue: Number(r.targetValue),
    ownerUsername: r.ownerId != null ? ownerNames.get(r.ownerId) ?? null : null,
    rewardCredits: Number(r.rewardCredits),
    creatorUsername: r.creatorUsername,
    expiresAt: r.expiresAt.toISOString(),
  }));

  // Drop rows whose card changed hands after listing (foreclose targets that
  // are now unowned, deliver targets already delivered elsewhere) — the lazy
  // settle hook is authoritative, the board just shouldn't advertise stale work.
  return board.filter((b) => {
    if (b.type === "foreclose") return b.ownerUsername !== null;
    return true;
  });
}

export async function getMyBounties(creatorId: number) {
  const rows = await db
    .select({
      id: bounties.id,
      type: bounties.type,
      targetUsername: bounties.targetUsername,
      rewardCredits: bounties.rewardCredits,
      feeCredits: bounties.feeCredits,
      status: bounties.status,
      takerId: bounties.takerId,
      expiresAt: bounties.expiresAt,
      createdAt: bounties.createdAt,
    })
    .from(bounties)
    .where(eq(bounties.creatorId, creatorId))
    .orderBy(desc(bounties.createdAt))
    .limit(20);

  const takerIds = [...new Set(rows.map((r) => r.takerId).filter((x): x is number => x != null))];
  const takers = takerIds.length
    ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, takerIds))
    : [];
  const takerNames = new Map(takers.map((t) => [t.id, t.username]));

  return rows.map((r) => ({
    id: r.id,
    type: r.type as BountyType,
    targetUsername: r.targetUsername,
    rewardCredits: Number(r.rewardCredits),
    feeCredits: Number(r.feeCredits),
    status: r.status,
    takerUsername: r.takerId != null ? takerNames.get(r.takerId) ?? null : null,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * World-reset integration: mark every open bounty expired WITHOUT refunds
 * (credits are hard-reset to 100 by the reset anyway — refunding first would
 * be a no-op and refunding after would mint money).
 */
export async function expireAllBountiesForWorldReset(): Promise<void> {
  try {
    await db
      .update(bounties)
      .set({ status: "expired", completedAt: new Date() })
      .where(eq(bounties.status, "open"));
  } catch (error) {
    console.error("World-reset bounty expiry error:", error);
  }
}
