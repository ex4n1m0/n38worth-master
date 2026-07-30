import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Lightweight list of every player the viewer currently owns (ids + usernames
 * only). Used by `useOwnedPlayerIds` for ownership-based UI checks (PUMP vs
 * GET buttons, avatar visibility).
 *
 * This replaces the old approach of hitting `/api/players/:username?lite=1`
 * with a high limit — that endpoint pages at 1000 rows and computes several
 * per-row subqueries, so large rosters silently missed cards and owned cards
 * wrongly showed a GET button.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    const ownedPlayers = await db
      .select({
        id: users.id,
        username: users.username,
        renamedAt: ownership.renamedAt,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(eq(ownership.ownerId, userId));

    return NextResponse.json({ ownedPlayers });
  } catch (error) {
    console.error("owned-ids fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch owned players" }, { status: 500 });
  }
}
