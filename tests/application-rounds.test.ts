import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import receipt from "../data/published/reviewed-application-rounds-oct05.json";
import dates from "../data/published/application-dates-current.json";
import fees from "../data/published/application-fees-current.json";
import directory from "../data/published/global-directory.json";

test("application data keeps date precision, exact programme scope and source evidence", () => {
  const installed = new Map(dates.map(d => [d.id, d]));
  for (const row of receipt.records) {
    const current = installed.get(row.id)!;
    assert.ok(current);
    assert.equal(current.due_at, row.due_at);
    const evidence = (current as { evidence?: { university_wide?: boolean } }).evidence;
    assert.ok(evidence);
    assert.equal(evidence.university_wide, false);
    assert.ok(current.student_category);
  }
  assert.equal(fees.length, 4);
  assert.ok(fees.every(f => f.category === "application_fee" && f.period === "total"));
  assert.ok(fees.every(f => f.data_sources.id === f.source_id && f.evidence.university_wide === false));
  assert.ok(fees.filter(f => f.currency === "KZT").every(f => f.program_id && "programme" in f.evidence && f.evidence.programme === "Executive MBA"));
});

test("application SQL runs against all migrations, preserves staff/history, respects RLS and is idempotent", async () => {
  execFileSync("python3", ["scripts/ingestion/apply-reviewed-application-rounds.py"], { encoding: "utf8" });
  const sql = await readFile("outputs/deeper-data-applications.sql", "utf8");
  const db = new PGlite({ extensions: { pg_trgm } });
  const historicalID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const existingProgrammeID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
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
    for (const file of (await readdir("supabase/migrations")).filter(f => f.endsWith(".sql")).sort()) {
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    }
    for (const universityID of new Set(receipt.records.map(r => r.university_id))) {
      const u = directory.find(d => d.id === universityID)!;
      await db.query("insert into public.universities(id,name,slug,country_code,published) values($1,$2,$3,$4,true)", [u.id, u.name, u.slug, u.country_code]);
    }
    const source = receipt.sources[0];
    await db.query("insert into public.data_sources(id,name,url) values($1,'Preserved older source metadata',$2)", [source.id, source.url]);
    await db.query(`insert into public.programs(id,name,subject,degree_level,language) values($1,'Executive MBA','Business Administration','Master','English')`, [existingProgrammeID]);
    await db.query(`insert into public.deadlines(id,university_id,source_id,source_url,year,title,student_category,cycle,due_date,timezone,application_url,verification_status,verified_at,notes)
values($1,$2,$3,$4,2025,'Historic application','Previous intake','2025 entry','2025-11-25','Asia/Hong_Kong',$4,'verified','2025-10-01','Historic observation')`, [historicalID, receipt.records[0].university_id, source.id, source.url]);
    await db.exec(sql);
    assert.equal((await db.query<{ n: number }>("select count(*) n from public.deadlines")).rows[0].n, 11);
    assert.equal((await db.query<{ n: number }>("select count(*) n from public.costs")).rows[0].n, 4);
    assert.equal((await db.query<{ n: number }>("select count(*) n from public.programs")).rows[0].n, 1);
    assert.equal((await db.query<{ n: number }>("select count(*) n from public.university_programs")).rows[0].n, 1);
    assert.equal((await db.query<{ n: number }>("select count(*) n from public.deadlines where due_at is null and due_date is not null")).rows[0].n, 7);
    assert.equal((await db.query<{ n: number }>("select count(*) n from public.costs where category='tuition' or period='year'")).rows[0].n, 0);
    const nuIDs = fees.filter(f => f.currency === "KZT").map(f => f.id);
    assert.ok((await db.query<{program_id: string}>("select program_id from public.costs where id=any($1::uuid[])", [nuIDs])).rows.every(r => r.program_id === existingProgrammeID));
    assert.equal((await db.query<{name: string}>("select name from public.data_sources where id=$1", [source.id])).rows[0].name, "Preserved older source metadata");
    await db.query("update public.deadlines set notes='Later staff correction' where id=$1", [receipt.records[0].id]);
    const snapshot = await db.query("select * from public.deadlines order by id");
    const costSnapshot = await db.query("select * from public.costs order by id");
    await db.exec(sql);
    assert.deepEqual((await db.query("select * from public.deadlines order by id")).rows, snapshot.rows);
    assert.deepEqual((await db.query("select * from public.costs order by id")).rows, costSnapshot.rows);
    assert.equal((await db.query<{notes: string}>("select notes from public.deadlines where id=$1", [historicalID])).rows[0].notes, "Historic observation");
    await db.exec("set role anon");
    assert.equal((await db.query<{ n: number }>("select count(*) n from public.costs")).rows[0].n, 4);
    await assert.rejects(db.query("update public.costs set amount=0"));
    await db.exec("reset role");
    await db.query("update public.universities set published=false where id=$1", [fees.find(f => f.currency === "KZT")!.university_id]);
    await db.exec("set role anon");
    assert.equal((await db.query<{ n: number }>("select count(*) n from public.costs")).rows[0].n, 2);
    await db.exec("reset role");
    const mode = await db.query<{ tablename: string; rowsecurity: boolean }>("select tablename,rowsecurity from pg_tables where schemaname='public' and tablename in ('deadlines','costs','university_programs')");
    assert.ok(mode.rows.every(r => r.rowsecurity === true));
  } finally {
    await db.close();
  }
});
