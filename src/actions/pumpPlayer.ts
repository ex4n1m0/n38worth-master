"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, messages, gameHistory } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL, capPlayerValue } from "@/lib/safeguards";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { getProfessionPerks } from "@/lib/professionPerks";

const BLOCK_SELL_COST_PERCENT = 1.0; // 100% of player value per press
const PUMP_BLOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes per press
const MAX_BLOCK_MS = 12 * 60 * 60 * 1000; // 12-hour hard cap
const VALUE_MULTIPLIER = 2; // 2x (100% increase)

export async function pumpPlayer(input: { ownershipId?: number; targetId?: number }) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const ownerId = parseInt(session.user.id);

  try {
    // Resolve ownership record — caller may provide ownershipId or targetId (player's user ID)
    let record: typeof ownership.$inferSelect | undefined;

    if (input.ownershipId) {
      const [found] = await db
        .select()
        .from(ownership)
        .where(
          and(
            eq(ownership.id, input.ownershipId),
            eq(ownership.ownerId, ownerId)
          )
        );
      record = found;
    } else if (input.targetId) {
      const [found] = await db
        .select()
        .from(ownership)
        .where(
          and(
            eq(ownership.ownedId, input.targetId),
            eq(ownership.ownerId, ownerId)
          )
        );
      record = found;
    } else {
      return { error: "Either ownershipId or targetId is required" };
    }

    if (!record) {
      return { error: "Ownership record not found. You must be the owner." };
    }

    // Get owner info
    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, ownerId));

    if (!owner) {
      return { error: "Owner not found" };
    }

    // Get owned player info
    const [ownedPlayer] = await db
      .select()
      .from(users)
      .where(eq(users.id, record.ownedId));

    if (!ownedPlayer) {
      return { error: "Player not found" };
    }

    // Calculate cost: 100% of owned player's value.
    // Overclocker perk (Turbo Boost): pump costs 10% less, same effect.
    const perks = await getProfessionPerks(ownerId);
    const costPercent = perks.has("Overclocker")
      ? BLOCK_SELL_COST_PERCENT * 0.9
      : BLOCK_SELL_COST_PERCENT;
    const cost = Math.max(1, Math.round(costPercent * ownedPlayer.playerValue));
    const newValue = capPlayerValue(Math.round(ownedPlayer.playerValue * VALUE_MULTIPLIER));
    const creditsToPlayer = cost; // 100% of cost goes to player

    // Check if owner has enough credits
    if (owner.credits < cost) {
      return { error: `Not enough credits. You need ${cost}¢ (100% of ${ownedPlayer.username}'s value of ${ownedPlayer.playerValue}¢)` };
    }

    // Calculate new expiry: if already blocked, extend from current expiry; otherwise from now
    const currentBlockEnd = record.blockSellUntil && new Date(record.blockSellUntil) > new Date()
      ? new Date(record.blockSellUntil).getTime()
      : Date.now();

    // 12-hour hard cap on total sell block
    const remainingBlockMs = Math.max(0, currentBlockEnd - Date.now());
    if (remainingBlockMs >= MAX_BLOCK_MS) {
      return { error: "Sell block is already at the 12-hour maximum. Wait for it to decrease before adding more." };
    }

    const newExpiresAt = new Date(currentBlockEnd + PUMP_BLOCK_DURATION_MS);
    const totalMinutesRemaining = Math.ceil((newExpiresAt.getTime() - Date.now()) / (1000 * 60));

    // Deduct credits from the owner
    await db
      .update(users)
      .set({
        credits: sql`credits - ${cost}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ownerId));

    // Pay the owned player + bump value — cap to prevent overflow. `photoScore`
    // doubles as the card "Score" — bumped +1 on every pump for all players
    // (humans and NPCs). Goddesses are excluded. NPCs keep their Unsplash-likes
    // starting score and grow from here.
    const pumpedIsGoddess = GODDESS_USERNAMES.includes(ownedPlayer.username);
    await db
      .update(users)
      .set({
        credits: sql`LEAST(credits + ${creditsToPlayer}, ${sql.raw(MAX_CREDITS_SQL)})`,
        playerValue: newValue,
        ...(!pumpedIsGoddess ? { photoScore: sql`${users.photoScore} + 1` } : {}),
      })
      .where(eq(users.id, record.ownedId));

    // Set block on the ownership record
    await db
      .update(ownership)
      .set({
        blockSellUntil: newExpiresAt,
        blockSellBy: owner.username,
      })
      .where(eq(ownership.id, record.id));

    // Log to game history so pumps show up in the History feed ("PUMPS" filter).
    try {
      await db.insert(gameHistory).values({
        eventType: "pump",
        actorId: ownerId,
        targetId: record.ownedId,
        targetUsername: ownedPlayer.username,
        details: JSON.stringify({ amount: cost, newValue }),
      });
    } catch (e) {
      console.error("Pump game history insert error:", e);
    }

    // Send a DM chat message to the owned player about the pump
    const now = new Date();
    const timestamp = now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const blockContent = `🚀 ${owner.username} PUMPED you! +10m block, value → ${newValue}¢ (+${creditsToPlayer}¢ gifted) — ${timestamp}`;

    const [blockMessage] = await db
      .insert(messages)
      .values({
        senderId: ownerId,
        recipientId: record.ownedId,
        content: blockContent,
        type: "private",
      })
      .returning();

    // Push real-time DM notification to both parties
    const messagePayload = {
      id: blockMessage.id,
      content: blockMessage.content,
      type: blockMessage.type,
      createdAt: blockMessage.createdAt,
      sender: {
        id: ownerId,
        username: owner.username,
        avatarUrl: owner.avatarUrl,
      },
      recipientId: record.ownedId,
      recipientUsername: ownedPlayer.username,
    };

    try {
      await Promise.all([
        pusher.trigger(`chat-private-${ownerId}`, "new-message", messagePayload),
        pusher.trigger(`chat-private-${record.ownedId}`, "new-message", messagePayload),
        pusher.trigger(`player-${record.ownedId}`, "credits-updated", {
          message: `${owner.username} OVERCLOCKED you! You received ${creditsToPlayer}¢`,
        }),
        pusher.trigger(`player-${ownerId}`, "credits-updated", {
          newCredits: owner.credits - cost,
        }),
      ]);
    } catch (e) {
      // Pusher errors are non-critical
    }

    return {
      success: true,
      cost,
      newValue,
      ownedUsername: ownedPlayer.username,
      expiresAt: newExpiresAt.toISOString(),
      totalMinutes: totalMinutesRemaining,
    };
  } catch (error) {
    console.error("Pump player error:", error);
    return { error: "Pump failed. Please try again." };
  }
}