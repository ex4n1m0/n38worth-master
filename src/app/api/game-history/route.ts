import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gameHistory, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

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
    // Build query
    let query = db
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
      .orderBy(desc(gameHistory.createdAt))
      .limit(limit)
      .offset(offset);

    // Apply type filter if provided
    if (eventType) {
      query = query.where(eq(gameHistory.eventType, eventType)) as typeof query;
    }

    const history = await query;

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