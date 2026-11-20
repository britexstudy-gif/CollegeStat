import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

type Row = { university_id: string | null; country_code: string };
type Receipt = { providers: { source: { url: string }; records: Row[] }[] };
type Manifest = { files: { file: string; sha256: string }[] };

test("national ranking staging retains every source position, repeats safely and stays private under installed RLS", async () => {
  const output = await mkdtemp(join(tmpdir(), "collegestat-national-rankings-"));
  execFileSync("python3", ["scripts/ingestion/stage-national-rankings.py", "--out", output], { stdio: "pipe" });
  const receipt = JSON.parse(await readFile("data/published/reviewed-national-rankings.json", "utf8")) as Receipt;
  const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as Manifest;
  const db = new PGlite({ extensions: { pg_trgm } });
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',auth.uid(),'aal',current_setting('request.jwt.claim.aal',true),'role',auth.role()) $$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text); alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated;`);
    for (const file of (await readdir("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort()) {
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    }
    const identities = [...new Map(receipt.providers.flatMap((provider) => provider.records).filter((row) => row.university_id).map((row) => [row.university_id, row])).values()];
    await db.query("insert into public.universities(id,name,slug,country_code,published) select (r->>'university_id')::uuid,'Existing institution','national-' || (r->>'university_id'),r->>'country_code',true from jsonb_array_elements($1::jsonb) r", [JSON.stringify(identities)]);
    const existingSource = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await db.query("insert into public.data_sources(id,name,url) values($1,'Retained existing source metadata',$2)", [existingSource, receipt.providers[0].source.url]);
    const batches: string[] = [];
    for (const file of manifest.files) {
      const contents = await readFile(file.file, "utf8");
      assert.equal(createHash("sha256").update(contents).digest("hex"), file.sha256);
      await db.exec(contents);
      batches.push(contents);
    }
    const count = async (query: string) => (await db.query<{ n: number }>(query)).rows[0].n;
    assert.equal(await count("select count(*)::int n from public.source_records where status='pending'"), 1039);
    assert.equal(await count("select count(*)::int n from public.ranking_entries where verification_status='needs_review'"), 860);
    assert.equal(await count("select count(*)::int n from public.ranking_editions where permitted=false"), 18);
    assert.equal(await count("select count(*)::int n from public.source_records where university_id is null"), 179);
    assert.equal((await db.query<{ name: string }>("select name from public.data_sources where id=$1", [existingSource])).rows[0].name, "Retained existing source metadata");
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.data_sources where url=$1", [receipt.providers[0].source.url])).rows[0].n, 1);
    const sourceSnapshot = (await db.query("select * from public.source_records order by id")).rows;
    const rankSnapshot = (await db.query("select * from public.ranking_entries order by id")).rows;
    for (const sql of batches) await db.exec(sql);
    assert.deepEqual((await db.query("select * from public.source_records order by id")).rows, sourceSnapshot);
    assert.deepEqual((await db.query("select * from public.ranking_entries order by id")).rows, rankSnapshot);
    await db.exec("set role anon");
    assert.equal(await count("select count(*)::int n from public.ranking_entries"), 0);
    assert.equal(await count("select count(*)::int n from public.ranking_editions"), 0);
    await assert.rejects(db.query("select * from public.source_records"));
    await assert.rejects(db.query("update public.ranking_editions set permitted=true"));
    await db.exec("reset role; set role authenticated");
    assert.equal(await count("select count(*)::int n from public.source_records"), 0);
    assert.equal(await count("select count(*)::int n from public.ranking_entries"), 0);
    await db.exec("reset role");
  } finally {
    await db.close();
    await rm(output, { recursive: true, force: true });
  }
});
