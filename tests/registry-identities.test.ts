import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import receipt from "../data/published/registry-identity-expansion-oct06.json";

test("bounded identity SQL runs under installed migrations, preserves corrections and repeats safely", async () => {
  const output = await mkdtemp(join(tmpdir(), "collegestat-identity-test-"));
  execFileSync("python3", ["scripts/ingestion/expand-registry-identities.py", "--sql-from-receipt", "--output-dir", output], { stdio: "pipe" });
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
    for (const file of (await readdir("supabase/migrations")).filter(f => f.endsWith(".sql")).sort()) {
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    }
    const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as {count: number; batches: {file: string; records: number; sha256: string}[]};
    assert.equal(manifest.count, 5000);
    assert.equal(manifest.batches.length, 20);
    assert.ok(manifest.batches.every(b => b.records <= 250));
    const sql = [];
    for (const batch of manifest.batches) {
      const contents = await readFile(batch.file, "utf8");
      assert.equal(createHash("sha256").update(contents).digest("hex"), batch.sha256);
      assert.ok(!/\b(?:delete|truncate|update|alter|drop)\b/i.test(contents.replace(/'(?:[^']|'')*'/gs, "''")), "Identity batches must not mutate installed observations or schema");
      await db.exec(contents);
      sql.push(contents);
    }
    assert.equal((await db.query<{n: number}>("select count(*) n from public.universities")).rows[0].n, 5000);
    assert.equal((await db.query<{n: number}>("select count(*) n from public.universities where university_type is not null")).rows[0].n, 0);
    assert.equal((await db.query<{n: number}>("select count(distinct identifiers->>'ror') n from public.universities")).rows[0].n, 5000);
    await db.query("update public.universities set description='Later staff correction' where id=$1", [receipt.records[0].id]);
    for (const contents of sql) await db.exec(contents);
    assert.equal((await db.query<{n: number}>("select count(*) n from public.universities")).rows[0].n, 5000);
    assert.equal((await db.query<{description: string}>("select description from public.universities where id=$1", [receipt.records[0].id])).rows[0].description, "Later staff correction");
    await db.exec("set role anon");
    assert.equal((await db.query<{n: number}>("select count(*) n from public.universities")).rows[0].n, 5000);
    await assert.rejects(db.query("update public.universities set published=false"));
    await db.exec("reset role");
  } finally {
    await db.close();
    await rm(output, { recursive: true, force: true });
  }
});
