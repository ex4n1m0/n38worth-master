import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { ownership, users } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { toggleGoddessPower } from "@/lib/goddess-powers";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { goddessName } = body as { goddessName?: string };
    if (!goddessName || !GODDESS_USERNAMES.includes(goddessName)) {
      return NextResponse.json({ error: "Invalid goddess name" }, { status: 400 });
    }

    const userId = Number(session.user.id);

    // Verify the user actually owns this goddess card.
    const [owned] = await db
      .select({ id: ownership.id })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(
        and(
          eq(ownership.ownerId, userId),
          eq(users.username, goddessName)
        )
      )
      .limit(1);

    if (!owned) {
      return NextResponse.json(
        { error: "You don't own this goddess building" },
        { status: 403 }
      );
    }

    const nowDisabled = await toggleGoddessPower(userId, goddessName);

    return NextResponse.json({
      goddessName,
      disabled: nowDisabled,
    });
  } catch (error) {
    console.error("Toggle goddess power error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
