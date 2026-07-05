import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, gameHistory } from "@/db/schema";
import { and, eq, ne, isNotNull, sql } from "drizzle-orm";
import { PROFESSIONS } from "@/lib/professions";

const CHANGE_UNIT_COST = 1000;

/**
 * Returns the number of *other* players (humans + NPCs, excluding the caller)
 * holding each profession. Keys are profession names; missing means zero.
 */
async function getOtherCounts(callerId: number): Promise<Record<string, number>> {
  const rows = await db
    .select({ profession: users.profession, count: sql<number>`count(*)` })
    .from(users)
    .where(and(isNotNull(users.profession), ne(users.id, callerId)))
    .groupBy(users.profession);

  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.profession) counts[row.profession] = Number(row.count);
  }
  return counts;
}

/**
 * How many *paid* profession changes this user has done before. Tracked via
 * "profession_change" game_history rows (only paid changes are logged), so the
 * next multiplier is paidChanges + 1.
 */
async function getPaidChanges(callerId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(gameHistory)
    .where(
      and(eq(gameHistory.actorId, callerId), eq(gameHistory.eventType, "profession_change"))
    );
  return Number(row?.count ?? 0);
}

/** Linear cost: base × multiplier. A profession nobody else has is free. */
function computeCost(otherCount: number, multiplier: number): number {
  const base = otherCount * CHANGE_UNIT_COST;
  return base === 0 ? 0 : base * multiplier;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = parseInt(session.user.id);

  try {
    const [caller] = await db
      .select({ profession: users.profession, credits: users.credits, isNpc: users.isNpc })
      .from(users)
      .where(eq(users.id, callerId));

    if (!caller) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const counts = await getOtherCounts(callerId);
    const paidChanges = await getPaidChanges(callerId);
    const multiplier = paidChanges + 1;

    const options = PROFESSIONS.map((p) => {
      const count = counts[p.name] ?? 0;
      return {
        name: p.name,
        imagePath: p.imagePath,
        count,
        cost: computeCost(count, multiplier),
        isCurrent: caller.profession === p.name,
      };
    });

    return NextResponse.json({
      current: caller.profession ?? null,
      credits: caller.credits,
      paidChanges,
      multiplier,
      options,
    });
  } catch (error) {
    console.error("Change-profession GET error:", error);
    return NextResponse.json({ error: "Failed to load profession options" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = parseInt(session.user.id);

  try {
    const body = await request.json().catch(() => ({}));
    const profession: unknown = body?.profession;

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

    // A player can only change their OWN profession — we act solely on the
    // authenticated caller, never on another player.
    const [caller] = await db
      .select({ profession: users.profession, credits: users.credits, isNpc: users.isNpc })
      .from(users)
      .where(eq(users.id, callerId));

    if (!caller) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (caller.isNpc === 1) {
      return NextResponse.json({ error: "NPCs cannot change profession" }, { status: 403 });
    }
    if (caller.profession === profession) {
      return NextResponse.json({ error: "You already have this profession" }, { status: 400 });
    }

    // Recompute the cost server-side (authoritative — never trust the client).
    const counts = await getOtherCounts(callerId);
    const otherCount = counts[profession] ?? 0;
    const paidChanges = await getPaidChanges(callerId);
    const multiplier = paidChanges + 1;
    const cost = computeCost(otherCount, multiplier);

    if (cost > 0 && caller.credits < cost) {
      return NextResponse.json(
        { error: `Changing to ${profession} costs ${cost}¢. You don't have enough credits.` },
        { status: 400 }
      );
    }

    // Apply the change. Deduct credits and log the paid change (which also
    // increments the multiplier for next time). Free changes are not logged.
    if (cost > 0) {
      await db
        .update(users)
        .set({ profession, credits: sql`GREATEST(credits - ${cost}, 0)` })
        .where(eq(users.id, callerId));

      try {
        await db.insert(gameHistory).values({
          eventType: "profession_change",
          actorId: callerId,
          targetId: callerId,
          targetUsername: session.user.name ?? null,
          details: JSON.stringify({ from: caller.profession ?? null, to: profession, cost, multiplier }),
        });
      } catch (e) {
        console.error("Profession-change history log error:", e);
      }
    } else {
      await db.update(users).set({ profession }).where(eq(users.id, callerId));
    }

    const [updated] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, callerId));

    return NextResponse.json({
      success: true,
      profession,
      charged: cost,
      multiplier,
      credits: updated?.credits ?? caller.credits,
    });
  } catch (error) {
    console.error("Change-profession POST error:", error);
    return NextResponse.json({ error: "Failed to change profession" }, { status: 500 });
  }
}
