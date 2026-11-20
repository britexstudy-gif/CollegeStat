// Dry-run of the v2 load: applies supabase/proposals/20261115_data_v2.sql to an
// in-memory Postgres (PGlite), COPYs every data/v2/*.csv in LOAD_ORDER (so every
// CHECK and foreign key runs), then calls explore_universities_v2. Touches no real DB.
//
//   node --import tsx scripts/ingest/load-check.ts
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { CATALOGUE_COLUMNS, LOAD_ORDER } from "../../server/data-v2/schema";
import { path } from "./lib";

export const SUPABASE_STUB = `
create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
`;

export async function freshV2Database(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_STUB);
  await db.exec(readFileSync(path("supabase/proposals/20261115_data_v2.sql"), "utf8"));
  return db;
}

async function main() {
  const db = await freshV2Database();
  const counts: Record<string, number> = {};
  for (const table of LOAD_ORDER) {
    const csv = readFileSync(path("data/v2", table + ".csv"));
    await db.query(`copy v2.${table} (${CATALOGUE_COLUMNS[table].join(",")}) from '/dev/blob' with (format csv, header true)`, [], {
      blob: new Blob([csv]),
    });
    counts[table] = Number((await db.query<{ n: number }>(`select count(*)::int n from v2.${table}`)).rows[0].n);
  }
  const probe = async (filters: object) =>
    (await db.query<{ r: { total: number; medianTuition: number | null } }>("select public.explore_universities_v2($1::jsonb, 1) r", [JSON.stringify(filters)])).rows[0].r;
  const checks = {
    all: (await probe({})).total,
    targets: (await probe({ targets: "true" })).total,
    "GB,DE ielts<=6.5": (await probe({ countries: "GB,DE", ielts_max: 6.5 })).total,
    "common_app": (await probe({ platform: "common_app" })).total,
    "tuition<=10000 targets": (await probe({ tuition_max: 10000, targets: "true" })).total,
    "program=computer": (await probe({ program: "computer" })).total,
  };
  console.log(JSON.stringify({ loaded: counts, explore: checks }, null, 1));
  await db.close();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
