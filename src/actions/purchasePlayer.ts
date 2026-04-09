"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, transactions, gameHistory, gameSettings } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { PG_BIGINT_MAX, MAX_CREDITS_SQL } from "@/lib/safeguards";

export async function purchasePlayer(targetId: number) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const buyerId = parseInt(session.user.id);

  if (buyerId === targetId) {
    return { error: "You cannot buy yourself" };
  }

  try {
    // 1. Get target player
    const [target] = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        credits: users.credits,
        blockSellUntil: users.blockSellUntil,
        blockSellBy: users.blockSellBy,
      })
      .from(users)
      .where(eq(users.id, targetId));

    if (!target) {
      return { error: "Player not found" };
    }

    // 2. Get buyer
    const [buyer] = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        credits: users.credits,
      })
      .from(users)
      .where(eq(users.id, buyerId));

    if (!buyer) {
      return { error: "Buyer not found" };
    }

    const cost = target.playerValue;

    // 3. Validate buyer has enough credits
    if (buyer.credits < cost) {
      return { error: "Insufficient credits" };
    }

    // 4. Check buyer doesn't already own this player
    const existingOwnership = await db
      .select()
      .from(ownership)
      .where(
        and(eq(ownership.ownerId, buyerId), eq(ownership.ownedId, targetId))
      );

    if (existingOwnership.length > 0) {
      return { error: "You already own this player" };
    }

    // 4b. Check ownership limit (dynamic based on total players)
    const [limitSetting] = await db
      .select({ value: gameSettings.settingValue })
      .from(gameSettings)
      .where(eq(gameSettings.settingKey, "max_ownership_limit"));

    const ownershipLimit = limitSetting?.value ?? 111; // Fallback to 111 if not set

    const [ownershipCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(eq(ownership.ownerId, buyerId));

    if (ownershipCount.count >= ownershipLimit) {
      return { error: `You've reached the maximum limit of ${ownershipLimit} owned players. Discard some players to buy more!` };
    }

    // 5. Get the current owner of target (single owner now)
    const [currentOwner] = await db
      .select()
      .from(ownership)
      .where(eq(ownership.ownedId, targetId));

    // Pre-compute values
    // Cap the doubled value at the PostgreSQL bigint limit (2^63 - 1) to prevent overflow
    // Use BigInt for precise arithmetic since values may exceed JS safe integer range (2^53)
    const bigPlayerValue = BigInt(target.playerValue);
    const bigDoubled = bigPlayerValue * BigInt(2);
    const canDouble = bigDoubled <= PG_BIGINT_MAX;
    const newValue = canDouble ? Number(bigDoubled) : target.playerValue;
    const ownerShare = Math.floor(cost * 0.75);
    const playerShare = cost - ownerShare;

    // Determine block sell data from current ownership
    let blockUntil: Date | null = null;
    let blockBy: string | null = null;
    if (currentOwner?.blockSellUntil && new Date(currentOwner.blockSellUntil) > new Date()) {
      blockUntil = new Date(currentOwner.blockSellUntil);
      blockBy = currentOwner.blockSellBy ?? null;
    } else if (target.blockSellUntil && new Date(target.blockSellUntil) > new Date()) {
      blockUntil = new Date(target.blockSellUntil);
      blockBy = target.blockSellBy ?? null;
    }

    // 6. Deduct credits from buyer (floor at 0)
    // Note: neon-http does not support transactions, so we execute operations individually
    await db
      .update(users)
      .set({ credits: sql`GREATEST(credits - ${cost}, 0)` })
      .where(eq(users.id, buyerId));

    // 7. Distribute revenue: 75% to original owner, 25% to the purchased player

    // Give 75% to the original owner (if exists) — cap to prevent overflow
    if (currentOwner) {
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${ownerShare}, ${sql.raw(MAX_CREDITS_SQL)})` })
        .where(eq(users.id, currentOwner.ownerId));

      // Remove the original ownership
      await db
        .delete(ownership)
        .where(eq(ownership.id, currentOwner.id));
    }

    // Give 25% to the purchased player — cap to prevent overflow
    await db
      .update(users)
      .set({ credits: sql`LEAST(credits + ${playerShare}, ${sql.raw(MAX_CREDITS_SQL)})` })
      .where(eq(users.id, targetId));

    // 8. Update the target's player value after purchase (double it, or keep it if at the cap)
    await db
      .update(users)
      .set({
        playerValue: newValue,
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId));

    // 9. Create ownership record — inherit any active sell block from the target player
    await db.insert(ownership).values({
      ownerId: buyerId,
      ownedId: targetId,
      purchasePrice: cost,
      blockSellUntil: blockUntil,
      blockSellBy: blockBy,
    });

    // 10. Log transaction
    await db.insert(transactions).values({
      buyerId,
      targetId,
      type: "purchase",
      amount: cost,
    });

    // 10b. Log to game history
    await db.insert(gameHistory).values({
      eventType: "purchase",
      actorId: buyerId,
      targetId,
      targetUsername: target.username,
      details: JSON.stringify({ amount: cost, newValue }),
    });

    // 11. Track onboarding NPC purchase (optional - columns may not exist yet)
    try {
      const [buyerOnboarding] = await db
        .select({
          onboardingNpcs: users.onboardingNpcs,
          onboardingOwnedCount: users.onboardingOwnedCount,
          onboardingComplete: users.onboardingComplete,
        })
        .from(users)
        .where(eq(users.id, buyerId));

      const starterNpcIds = (buyerOnboarding?.onboardingNpcs as number[]) || [];
      if (
        starterNpcIds.includes(targetId) &&
        buyerOnboarding?.onboardingComplete !== 1
      ) {
        const newOwnedCount = (buyerOnboarding?.onboardingOwnedCount ?? 0) + 1;
        const isComplete = newOwnedCount >= 3;
        await db
          .update(users)
          .set({
            onboardingOwnedCount: newOwnedCount,
            onboardingComplete: isComplete ? 1 : 0,
          })
          .where(eq(users.id, buyerId));
      }
    } catch (onboardingError) {
      // Onboarding columns may not exist yet - continue without tracking
      console.log("Onboarding tracking skipped:", onboardingError);
    }

    // 12. Trigger real-time updates via Pusher
    try {
      const pusherPromises = [
        pusher.trigger(`player-${targetId}`, "purchased", {
          buyerUsername: buyer.username,
          newValue,
        }),
        pusher.trigger(`player-${buyerId}`, "credits-updated", {
          newCredits: buyer.credits - cost,
        }),
      ];

      // Notify original owner if they exist
      if (currentOwner) {
        pusherPromises.push(
          pusher.trigger(`player-${currentOwner.ownerId}`, "revenue-received", {
            amount: ownerShare,
            fromPlayer: target.username,
            buyer: buyer.username,
          })
        );
      }

      await Promise.all(pusherPromises);
    } catch (pusherError) {
      // Don't fail the purchase if Pusher fails
      console.error("Pusher error:", pusherError);
    }

    return {
      success: true,
      newValue,
      cost,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Purchase error:", errMsg);
    console.error("Purchase error full:", error);
    return { error: "Purchase failed. Please try again." };
  }
}
