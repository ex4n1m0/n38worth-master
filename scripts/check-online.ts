import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function check() {
  // Check who's online (last 5 min)
  const online5 = await sql`
    SELECT username, player_value, credits, profession,
           (SELECT COUNT(*) FROM ownership o WHERE o.owner_id = u.id) as owned_count,
           last_online_at
    FROM users u
    WHERE is_npc = 0 AND is_active = 1
      AND last_online_at > NOW() - INTERVAL '5 minutes'
    ORDER BY player_value DESC
    LIMIT 10
  `;
  console.log("Online humans (last 5 min):");
  for (const r of online5) {
    console.log(`  ${r.username} | owned: ${r.owned_count} | value: ${r.player_value} | last_online: ${r.last_online_at}`);
  }
  if (online5.length === 0) console.log("  (none)");

  // Also check last 15 min
  const online15 = await sql`
    SELECT username, last_online_at,
           (SELECT COUNT(*) FROM ownership o WHERE o.owner_id = u.id) as owned_count
    FROM users u
    WHERE is_npc = 0 AND is_active = 1
      AND last_online_at > NOW() - INTERVAL '15 minutes'
    ORDER BY last_online_at DESC
    LIMIT 10
  `;
  console.log("\nOnline humans (last 15 min):");
  for (const r of online15) {
    console.log(`  ${r.username} | owned: ${r.owned_count} | last_online: ${r.last_online_at}`);
  }
  if (online15.length === 0) console.log("  (none)");

  // Check all active humans regardless of online status
  const allHumans = await sql`
    SELECT username, last_online_at,
           (SELECT COUNT(*) FROM ownership o WHERE o.owner_id = u.id) as owned_count
    FROM users u
    WHERE is_npc = 0 AND is_active = 1
    ORDER BY last_online_at DESC
    LIMIT 10
  `;
  console.log("\nAll active humans (recent by last_online_at):");
  for (const r of allHumans) {
    console.log(`  ${r.username} | owned: ${r.owned_count} | last_online: ${r.last_online_at}`);
  }

  process.exit(0);
}

check().catch((e) => { console.error(e); process.exit(1); });
