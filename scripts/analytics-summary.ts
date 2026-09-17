import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { sql } from "drizzle-orm";

/**
 * Channel report for the self-hosted acquisition analytics
 * (analytics_events — landing visits + signup attribution).
 *
 * Usage: npm run analytics:summary [days]   (default: 14)
 */
async function main() {
  const days = Math.max(1, Number(process.argv[2] ?? 14));

  const result = (await db.execute(sql`
    WITH recent AS (
      SELECT * FROM analytics_events
      WHERE created_at > now() - (${days} * interval '1 day')
    )
    SELECT
      COALESCE(utm_source, referrer_domain, 'direct / unknown') AS channel,
      COUNT(*) FILTER (WHERE type = 'visit')::int AS visits,
      COUNT(*) FILTER (WHERE type = 'signup')::int AS signups
    FROM recent
    GROUP BY 1
    ORDER BY visits DESC, signups DESC
  `)) as unknown as { rows: Array<{ channel: string; visits: number; signups: number }> };

  const rows = result.rows ?? [];

  console.log(`\nn38worth acquisition — last ${days} day(s)\n`);
  if (rows.length === 0) {
    console.log("  No analytics events yet.");
    console.log("  (Visits are recorded by the landing-page beacon; signups at account creation.)\n");
    return;
  }

  const w = [30, 9, 9, 11];
  console.log(
    "  " +
      ["channel".padEnd(w[0]), "visits".padStart(w[1]), "signups".padStart(w[2]), "conv %".padStart(w[3])].join("")
  );
  console.log("  " + "-".repeat(w[0] + w[1] + w[2] + w[3]));

  let totalVisits = 0;
  let totalSignups = 0;
  for (const r of rows) {
    totalVisits += r.visits;
    totalSignups += r.signups;
    const conv = r.visits > 0 ? ((r.signups / r.visits) * 100).toFixed(1) + "%" : "—";
    console.log(
      "  " +
        [
          r.channel.slice(0, w[0] - 2).padEnd(w[0]),
          String(r.visits).padStart(w[1]),
          String(r.signups).padStart(w[2]),
          conv.padStart(w[3]),
        ].join("")
    );
  }
  console.log("  " + "-".repeat(w[0] + w[1] + w[2] + w[3]));
  const conv = totalVisits > 0 ? ((totalSignups / totalVisits) * 100).toFixed(1) + "%" : "—";
  console.log(
    "  " +
      ["TOTAL".padEnd(w[0]), String(totalVisits).padStart(w[1]), String(totalSignups).padStart(w[2]), conv.padStart(w[3])].join("")
  );
  console.log(
    "\n  Note: 'direct / unknown' aggregates organic visits without UTM tags or referrer.\n  Tagged launch links: see DISTRIBUTION_STUDY.md § Channel launch links.\n"
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("analytics-summary failed:", e);
    process.exit(1);
  });
