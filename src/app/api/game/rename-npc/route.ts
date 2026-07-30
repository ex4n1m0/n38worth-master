import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership, gameHistory } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { registerSchema } from "@/lib/validators";

/**
 * POST /api/game/rename-npc — rename an NPC card the caller owns.
 *
 * Ownership perk: each owner may rename an owned NPC once. The allowance is
 * tracked per ownership stint (ownership.renamed_at), so when the card is
 * hired away and a new owner takes it, the new owner gets their own rename.
 * Free of charge. Only NPC cards (goddesses/protected cards are excluded).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = parseInt(session.user.id);

  try {
    const body = await req.json().catch(() => ({}));
    const { targetId, newUsername } = body as {
      targetId?: number;
      newUsername?: string;
    };

    if (!targetId || typeof targetId !== "number") {
      return NextResponse.json({ error: "targetId is required" }, { status: 400 });
    }
    if (!newUsername || typeof newUsername !== "string") {
      return NextResponse.json({ error: "newUsername is required" }, { status: 400 });
    }

    const parsed = registerSchema
      .pick({ username: true })
      .safeParse({ username: newUsername });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }
    const name = parsed.data.username;

    // 1. Verify the caller owns this card and still has their rename left.
    const [owned] = await db
      .select({ id: ownership.id, renamedAt: ownership.renamedAt })
      .from(ownership)
      .where(and(eq(ownership.ownerId, callerId), eq(ownership.ownedId, targetId)));
    if (!owned) {
      return NextResponse.json({ error: "You don't own this avatar" }, { status: 403 });
    }
    if (owned.renamedAt !== null) {
      return NextResponse.json(
        { error: "You already renamed this avatar — each owner gets one rename" },
        { status: 403 }
      );
    }

    // 2. Only NPC cards can be renamed.
    const [npc] = await db
      .select({
        id: users.id,
        username: users.username,
        isNpc: users.isNpc,
        isProtected: users.isProtected,
      })
      .from(users)
      .where(eq(users.id, targetId));
    if (!npc) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }
    if (npc.isNpc !== 1 || npc.isProtected === 1) {
      return NextResponse.json(
        { error: "Only NPC avatars can be renamed" },
        { status: 400 }
      );
    }
    if (npc.username === name) {
      return NextResponse.json(
        { error: "That is already this avatar's name" },
        { status: 400 }
      );
    }

    // 3. Uniqueness (usernames are globally unique).
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, name));
    if (existing) {
      return NextResponse.json({ error: "Name is already taken" }, { status: 409 });
    }

    // 4. Apply the rename and burn this owner's allowance.
    await db
      .update(users)
      .set({ username: name, updatedAt: new Date() })
      .where(eq(users.id, targetId));
    await db
      .update(ownership)
      .set({ renamedAt: new Date() })
      .where(and(eq(ownership.id, owned.id), isNull(ownership.renamedAt)));

    await db.insert(gameHistory).values({
      eventType: "npc_rename",
      actorId: callerId,
      targetId,
      targetUsername: name,
      details: JSON.stringify({ oldUsername: npc.username, newUsername: name }),
    });

    return NextResponse.json({
      success: true,
      oldUsername: npc.username,
      newUsername: name,
    });
  } catch (error) {
    console.error("Rename NPC error:", error);
    return NextResponse.json({ error: "Failed to rename avatar" }, { status: 500 });
  }
}
