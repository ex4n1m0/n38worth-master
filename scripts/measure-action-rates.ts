import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";
import { GODDESS_USERNAMES } from "../src/lib/goddesses";

/**
 * READ-ONLY measurement for PLAYER_AI_STUDY.md §7.5 / §11.4:
 * what does HUMAN action pacing actually look like? Feeds the
 * per-user rate-guard ceiling ruling.
 *
 * Measures over the last N days (default 14) of game_history:
 *   1. Per-(actor, minute) action counts  → distribution (p50..p99, max)
 *   2. Consecutive inter-action gaps       → how fast humans chain actions
 *   3. Top individual (actor, minute) samples for eyeballing
 *
 * Usage: npx tsx scripts/measure-action-rates.ts [days]
 */
const ACTION_EVENTS = ["purchase", "pump", "sell", "sell_combo", "let_go", "war_delete", "raid"];

async function main() {
  const days = Math.max(1, Number(process.argv[2] ?? 14));
  const goddesses = GODDESS_USERNAMES;

  const perMinute = (await db.execute(sql`
    WITH m AS (
      SELECT gh.actor_id,
             date_trunc('minute', gh.created_at) AS minute,
             COUNT(*)::int AS n
      FROM game_history gh
      JOIN users u ON u.id = gh.actor_id
      WHERE gh.created_at > now() - (${days} * interval '1 day')
        AND gh.event_type IN ${sql.raw(`(${ACTION_EVENTS.map((e) => `'${e}'`).join(",")})`)}
        AND u.username NOT IN ${sql.raw(`(${goddesses.map((g) => `'${g}'`).join(",")})`)}
      GROUP BY 1, 2
    )
    SELECT
      COUNT(*)::int AS samples,
      COUNT(DISTINCT actor_id)::int AS actors,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY n)::float AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY n)::float AS p90,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY n)::float AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY n)::float AS p99,
      MAX(n)::int AS max_n
    FROM m
  `)) as unknown as { rows: Array<Record<string, number>> };

  const gaps = (await db.execute(sql`
    WITH acts AS (
      SELECT gh.actor_id, gh.created_at,
             LAG(gh.created_at) OVER (PARTITION BY gh.actor_id ORDER BY gh.created_at) AS prev
      FROM game_history gh
      JOIN users u ON u.id = gh.actor_id
      WHERE gh.created_at > now() - (${days} * interval '1 day')
        AND gh.event_type IN ${sql.raw(`(${ACTION_EVENTS.map((e) => `'${e}'`).join(",")})`)}
        AND u.username NOT IN ${sql.raw(`(${goddesses.map((g) => `'${g}'`).join(",")})`)}
    ), g AS (
      SELECT EXTRACT(EPOCH FROM (created_at - prev))::float AS gap_s
      FROM acts
      WHERE prev IS NOT NULL
        AND created_at - prev < interval '10 minutes'  -- within one session only
    )
    SELECT
      COUNT(*)::int AS gaps,
      percentile_cont(0.05) WITHIN GROUP (ORDER BY gap_s)::float AS p05,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY gap_s)::float AS p25,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_s)::float AS p50,
      AVG(gap_s)::float AS avg
    FROM g
  `)) as unknown as { rows: Array<Record<string, number>> };

  const top = (await db.execute(sql`
    SELECT u.username,
           date_trunc('minute', gh.created_at) AS minute,
           COUNT(*)::int AS n
    FROM game_history gh
    JOIN users u ON u.id = gh.actor_id
    WHERE gh.created_at > now() - (${days} * interval '1 day')
      AND gh.event_type IN ${sql.raw(`(${ACTION_EVENTS.map((e) => `'${e}'`).join(",")})`)}
      AND u.username NOT IN ${sql.raw(`(${goddesses.map((g) => `'${g}'`).join(",")})`)}
    GROUP BY 1, 2
    ORDER BY n DESC
    LIMIT 12
  `)) as unknown as { rows: Array<{ username: string; minute: string; n: number }> };

  console.log(`\nHuman action pacing — last ${days} day(s), events: ${ACTION_EVENTS.join(", ")}\n`);
  console.log("Per-(player, minute) count distribution:");
  console.table(perMinute.rows[0]);
  console.log("\nInter-action gaps within sessions (<10 min apart), seconds:");
  console.table(gaps.rows[0]);
  console.log("\nBusiest single minutes:");
  console.table(top.rows);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
