import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function check() {
  // Find all goddess ownership records
  const rows = await sql`
    SELECT u.username, o.id as ownership_id, o.owner_id, ou.username as owner_username,
           o.block_sell_until, o.block_sell_by, o.block_unbreakable_until
    FROM users u
    LEFT JOIN ownership o ON o.owned_id = u.id
    LEFT JOIN users ou ON ou.id = o.owner_id
    WHERE u.username IN ('Goddess of Fate','Goddess of War','Goddess of Wealth','Goddess of Knowledge','Goddess of Time','Goddess')
    ORDER BY u.username
  `;

  for (const r of rows) {
    console.log(
      r.username,
      "| owner:", r.owner_username ?? "none",
      "| block_sell_until:", r.block_sell_until,
      "| block_sell_by:", r.block_sell_by,
      "| unbreakable:", r.block_unbreakable_until
    );
  }

  // Also check: any ownership with blockSellBy = 'Goddess of Fate' (stale seals)
  const stale = await sql`
    SELECT o.id, o.owned_id, u.username as owned_username, o.block_sell_until, o.block_sell_by
    FROM ownership o
    JOIN users u ON u.id = o.owned_id
    WHERE o.block_sell_by = 'Goddess of Fate'
  `;
  console.log("\n--- All Fate seals ---");
  for (const r of stale) {
    console.log(r.owned_username, "| block_sell_until:", r.block_sell_until, "| id:", r.id);
  }

  process.exit(0);
}

check().catch((e) => { console.error(e); process.exit(1); });
