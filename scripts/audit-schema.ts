/**
 * Schema-drift audit.
 *
 * Scans every drizzle/*.sql migration for `ADD COLUMN [IF NOT EXISTS] "<name>"`
 * and `CREATE TABLE "<table>" ( ... "<col>" ... )` statements, then queries
 * Postgres `information_schema.columns` to verify every expected column is
 * actually present in the live database.
 *
 * This catches the "migration file exists on disk but was never applied" class
 * of bugs (exactly what caused the `ownership.last_boost_at` 500 that broke
 * /players/[username]).
 *
 * Run: npx tsx scripts/audit-schema.ts
 * Exit code: 0 if no drift, 1 if drift detected.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

interface Expected {
  table: string;
  column: string;
  source: string; // migration file
}

/**
 * Very small SQL parser — only cares about:
 *   ALTER TABLE "<t>"? ADD COLUMN [IF NOT EXISTS] "<c>" ...
 *   CREATE TABLE "<t>" ( "<c>" ..., "<c2>" ..., ... )
 *
 * Comments (`--`) and statement-breakpoints (`-->`) are stripped.
 */
function extractExpectedColumns(file: string, text: string): Expected[] {
  const out: Expected[] = [];

  // Strip line comments
  const cleaned = text
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");

  // Split into statements. drizzle uses `--> statement-breakpoint`; we also
  // fall back to `;` to be safe. Strip breakpoint markers first.
  const withoutBreakpoints = cleaned.replace(/-->\s*statement-breakpoint/gi, "");
  const statements = withoutBreakpoints
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const alterAddRe =
    /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([a-zA-Z_][\w]*)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"([a-zA-Z_][\w]*)"/i;
  const createRe =
    /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([a-zA-Z_][\w]*)"\s*\(([\s\S]+)\)\s*$/i;

  for (const stmt of statements) {
    const alterMatch = stmt.match(alterAddRe);
    if (alterMatch) {
      out.push({ table: alterMatch[1], column: alterMatch[2], source: file });
      continue;
    }
    const createMatch = stmt.match(createRe);
    if (createMatch) {
      const table = createMatch[1];
      const body = createMatch[2];
      // Column defs start with `"name" <type>`; skip CONSTRAINT / PRIMARY / etc.
      const colRe = /(?:^|,)\s*"([a-zA-Z_][\w]*)"\s+[a-zA-Z]/g;
      for (const c of body.matchAll(colRe)) {
        out.push({ table, column: c[1], source: file });
      }
    }
  }

  return out;
}

async function main() {
  const drizzleDir = path.join(process.cwd(), "drizzle");
  const sqlFiles = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const expected: Expected[] = [];
  for (const f of sqlFiles) {
    const text = fs.readFileSync(path.join(drizzleDir, f), "utf8");
    expected.push(...extractExpectedColumns(f, text));
  }

  // Deduplicate (same table.column may appear in multiple migrations)
  const seen = new Map<string, Expected>();
  for (const e of expected) {
    const key = `${e.table}.${e.column}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  const uniqueExpected = Array.from(seen.values());

  // Load live column set
  const live = (await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `) as Array<{ table_name: string; column_name: string }>;
  const liveSet = new Set(live.map((r) => `${r.table_name}.${r.column_name}`));

  const missing = uniqueExpected.filter(
    (e) => !liveSet.has(`${e.table}.${e.column}`)
  );

  console.log("Schema-drift audit");
  console.log("==================");
  console.log(
    `Scanned ${sqlFiles.length} migrations → ${uniqueExpected.length} unique columns expected`
  );
  console.log(`Live DB has ${liveSet.size} columns in schema 'public'`);

  if (missing.length === 0) {
    console.log("\n✅  No drift detected — every expected column exists.");
    process.exit(0);
  }

  console.log(`\n❌  ${missing.length} expected column(s) missing from live DB:\n`);
  for (const m of missing) {
    console.log(`  - ${m.table}.${m.column}   (declared in ${m.source})`);
  }
  console.log(
    "\nLikely fix: apply the migration manually via `drizzle-kit push` or raw SQL."
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
