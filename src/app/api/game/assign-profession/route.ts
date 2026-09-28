import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, gameHistory } from "@/db/schema";
import { and, eq, ne, isNotNull, sql } from "drizzle-orm";
import { PROFESSIONS } from "@/lib/professions";
import { capPlayerValue } from "@/lib/safeguards";

const CHANGE_UNIT_COST = 1000;

/**
 * Assign a profession to an NPC Avatar the caller owns.
 *
 * - The caller must own the NPC Avatar.
 * - The NPC must not already have the target profession.
 * - Cost = (other players with that profession) × 1000 × change-number,
 *   same as the player change-profession logic. A profession nobody else
 *   has is free.
 * - FIRST assignment (NPC had no profession): the cheapest profession(s)
 *   — fewest other holders, ties included — are free. Later changes pay
 *   the normal cost.
 * - On assignment, the NPC's value is reset to its floor value
 *   (valueFloor), making it cheap and fresh for combo use.
 * - The NPC is NOT deleted — it stays owned by the caller.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = parseInt(session.user.id);

  try {
    const body = await request.json().catch(() => ({}));
    const { targetId, profession } = body as { targetId?: number; profession?: string };

    if (!targetId || typeof targetId !== "number") {
      return NextResponse.json({ error: "targetId is required" }, { status: 400 });
    }
    if (!profession || typeof profession !== "string") {
      return NextResponse.json({ error: "Profession name is required" }, { status: 400 });
    }

    const validProfession = PROFESSIONS.find((p) => p.name === profession);
    if (!validProfession) {
      return NextResponse.json(
        { error: `Invalid profession. Must be one of: ${PROFESSIONS.map((p) => p.name).join(", ")}` },
        { status: 400 }
      );
    }

    // 1-4. Run all independent reads in ONE parallel batch — neon-http pays
    // ~10-100ms per round trip, so serializing them dominated the latency.
    const [ownedRows, npcRows, countRows, paidRow, callerRows] = await Promise.all([
      // 1. Verify the caller owns this NPC Avatar.
      db
        .select({ id: ownership.id })
        .from(ownership)
        .where(and(eq(ownership.ownerId, callerId), eq(ownership.ownedId, targetId))),
      // 2. Fetch the NPC Avatar.
      db
        .select({
          id: users.id,
          username: users.username,
          profession: users.profession,
          valueFloor: users.valueFloor,
          playerValue: users.playerValue,
          isNpc: users.isNpc,
          isProtected: users.isProtected,
        })
        .from(users)
        .where(eq(users.id, targetId)),
      // 3. Compute the cost (same logic as change-profession).
      db
        .select({ profession: users.profession, count: sql<number>`count(*)` })
        .from(users)
        .where(and(isNotNull(users.profession), ne(users.id, callerId)))
        .groupBy(users.profession),
      // Use the caller's paid profession changes for the multiplier.
      db
        .select({ count: sql<number>`count(*)` })
        .from(gameHistory)
        .where(and(eq(gameHistory.actorId, callerId), eq(gameHistory.eventType, "profession_change"))),
      // 4. Caller credits.
      db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, callerId)),
    ]);

    const [owned] = ownedRows;
    if (!owned) {
      return NextResponse.json({ error: "You don't own this building" }, { status: 403 });
    }

    const [npc] = npcRows;
    if (!npc) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }
    if (npc.isNpc !== 1) {
      return NextResponse.json({ error: "Can only assign professions to NPC buildings" }, { status: 400 });
    }
    if (npc.profession === profession) {
      return NextResponse.json({ error: "This building already has this profession" }, { status: 400 });
    }

    const counts: Record<string, number> = {};
    for (const row of countRows) {
      if (row.profession) counts[row.profession] = Number(row.count);
    }
    const otherCount = counts[profession] ?? 0;

    const paidChanges = Number(paidRow[0]?.count ?? 0);
    const multiplier = paidChanges + 1;
    const base = otherCount * CHANGE_UNIT_COST;
    let cost = base === 0 ? 0 : base * multiplier;

    // First assignment (the NPC had no profession — the forced choice when it
    // is hired): the CHEAPEST profession(s) are free. Cheapest = fewest other
    // holders; when several professions tie for the minimum, all of them are
    // free. Normal costs apply to every later change.
    const isFirstAssignment = npc.profession === null;
    if (isFirstAssignment && cost > 0) {
      const minCount = Math.min(...PROFESSIONS.map((p) => counts[p.name] ?? 0));
      if (otherCount === minCount) cost = 0;
    }

    // 4. Check credits.
    const [caller] = callerRows;
    if (!caller) {
      return NextResponse.json({ error: "Caller not found" }, { status: 404 });
    }
    if (cost > 0 && Number(caller.credits) < cost) {
      return NextResponse.json(
        { error: `Assigning ${profession} costs ${cost}¢. You don't have enough credits.` },
        { status: 400 }
      );
    }

    // 5. Apply: set profession, reset value to floor, deduct credits.
    const newValue = capPlayerValue(Number(npc.valueFloor));
    const updateData: Record<string, unknown> = {
      profession,
      playerValue: newValue,
    };

    if (cost > 0) {
      updateData.credits = sql`GREATEST(credits - ${cost}, 0)`;
    }

    // Writes are independent of each other — fire them in one parallel batch
    // (caller deduction + history log + NPC update), then re-read credits.
    const writes: Promise<unknown>[] = [
      db.update(users).set(updateData).where(eq(users.id, npc.id)),
    ];
    if (cost > 0) {
      // Also deduct from the caller.
      writes.push(
        db
          .update(users)
          .set({ credits: sql`GREATEST(credits - ${cost}, 0)` })
          .where(eq(users.id, callerId))
      );
      writes.push(
        db
          .insert(gameHistory)
          .values({
            eventType: "profession_change",
            actorId: callerId,
            targetId: npc.id,
            targetUsername: npc.username,
            details: JSON.stringify({
              from: npc.profession ?? null,
              to: profession,
              cost,
              multiplier,
              npcAssignment: true,
              valueReset: newValue,
            }),
          })
          .catch((e) => {
            console.error("NPC profession-change history log error:", e);
          })
      );
    }
    await Promise.all(writes);

    const [updatedCaller] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, callerId));

    return NextResponse.json({
      success: true,
      profession,
      charged: cost,
      multiplier,
      newValue,
      credits: Number(updatedCaller?.credits ?? caller.credits),
    });
  } catch (error) {
    console.error("Assign-profession error:", error);
    return NextResponse.json({ error: "Failed to assign profession" }, { status: 500 });
  }
}
