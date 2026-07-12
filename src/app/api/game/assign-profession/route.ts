import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, gameHistory } from "@/db/schema";
import { and, eq, ne, isNotNull, sql, inArray } from "drizzle-orm";
import { PROFESSIONS } from "@/lib/professions";
import { capPlayerValue } from "@/lib/safeguards";

const CHANGE_UNIT_COST = 1000;

/**
 * Assign a profession to an NPC card the caller owns.
 *
 * - The caller must own the NPC card.
 * - The NPC must not already have the target profession.
 * - Cost = (other players with that profession) × 1000 × change-number,
 *   same as the player change-profession logic. A profession nobody else
 *   has is free.
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

    // 1. Verify the caller owns this NPC card.
    const [owned] = await db
      .select({ id: ownership.id })
      .from(ownership)
      .where(and(eq(ownership.ownerId, callerId), eq(ownership.ownedId, targetId)));
    if (!owned) {
      return NextResponse.json({ error: "You don't own this card" }, { status: 403 });
    }

    // 2. Fetch the NPC card.
    const [npc] = await db
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
      .where(eq(users.id, targetId));

    if (!npc) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    // Allow assigning professions to NPC cards and the Agent (which has isNpc=0
    // but is a special AI player, not a regular human).
    if (npc.isNpc !== 1 && npc.username !== "Agent") {
      return NextResponse.json({ error: "Can only assign professions to NPC cards" }, { status: 400 });
    }
    if (npc.profession === profession) {
      return NextResponse.json({ error: "This card already has this profession" }, { status: 400 });
    }

    // 3. Compute the cost (same logic as change-profession).
    const countRows = await db
      .select({ profession: users.profession, count: sql<number>`count(*)` })
      .from(users)
      .where(and(isNotNull(users.profession), ne(users.id, callerId)))
      .groupBy(users.profession);
    const counts: Record<string, number> = {};
    for (const row of countRows) {
      if (row.profession) counts[row.profession] = Number(row.count);
    }
    const otherCount = counts[profession] ?? 0;

    // Use the caller's paid profession changes for the multiplier.
    const [paidRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(gameHistory)
      .where(and(eq(gameHistory.actorId, callerId), eq(gameHistory.eventType, "profession_change")));
    const paidChanges = Number(paidRow?.count ?? 0);
    const multiplier = paidChanges + 1;
    const base = otherCount * CHANGE_UNIT_COST;
    const cost = base === 0 ? 0 : base * multiplier;

    // 4. Check credits.
    const [caller] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, callerId));
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
      // Also deduct from the caller.
      await db
        .update(users)
        .set({ credits: sql`GREATEST(credits - ${cost}, 0)` })
        .where(eq(users.id, callerId));

      try {
        await db.insert(gameHistory).values({
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
        });
      } catch (e) {
        console.error("NPC profession-change history log error:", e);
      }
    }

    // Update the NPC card.
    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, npc.id));

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
