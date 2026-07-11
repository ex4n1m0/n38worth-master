import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function check() {
  // Reproduce the exact query from chat.ts getRankSnapshot()
  const onlineRows = await sql`
    SELECT
      u.username,
      u.player_value,
      u.credits,
      u.profession,
      (SELECT COUNT(*) FROM ownership o WHERE o.owner_id = u.id) as owned_count,
      u.last_online_at
    FROM users u
    WHERE u.is_npc = 0 AND u.is_active = 1
      AND u.last_online_at > NOW() - INTERVAL '10 minutes'
      AND u.username != 'Agent'
    ORDER BY u.player_value DESC
    LIMIT 10
  `;

  console.log("Online humans query result:");
  for (const r of onlineRows) {
    console.log(`  ${r.username} | owned_count: ${r.owned_count} (${typeof r.owned_count}) | value: ${r.player_value} | credits: ${r.credits} | profession: ${r.profession}`);
  }
  if (onlineRows.length === 0) console.log("  (none online)");

  process.exit(0);
}

check().catch((e) => { console.error(e); process.exit(1); });
