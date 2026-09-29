import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, and, isNotNull, ne, sql } from "drizzle-orm";
import { isAIPlayerUsername } from "@/lib/agent/roster";

const PERM_BLOCK_MS = 24 * 60 * 60 * 1000;
const MAX_PERM_BLOCKS = 10;

interface ActiveBlock {
  ownershipId: number;
  playerId: number;
  username: string;
  avatarUrl: string | null;
  permBlockUntil: string;
}

/**
 * A card is eligible for a perm block only if it's a regular NPC — i.e. an NPC
 * that is NOT a goddess. Human players and goddesses are excluded.
 */
async function isPermEligible(targetId: number): Promise<boolean> {
  const [target] = await db
    .select({ isNpc: users.isNpc, username: users.username })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);
  if (!target) return false;
  return target.isNpc === 1 && !isAIPlayerUsername(target.username);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerId = parseInt(session.user.id);

  try {
    const body = await req.json().catch(() => ({}));
    const { targetId, sourceId } = body as { targetId?: number; sourceId?: number };

    if (!targetId || typeof targetId !== "number") {
      return NextResponse.json({ error: "Invalid target player" }, { status: 400 });
    }

    // Verify the target is owned by the current user
    const [targetRecord] = await db
      .select()
      .from(ownership)
      .where(and(eq(ownership.ownerId, ownerId), eq(ownership.ownedId, targetId)));

    if (!targetRecord) {
      return NextResponse.json({ error: "You do not own this building" }, { status: 403 });
    }

    // Perm blocks can only be assigned to regular NPC cards — not to Goddesses
    // or human players.
    const eligible = await isPermEligible(targetId);
    if (!eligible) {
      return NextResponse.json(
        { error: "Iron deeds can only be placed on NPC buildings" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const newPermBlockUntil = new Date(now + PERM_BLOCK_MS);

    // If a source is provided, move the block from source to target.
    if (sourceId) {
      if (sourceId === targetId) {
        return NextResponse.json({ error: "Source and target cannot be the same" }, { status: 400 });
      }

      const [sourceRecord] = await db
        .select()
        .from(ownership)
        .where(and(eq(ownership.ownerId, ownerId), eq(ownership.ownedId, sourceId)));

      if (!sourceRecord) {
        return NextResponse.json({ error: "Source building not found" }, { status: 404 });
      }

      if (!sourceRecord.permBlockUntil) {
        return NextResponse.json({ error: "Source building has no iron deed" }, { status: 400 });
      }

      // Remove from source and assign to target (refreshing the 24h timer).
      await db
        .update(ownership)
        .set({ permBlockUntil: null })
        .where(eq(ownership.id, sourceRecord.id));

      await db
        .update(ownership)
        .set({ permBlockUntil: newPermBlockUntil })
        .where(eq(ownership.id, targetRecord.id));

      return NextResponse.json({
        success: true,
        permBlockUntil: newPermBlockUntil.toISOString(),
        sourceId,
        targetId,
      });
    }

    // No source: toggle the target's own permanent block. An EXPIRED block
    // counts as no block (stale rows are cleaned up by the offline-penalty
    // cron) — toggling an expired block assigns a fresh one.
    const hasActivePermBlock =
      targetRecord.permBlockUntil && new Date(targetRecord.permBlockUntil).getTime() > now;
    if (hasActivePermBlock) {
      // Remove the permanent block.
      await db
        .update(ownership)
        .set({ permBlockUntil: null })
        .where(eq(ownership.id, targetRecord.id));

      return NextResponse.json({
        success: true,
        permBlockUntil: null,
        targetId,
      });
    }

    // Count how many ACTIVE (unexpired) permanent blocks are already assigned.
    const [permCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(ownership)
      .where(and(
        eq(ownership.ownerId, ownerId),
        isNotNull(ownership.permBlockUntil),
        sql`${ownership.permBlockUntil} > NOW()`
      ));

    if (permCount.count < MAX_PERM_BLOCKS) {
      await db
        .update(ownership)
        .set({ permBlockUntil: newPermBlockUntil })
        .where(eq(ownership.id, targetRecord.id));

      return NextResponse.json({
        success: true,
        permBlockUntil: newPermBlockUntil.toISOString(),
        targetId,
      });
    }

    // Limit reached: return the active (unexpired) blocks so the client can
    // choose one to move.
    const activeBlocksRaw = await db
      .select({
        ownershipId: ownership.id,
        playerId: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        permBlockUntil: ownership.permBlockUntil,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(and(
        eq(ownership.ownerId, ownerId),
        isNotNull(ownership.permBlockUntil),
        sql`${ownership.permBlockUntil} > NOW()`,
        ne(ownership.ownedId, targetId)
      ));

    const activeBlocks: ActiveBlock[] = activeBlocksRaw.map((b) => ({
      ...b,
      permBlockUntil: b.permBlockUntil ? new Date(b.permBlockUntil).toISOString() : "",
    }));

    return NextResponse.json(
      {
        error: "Iron deed limit reached",
        activeBlocks,
      },
      { status: 409 }
    );
  } catch (error) {
    console.error("Perm-block error:", error);
    return NextResponse.json({ error: "Failed to update iron deed" }, { status: 500 });
  }
}
