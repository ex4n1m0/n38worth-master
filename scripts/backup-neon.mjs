// One-shot Neon backup for the n38worth sunset (2026-10-15).
// Streams every public-schema table to backups/<table>.jsonl (one JSON row
// per line) with adaptive chunking (the neon HTTP proxy caps responses at
// 64MB — wide tables halve the chunk until it fits), per-chunk network
// retries, and RESUME: an existing <table>.jsonl with complete lines is
// appended to, starting at its row count. Optional argv table filter.
// Usage: node scripts/backup-neon.mjs [table ...]
import { createWriteStream, mkdirSync, writeFileSync, existsSync, openSync, fstatSync, readSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}
const sql = neon(url);
// Dynamic-identifier queries (identifiers can't be bind params) go through
// sql.query with quoted, information_schema-sourced names only.
const q = async (text) => {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await sql.query(text, []);
    } catch (e) {
      lastErr = e;
      if (/terminated|socket|fetch failed|ECONN|507|too large/i.test(String(e.message))) {
        if (/507|too large/i.test(String(e.message))) throw e; // handled by chunk halving
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
};

const only = process.argv.slice(2);
const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name`;
const list = only.length
  ? tables.filter((t) => only.includes(t.table_name)).map((t) => t.table_name)
  : tables.map((t) => t.table_name);
console.log(`tables (${list.length}): ${list.join(", ")}`);

mkdirSync("backups", { recursive: true });

function existingRows(file) {
  // Count complete lines without loading the file (files reach ~5GB).
  if (!existsSync(file)) return 0;
  const fd = openSync(file, "r");
  const size = fstatSync(fd).size;
  const BUF = 1 << 22;
  const buf = Buffer.alloc(BUF);
  let count = 0;
  let rem = "";
  for (let pos = 0; pos < size; pos += BUF) {
    const n = readSync(fd, buf, 0, Math.min(BUF, size - pos), pos);
    const chunk = rem + buf.toString("utf8", 0, n);
    const parts = chunk.split("\n");
    rem = parts.pop(); // partial tail line carried over
    count += parts.length;
  }
  if (rem.length > 0) count += 1; // final line without trailing newline
  return count;
}

const summary = [];
for (const table_name of list) {
  const ident = '"' + table_name.replace(/"/g, '""') + '"';
  const cRes = await q(`SELECT COUNT(*)::int AS count FROM ${ident}`);
  const n = cRes[0].count;
  let done = existingRows(`backups/${table_name}.jsonl`);
  if (done >= n) {
    console.log(`${table_name}: ${done}/${n} — already complete, skipped`);
    summary.push({ table: table_name, rows: done, resumed: true });
    continue;
  }
  const ws = createWriteStream(`backups/${table_name}.jsonl`, { flags: "a" });
  let chunk = 5000;
  let rowsWritten = done;
  console.log(`${table_name}: resuming/starting at ${done}/${n}`);
  while (done < n) {
    let rows;
    try {
      rows = await q(`SELECT * FROM ${ident} ORDER BY 1 LIMIT ${chunk} OFFSET ${done}`);
    } catch (e) {
      if (/too large|507/i.test(String(e.message)) && chunk > 100) {
        chunk = Math.max(100, Math.floor(chunk / 2));
        continue;
      }
      throw e;
    }
    for (const r of rows) ws.write(JSON.stringify(r) + "\n");
    rowsWritten += rows.length;
    done += rows.length;
    if (rowsWritten % 100000 === 0) console.log(`  ${table_name}: ${rowsWritten}/${n}`);
  }
  ws.end();
  await new Promise((r) => ws.on("close", r));
  summary.push({ table: table_name, rows: rowsWritten, chunk });
  console.log(`${table_name}: ${rowsWritten} rows (chunk ${chunk})`);
}

writeFileSync("backups/BACKUP-MANIFEST.json", JSON.stringify({ date: new Date().toISOString(), summary }, null, 2));

if (!only.length) {
  const cols = await sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`;
  writeFileSync("backups/schema-summary.json", JSON.stringify(cols, null, 2));
}
console.log("done (" + summary.reduce((a, s) => a + s.rows, 0) + " rows in this pass)");
