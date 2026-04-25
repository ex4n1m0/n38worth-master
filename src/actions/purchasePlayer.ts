"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, transactions, gameHistory, rewardHistory } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { PG_BIGINT_MAX, MAX_CREDITS_SQL } from "@/lib/safeguards";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { getCountdownState, startCountdown, clearCountdown } from "@/lib/goddess-countdown";

// Helper function to determine value multiplier based on current player value
function getValueMultiplier(value: number): number {
  if (value < 1000) return 2.0;      // 100% increase
  if (value < 10000) return 1.75;    // 75% increase
  if (value < 100000) return 1.5;    // 50% increase
  if (value < 1000000) return 1.25;  // 25% increase
  return 1.1;                        // 10% increase
}

export async function purchasePlayer(targetId: number) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const buyerId = parseInt(session.user.id);

  if (buyerId === targetId) {
    return { error: "You cannot hire yourself" };
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

    // 4b. Check ownership limit (static cap of 500 owned players)
    const ownershipLimit = 500;

    const [ownershipCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(eq(ownership.ownerId, buyerId));

    if (ownershipCount.count >= ownershipLimit) {
      return { error: `You've reached the maximum limit of ${ownershipLimit} owned players. Discard some players to hire more!` };
    }

    // 5. Get the current owner of target (single owner now)
    const [currentOwner] = await db
      .select()
      .from(ownership)
      .where(eq(ownership.ownedId, targetId));

    // Pre-compute values using tiered multiplier
    const multiplier = getValueMultiplier(target.playerValue);
    const bigPlayerValue = BigInt(target.playerValue);
    const bigIncreased = (bigPlayerValue * BigInt(Math.round(multiplier * 100))) / BigInt(100);
    // Cap at the PostgreSQL bigint limit (2^63 - 1) to prevent overflow
    // Use BigInt for precise arithmetic since values may exceed JS safe integer range (2^53)
    // Ensure minimum increase of 1 to prevent stagnation at small values (integer division truncates)
    const bigNewValue = bigIncreased > bigPlayerValue ? bigIncreased : bigPlayerValue + BigInt(1);
    const canIncrease = bigNewValue <= PG_BIGINT_MAX;
    const newValue = canIncrease ? Number(bigNewValue) : target.playerValue;
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

      // Log purchase income for the original owner (75%)
      try {
        await db.insert(rewardHistory).values({
          userId: currentOwner.ownerId,
          type: "purchase_income",
          amount: ownerShare,
          details: JSON.stringify({
            buyerUsername: buyer.username,
            playerUsername: target.username,
            salePrice: cost,
            share: "75%",
          }),
        });
      } catch (historyError) {
        console.error("Reward history insert error (owner share):", historyError);
      }

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

    // Log purchase income for the purchased player (25%)
    try {
      await db.insert(rewardHistory).values({
        userId: targetId,
        type: "purchase_income",
        amount: playerShare,
        details: JSON.stringify({
          buyerUsername: buyer.username,
          playerUsername: target.username,
          salePrice: cost,
          share: "25%",
        }),
      });
    } catch (historyError) {
      console.error("Reward history insert error (player share):", historyError);
    }

    // 8. Update the target's player value after purchase (tiered increase based on current value, or keep it if at the cap)
    // Also increment the purchase counter
    await db
      .update(users)
      .set({
        playerValue: newValue,
        purchaseCount: sql`${users.purchaseCount} + 1`,
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

    // 12. Goddess countdown logic (only when a goddess is involved)
    let countdownStarted = false;
    let countdownCancelled = false;
    try {
      if (GODDESS_USERNAMES.includes(target.username)) {
        // Get all goddess user IDs
        const goddesses = await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.username, GODDESS_USERNAMES));

        const goddessIds = goddesses.map((g) => g.id);

        // Recount buyer's goddess ownership AFTER the purchase
        const [goddessOwnershipCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(ownership)
          .where(
            and(
              eq(ownership.ownerId, buyerId),
              inArray(ownership.ownedId, goddessIds)
            )
          );

        // Snapshot whatever countdown is currently active (if any)
        const existingCountdown = await getCountdownState();

        // Case A: buyer now owns all 5 goddesses → buyer should hold the countdown
        if (Number(goddessOwnershipCount.count) >= 5) {
          if (existingCountdown.active && existingCountdown.userId === buyerId) {
            // Already counting down for this buyer — nothing to do
          } else {
            // If a DIFFERENT user currently holds the countdown, it must be cancelled
            // first so the frontend toasts "countdown cancelled" before we announce
            // the new challenger. (Without this broadcast, clients would briefly see
            // two countdowns because startCountdown silently overwrites the row.)
            if (
              existingCountdown.active &&
              existingCountdown.userId !== buyerId
            ) {
              try {
                await pusher.trigger("game-global", "countdown-cancelled", {
                  reason: `${buyer.username} hired ${target.username}`,
                  stoppedBy: buyer.username,
                });
              } catch (pusherError) {
                console.error("Pusher error on countdown cancel (takeover):", pusherError);
              }
              countdownCancelled = true;
            }

            // Start new countdown for the buyer (overwrites any prior state)
            await startCountdown(buyerId);
            countdownStarted = true;

            try {
              const countdownState = await getCountdownState();
              await pusher.trigger("game-global", "countdown-started", {
                username: buyer.username,
                userId: buyerId,
                durationMinutes: countdownState.durationMinutes,
              });
            } catch (pusherError) {
              console.error("Pusher error on countdown start:", pusherError);
            }
          }
        } else {
          // Case B: buyer does NOT own all 5. If this purchase stole a goddess away
          // from the current countdown holder, cancel their countdown — but record
          // a grace window so that if they reacquire the goddess within ~2 minutes,
          // their original countdown resumes instead of restarting from zero.
          if (existingCountdown.active && existingCountdown.userId !== buyerId) {
            if (currentOwner && currentOwner.ownerId === existingCountdown.userId) {
              await clearCountdown({
                userId: existingCountdown.userId,
                startedAt: existingCountdown.startedAt,
                durationMinutes: existingCountdown.durationMinutes,
              });
              countdownCancelled = true;

              try {
                await pusher.trigger("game-global", "countdown-cancelled", {
                  reason: `${buyer.username} hired ${target.username}`,
                  stoppedBy: buyer.username,
                });
              } catch (pusherError) {
                console.error("Pusher error on countdown cancel:", pusherError);
              }
            }
          }
        }

      }
    } catch (winCheckError) {
      console.error("Goddess countdown check error:", winCheckError);
      // Don't fail the purchase if countdown check fails
    }

    // 13. Trigger real-time updates via Pusher
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
      countdownStarted,
      countdownCancelled,
      countdownUser: countdownStarted ? buyer.username : undefined,
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Purchase error:", errMsg);
    console.error("Purchase error full:", error);
    return { error: "Purchase failed. Please try again." };
  }
}
