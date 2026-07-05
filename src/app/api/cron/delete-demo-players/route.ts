import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { purgeUser } from "@/lib/purgeUser";

/**
 * Deletes expired demo players. Demo accounts are created with a 1-hour
 * estimatedDeletionAt; this cron purges any demo player whose deadline has
 * passed (falling back to created_at + 1h). OAuth users also have a null
 * password hash, so the demo username pattern is required to avoid touching
 * real accounts.
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
    const now = new Date();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const demoUsers = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(
        sql`${users.passwordHash} IS NULL
          AND ${users.username} LIKE 'Demo Player_%'
          AND ${users.isNpc} = 0
          AND ${users.isProtected} = 0
          AND (
            (${users.estimatedDeletionAt} IS NOT NULL AND ${users.estimatedDeletionAt} <= ${now})
            OR ${users.createdAt} <= ${oneHourAgo}
          )`
      );

    let deleted = 0;
    for (const u of demoUsers) {
      try {
        const ok = await purgeUser(u.id, "demo_expired", { resetOwnedValues: false });
        if (ok) deleted++;
      } catch (e) {
        console.error(`Failed to delete demo player ${u.username} (${u.id}):`, e);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      candidates: demoUsers.length,
      demoPlayersDeleted: deleted,
    });
  } catch (error) {
    console.error("Delete demo players cron error:", error);
    return NextResponse.json(
      { error: "Failed to delete demo players" },
      { status: 500 }
    );
  }
}
