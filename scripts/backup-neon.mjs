// One-shot Neon backup for the n38worth sunset (2026-10-15).
// Streams every public-schema table to backups/<table>.jsonl (one JSON row
// per line) with adaptive chunking (the neon HTTP proxy caps responses at
// 64MB — wide tables halve the chunk until it fits). Also writes a schema
// summary. Usage: node scripts/backup-neon.mjs
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const sql = neon(url);
// Dynamic-identifier queries (identifiers can't be bind params) go through
// sql.query with quoted, information_schema-sourced names only.
const q = (text) => sql.query(text, []);

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name`;
console.log(`tables (${tables.length}): ${tables.map((t) => t.table_name).join(", ")}`);

mkdirSync("backups", { recursive: true });
const summary = [];
for (const { table_name } of tables) {
  const ident = '"' + table_name.replace(/"/g, '""') + '"';
  const cRes = await q(`SELECT COUNT(*)::int AS count FROM ${ident}`);
  const n = cRes[0].count;
  const ws = createWriteStream(`backups/${table_name}.jsonl`);
  let chunk = 5000;
  let off = 0;
  let rowsWritten = 0;
  while (off < n) {
    let rows;
    try {
      rows = await q(`SELECT * FROM ${ident} ORDER BY 1 LIMIT ${chunk} OFFSET ${off}`);
    } catch (e) {
      if (/too large|507/i.test(String(e.message)) && chunk > 100) {
        chunk = Math.max(100, Math.floor(chunk / 2));
        continue;
      }
      throw e;
    }
    for (const r of rows) ws.write(JSON.stringify(r) + "\n");
    rowsWritten += rows.length;
    off += rows.length;
    if (rowsWritten % 100000 === 0) console.log(`  ${table_name}: ${rowsWritten}/${n}`);
  }
  ws.end();
  await new Promise((r) => ws.on("close", r));
  summary.push({ table: table_name, rows: rowsWritten, chunk });
  console.log(`${table_name}: ${rowsWritten} rows (chunk ${chunk})`);
}

writeFileSync("backups/BACKUP-MANIFEST.json", JSON.stringify({ date: new Date().toISOString(), summary }, null, 2));

const cols = await sql`
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position`;
writeFileSync("backups/schema-summary.json", JSON.stringify(cols, null, 2));
console.log("done → backups/ (" + summary.reduce((a, s) => a + s.rows, 0) + " rows total)");
