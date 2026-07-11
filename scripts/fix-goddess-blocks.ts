import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function fix() {
  // Find all goddess ownership records with far-future blocks (year 2099)
  const stale = await sql`
    SELECT o.id, u.username as owned_username, o.block_sell_until, o.block_sell_by
    FROM ownership o
    JOIN users u ON u.id = o.owned_id
    WHERE u.username IN ('Goddess of Fate','Goddess of War','Goddess of Wealth','Goddess of Knowledge','Goddess of Time','Goddess')
      AND o.block_sell_until > NOW() + INTERVAL '1 year'
  `;

  console.log(`Found ${stale.length} goddess ownership records with far-future blocks:`);
  for (const r of stale) {
    console.log(`  ${r.owned_username} | block_sell_until: ${r.block_sell_until} | block_sell_by: ${r.block_sell_by}`);
  }

  if (stale.length > 0) {
    // Clear the far-future block — goddesses should never have permanent sell blocks.
    // Their protection comes from the unbreakable window (30 min after purchase).
    const result = await sql`
      UPDATE ownership o
      SET block_sell_until = NULL, block_sell_by = NULL
      FROM users u
      WHERE o.owned_id = u.id
        AND u.username IN ('Goddess of Fate','Goddess of War','Goddess of Wealth','Goddess of Knowledge','Goddess of Time','Goddess')
        AND o.block_sell_until > NOW() + INTERVAL '1 year'
      RETURNING o.id, u.username
    `;
    console.log(`\nCleared ${result.length} far-future blocks from goddesses.`);
    for (const r of result) {
      console.log(`  Fixed: ${r.username} (ownership id: ${r.id})`);
    }
  }

  process.exit(0);
}

fix().catch((e) => { console.error(e); process.exit(1); });
