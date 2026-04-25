import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gameHistory, users } from "@/db/schema";
import { desc, eq, sql, and } from "drizzle-orm";

// Hide events where the actor or the target is an invisible human (no avatar uploaded).
// NULL actor/target ids pass (system events).
const visibleActorsSql = sql`(
  ("game_history"."actor_id" IS NULL OR EXISTS (
    SELECT 1 FROM users u WHERE u.id = "game_history"."actor_id"
      AND (u.is_npc = 1 OR (u.avatar_url IS NOT NULL AND u.avatar_completed = 1))
  ))
  AND ("game_history"."target_id" IS NULL OR EXISTS (
    SELECT 1 FROM users u WHERE u.id = "game_history"."target_id"
      AND (u.is_npc = 1 OR (u.avatar_url IS NOT NULL AND u.avatar_completed = 1))
  ))
)`;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;
  const eventType = searchParams.get("type"); // Optional filter by event type

  try {
    // Build query — always filter out events whose actor or target is a hidden human.
    const whereClause = eventType
      ? and(eq(gameHistory.eventType, eventType), visibleActorsSql)
      : visibleActorsSql;

    const history = await db
      .select({
        id: gameHistory.id,
        eventType: gameHistory.eventType,
        actorId: gameHistory.actorId,
        targetId: gameHistory.targetId,
        targetUsername: gameHistory.targetUsername,
        details: gameHistory.details,
        createdAt: gameHistory.createdAt,
      })
      .from(gameHistory)
      .where(whereClause)
      .orderBy(desc(gameHistory.createdAt))
      .limit(limit)
      .offset(offset);

    // Enrich with actor usernames where available
    const enrichedHistory = await Promise.all(
      history.map(async (event) => {
        let actorUsername = null;
        let actorAvatarUrl = null;

        if (event.actorId) {
          const [actor] = await db
            .select({ username: users.username, avatarUrl: users.avatarUrl })
            .from(users)
            .where(eq(users.id, event.actorId));
          
          if (actor) {
            actorUsername = actor.username;
            actorAvatarUrl = actor.avatarUrl;
          }
        }

        // Parse details JSON if present
        let parsedDetails = null;
        if (event.details) {
          try {
            parsedDetails = JSON.parse(event.details);
          } catch {
            parsedDetails = { raw: event.details };
          }
        }

        return {
          ...event,
          actorUsername,
          actorAvatarUrl,
          details: parsedDetails,
        };
      })
    );

    return NextResponse.json({ history: enrichedHistory });
  } catch (error) {
    console.error("Game history API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch game history" },
      { status: 500 }
    );
  }
}