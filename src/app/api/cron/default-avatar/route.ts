import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

/**
 * Failsafe: assigns a default avatar to human players who haven't uploaded
 * one within 15 minutes of account creation. This ensures they become visible
 * to other players and can participate in the game.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const defaultAvatarUrl = "/NEW_HIDDEN.webp";

    // Find human players with incomplete avatars created more than 15 min ago
    const stuckPlayers = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(
        sql`${users.isNpc} = 0
          AND ${users.avatarCompleted} = 0
          AND ${users.createdAt} <= ${fifteenMinutesAgo}`
      );

    let updated = 0;
    for (const player of stuckPlayers) {
      try {
        await db
          .update(users)
          .set({
            avatarUrl: defaultAvatarUrl,
            avatarCompleted: 1,
          })
          .where(eq(users.id, player.id));
        updated++;
      } catch (e) {
        console.error(`Failed to assign default avatar to ${player.username} (${player.id}):`, e);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      candidates: stuckPlayers.length,
      updated,
    });
  } catch (error) {
    console.error("Default avatar cron error:", error);
    return NextResponse.json(
      { error: "Failed to assign default avatars" },
      { status: 500 }
    );
  }
}
