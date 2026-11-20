import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { z } from "zod";
import { readJSON } from "../server/http";
import { entitySchemas } from "../services/admin-schema";
import { observationSchema } from "../lib/research";

const migration = "20261009125814_ranking_review_guard.sql";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEMBER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORDINARY_SOURCE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const APPROVE_ERROR = "Ranking observations require a dedicated ranking review workflow";
const VERIFY_ERROR = "Staged ranking entries require a dedicated ranking review workflow";
type RankingRow = {
  university_id: string | null;
  country_code: string;
  category: string;
  rank: number;
  rank_label: string;
  name: string;
  evidence: Record<string, unknown>;
};
type Receipt = { providers: { provider: string; records: RankingRow[] }[] };
type Staged = {
  id: string;
  university_id: string;
  source_id: string;
  metric: string;
  year: number;
  raw_value: RankingRow;
};
type RPCResult = { data?: unknown; error: { code?: string; message?: string } | null };
type RPC = (name: string, args: Record<string, unknown>) => Promise<RPCResult>;
type Handler = (request: Request) => Promise<Response>;

// Evaluate the real route with a local RPC adapter. This avoids loading the
// Cloudflare runtime or contacting hosted services while exercising POST itself.
async function adminHandler(rpc: RPC): Promise<Handler> {
  const { outputText } = transpileModule(await readFile("app/api/admin/route.ts", "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  });
  const dependencies: Record<string, unknown> = {
    zod: { z },
    "@/server/http": { readJSON },
    "@/server/config": {
      sameOrigin: (request: Request) => request.headers.get("origin") === new URL(request.url).origin,
      serverError: () => Response.json({ error: "The request could not be completed. Please retry." }, { status: 500 }),
    },
    "@/server/admin-access": { adminAccess: async () => ({ db: { rpc } }) },
    "@/services/admin-schema": { entitySchemas },
    "@/lib/research": { observationSchema },
  };
  const exports: { POST?: Handler } = {};
  new Function("require", "exports", outputText)((name: string) => {
    assert.ok(name in dependencies, `Unexpected route dependency: ${name}`);
    return dependencies[name];
  }, exports);
  assert.ok(exports.POST);
  return exports.POST;
}

function adminRequest(input: unknown) {
  return new Request("https://collegestat.test/api/admin", {
    method: "POST",
    headers: { origin: "https://collegestat.test", "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

function guardError(message: string) {
  return (error: unknown) => {
    assert.equal((error as { code: string }).code, "22023");
    assert.equal((error as Error).message, message);
    return true;
  };
}

test("installed migrations keep staged HERD/NIRF rankings in dedicated review without changing ordinary approval", async (t) => {
  const db = new PGlite({ extensions: { pg_trgm } });
  const output = await mkdtemp(join(tmpdir(), "collegestat-ranking-review-guard-"));
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',auth.uid(),'aal',current_setting('request.jwt.claim.aal',true),'role',auth.role()) $$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated;`);
    // Install actual migrations only. The separate admin MFA proposal must not
    // hide or alter the behavior of the functions being guarded.
    for (const file of (await readdir("supabase/migrations")).filter(file => file.endsWith(".sql") && file < migration).sort()) {
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    }
    const rpcMetadata = async () => (await db.query(`select oid, proname, prosecdef, proconfig, proacl,
proargnames, proargtypes::text, prorettype::text, proowner, prolang, provolatile, prokind
from pg_proc where oid in ('public.approve_observation(uuid)'::regprocedure,'public.verify_record(text,uuid)'::regprocedure)
order by proname`)).rows;
    const metadataBefore = await rpcMetadata();
    const bodyBefore = (await db.query<{ body: string }>("select prosrc body from pg_proc where oid='public.approve_observation(uuid)'::regprocedure")).rows[0].body;
    const guardSQL = await readFile("supabase/migrations/" + migration, "utf8");
    await db.exec(guardSQL);
    assert.deepEqual(await rpcMetadata(), metadataBefore, "CREATE OR REPLACE preserves ownership, signature, security, search path and existing grants");
    const bodyAfter = (await db.query<{ body: string }>("select prosrc body from pg_proc where oid='public.approve_observation(uuid)'::regprocedure")).rows[0].body;
    assert.equal(bodyAfter.replace(" if r.metric like 'ranking:%' then raise exception '" + APPROVE_ERROR + "' using errcode='22023'; end if;\n", ""), bodyBefore);
    await db.exec(guardSQL);
    assert.deepEqual(await rpcMetadata(), metadataBefore, "The guard can be safely applied again");

    const receipt = JSON.parse(await readFile("data/published/reviewed-national-rankings.json", "utf8")) as Receipt;
    const identities = [...new Map(receipt.providers.flatMap(provider => provider.records).filter(row => row.university_id).map(row => [row.university_id, row])).values()];
    await db.query("insert into public.universities(id,name,slug,country_code,published) select (r->>'university_id')::uuid,r->>'name','ranking-guard-'||(r->>'university_id'),r->>'country_code',true from jsonb_array_elements($1::jsonb) r", [JSON.stringify(identities)]);
    execFileSync("python3", ["scripts/ingestion/stage-national-rankings.py", "--out", output], { stdio: "pipe" });
    const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8")) as { files: { file: string }[] };
    for (const file of manifest.files) await db.exec(await readFile(file.file, "utf8"));
    const staged = (await db.query<Staged>(`select distinct on (p.slug) r.id,r.university_id,r.source_id,r.metric,r.year,r.raw_value
from public.source_records r join public.ranking_entries e on e.id=r.id
join public.ranking_editions edition on edition.id=e.edition_id
join public.ranking_providers p on p.id=edition.provider_id
where p.slug in ('herd','nirf') order by p.slug,r.id`)).rows;
    assert.equal(staged.length, 2);
    for (const row of staged) {
      const entry = (await db.query<{ rank: number; rank_label: string; evidence: Record<string, unknown> }>("select rank,rank_label,evidence from public.ranking_entries where id=$1", [row.id])).rows[0];
      assert.equal(entry.rank, row.raw_value.rank);
      assert.equal(entry.rank_label, row.raw_value.rank_label);
      assert.deepEqual(entry.evidence, row.raw_value.evidence, "All supplied ranking evidence survives staging");
      assert.equal(entry.evidence.raw_rank, row.raw_value.rank);
      assert.equal(entry.evidence.raw_name, row.raw_value.name);
      assert.ok(entry.evidence.source_retrieved_at);
      assert.ok(entry.evidence.population);
      await db.query("insert into public.data_points(university_id,metric,year,value,unit,source_id,canonical) values($1,$2,$3,999,'position',$4,true)", [row.university_id, row.metric, row.year, row.source_id]);
    }
    await db.query("insert into auth.users(id) values($1),($2)", [ADMIN, MEMBER]);
    await db.query("update public.profiles set role='admin' where id=$1", [ADMIN]);
    await db.query("insert into public.data_sources(id,name,url) values($1,'Ordinary enrollment evidence','https://example.edu/enrollment')", [ORDINARY_SOURCE]);
    const as = async (id: string, role = "authenticated") => {
      assert.ok(["authenticated", "anon"].includes(role));
      await db.exec(`reset role; set role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false),set_config('request.jwt.claim.aal','aal1',false)", [id, role]);
    };
    await as(ADMIN);
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const table of ["source_records", "data_points", "ranking_entries", "ranking_editions", "verification_logs", "audit_logs"]) {
        result[table] = (await db.query(`select * from public.${table} order by id`)).rows;
      }
      return result;
    };
    const rejectWithoutMutation = async (sql: string, id: string, message: string) => {
      const before = await snapshot();
      await db.exec("begin");
      try {
        await assert.rejects(db.query(sql, [id]), guardError(message));
        await assert.rejects(db.query("select 1"), (error: unknown) => (error as { code: string }).code === "25P02");
      } finally {
        await db.exec("rollback");
      }
      assert.deepEqual(await snapshot(), before, "Rejected review leaves statuses, canonical facts, ranks, editions and audit history unchanged");
    };

    await t.test("generic approval and entry verification abort without mutation or anonymous publication", async () => {
      for (const row of staged) {
        await rejectWithoutMutation("select public.approve_observation($1)", row.id, APPROVE_ERROR);
        await rejectWithoutMutation("select public.verify_record('ranking_entries',$1)", row.id, VERIFY_ERROR);
        assert.equal((await db.query<{ status: string }>("select status from public.source_records where id=$1", [row.id])).rows[0].status, "pending");
      }
      await as("", "anon");
      for (const table of ["ranking_entries", "ranking_editions", "data_points"]) {
        assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0);
      }
      await assert.rejects(db.query("select * from public.source_records"));
      await assert.rejects(db.query("select public.approve_observation($1)", [staged[0].id]), /permission denied/);
      await assert.rejects(db.query("select public.verify_record('ranking_entries',$1)", [staged[0].id]), /permission denied/);
      await as(ADMIN);
    });

    const rpc: RPC = async (name, args) => {
      assert.ok(["approve_observation", "reject_observation", "verify_record"].includes(name));
      try {
        const values = name === "verify_record" ? [args.entity, args.record_id] : [args.observation_id];
        await db.query(`select public.${name}(${name === "verify_record" ? "$1,$2" : "$1"})`, values);
        return { data: null, error: null };
      } catch (error) {
        return { error: { code: (error as { code: string }).code, message: (error as Error).message } };
      }
    };
    const POST = await adminHandler(rpc);
    await t.test("admin API returns a clear 409 for both blocked actions", async () => {
      const before = await snapshot();
      for (const row of staged) {
        const approval = await POST(adminRequest({ action: "review", id: row.id, approve: true }));
        assert.equal(approval.status, 409);
        assert.deepEqual(await approval.json(), { error: APPROVE_ERROR });
        const verification = await POST(adminRequest({ action: "verify", entity: "ranking_entries", id: row.id }));
        assert.equal(verification.status, 409);
        assert.deepEqual(await verification.json(), { error: VERIFY_ERROR });
      }
      assert.deepEqual(await snapshot(), before);
      const unrelatedError = await adminHandler(async () => ({ error: { code: "22023", message: "Private unrelated database detail" } }));
      const response = await unrelatedError(adminRequest({ action: "review", id: staged[0].id, approve: true }));
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "The request could not be completed. Please retry." });
    });

    await t.test("nonadmins cannot approve, verify or reject rankings", async () => {
      const before = await snapshot();
      await as(MEMBER);
      await assert.rejects(db.query("select public.approve_observation($1)", [staged[0].id]), /Administrator required/);
      await assert.rejects(db.query("select public.verify_record('ranking_entries',$1)", [staged[0].id]), /Administrator required/);
      await assert.rejects(db.query("select public.reject_observation($1)", [staged[0].id]), /Administrator required/);
      await as(ADMIN);
      assert.deepEqual(await snapshot(), before);
    });

    await t.test("rejection remains available and rejected, conflicting or previously approved sources cannot bypass ranking review", async () => {
      const response = await POST(adminRequest({ action: "review", id: staged[0].id, approve: false }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { reviewed: true });
      assert.equal((await db.query<{ status: string }>("select status from public.source_records where id=$1", [staged[0].id])).rows[0].status, "rejected");
      await rejectWithoutMutation("select public.verify_record('ranking_entries',$1)", staged[0].id, VERIFY_ERROR);
      for (const status of ["conflicting", "approved"]) {
        await db.query("update public.source_records set status=$1 where id=$2", [status, staged[1].id]);
        if (status === "conflicting") await rejectWithoutMutation("select public.approve_observation($1)", staged[1].id, APPROVE_ERROR);
        await rejectWithoutMutation("select public.verify_record('ranking_entries',$1)", staged[1].id, VERIFY_ERROR);
      }
    });

    await t.test("legacy entries with different IDs still match staged sources by university, source and year", async () => {
      const original = staged[0].id;
      const replacement = (await db.query<{ id: string }>("update public.ranking_entries set id=gen_random_uuid() where id=$1 returning id", [original])).rows[0].id;
      assert.notEqual(replacement, original);
      await rejectWithoutMutation("select public.verify_record('ranking_entries',$1)", replacement, VERIFY_ERROR);
      // Legacy entries may obtain their reporting year from their edition.
      await db.query("update public.ranking_entries set year=null where id=$1", [replacement]);
      await rejectWithoutMutation("select public.verify_record('ranking_entries',$1)", replacement, VERIFY_ERROR);
    });

    await t.test("ordinary numeric approval copies evidence and supersedes a canonical value", async () => {
      const university = staged[0].university_id;
      const evidence = { source_url: "https://example.edu/enrollment", population: "All enrolled students", reporting_year: 2026 };
      await db.query("insert into public.data_points(university_id,metric,year,value,unit,source_id,canonical,verification_status,verified_at) values($1,'enrollment',2026,120,'students',$2,true,'verified',now())", [university, staged[0].source_id]);
      await db.query("select public.stage_observations($1,$2::jsonb)", [ORDINARY_SOURCE, JSON.stringify([{ university_id: university, metric: "enrollment", year: 2026, value: 130, unit: "students", source_url: "https://example.edu/enrollment", evidence }])]);
      const observation = (await db.query<{ id: string; status: string }>("select id,status from public.source_records where metric='enrollment'")).rows[0];
      assert.equal(observation.status, "conflicting");
      const response = await POST(adminRequest({ action: "review", id: observation.id, approve: true }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { reviewed: true });
      const points = (await db.query<{ value: number; canonical: boolean; verification_status: string; evidence: unknown }>("select value::integer value,canonical,verification_status,evidence from public.data_points where metric='enrollment' order by value")).rows;
      assert.equal(points.length, 2);
      assert.equal(points[0].canonical, false);
      assert.equal(points[1].canonical, true);
      assert.equal(points[1].value, 130);
      assert.equal(points[1].verification_status, "verified");
      assert.deepEqual(points[1].evidence, evidence);
      assert.equal((await db.query<{ status: string }>("select status from public.source_records where id=$1", [observation.id])).rows[0].status, "approved");
      await as("", "anon");
      assert.deepEqual((await db.query("select metric,value::integer value from public.data_points")).rows, [{ metric: "enrollment", value: 130 }]);
      assert.equal((await db.query("select * from public.ranking_entries")).rows.length, 0);
      await as(ADMIN);
    });

    await t.test("established ranking verification without staged ranking observations still works", async () => {
      const provider = (await db.query<{ id: string }>("insert into public.ranking_providers(name,slug,license_status) values('Curated ranking','curated-review-guard','permitted') returning id")).rows[0].id;
      const edition = (await db.query<{ id: string }>("insert into public.ranking_editions(provider_id,year,permitted) values($1,2026,true) returning id", [provider])).rows[0].id;
      const entry = (await db.query<{ id: string }>("insert into public.ranking_entries(university_id,edition_id,year,source_id,rank) values($1,$2,2026,$3,7) returning id", [staged[0].university_id, edition, ORDINARY_SOURCE])).rows[0].id;
      const response = await POST(adminRequest({ action: "verify", entity: "ranking_entries", id: entry }));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { saved: true });
      await as("", "anon");
      assert.deepEqual((await db.query("select id,rank from public.ranking_entries")).rows, [{ id: entry, rank: 7 }]);
      await as(ADMIN);
    });
  } finally {
    await db.close();
    await rm(output, { recursive: true, force: true });
  }
});
