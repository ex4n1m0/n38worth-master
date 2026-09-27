import { db } from "@/db";
import { users, ownership, transactions, gameHistory, rewardHistory } from "@/db/schema";
import { eq, and, sql, inArray, isNotNull } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_PLAYER_VALUE, MAX_CREDITS_SQL, capPlayerValue } from "@/lib/safeguards";
import { GODDESS_USERNAMES, GODDESS_VALUES } from "@/lib/goddesses";
import { getCountdownState, startCountdown, clearCountdown } from "@/lib/goddess-countdown";
import { checkAndAwardMissions, canPurchaseCard } from "@/lib/missions";
import { getGoddessPowers } from "@/lib/goddess-powers";
import { getProfessionPerks } from "@/lib/professionPerks";
import { isAIPlayerUsername, isRemovedAgentUsername } from "@/lib/agent/roster";
import { broadcastMarketPatch } from "@/lib/market-broadcast";

// Helper function to determine value multiplier based on current player value
function getValueMultiplier(value: number): number {
  if (value < 1000) return 2.0;      // 100% increase
  if (value < 10000) return 1.75;    // 75% increase
  if (value < 100000) return 1.5;    // 50% increase
  if (value < 1000000) return 1.25;  // 25% increase
  return 1.1;                        // 10% increase
}

const BLOCK_SELL_DURATION_MS = 30 * 1000; // 30 seconds in milliseconds
const UNBREAKABLE_BLOCK_MS = 30 * 60 * 1000; // 30 minutes for bonus cards & goddesses
const PERM_BLOCK_MS = 24 * 60 * 60 * 1000; // 24 hours for permanent starter blocks
const MAX_PERM_BLOCKS = 10;

export interface BuyPlayerResult {
  success?: boolean;
  error?: string;
  newValue?: number;
  cost?: number;
  avatarUrl?: string | null;
  countdownStarted?: boolean;
  countdownCancelled?: boolean;
  countdownUser?: string;
}

/**
 * Session-free core of the hire/purchase flow.
 *
 * This contains all of the buy mechanics with the buyer supplied explicitly as
 * `buyerId` so it can be reused both by the `purchasePlayer` server action
 * (which resolves the buyer from the auth session) and by automated players
 * such as the AI Agent cron (which has no browser session).
 *
 * Behavior is identical to the original server-action body.
 */
export async function buyPlayerCore(
  buyerId: number,
  targetId: number,
  blockDurationHours: number = 1
): Promise<BuyPlayerResult> {
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
        isNpc: users.isNpc,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, targetId));

    if (!target) {
      return { error: "Player not found" };
    }

    // The removed support Agent can exist in older databases, but is not a card.
    if (isRemovedAgentUsername(target.username)) {
      return { error: "Player not found" };
    }

    // 2. Get buyer
    const [buyer] = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        credits: users.credits,
        hireSlots: users.hireSlots,
        avatarUrl: users.avatarUrl,
        avatarCompleted: users.avatarCompleted,
      })
      .from(users)
      .where(eq(users.id, buyerId));

    if (!buyer) {
      return { error: "Buyer not found" };
    }

    // Bonus cards were removed from the game — no player is ever a bonus card.
    const isBonusCard = false;
    const isGoddess = GODDESS_USERNAMES.includes(target.username);

    // Restrict: buyer must have a completed avatar to hire human players
    const buyerHasAvatar = !!buyer.avatarUrl && buyer.avatarCompleted === 1;
    const targetIsHuman = target.isNpc === 0 && !isBonusCard && !isGoddess;
    if (targetIsHuman && !buyerHasAvatar) {
      return { error: "You need to upload a profile photo before you can hire human players" };
    }

    // Mission lock: goddesses and the 3 passive bonus cards can only be bought
    // with credits once the buyer has obtained them from a mission at least
    // once (i.e. completed the mission that awards them). Single-use action
    // cards and regular players are never locked. `canPurchaseCard` returns
    // true immediately (no DB hit) for non-lockable cards.
    const purchaseUnlocked = await canPurchaseCard(buyerId, target.username);
    if (!purchaseUnlocked) {
      return {
        error: `🔒 ${target.username} is locked. Win it from a mission first to unlock buying it with credits.`,
      };
    }

    // Effective value used for cost & doubling. Bonus cards are clamped to their
    // base value so a card whose value was reset below the base (e.g. released to
    // floor on an owner deletion) still charges/doubles from the base — matching
    // what the market displays.
    const bonusBase = 0;
    const effectiveValue = target.playerValue;

    // Calculate cost: bonus cards cost their current (doubling) value, regular
    // players use the block duration multiplier. (For bonus cards the multiplier
    // is 1, so cost is simply the card's current value.)
    const costMultiplier = isBonusCard ? 1 : Math.max(1, blockDurationHours);

    // All goddesses: cost = value = GODDESS_VALUES. No dynamic pricing.
    let cost: number;
    if (isGoddess) {
      cost = GODDESS_VALUES[target.username] ?? effectiveValue;
    } else {
      cost = effectiveValue * costMultiplier;
    }

    // Bonus cards & goddesses get a fixed 30-min unbreakable initial block.
    // Other players use the buyer-chosen blockDurationHours for their (breakable) block.
    const usesUnbreakableInitialBlock = isBonusCard || isGoddess;

    // 3. Validate buyer has enough credits
    if (buyer.credits < cost) {
      if (isBonusCard) {
        return { error: `Insufficient credits. You need ${cost}¢ to hire ${target.username}` };
      }
      return { error: `Insufficient credits. You need ${cost}¢ (${costMultiplier}x player value)` };
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

    // 4b. Check ownership limit (dynamic per-player hire_slots cap).
    // Server Marshal perk (Extra Racks): +2 hire slots.
    const buyerPerksForSlots = await getProfessionPerks(buyerId);
    const marshalBonus = buyerPerksForSlots.has("Server Marshal") ? 2 : 0;
    const ownershipLimit = buyer.hireSlots + marshalBonus;

    const [ownershipCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(eq(ownership.ownerId, buyerId));

    if (ownershipCount.count >= ownershipLimit) {
      return { error: `You've reached your hire limit of ${ownershipLimit} players. Buy more slots to expand your team!` };
    }

    // 5. Get the current owner of target (single owner now)
    const [currentOwner] = await db
      .select()
      .from(ownership)
      .where(eq(ownership.ownedId, targetId));

    // Note: Goddess of Fate no longer hard-blocks poaching. Instead, Fate
    // holders' teams get permanent sell blocks (set by the fate-seal cron).
    // Players can break the block at 1000× the player's value via the
    // break-partnership API. Normal purchases are blocked by the sell block
    // (blockSellUntil), which is the standard flow for any partnered player.

    // 5b. Check if the target is one of the buyer's onboarding starter NPCs.
    //     If so, skip the partner/sell-block check — onboarding NPCs from the
    //     pool may have stale ownership records with a future blockSellUntil
    //     from a previous player, which would block new players from completing
    //     the onboarding flow. We first fetch the buyer's onboardingNpcs list.
    let isOnboardingNpc = false;
    try {
      const [buyerCheck] = await db
        .select({ onboardingNpcs: users.onboardingNpcs })
        .from(users)
        .where(eq(users.id, buyerId));
      const starterIds = (buyerCheck?.onboardingNpcs as number[]) || [];
      isOnboardingNpc = starterIds.includes(targetId);
    } catch {
      // Onboarding columns may not exist — ignore
    }

    const currentBlockEnd = currentOwner?.blockSellUntil
      ? new Date(currentOwner.blockSellUntil).getTime()
      : 0;
    const permBlockEnd = currentOwner?.permBlockUntil
      ? new Date(currentOwner.permBlockUntil).getTime()
      : 0;
    if ((currentBlockEnd > Date.now() || permBlockEnd > Date.now()) && !isOnboardingNpc) {
      const expiresAt = new Date(Math.max(currentBlockEnd, permBlockEnd));
      const minutesLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 60000);
      return { error: `${target.username} is partnered and cannot be hired for ${minutesLeft} more minute${minutesLeft !== 1 ? "s" : ""}` };
    }

    // 5c. Count how many players the previous owner owns (for bonus calculation)
    let prevOwnerOwnedCount = 0;
    if (currentOwner) {
      const [ownedResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ownership)
        .where(eq(ownership.ownerId, currentOwner.ownerId));
      prevOwnerOwnedCount = ownedResult?.count ?? 0;
    }

    // Pre-compute the post-hire value. Goddesses and bonus cards no longer grow
    // on purchase — they are pinned to their floor value (goddesses:
    // GODDESS_VALUES, bonus cards: BONUS_CARD_VALUES). Only regular players grow,
    // via the tiered multiplier.
    const bigPlayerValue = BigInt(effectiveValue);
    let bigNewValue: bigint;
    if (isGoddess) {
      bigNewValue = BigInt(GODDESS_VALUES[target.username] ?? effectiveValue);
    } else if (isBonusCard) {
      bigNewValue = BigInt(bonusBase);
    } else {
      const multiplier = getValueMultiplier(target.playerValue);
      const bigIncreased = (bigPlayerValue * BigInt(Math.round(multiplier * 100))) / BigInt(100);
      // Ensure minimum increase of 1 to prevent stagnation at small values (integer division truncates)
      bigNewValue = bigIncreased > bigPlayerValue ? bigIncreased : bigPlayerValue + BigInt(1);
    }
    // Cap at MAX_PLAYER_VALUE (1e12). Clamping in BigInt space keeps this precise
    // even if a stored value was already above the ceiling; the result is ≤ 1e12
    // so the Number() conversion is lossless. This guarantees the card stays
    // affordable (cost = value × ≤6h stays far below the credit cap).
    const newValue = Number(bigNewValue > BigInt(MAX_PLAYER_VALUE) ? BigInt(MAX_PLAYER_VALUE) : bigNewValue);
    // Economy boost: previous owner gets 100% + 1% per owned player as bonus,
    // purchased player receives 100%. Buyer pays `cost`, but more credits are minted
    // into the economy based on the previous owner's portfolio size.
    const bonusMultiplier = 1 + (prevOwnerOwnedCount * 0.01); // 100% + 1% per owned player
    const ownerShare = Math.floor(cost * bonusMultiplier);
    const playerShare = cost;

    // 6. Deduct credits from buyer (floor at 0)
    // Note: neon-http does not support transactions, so we execute operations individually
    await db
      .update(users)
      .set({ credits: sql`GREATEST(credits - ${cost}, 0)` })
      .where(eq(users.id, buyerId));

    // 7. Distribute revenue: 100% + bonus to original owner, 100% to the purchased player
    //    (economy-boost: credits are minted on every hire, more for larger portfolios)

    // Give 100% + bonus to the original owner (if exists) — cap to prevent overflow
    // Applies to bonus cards too: previous owner gets paid the standard share.
    if (currentOwner) {
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${ownerShare}, ${sql.raw(MAX_CREDITS_SQL)})` })
        .where(eq(users.id, currentOwner.ownerId));

      // Log purchase income for the original owner (with bonus percentage)
      const bonusPercent = Math.round((bonusMultiplier - 1) * 100);
      try {
        await db.insert(rewardHistory).values({
          userId: currentOwner.ownerId,
          type: "purchase_income",
          amount: ownerShare,
          details: JSON.stringify({
            buyerUsername: buyer.username,
            playerUsername: target.username,
            salePrice: cost,
            share: `${100 + bonusPercent}%`,
            ownedCount: prevOwnerOwnedCount,
            bonusPercent: bonusPercent,
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

    // Give 100% to the purchased player — cap to prevent overflow (skip for bonus cards)
    if (!isBonusCard) {
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${playerShare}, ${sql.raw(MAX_CREDITS_SQL)})` })
        .where(eq(users.id, targetId));

      // Log purchase income for the purchased player (100%)
      try {
        await db.insert(rewardHistory).values({
          userId: targetId,
          type: "purchase_income",
          amount: playerShare,
          details: JSON.stringify({
            buyerUsername: buyer.username,
            playerUsername: target.username,
            salePrice: cost,
            share: "100%",
          }),
        });
      } catch (historyError) {
        console.error("Reward history insert error (player share):", historyError);
      }
    }

    // 8. Update the target's player value after purchase (tiered increase based on current value, or keep it if at the cap)
    // Also increment the purchase counter. `photoScore` doubles as the card
    // "Score" — bumped +1 on every hire for all players (humans and NPCs).
    // Goddesses are excluded (their score is not meaningful). NPCs keep their
    // Unsplash-likes starting score and grow from there.
    await db
      .update(users)
      .set({
        playerValue: newValue,
        purchaseCount: sql`${users.purchaseCount} + 1`,
        ...(!isGoddess ? { photoScore: sql`${users.photoScore} + 1` } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId));

    // 9. Create ownership record — set block sell based on card type:
    //    - Bonus cards & goddesses: fixed 30-min UNBREAKABLE block (no break, even by War/Creation)
    //    - All other players: buyer-chosen hours, fully breakable
    //    - First 10 players a non-Agent user acquires get a 24h unbreakable perm block
    const nowMs = Date.now();
    const blockExpiry = usesUnbreakableInitialBlock
      ? new Date(nowMs + UNBREAKABLE_BLOCK_MS)
      : new Date(nowMs + blockDurationHours * BLOCK_SELL_DURATION_MS);
    const unbreakableUntil = usesUnbreakableInitialBlock
      ? new Date(nowMs + UNBREAKABLE_BLOCK_MS)
      : null;

    let permBlockUntil = null;
    // Auto-assign a 24h perm block to the first 10 cards a non-AI buyer acquires,
    // but ONLY for regular NPC cards — not Goddesses or human players.
    // Only ACTIVE (unexpired) blocks count toward the cap.
    if (!isAIPlayerUsername(buyer.username) && target.isNpc === 1 && !isAIPlayerUsername(target.username)) {
      const [permCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ownership)
        .where(and(
          eq(ownership.ownerId, buyerId),
          isNotNull(ownership.permBlockUntil),
          sql`${ownership.permBlockUntil} > NOW()`
        ));
      if (permCount.count < MAX_PERM_BLOCKS) {
        permBlockUntil = new Date(nowMs + PERM_BLOCK_MS);
      }
    }

    await db.insert(ownership).values({
      ownerId: buyerId,
      ownedId: targetId,
      purchasePrice: cost,
      blockSellUntil: blockExpiry,
      blockSellBy: buyer.username,
      blockUnbreakableUntil: unbreakableUntil,
      permBlockUntil,
    });

    // 9b. Award +1 hire slot when hiring a player that already had a boss (economy incentive)
    if (currentOwner && !isBonusCard) {
      try {
        await db
          .update(users)
          .set({
            hireSlots: sql`${users.hireSlots} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, buyerId));

        await db.insert(rewardHistory).values({
          userId: buyerId,
          type: "slot_reward",
          amount: 1,
          details: JSON.stringify({
            reason: "hired_player_with_boss",
            playerUsername: target.username,
          }),
        });
      } catch (slotError) {
        console.error("Hire slot reward error:", slotError);
      }
    }

    // 9c. Apply immediate bonus for bonus cards (first bonus on hire, then hourly cron takes over)
    if (isBonusCard) {
      try {
        const now = new Date();

        // Bonus Own Value: +10% if value < 100, otherwise +1%
        if (target.username === "Bonus Own Value") {
          const currentValue = BigInt(buyer.playerValue);
          // Use 10% for small values (< 100), otherwise 1%
          const percentage = buyer.playerValue < 100 ? BigInt(10) : BigInt(100);
          const increase = currentValue / percentage;
          const bonusNewValue = currentValue + increase;
          const cappedValue = bonusNewValue > BigInt(MAX_PLAYER_VALUE) ? BigInt(MAX_PLAYER_VALUE) : bonusNewValue;

          await db
            .update(users)
            .set({
              playerValue: Number(cappedValue),
              updatedAt: now,
            })
            .where(eq(users.id, buyerId));
        }

        // Bonus Owned Players: +1% to all owned players' values
        else if (target.username === "Bonus Owned Players") {
          const ownedPlayers = await db
            .select({
              id: users.id,
              playerValue: users.playerValue,
            })
            .from(ownership)
            .innerJoin(users, eq(ownership.ownedId, users.id))
            .where(eq(ownership.ownerId, buyerId));

          for (const player of ownedPlayers) {
            const currentValue = BigInt(player.playerValue);
            // Use 10% for small values (< 100), otherwise 1%
            const percentage = player.playerValue < 100 ? BigInt(10) : BigInt(100);
            const increase = currentValue / percentage;
            const bonusNewValue = currentValue + increase;
            const cappedValue = bonusNewValue > BigInt(MAX_PLAYER_VALUE) ? BigInt(MAX_PLAYER_VALUE) : bonusNewValue;

            await db
              .update(users)
              .set({
                playerValue: Number(cappedValue),
                updatedAt: now,
              })
              .where(eq(users.id, player.id));
          }
        }

        // Bonus Player Slot: +1 hire slot
        else if (target.username === "Bonus Player Slot") {
          await db
            .update(users)
            .set({
              hireSlots: sql`${users.hireSlots} + 1`,
              updatedAt: now,
            })
            .where(eq(users.id, buyerId));
        }
      } catch (bonusError) {
        console.error("Immediate bonus application error:", bonusError);
        // Don't fail the purchase if bonus application fails
      }
    }

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
      details: JSON.stringify({ amount: cost, newValue, ...(currentOwner ? { previousOwnerId: currentOwner.ownerId } : {}) }),
    });

    // Broadcast the market patch so other players' views update instantly
    // (public channel — no extra API invocations; see src/lib/market-events.ts).
    await broadcastMarketPatch({
      targetId,
      username: target.username,
      value: newValue,
      ownerCount: 1,
      ...(isGoddess ? {} : { photoScoreDelta: 1 }),
      ownedDeltas: [
        { id: buyerId, delta: 1 },
        ...(currentOwner ? [{ id: currentOwner.ownerId, delta: -1 }] : []),
      ],
      reason: "purchase",
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

        // Case A: buyer now owns all 6 goddesses → buyer should hold the countdown
        if (Number(goddessOwnershipCount.count) >= 6) {
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
                // M3 (2026-09-27): render-from-event timing (see purchasePlayer).
                startedAt: countdownState.startedAt,
                expiresAt: countdownState.expiresAt,
              });
            } catch (pusherError) {
              console.error("Pusher error on countdown start:", pusherError);
            }
          }
        } else {
          // Case B: buyer does NOT own all 6. If this purchase stole a goddess away
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

    // 12b. Marketplace missions: award free reward cards when the buyer's
    //      owned-card count crosses a mission threshold. Never fails the hire.
    try {
      await checkAndAwardMissions(buyerId);
    } catch (missionError) {
      console.error("Mission award check error:", missionError);
    }

    // 13. Trigger real-time updates via Pusher
    try {
      const pusherPromises = [
        pusher.trigger(`player-${targetId}`, "purchased", {
          buyerUsername: buyer.username,
          newValue,
          // Income the hired card earns (100% of sale price); used by the
          // client to fire the "POACHED!" flash for the bought player too.
          amount: isBonusCard ? 0 : playerShare,
          buyerAvatar: buyer.avatarUrl,
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
            fromPlayerAvatar: target.avatarUrl,
            buyer: buyer.username,
            buyerAvatar: buyer.avatarUrl,
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
      avatarUrl: target.avatarUrl,
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

/**
 * Core break-partnership logic — clears a sell block on a target card, charges
 * the break fee (1000× for Fate-sealed, 0 for War holders, otherwise
 * ceil(hoursRemaining) × value), then runs a normal purchase to transfer
 * ownership. Used by the API route (via auth) and the AI Agent (server-side,
 * no session). Returns the same shape as BuyPlayerResult plus break cost info.
 */
export interface BreakPartnershipResult {
  success?: boolean;
  error?: string;
  breakCost?: number;
  purchaseCost?: number;
  totalCost?: number;
  newValue?: number;
  targetUsername?: string;
  countdownStarted?: boolean;
  needsProfession?: boolean;
  targetId?: number;
}

export async function breakPartnershipCore(
  buyerId: number,
  targetId: number
): Promise<BreakPartnershipResult> {
  if (targetId === buyerId) {
    return { error: "Cannot break your own partnership" };
  }

  // Load the current ownership record for target
  const [ownershipRecord] = await db
    .select()
    .from(ownership)
    .where(eq(ownership.ownedId, targetId));

  if (!ownershipRecord) {
    return { error: "This player has no active partnership to break" };
  }

  // Goddess of Fate: the owner's team has permanent sell blocks. Breaking
  // them is allowed but costs 1000× the player's current value (instead of
  // the normal hourly break fee). War power does NOT waive this Fate fee.
  let ownerHasFate = false;
  if (ownershipRecord.ownerId !== buyerId) {
    const ownerPowers = await getGoddessPowers(ownershipRecord.ownerId);
    ownerHasFate = ownerPowers.hasFate;
  }

  // Check for an active unbreakable window first (perm block counts as unbreakable)
  const now = Date.now();
  const unbreakableEnd = ownershipRecord.blockUnbreakableUntil
    ? new Date(ownershipRecord.blockUnbreakableUntil).getTime()
    : 0;
  const permBlockEnd = ownershipRecord.permBlockUntil
    ? new Date(ownershipRecord.permBlockUntil).getTime()
    : 0;
  if (unbreakableEnd > now || permBlockEnd > now) {
    const minutesLeft = Math.ceil((Math.max(unbreakableEnd, permBlockEnd) - now) / 60000);
    return {
      error: `This partnership is unbreakable for ${minutesLeft} more minute${minutesLeft !== 1 ? "s" : ""} and cannot be broken by any means.`,
    };
  }

  // Verify there is actually an active sell block
  const blockEnd = ownershipRecord.blockSellUntil ? new Date(ownershipRecord.blockSellUntil).getTime() : 0;
  const remainingMs = Math.max(0, blockEnd - now);

  if (remainingMs <= 0) {
    return { error: "No active sell block — use the regular hire button" };
  }

  // Load target value
  const [target] = await db
    .select({ id: users.id, username: users.username, playerValue: users.playerValue, credits: users.credits })
    .from(users)
    .where(eq(users.id, targetId));

  if (!target) {
    return { error: "Target player not found" };
  }

  // Load buyer
  const [buyer] = await db
    .select({ id: users.id, credits: users.credits, username: users.username })
    .from(users)
    .where(eq(users.id, buyerId));

  if (!buyer) {
    return { error: "Buyer not found" };
  }

  // Check buyer doesn't already own this player
  const [alreadyOwns] = await db
    .select({ id: ownership.id })
    .from(ownership)
    .where(and(eq(ownership.ownerId, buyerId), eq(ownership.ownedId, targetId)));

  if (alreadyOwns) {
    return { error: "You already own this player" };
  }

  // Calculate break fee
  const buyerPowers = await getGoddessPowers(buyerId);
  let breakCost: number;
  if (ownerHasFate) {
    breakCost = Number(target.playerValue) * 1000;
  } else if (buyerPowers.hasWar) {
    breakCost = 0;
  } else {
    const hoursRemaining = Math.ceil(remainingMs / (60 * 60 * 1000));
    breakCost = hoursRemaining * Number(target.playerValue);
    // Zero-Day perk (Exploit Chain): normal break fees are 20%
    // cheaper. Does not touch the Fate 1000× fee or War's free breaks.
    const buyerPerks = await getProfessionPerks(buyerId);
    if (buyerPerks.has("Zero-Day")) {
      breakCost = Math.round(breakCost * 0.8);
    }
  }

  // Buyer must afford break fee + normal purchase price
  const totalCost = breakCost + Number(target.playerValue);
  if (Number(buyer.credits) < totalCost) {
    return { error: `Not enough credits. Need ${totalCost} (${breakCost} break fee + ${target.playerValue} hire)` };
  }

  // Deduct break fee from buyer (0 for War holders)
  if (breakCost > 0) {
    await db
      .update(users)
      .set({ credits: sql`credits - ${breakCost}` })
      .where(eq(users.id, buyerId));

    // Credit break fee to the current owner (compensation)
    await db
      .update(users)
      .set({ credits: sql`LEAST(credits + ${breakCost}, ${sql.raw(MAX_CREDITS_SQL)})` })
      .where(eq(users.id, ownershipRecord.ownerId));
  }

  // Clear the sell block on the ownership record so purchasePlayer can proceed
  await db
    .update(ownership)
    .set({ blockSellUntil: null, blockSellBy: null })
    .where(eq(ownership.id, ownershipRecord.id));

  // Now run the normal purchase (standard 1-hour block for new owner)
  const { purchasePlayer } = await import("@/actions/purchasePlayer");
  const purchaseResult = await purchasePlayer(targetId, 1);

  if (purchaseResult.error) {
    // Rollback: refund break fee to buyer, re-credit owner
    if (breakCost > 0) {
      await db
        .update(users)
        .set({ credits: sql`LEAST(credits + ${breakCost}, ${sql.raw(MAX_CREDITS_SQL)})` })
        .where(eq(users.id, buyerId));
    }
    return { error: purchaseResult.error };
  }

  return {
    success: true,
    breakCost,
    purchaseCost: Number(target.playerValue),
    totalCost,
    newValue: purchaseResult.newValue,
    targetUsername: target.username,
    countdownStarted: purchaseResult.countdownStarted,
    needsProfession: purchaseResult.needsProfession,
    targetId: purchaseResult.targetId,
  };
}

/**
 * Core block-sell logic — protects an owned card from being sold/poached by
 * extending its sell block. Costs 100% of the card's value per hour, bumps the
 * card's value by 10%, and pays 90% of the cost to the card. Used by the API
 * route (via auth) and the AI Agent (server-side, no session).
 */
export interface BlockSellCoreResult {
  success?: boolean;
  error?: string;
  cost?: number;
  ownedUsername?: string;
  expiresAt?: string;
  totalHours?: number;
}

const SELL_BLOCK_COST_PERCENT = 1.0;
const SELL_BLOCK_DURATION_MS = 1 * 60 * 60 * 1000;
const SELL_BLOCK_MAX_MS = 12 * 60 * 60 * 1000;

export async function blockSellCore(
  ownerId: number,
  ownershipId: number
): Promise<BlockSellCoreResult> {
  try {
    const [record] = await db
      .select()
      .from(ownership)
      .where(and(eq(ownership.id, ownershipId), eq(ownership.ownerId, ownerId)));

    if (!record) {
      return { error: "Ownership record not found. You must be the owner." };
    }

    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, ownerId));

    if (!owner) return { error: "Owner not found" };

    const [ownedPlayer] = await db
      .select()
      .from(users)
      .where(eq(users.id, record.ownedId));

    if (!ownedPlayer) return { error: "Player not found" };

    const cost = Math.max(1, Math.round(SELL_BLOCK_COST_PERCENT * Number(ownedPlayer.playerValue)));
    const newValue = capPlayerValue(Math.round(Number(ownedPlayer.playerValue) * 1.10));
    const creditsToPlayer = Math.round(cost * 0.90);

    if (Number(owner.credits) < cost) {
      return { error: `Not enough credits. Need ${cost}` };
    }

    const currentBlockEnd = record.blockSellUntil && new Date(record.blockSellUntil) > new Date()
      ? new Date(record.blockSellUntil).getTime()
      : Date.now();

    const remainingBlockMs = Math.max(0, currentBlockEnd - Date.now());
    if (remainingBlockMs >= SELL_BLOCK_MAX_MS) {
      return { error: "Sell block already at 12h max" };
    }

    // Cryptographer perk (Deep Encryption): sell blocks last +50% longer per press.
    const perks = await getProfessionPerks(ownerId);
    const durationMs = perks.has("Cryptographer")
      ? Math.round(SELL_BLOCK_DURATION_MS * 1.5)
      : SELL_BLOCK_DURATION_MS;

    const newExpiresAt = new Date(currentBlockEnd + durationMs);
    const totalHoursRemaining = Math.ceil((newExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60));

    await db
      .update(users)
      .set({ credits: sql`credits - ${cost}`, updatedAt: new Date() })
      .where(eq(users.id, ownerId));

    await db
      .update(users)
      .set({
        credits: sql`LEAST(credits + ${creditsToPlayer}, ${sql.raw(MAX_CREDITS_SQL)})`,
        playerValue: newValue,
      })
      .where(eq(users.id, record.ownedId));

    await db
      .update(ownership)
      .set({ blockSellUntil: newExpiresAt, blockSellBy: owner.username })
      .where(eq(ownership.id, ownershipId));

    return {
      success: true,
      cost,
      ownedUsername: ownedPlayer.username,
      expiresAt: newExpiresAt.toISOString(),
      totalHours: totalHoursRemaining,
    };
  } catch (error) {
    console.error("Block sell core error:", error);
    return { error: "Block sell failed" };
  }
}
