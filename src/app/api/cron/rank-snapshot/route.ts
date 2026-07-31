import { NextResponse } from "next/server";
import { db } from "@/db";
import { userRankSnapshots } from "@/db/schema";
import { sql, lt } from "drizzle-orm";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";

export const maxDuration = 60;

/**
 * Pre-computes every visible human's leaderboard position in all 5 categories
 * (empire/legacy/credits/value/portfolio) into user_rank_snapshots, so
 * /api/leaderboard can serve "my positions" with one indexed lookup instead
 * of 5 correlated COUNT subqueries per request.
 *
 * Rank semantics match the live computation: position = 1 + number of players
 * strictly ahead (Postgres RANK()).
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
    const startedAt = new Date();
    const removedAgentNamesSql = sql.join(
      REMOVED_AGENT_USERNAMES.map((name) => sql`${name}`),
      sql`, `
    );

    // Portfolio formula mirrors /api/leaderboard exactly:
    // owned cards' value × (1 + cards each owned card owns), summed, then
    // × max(ownerCount, 1). Own player_value is NOT included.
    const rows = await db.execute(sql`
      WITH visible AS (
        SELECT u.id, u.created_at, u.credits, u.player_value,
          (SELECT COUNT(*) FROM ownership o WHERE o.owner_id = u.id) AS owned_count,
          COALESCE((SELECT SUM(u2.player_value * (1 + (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id))) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = u.id), 0)
            * GREATEST((SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = u.id), 1) AS portfolio_value
        FROM users u
        WHERE u.is_npc = 0 AND u.avatar_url IS NOT NULL AND u.avatar_completed = 1
          AND u.username NOT IN (${removedAgentNamesSql})
      )
      SELECT id,
        RANK() OVER (ORDER BY owned_count DESC) AS empire_rank,
        RANK() OVER (ORDER BY created_at ASC) AS legacy_rank,
        RANK() OVER (ORDER BY credits DESC) AS credits_rank,
        RANK() OVER (ORDER BY player_value DESC) AS value_rank,
        RANK() OVER (ORDER BY portfolio_value DESC) AS portfolio_rank
      FROM visible
    `);

    const values = rows.rows.map((r) => ({
      userId: Number(r.id),
      empireRank: Number(r.empire_rank),
      legacyRank: Number(r.legacy_rank),
      creditsRank: Number(r.credits_rank),
      valueRank: Number(r.value_rank),
      portfolioRank: Number(r.portfolio_rank),
      updatedAt: startedAt,
    }));

    // Chunked upserts — neon-http has practical parameter limits.
    const CHUNK = 200;
    for (let i = 0; i < values.length; i += CHUNK) {
      await db
        .insert(userRankSnapshots)
        .values(values.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: userRankSnapshots.userId,
          set: {
            empireRank: sql`excluded.empire_rank`,
            legacyRank: sql`excluded.legacy_rank`,
            creditsRank: sql`excluded.credits_rank`,
            valueRank: sql`excluded.value_rank`,
            portfolioRank: sql`excluded.portfolio_rank`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }

    // Drop rows for users who are no longer rank-visible (avatar removed,
    // account deactivated/reset) so they fall back to the live computation.
    await db
      .delete(userRankSnapshots)
      .where(lt(userRankSnapshots.updatedAt, startedAt));

    return NextResponse.json({ status: "ok", snapshotted: values.length });
  } catch (error) {
    console.error("Rank snapshot cron error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
