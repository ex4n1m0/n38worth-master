import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const BIO_MAX_LENGTH = 160;
const NPC_BIO_COST = 1000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const callerId = Number(session.user.id);

  try {
    const { targetUserId, bio } = await req.json();

    if (typeof targetUserId !== "number") {
      return NextResponse.json({ error: "Invalid targetUserId" }, { status: 400 });
    }

    const trimmedBio = typeof bio === "string" ? bio.trim() : "";

    if (trimmedBio.length > BIO_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Bio must be ${BIO_MAX_LENGTH} characters or less` },
        { status: 400 }
      );
    }

    const [target] = await db
      .select({
        id: users.id,
        isNpc: users.isNpc,
        isProtected: users.isProtected,
        credits: users.credits,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    if (target.isNpc === 0) {
      // Human player — only the player themselves can edit their bio
      if (callerId !== targetUserId) {
        return NextResponse.json({ error: "You can only edit your own bio" }, { status: 403 });
      }
    } else {
      // NPC or Goddess — caller must own the target
      const [ownerRow] = await db
        .select({ id: ownership.id })
        .from(ownership)
        .where(and(eq(ownership.ownerId, callerId), eq(ownership.ownedId, targetUserId)))
        .limit(1);

      if (!ownerRow) {
        return NextResponse.json(
          { error: "You must own this player to set their bio" },
          { status: 403 }
        );
      }

      const cost = NPC_BIO_COST;

      const [caller] = await db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, callerId))
        .limit(1);

      if (!caller || caller.credits < cost) {
        return NextResponse.json(
          { error: `Not enough credits. Setting this bio costs ${cost}¢` },
          { status: 400 }
        );
      }

      // Deduct credits from caller
      await db
        .update(users)
        .set({ credits: caller.credits - cost, updatedAt: new Date() })
        .where(eq(users.id, callerId));
    }

    // Save bio (null for empty string = clear bio)
    await db
      .update(users)
      .set({ bio: trimmedBio.length > 0 ? trimmedBio : null, updatedAt: new Date() })
      .where(eq(users.id, targetUserId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bio update error:", error);
    return NextResponse.json({ error: "Failed to update bio" }, { status: 500 });
  }
}
