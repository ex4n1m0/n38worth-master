import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { sql, eq, inArray, and, isNotNull, ne } from "drizzle-orm";
import { GODDESS_USERNAMES } from "@/lib/goddesses";

/**
 * Fate Seal cron — ensures all players owned by a Goddess of Fate (or Creation)
 * holder have a permanent sell block, and removes Fate seals from players whose
 * owners no longer hold the Fate power.
 *
 * Runs every minute. Uses a far-future timestamp (year 2099) as the "permanent"
 * block. The break-partnership API charges 1000× the player's value to break it.
 */
const FATE_SEAL_DATE = new Date("2099-12-31T23:59:59Z");

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // 1. Find all users who currently own the Goddess of Fate or Goddess (Creation).
    const fateHolders = await db
      .select({ ownerId: ownership.ownerId })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(inArray(users.username, ["Goddess of Fate", "Goddess"]));

    const fateHolderIds = [...new Set(fateHolders.map((r) => r.ownerId))];

    // 2. Set permanent sell blocks on all players owned by Fate holders
    //    (only if not already sealed).
    let sealedCount = 0;
    if (fateHolderIds.length > 0) {
      // First, find ownership records that need sealing (blockSellUntil is null
      // or not far-future).
      const toSeal = await db
        .select({ id: ownership.id })
        .from(ownership)
        .where(
          and(
            inArray(ownership.ownerId, fateHolderIds),
            sql`${ownership.blockSellUntil} IS NULL OR ${ownership.blockSellUntil} < ${FATE_SEAL_DATE}`
          )
        );

      if (toSeal.length > 0) {
        // Update in bulk — set blockSellUntil to far future, mark as Fate seal.
        await db
          .update(ownership)
          .set({
            blockSellUntil: FATE_SEAL_DATE,
            blockSellBy: "Goddess of Fate",
          })
          .where(
            and(
              inArray(ownership.ownerId, fateHolderIds),
              sql`${ownership.blockSellUntil} IS NULL OR ${ownership.blockSellUntil} < ${FATE_SEAL_DATE}`
            )
          );
        sealedCount = toSeal.length;
      }
    }

    // 3. Remove Fate seals from players whose owners no longer hold Fate.
    //    A "Fate seal" is identified by blockSellBy = 'Goddess of Fate' and
    //    blockSellUntil = the far-future date.
    let unsealedCount = 0;
    const staleSeals = await db
      .select({ id: ownership.id })
      .from(ownership)
      .where(
        and(
          eq(ownership.blockSellBy, "Goddess of Fate"),
          sql`${ownership.blockSellUntil} = ${FATE_SEAL_DATE}`,
          // Owner is NOT a Fate holder
          fateHolderIds.length > 0
            ? sql`${ownership.ownerId} NOT IN (${sql.join(fateHolderIds.map((id) => sql`${id}`), sql`, `)})`
            : sql`TRUE`
        )
      );

    if (staleSeals.length > 0) {
      await db
        .update(ownership)
        .set({
          blockSellUntil: null,
          blockSellBy: null,
        })
        .where(
          and(
            eq(ownership.blockSellBy, "Goddess of Fate"),
            sql`${ownership.blockSellUntil} = ${FATE_SEAL_DATE}`,
            fateHolderIds.length > 0
              ? sql`${ownership.ownerId} NOT IN (${sql.join(fateHolderIds.map((id) => sql`${id}`), sql`, `)})`
              : sql`TRUE`
          )
        );
      unsealedCount = staleSeals.length;
    }

    return NextResponse.json({
      success: true,
      fateHolders: fateHolderIds.length,
      sealed: sealedCount,
      unsealed: unsealedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Fate seal cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
