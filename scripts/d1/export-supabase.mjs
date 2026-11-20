// Exports the public catalogue tables from Supabase (read-only) to
// data/d1-export/<table>.ndjson, for scripts/d1/build-d1.ts.
//
//   node scripts/d1/export-supabase.mjs [table ...]
//
// Uses the Supabase management API token in ~/.config/collegestat/supabase-token
// (never printed). Plain paged selects by primary key keep the load light on the
// free compute; each page is retried, and finished tables are skipped on rerun.
import { readFileSync, mkdirSync, existsSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";

const REF = "yfyqikmanpgnvyfthzwe";
const TOKEN = readFileSync(homedir() + "/.config/collegestat/supabase-token", "utf8").trim();
const OUT = new URL("../../data/d1-export/", import.meta.url);
mkdirSync(OUT, { recursive: true });

/** [table, rows per page]. Universities rows carry large JSON columns. */
const TABLES = [
  ["universities", 150],
  ["data_sources", 4000],
  ["data_points", 4000],
  ["costs", 4000],
  ["admissions", 4000],
  ["deadlines", 4000],
  ["requirements", 4000],
  ["financial_aid", 4000],
  ["media", 4000],
  ["campuses", 4000],
  ["departments", 2000],
  ["professors", 2000],
  ["research", 2000],
  ["research_metrics", 4000],
  ["ranking_entries", 4000],
  ["ranking_editions", 4000],
  ["ranking_providers", 4000],
  ["university_programs", 4000],
  ["programs", 4000],
  ["university_scholarships", 4000],
  ["scholarships", 2000],
  ["university_aliases", 8000],
  // Backup-only tables (Nov 20 cleanup): not used by the D1 build.
  ["source_records", 1500],
  ["external_identifiers", 8000],
];

async function sql(query) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, read_only: true }),
        signal: AbortSignal.timeout(170000),
      });
      const text = await r.text();
      if (r.ok && text.startsWith("[")) return JSON.parse(text);
      console.error(`  retry ${attempt}: ${r.status} ${text.slice(0, 90)}`);
    } catch (e) {
      console.error(`  retry ${attempt}: ${e.message}`);
    }
    await new Promise((d) => setTimeout(d, Math.min(attempt, 6) * 10000));
  }
  throw new Error("query kept failing");
}

const only = process.argv.slice(2);
for (const [table, size] of TABLES) {
  if (only.length && !only.includes(table)) continue;
  const file = new URL(table + ".ndjson", OUT);
  if (existsSync(file) && !only.length) {
    console.log(`${table}: already exported`);
    continue;
  }
  const [{ pk }] = await sql(
    `select coalesce((select string_agg(quote_ident(a.attname), ',') from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid='public.${table}'::regclass and i.indisprimary), 'ctid') as pk`,
  );
  const lines = [];
  for (let offset = 0; ; offset += size) {
    const rows = await sql(
      `select to_jsonb(t) as r from public.${table} t order by ${pk} limit ${size} offset ${offset}`,
    );
    for (const { r } of rows) lines.push(JSON.stringify(r));
    process.stdout.write(`\r${table}: ${lines.length}`);
    if (rows.length < size) break;
  }
  writeFileSync(new URL(table + ".ndjson.tmp", OUT), lines.join("\n") + (lines.length ? "\n" : ""));
  renameSync(new URL(table + ".ndjson.tmp", OUT), file);
  console.log(`\r${table}: ${lines.length} rows`);
}
console.log("export done");
