"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, transactions, gameHistory } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { pusher } from "@/lib/pusher-server";
import { MAX_CREDITS_SQL } from "@/lib/safeguards";
import { broadcastMarketPatch } from "@/lib/market-broadcast";

export async function letGoPlayer(otherId: number) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const ownerId = parseInt(session.user.id);

  try {
    // Check if owner owns this player
    const [ownershipRecord] = await db
      .select()
      .from(ownership)
      .where(
        and(
          eq(ownership.ownerId, ownerId),
          eq(ownership.ownedId, otherId)
        )
      );

    if (!ownershipRecord) {
      return { error: "You don't own this player" };
    }

    // Get the player info
    const [targetPlayer] = await db
      .select()
      .from(users)
      .where(eq(users.id, otherId));

    if (!targetPlayer) {
      return { error: "Avatar not found" };
    }

    // Check if the ownership has an active sell block
    if (ownershipRecord.blockSellUntil && new Date(ownershipRecord.blockSellUntil) > new Date()) {
      const expiresAt = new Date(ownershipRecord.blockSellUntil);
      const minutesLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 60000);
      return { error: `${targetPlayer.username} is firewalled and can't be let go for ${minutesLeft} more minute${minutesLeft !== 1 ? "s" : ""}` };
    }

    const letGoCost = targetPlayer.playerValue;

    // Get owner info
    const [owner] = await db
      .select({
        id: users.id,
        username: users.username,
        credits: users.credits,
      })
      .from(users)
      .where(eq(users.id, ownerId));

    if (!owner) {
      return { error: "Owner not found" };
    }

    // Check owner has enough credits
    if (owner.credits < letGoCost) {
      return { error: `Not enough credits. Need ${letGoCost}¢ to let go` };
    }

    // 1. Deduct cost from owner (they pay to release the player)
    await db
      .update(users)
      .set({ credits: sql`GREATEST(credits - ${letGoCost}, 0)` })
      .where(eq(users.id, ownerId));

    // 2. Give 100% to the player (not resetting value)
    await db
      .update(users)
      .set({
        credits: sql`LEAST(credits + ${letGoCost}, ${sql.raw(MAX_CREDITS_SQL)})`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, otherId));

    // 3. Remove ownership record
    await db
      .delete(ownership)
      .where(eq(ownership.id, ownershipRecord.id));

    // Broadcast: card released — ownerless, value unchanged, owner owns one less.
    await broadcastMarketPatch({
      targetId: otherId,
      ownerCount: 0,
      ownedDeltas: [{ id: ownerId, delta: -1 }],
      reason: "let-go",
    });

    // 4. If player is NPC, set ownerlessAt
    if (targetPlayer.isNpc === 1) {
      await db
        .update(users)
        .set({ ownerlessAt: new Date() })
        .where(eq(users.id, otherId));
    }

    // 5. Log transaction
    await db.insert(transactions).values({
      buyerId: ownerId,
      targetId: otherId,
      type: "let_go",
      amount: letGoCost,
    });

    // 6. Log to game history
    await db.insert(gameHistory).values({
      eventType: "let_go",
      actorId: ownerId,
      targetId: otherId,
      targetUsername: targetPlayer.username,
      details: JSON.stringify({ amount: letGoCost, valueKept: targetPlayer.playerValue }),
    });

    // 7. Trigger real-time updates
    try {
      await Promise.all([
        pusher.trigger(`player-${ownerId}`, "credits-updated", {
          newCredits: owner.credits - letGoCost,
        }),
        pusher.trigger(`player-${otherId}`, "ownership-changed", {
          type: "let_go",
          initiator: owner.username,
          newValue: targetPlayer.playerValue,
        }),
      ]);
    } catch (pusherError) {
      console.error("Pusher error:", pusherError);
    }

    return {
      success: true,
      letGoCost,
      playerValue: targetPlayer.playerValue,
    };
  } catch (error) {
    console.error("Let go error:", error);
    return { error: "Let go failed. Please try again." };
  }
}
