import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const professions = await sql`
    SELECT u.profession, COUNT(*) as cnt, SUM(u.player_value) as total_value
    FROM ownership o
    JOIN users u ON u.id = o.owned_id
    WHERE o.owner_id = (SELECT id FROM users WHERE username = 'Agent')
    AND u.profession IS NOT NULL
    GROUP BY u.profession
  `;
  console.log("Professions owned:");
  for (const p of professions) {
    console.log(`  ${p.profession}: ${p.cnt} cards, total value: ${p.total_value}`);
  }

  // Check for unblocked cards per profession
  const unblocked = await sql`
    SELECT u.profession, u.username, u.player_value, o.block_sell_until
    FROM ownership o
    JOIN users u ON u.id = o.owned_id
    WHERE o.owner_id = (SELECT id FROM users WHERE username = 'Agent')
    AND u.profession IS NOT NULL
    ORDER BY u.profession, u.player_value DESC
  `;
  console.log("\nAll profession cards:");
  for (const c of unblocked) {
    const blocked = c.block_sell_until && new Date(c.block_sell_until) > new Date() ? "BLOCKED" : "sellable";
    console.log(`  ${c.profession} | ${c.username} | ${c.player_value} | ${blocked}`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
