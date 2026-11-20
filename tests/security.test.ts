import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { awardImportSQL } from "../scripts/database/award-import";
import { currentScholarships } from "../server/scholarship-catalogue";
import requirements from "../data/published/requirements-current.json";
import { globalCatalogue } from "../server/global-catalogue";
import dates from "../data/published/application-dates-current.json";
import { parseAdminToolResult } from "../lib/admin-tool-results";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  UNI = "11111111-1111-4111-8111-111111111111";
test("Supabase migration: RLS, ownership, role escalation, audit, ranking permissions, search, and imports", async () => {
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
    for (const file of (await readdir("supabase/migrations")).sort()) {
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    }
    // Exercise the proposed database MFA policy locally; it is not a hosted migration.
    await db.exec(
      await readFile("supabase/proposals/admin-mfa-enforcement.sql", "utf8"),
    );
    await db.exec(await readFile("supabase/seed.sql", "utf8"));
    await db.exec(await readFile("supabase/seed-evidence.sql", "utf8"));
    await db.exec(await readFile("supabase/seed-intelligence.sql", "utf8"));
    await db.exec(await readFile("supabase/seed-assets.sql", "utf8"));
    await db.exec(
      `insert into auth.users(id,raw_user_meta_data) values ('${A}','{"full_name":"Alice"}'),('${B}','{}'),('${ADMIN}','{}'); update public.profiles set role='admin' where id='${ADMIN}';`,
    );
    const as = async (id: string, role = "authenticated") => {
      await db.exec(
        `reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false); select set_config('request.jwt.claim.role','${role}',false); select set_config('request.jwt.claim.aal','aal2',false);`,
      );
    };
    await as("", "anon");
    assert.equal(
      (await db.query("select * from public.universities")).rows.length,
      6,
    );
    await assert.rejects(db.query("select * from public.user_notes"));
    await assert.rejects(
      db.query(
        `insert into public.universities(name,slug,country_code) values('Bad','bad','US')`,
      ),
    );
    await as(A);
    await assert.rejects(
      db.query(`select public.admin_university_coverage('${UNI}')`),
      /Administrator/,
    );
    assert.equal(
      (await db.query("select * from public.profiles")).rows.length,
      1,
    );
    await db.exec(
      `update public.profiles set display_name='Alice Updated' where id='${A}'`,
    );
    await assert.rejects(
      db.exec(`update public.profiles set role='admin' where id='${A}'`),
    );
    await assert.rejects(
      db.exec(
        `insert into public.saved_universities(user_id,university_id) values('${B}','${UNI}')`,
      ),
    );
    await db.exec(
      `insert into public.saved_universities(user_id,university_id) values('${A}','${UNI}'); insert into public.user_notes(user_id,university_id,body) values('${A}','${UNI}','Private note')`,
    );
    await as(B);
    assert.equal(
      (await db.query("select * from public.user_notes")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.saved_universities")).rows.length,
      0,
    );
    await db.exec(
      `update public.user_notes set body='Changed' where user_id='${A}'`,
    );
    await as(A);
    assert.equal(
      (await db.query<{ body: string }>("select body from public.user_notes"))
        .rows[0].body,
      "Private note",
    );
    await assert.rejects(
      db.query(
        `select public.save_comparison(array['${UNI}'::uuid,'${UNI}'::uuid],'Bad')`,
      ),
    );
    await db.query(
      `select public.save_comparison(array['${UNI}'::uuid],'My comparison')`,
    );
    await as(ADMIN);
    await db.exec("select set_config('request.jwt.claim.aal','aal1',false)");
    const coverageResult = await db.query<{ coverage: unknown }>(
      `select public.admin_university_coverage('${UNI}') coverage`,
    );
    assert.equal(coverageResult.rows.length, 1);
    assert.equal(parseAdminToolResult("university_coverage", coverageResult.rows[0].coverage).university.id, UNI,
      "MCP output contract accepts the actual staff coverage RPC shape");
    await assert.rejects(
      db.exec(
        `update public.universities set name='MFA bypass' where id='${UNI}'`,
      ),
      /MFA/,
    );
    const firstSource = (
      await db.query<{ id: string }>(
        "select id from public.data_sources limit 1",
      )
    ).rows[0].id;
    await assert.rejects(
      db.query("select public.stage_observations($1,$2::jsonb)", [
        firstSource,
        JSON.stringify([
          {
            university_id: UNI,
            metric: "enrollment",
            year: 2026,
            value: 1,
            unit: "students",
            source_url: "https://example.edu/students",
          },
        ]),
      ]),
      /MFA/,
    );
    await db.exec("select set_config('request.jwt.claim.aal','aal2',false)");
    await db.exec(
      `insert into public.universities(name,slug,country_code,published) values('Unpublished','unpublished','US',false)`,
    );
    assert.ok(
      (await db.query("select * from public.audit_logs")).rows.length > 0,
    );
    const source = (
      await db.query<{ id: string }>(
        "select id from public.data_sources limit 1",
      )
    ).rows[0].id;
    await assert.rejects(
      db.exec(
        `insert into public.admissions(university_id,acceptance_rate) values('${UNI}',101)`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into public.admissions(university_id,applicants,admitted) values('${UNI}',10,20)`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into public.costs(university_id,category,amount,currency,period) values('${UNI}','tuition',-1,'USD','year')`,
      ),
    );
    await assert.rejects(
      db.exec(
        `insert into public.data_points(university_id,metric,value,verification_status) values('${UNI}','enrollment',10,'verified')`,
      ),
    );
    await db.exec(
      `insert into public.source_records(source_id,university_id,metric,year,raw_value,normalized_value,unit,source_url) values('${source}','${UNI}','test_metric',2025,'100',100,'students','https://example.edu/facts')`,
    );
    const observation = (
      await db.query<{ id: string }>("select id from public.source_records")
    ).rows[0].id;
    await db.query(`select public.approve_observation('${observation}')`);
    assert.equal(
      (await db.query("select * from public.verification_logs")).rows.length,
      1,
    );
    await as(A);
    await assert.rejects(
      db.query(`select public.approve_observation('${observation}')`),
    );
    await assert.rejects(
      db.exec(
        `insert into storage.objects(bucket_id) values('university-logos')`,
      ),
    );
    assert.equal(
      (await db.query("select * from public.audit_logs")).rows.length,
      0,
    );
    await as("", "anon");
    assert.equal(
      (await db.query("select * from public.universities")).rows.length,
      6,
    );
    const search = await db.query<{ result: { total: number } }>(
      `select public.explore_universities('{"country":"DE"}',1) result`,
    );
    assert.equal(search.rows[0].result.total, 1);
    await assert.rejects(
      db.query(`select public.explore_universities('{"ielts_max":10}',1)`),
    );
    const cs = await db.query<{ r: { total: number } }>(
      `select public.explore_universities('{"field":"Computer Science","degree":"Bachelor","ielts_max":7,"scholarships":"yes"}',1) r`,
    );
    assert.equal(
      cs.rows[0].r.total,
      1,
      "Sourced program, requirement and scholarship constraints compose",
    );

    assert.equal(
      (await db.query(`select * from public.search_universities('MIT')`)).rows
        .length,
      1,
    );
    await as(ADMIN);
    await db.exec(
      `insert into public.ranking_editions(provider_id,year,permitted) select id,2026,true from public.ranking_providers where slug='qs'`,
    );
    await db.exec(
      `insert into public.ranking_entries(university_id,edition_id,rank,source_id) select '${UNI}',id,1,'${source}' from public.ranking_editions limit 1`,
    );
    await as("", "anon");
    assert.equal(
      (await db.query("select * from public.ranking_entries")).rows.length,
      0,
    );
    await as(ADMIN);
    await db.exec(
      `update public.ranking_providers set license_status='permitted' where slug='qs'`,
    );
    const entry = (
      await db.query<{ id: string }>(
        "select id from public.ranking_entries limit 1",
      )
    ).rows[0];
    await as("", "anon");
    assert.equal(
      (await db.query("select * from public.ranking_entries")).rows.length,
      0,
      "Permission alone never publishes an unverified ranking",
    );
    await as(ADMIN);
    await db.query(
      `select public.verify_record('ranking_entries','${entry.id}')`,
    );
    await as("", "anon");
    assert.equal(
      (await db.query("select * from public.ranking_entries")).rows.length,
      1,
    );

    // Faculty and media are visible only with verified evidence and reuse permission.
    assert.equal(
      (await db.query("select * from public.professors")).rows.length,
      1,
    );
    assert.equal((await db.query("select * from public.media")).rows.length, 2);
    await as(ADMIN);
    assert.equal(
      (await db.query("select * from public.user_notes")).rows.length,
      0,
      "Admins cannot read students' notes",
    );
    await db.exec(
      "update public.professors set title='Changed title' where name='Daniela Rus'",
    );
    await as("", "anon");
    assert.equal(
      (await db.query("select * from public.professors")).rows.length,
      0,
      "Editing a published fact invalidates verification",
    );
    await as(ADMIN);
    const row = {
      university_id: UNI,
      metric: "enrollment",
      year: 2026,
      value: 12345,
      unit: "students",
      source_url: "https://example.edu/2026/facts",
    };
    const stage = async (value: number) =>
      db.query<{ r: { accepted: number; duplicates: number } }>(
        "select public.stage_observations($1,$2::jsonb) r",
        [source, JSON.stringify([{ ...row, value }])],
      );
    const firstStagingReceipt = (await stage(12345)).rows[0].r;
    assert.equal(firstStagingReceipt.accepted, 1);
    assert.equal(parseAdminToolResult("stage_observations", firstStagingReceipt).accepted, 1,
      "MCP output contract accepts the actual staging receipt without inventing publication status");
    assert.equal(
      (await stage(12345)).rows[0].r.duplicates,
      1,
      "Identical retries do not duplicate observations",
    );
    const pending = async () =>
      (
        await db.query<{ id: string }>(
          "select id from public.source_records where year=2026 and status in ('pending','conflicting') order by retrieved_at desc limit 1",
        )
      ).rows[0].id;
    await db.query("select public.approve_observation($1)", [await pending()]);
    assert.equal((await stage(12500)).rows[0].r.accepted, 1);
    await db.query("select public.approve_observation($1)", [await pending()]);
    const versions = await db.query<{ value: string; canonical: boolean }>(
      "select value,canonical from public.data_points where university_id=$1 and metric='enrollment' and year=2026 order by created_at",
      [UNI],
    );
    assert.equal(
      versions.rows.length,
      2,
      "Same-source corrections retain both values",
    );
    assert.equal(versions.rows.filter((v) => v.canonical).length, 1);
    await as("", "anon");
    assert.equal(
      (await db.query("select * from public.data_points where year=2026")).rows
        .length,
      1,
      "Only the canonical revision is public",
    );
    await as(A);
    await assert.rejects(stage(13000));
    await assert.rejects(db.query("select public.claim_ingestion_job()"));
    await as(ADMIN);
    const before = (await db.query("select * from public.data_imports")).rows
      .length;
    await assert.rejects(
      db.query("select public.stage_observations($1,$2::jsonb)", [
        source,
        JSON.stringify([row, { ...row, value: -10 }]),
      ]),
    );
    assert.equal(
      (await db.query("select * from public.data_imports")).rows.length,
      before,
      "Invalid imports roll back the entire batch",
    );
    const feed = (
      await db.query<{ id: string }>(
        "insert into public.ingestion_feeds(source_id,name,adapter,url,enabled) values($1,'Test feed','collegestat-json','https://example.edu/feed.json',true) returning id",
        [source],
      )
    ).rows[0].id;
    await as("", "service_role");
    await db.query("select public.enqueue_due_feeds()");
    await db.query("select public.enqueue_due_feeds()");
    const job = (
      await db.query<{ j: { id: string; lease_token: string } }>(
        "select to_jsonb(public.claim_ingestion_job()) j",
      )
    ).rows[0].j;
    assert.ok(job.id);
    assert.equal(
      (
        await db.query<{ j: unknown }>(
          "select to_jsonb(public.claim_ingestion_job()) j",
        )
      ).rows[0].j,
      null,
      "Running lease cannot be claimed twice",
    );
    await assert.rejects(
      db.query("select public.stage_observations($1,$2::jsonb,$3,$4)", [
        source,
        JSON.stringify([row]),
        job.id,
        A,
      ]),
    );
    await db.query("select public.stage_observations($1,$2::jsonb,$3,$4)", [
      source,
      JSON.stringify([{ ...row, year: 2027 }]),
      job.id,
      job.lease_token,
    ]);
    await assert.rejects(
      db.query("select public.stage_observations($1,$2::jsonb,$3,$4)", [
        source,
        JSON.stringify([row]),
        job.id,
        job.lease_token,
      ]),
      "Completed lease cannot be reused",
    );
    await as(ADMIN);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.ingestion_jobs where feed_id=$1",
          [feed],
        )
      ).rows[0].status,
      "review",
    );
    await as("", "anon");
    assert.equal(
      (await db.query("select * from public.data_points where year=2027")).rows
        .length,
      0,
      "Worker cannot auto-publish",
    );
    const candidateRows = JSON.stringify([
      {
        external_id: "https://ror.org/0test0001",
        source_url: "https://ror.org/0test0001",
        name: "Test Research Institute",
        country_code: "DE",
        source_modified_at: "2026-09-01",
        source_metadata: { license: "CC0-1.0" },
        proposed: {
          name: "Test Research Institute",
          country_code: "DE",
          website: "https://example.test",
          aliases: ["TRI"],
        },
      },
    ]);
    await as(A);
    assert.equal(
      (await db.query("select * from public.institution_candidates")).rows
        .length,
      0,
    );
    await assert.rejects(
      db.query("select public.stage_institution_candidates($1::jsonb,$2)", [
        candidateRows,
        "https://zenodo.org/records/test",
      ]),
    );
    await as("", "service_role");
    await db.query("select public.stage_institution_candidates($1::jsonb,$2)", [
      candidateRows,
      "https://zenodo.org/records/test",
    ]);
    await db.query("select public.stage_institution_candidates($1::jsonb,$2)", [
      candidateRows,
      "https://zenodo.org/records/test",
    ]);
    await assert.rejects(
      db.query(
        "select public.review_institution_candidate(gen_random_uuid(),true,null)",
      ),
    );
    await as(ADMIN);
    const candidates = await db.query<{ id: string }>(
      "select id from public.institution_candidates",
    );
    assert.equal(
      candidates.rows.length,
      1,
      "Identity import deduplicates identical versions",
    );
    const candidateId = candidates.rows[0].id;
    const reviewed = await db.query<{ id: string }>(
      "select public.review_institution_candidate($1,true,null) id",
      [candidateId],
    );
    const draftId = reviewed.rows[0].id;
    assert.equal(
      (
        await db.query<{ published: boolean }>(
          "select published from public.universities where id=$1",
          [draftId],
        )
      ).rows[0].published,
      false,
    );
    await assert.rejects(
      db.query("select public.review_institution_candidate($1,true,null)", [
        candidateId,
      ]),
    );
    await as("", "anon");
    await assert.rejects(
      db.query("select * from public.institution_candidates"),
    );
    assert.equal(
      (
        await db.query("select * from public.universities where id=$1", [
          draftId,
        ])
      ).rows.length,
      0,
      "Identity review never auto-publishes",
    );
    const mitSearch = await db.query<{ slug: string }>(
      "select slug from public.search_universities('MIT')",
    );
    assert.equal(mitSearch.rows[0].slug, "mit", "Exact acronym ranks first");
    await db.exec(
      "reset role; select set_config('request.jwt.claim.role','',false);",
    );
    const parentIDs = new Set([
      ...currentScholarships.flatMap((a) =>
        a.university_scholarships.map((l) => l.university_id),
      ),
      ...requirements.map((r) => r.university_id),
    ]);
    for (const id of parentIDs) {
      const u = globalCatalogue.find((u) => u.id === id)!;
      await db.query(
        "insert into public.universities(id,name,slug,country_code,published) values($1,$2,$3,$4,true) on conflict do nothing",
        [u.id, u.name, u.slug, u.country_code],
      );
    }
    await db.exec(awardImportSQL());
    const revised = requirements.find(
      (r) => r.id === "bb000000-0000-4000-8000-000000000008",
    )!;
    assert.equal(
      (
        await db.query<{ label: string }>(
          "select label from public.requirements where id=$1",
          [revised.id],
        )
      ).rows[0].label,
      revised.label,
      "Reviewed language policy replaces the older seed without adding a duplicate",
    );
    await db.exec(awardImportSQL());
    await db.query(
      "update public.requirements set label='Newer administrator review',verified_at='2099-01-01' where id=$1",
      [revised.id],
    );
    await db.query(
      "update public.requirements set verification_status='verified',verified_at='2099-01-01' where id=$1",
      [revised.id],
    );
    await db.exec(awardImportSQL());
    assert.equal(
      (
        await db.query<{ label: string }>(
          "select label from public.requirements where id=$1",
          [revised.id],
        )
      ).rows[0].label,
      "Newer administrator review",
      "A reviewed import cannot overwrite a newer administrator policy",
    );
    await as("", "anon");
    assert.equal(
      (
        await db.query(
          "select id from public.scholarships where id=any($1::uuid[])",
          [currentScholarships.map((a) => a.id)],
        )
      ).rows.length,
      currentScholarships.length,
      "Award import is verified, public and repeatable",
    );
    assert.equal(
      (
        await db.query(
          "select id from public.deadlines where id=any($1::uuid[])",
          [dates.map((d) => d.id)],
        )
      ).rows.length,
      dates.length,
      "Every scoped deadline survives the SQL import",
    );
    assert.equal(
      (
        await db.query(
          "select id from public.requirements where id=any($1::uuid[])",
          [requirements.map((r) => r.id)],
        )
      ).rows.length,
      requirements.length,
      "Reviewed entry requirements survive import and anonymous publication rules",
    );
    const precision = await db.query<{ precise: number; date_only: number }>(
      "select count(*) filter(where due_at is not null)::int precise,count(*) filter(where due_date is not null)::int date_only from public.deadlines where id=any($1::uuid[])",
      [dates.map((d) => d.id)],
    );
    assert.equal(
      precision.rows[0].date_only,
      dates.filter((d) => d.due_at.length === 10).length,
    );
    assert.equal(
      precision.rows[0].precise,
      dates.filter((d) => d.due_at.length > 10).length,
    );
    await db.exec(
      "reset role; select set_config('request.jwt.claim.role','',false);",
    );
    await assert.rejects(
      db.query(
        "update public.deadlines set due_at='2026-11-30T12:00:00Z' where id=$1",
        [dates.find((d) => d.due_at.length === 10)!.id],
      ),
      "A date-only source cannot also carry an invented precise cutoff",
    );
    await db.query(
      "update public.universities set profile_resources=$1::jsonb,imported_records=$2::jsonb where id=$3",
      [
        JSON.stringify({
          rankings: [
            {
              provider: "qs",
              year: 2027,
              rank: 1,
              url: "https://www.topuniversities.com",
            },
          ],
        }),
        JSON.stringify([
          {
            source: "ipeds",
            metric: "acceptance_rate",
            value: 88,
            reporting_year: 2099,
            verification_status: "verified",
            publication_status: "published",
          },
          {
            source: "leiden",
            metric: "research",
            value: 1,
            verification_status: "verified",
            publication_status: "published",
          },
        ]),
        UNI,
      ],
    );
    await as("", "anon");
    const latest = await db.query<{ r: { ids: string[] } }>(
      'select public.explore_universities(\'{"admission_min":87,"admission_max":89}\',1) r',
    );
    assert.ok(
      latest.rows[0].r.ids.includes(UNI),
      "A newer government reporting year supersedes an older canonical admission value",
    );
    const ranks = await db.query<{
      r: { id: string; imported_records: { source: string }[] };
    }>("select public.ranking_profiles() r");
    const published = ranks.rows.find((row) => row.r.id === UNI)!;
    assert.ok(published);
    assert.deepEqual(
      published.r.imported_records.map((r) => r.source),
      ["leiden"],
      "Ranking endpoints exclude unrelated imported observations",
    );
    assert.ok(!ranks.rows.some((row) => row.r.id === draftId));
  } finally {
    await db.close();
  }
});
