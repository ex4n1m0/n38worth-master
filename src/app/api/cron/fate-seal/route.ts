import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { sql, eq, inArray, and } from "drizzle-orm";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { getGoddessPowers } from "@/lib/goddess-powers";

/**
 * Fate Seal cron — ensures all players owned by a Goddess of Fate (or Creation)
 * holder have a permanent sell block, and removes Fate seals from players whose
 * owners no longer hold the Fate power (or have toggled it OFF).
 *
 * Runs every minute. Uses a far-future timestamp (year 2099) as the "permanent"
 * block. The break-partnership API charges 1000× the player's value to break it.
 *
 * IMPORTANT: Goddesses themselves are NEVER sealed (their value is pinned and
 * they have their own unbreakable block during the initial 30-min window).
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

    // Filter to only holders whose Fate power is actually ENABLED (not toggled off).
    const fateHolderIds: number[] = [];
    for (const h of fateHolders) {
      if (h.ownerId == null) continue;
      try {
        const powers = await getGoddessPowers(h.ownerId);
        if (powers.hasFate) fateHolderIds.push(h.ownerId);
      } catch {
        // If we can't check, skip — don't seal for unknown power state.
      }
    }

    // 2. Set permanent sell blocks on all players owned by Fate holders
    //    (only if not already sealed). EXCLUDE goddesses — their value is pinned
    //    and they have their own protection.
    let sealedCount = 0;
    if (fateHolderIds.length > 0) {
      // Find ownership records that need sealing, excluding goddesses.
      const toSeal = await db
        .select({ id: ownership.id, ownedId: ownership.ownedId })
        .from(ownership)
        .innerJoin(users, eq(ownership.ownedId, users.id))
        .where(
          and(
            inArray(ownership.ownerId, fateHolderIds),
            sql`${ownership.blockSellUntil} IS NULL OR ${ownership.blockSellUntil} < ${FATE_SEAL_DATE}`,
            // Exclude goddesses — never seal them
            sql`${users.username} NOT IN (${sql.join(GODDESS_USERNAMES.map((u) => sql`${u}`), sql`, `)})`
          )
        );

      if (toSeal.length > 0) {
        const sealIds = toSeal.map((r) => r.id);
        await db
          .update(ownership)
          .set({
            blockSellUntil: FATE_SEAL_DATE,
            blockSellBy: "Goddess of Fate",
          })
          .where(inArray(ownership.id, sealIds));
        sealedCount = toSeal.length;
      }
    }

    // 3. Remove Fate seals from players whose owners no longer hold Fate (or
    //    have toggled it off). A "Fate seal" is identified by blockSellBy =
    //    'Goddess of Fate' and blockSellUntil = the far-future date.
    let unsealedCount = 0;
    const staleSeals = await db
      .select({ id: ownership.id })
      .from(ownership)
      .where(
        and(
          eq(ownership.blockSellBy, "Goddess of Fate"),
          sql`${ownership.blockSellUntil} = ${FATE_SEAL_DATE}`,
          // Owner is NOT an active Fate holder
          fateHolderIds.length > 0
            ? sql`${ownership.ownerId} NOT IN (${sql.join(fateHolderIds.map((id) => sql`${id}`), sql`, `)})`
            : sql`TRUE`
        )
      );

    if (staleSeals.length > 0) {
      const staleIds = staleSeals.map((r) => r.id);
      await db
        .update(ownership)
        .set({
          blockSellUntil: null,
          blockSellBy: null,
        })
        .where(inArray(ownership.id, staleIds));
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
