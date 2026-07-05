import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, inArray } from "drizzle-orm";
import { BONUS_CARD_USERNAMES } from "@/lib/bonus-cards";
import { PG_BIGINT_MAX } from "@/lib/safeguards";

export async function GET(req: Request) {
  // Verify the request is from Vercel Cron (skip if CRON_SECRET not configured)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();

    // Get all bonus cards with their owners
    const bonusCards = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        ownerId: ownership.ownerId,
      })
      .from(users)
      .leftJoin(ownership, eq(ownership.ownedId, users.id))
      .where(inArray(users.username, BONUS_CARD_USERNAMES));

    // Group by bonus card type
    const bonusOwnValue = bonusCards.find(c => c.username === "Bonus Own Value");
    const bonusOwnedPlayers = bonusCards.find(c => c.username === "Bonus Owned Players");
    const bonusPlayerSlot = bonusCards.find(c => c.username === "Bonus Player Slot");

    const results = {
      ownValue: { processed: 0, errors: [] as string[] },
      ownedPlayers: { processed: 0, errors: [] as string[] },
      playerSlot: { processed: 0, errors: [] as string[] },
    };

    // 1. Bonus Own Value: Owner's own player value increases by 1%
    if (bonusOwnValue?.ownerId) {
      try {
        const [owner] = await db
          .select({ id: users.id, playerValue: users.playerValue, username: users.username })
          .from(users)
          .where(eq(users.id, bonusOwnValue.ownerId));

        if (owner) {
          // Calculate increase: 10% if value < 100, otherwise 1%
          const currentValue = BigInt(owner.playerValue);
          const percentage = owner.playerValue < 100 ? BigInt(10) : BigInt(100);
          const increase = currentValue / percentage;
          const newValue = currentValue + increase;

          // Cap at PostgreSQL bigint limit
          const cappedValue = newValue > PG_BIGINT_MAX ? PG_BIGINT_MAX : newValue;

          await db
            .update(users)
            .set({
              playerValue: Number(cappedValue),
              updatedAt: now,
            })
            .where(eq(users.id, owner.id));

          results.ownValue.processed++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.ownValue.errors.push(`Bonus Own Value: ${errorMsg}`);
      }
    }

    // 2. Bonus Owned Players: All owned players' values increase by 1%
    if (bonusOwnedPlayers?.ownerId) {
      try {
        // Get all players owned by the bonus card holder
        const ownedPlayers = await db
          .select({
            id: users.id,
            playerValue: users.playerValue,
            username: users.username,
          })
          .from(ownership)
          .innerJoin(users, eq(ownership.ownedId, users.id))
          .where(eq(ownership.ownerId, bonusOwnedPlayers.ownerId));

        for (const player of ownedPlayers) {
          try {
            // Calculate increase: 10% if value < 100, otherwise 1%
            const currentValue = BigInt(player.playerValue);
            const percentage = player.playerValue < 100 ? BigInt(10) : BigInt(100);
            const increase = currentValue / percentage;
            const newValue = currentValue + increase;

            // Cap at PostgreSQL bigint limit
            const cappedValue = newValue > PG_BIGINT_MAX ? PG_BIGINT_MAX : newValue;

            await db
              .update(users)
              .set({
                playerValue: Number(cappedValue),
                updatedAt: now,
              })
              .where(eq(users.id, player.id));

            results.ownedPlayers.processed++;
          } catch (playerError) {
            const errorMsg = playerError instanceof Error ? playerError.message : String(playerError);
            results.ownedPlayers.errors.push(`Player ${player.username}: ${errorMsg}`);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.ownedPlayers.errors.push(`Bonus Owned Players: ${errorMsg}`);
      }
    }

    // 3. Bonus Player Slot: Owner gains +1 hire slot
    if (bonusPlayerSlot?.ownerId) {
      try {
        const [owner] = await db
          .select({ id: users.id, hireSlots: users.hireSlots, username: users.username })
          .from(users)
          .where(eq(users.id, bonusPlayerSlot.ownerId));

        if (owner) {
          await db
            .update(users)
            .set({
              hireSlots: sql`${users.hireSlots} + 1`,
              updatedAt: now,
            })
            .where(eq(users.id, owner.id));

          results.playerSlot.processed++;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.playerSlot.errors.push(`Bonus Player Slot: ${errorMsg}`);
      }
    }

    return NextResponse.json({
      success: true,
      skipped: false,
      message: "Bonus cards powers applied",
      results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Bonus cards cron error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to apply bonus cards powers", details: errorMessage },
      { status: 500 }
    );
  }
}
