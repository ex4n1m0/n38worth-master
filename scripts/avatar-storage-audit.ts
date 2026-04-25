/**
 * One-shot read-only audit: how much avatar data is stored inline as base64
 * data URIs vs. external https URLs, split by NPC vs human.
 *
 * Run: npx tsx scripts/avatar-storage-audit.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config(); // also load .env if present
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main() {
  const rows = (await sql`
    SELECT
      CASE WHEN is_npc = 1 THEN 'npc' ELSE 'human' END AS kind,
      COUNT(*) FILTER (WHERE avatar_url LIKE 'data:%')               AS base64_count,
      COALESCE(SUM(LENGTH(avatar_url)) FILTER (WHERE avatar_url LIKE 'data:%'), 0)::bigint AS base64_bytes,
      COUNT(*) FILTER (WHERE avatar_url LIKE 'http%')                AS url_count,
      COUNT(*) FILTER (WHERE avatar_url IS NULL)                     AS null_count,
      COUNT(*)                                                       AS total
    FROM users
    GROUP BY kind
    ORDER BY kind;
  `) as Array<{
    kind: string;
    base64_count: string | number;
    base64_bytes: string | number;
    url_count: string | number;
    null_count: string | number;
    total: string | number;
  }>;

  const mb = (n: number) => (n / (1024 * 1024)).toFixed(2) + " MB";

  console.log("Avatar storage audit");
  console.log("====================");
  let grandBytes = 0;
  let grandBase64 = 0;
  for (const r of rows) {
    const bytes = Number(r.base64_bytes);
    grandBytes += bytes;
    grandBase64 += Number(r.base64_count);
    console.log(
      `${r.kind.padEnd(6)}  total=${r.total}  base64=${r.base64_count} (${mb(bytes)})  https=${r.url_count}  null=${r.null_count}`
    );
  }
  console.log("--------------------");
  console.log(`TOTAL base64 rows: ${grandBase64}   TOTAL base64 bytes: ${mb(grandBytes)}`);

  // Rough projection of monthly Blob cost: Vercel Blob = $0.023/GB storage + $0.05/GB egress.
  const gb = grandBytes / (1024 ** 3);
  console.log(`\nProjected Vercel Blob storage: ${gb.toFixed(3)} GB → $${(gb * 0.023).toFixed(4)}/mo`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
