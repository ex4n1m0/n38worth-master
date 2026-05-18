import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, gameHistory, ownership } from "@/db/schema";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";

const PAGE_SIZE = 21;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));

  try {
    // Resolve username to userId
    const [profileUser] = await db
      .select({ id: users.id, isNpc: users.isNpc, avatarUrl: users.avatarUrl, avatarCompleted: users.avatarCompleted })
      .from(users)
      .where(eq(users.username, username));

    if (!profileUser) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Hide hidden humans unless they're the viewer
    const session = await auth();
    const viewerId = session?.user?.id ? Number(session.user.id) : null;
    const isHidden = profileUser.isNpc === 0 && (!profileUser.avatarUrl || profileUser.avatarCompleted !== 1);
    if (isHidden && viewerId !== profileUser.id) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const profileUserId = profileUser.id;

    // Query game_history for purchase events where this user was the previousOwner.
    // Fetch a large ceiling so we can deduplicate the full history across all pages.
    const lostEventsRaw = await db
      .select({
        targetId: gameHistory.targetId,
        createdAt: gameHistory.createdAt,
      })
      .from(gameHistory)
      .where(
        and(
          eq(gameHistory.eventType, "purchase"),
          sql`(${gameHistory.details}::jsonb->>'previousOwnerId')::int = ${profileUserId}`
        )
      )
      .orderBy(desc(gameHistory.createdAt))
      .limit(2000);

    // Deduplicate — keep most-recent loss per targetId (already ordered desc)
    const seenTargetIds = new Set<number>();
    const dedupedAll: number[] = [];
    const lostAtMap = new Map<number, Date>();
    for (const row of lostEventsRaw) {
      if (row.targetId && !seenTargetIds.has(row.targetId)) {
        seenTargetIds.add(row.targetId);
        dedupedAll.push(row.targetId);
        lostAtMap.set(row.targetId, row.createdAt);
      }
    }

    // Build set of player IDs the viewer already owns (to exclude from results)
    let viewerOwnedIds = new Set<number>();
    if (viewerId) {
      const viewerOwnership = await db
        .select({ ownedId: ownership.ownedId })
        .from(ownership)
        .where(eq(ownership.ownerId, viewerId));
      viewerOwnedIds = new Set(viewerOwnership.map((o) => o.ownedId));
    }

    // Fetch player data for all deduped IDs in a single bulk query,
    // with a LEFT JOIN to get the current owner's username.
    const ownerAlias = db
      .select({ ownedId: ownership.ownedId, ownerUsername: users.username })
      .from(ownership)
      .innerJoin(users, eq(users.id, ownership.ownerId))
      .as("owner_info");

    const playerRows = dedupedAll.length > 0
      ? await db
          .select({
            id: users.id,
            username: users.username,
            avatarUrl: users.avatarUrl,
            playerValue: users.playerValue,
            isNpc: users.isNpc,
            avatarCompleted: users.avatarCompleted,
            currentOwnerUsername: ownerAlias.ownerUsername,
          })
          .from(users)
          .leftJoin(ownerAlias, eq(ownerAlias.ownedId, users.id))
          .where(inArray(users.id, dedupedAll))
      : [];

    const allLostPlayers = playerRows
      .filter((p) => {
        // Skip hidden humans
        const hidden = p.isNpc === 0 && (!p.avatarUrl || p.avatarCompleted !== 1);
        if (hidden) return false;
        // Skip if viewer already owns this player
        if (viewerOwnedIds.has(p.id)) return false;
        return true;
      })
      .map((p) => ({
        id: p.id,
        username: p.username,
        avatarUrl: p.avatarUrl,
        playerValue: p.playerValue,
        currentOwnerUsername: p.currentOwnerUsername ?? null,
        lostAt: (lostAtMap.get(p.id) ?? new Date()).toISOString(),
      }));

    allLostPlayers.sort((a, b) => b.playerValue - a.playerValue);

    const total = allLostPlayers.length;
    const totalValue = allLostPlayers.reduce((sum, p) => sum + (p.playerValue ?? 0), 0);
    const start = (page - 1) * PAGE_SIZE;
    const lostPlayers = allLostPlayers.slice(start, start + PAGE_SIZE);

    return NextResponse.json({ lostPlayers, total, totalValue, page, pageSize: PAGE_SIZE });
  } catch (error) {
    console.error("Lost players API error:", error);
    return NextResponse.json({ error: "Failed to fetch lost players" }, { status: 500 });
  }
}
