import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
const migration = "20261010094202_structured_review_guard.sql";
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  MEMBER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  UNI = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  SOURCE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
test("structured fact guard preserves ordinary approval while preventing scope loss", async (t) => {
  const db = new PGlite({ extensions: { pg_trgm } });
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'aal',current_setting('request.jwt.claim.aal',true),'role',auth.role())$$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql") && f < migration)
      .sort())
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    const metadata = async () =>
      (
        await db.query(
          "select oid,proacl,prosecdef,proconfig,proargnames,proargtypes::text,prorettype::text,proowner from pg_proc where oid='public.approve_observation(uuid)'::regprocedure",
        )
      ).rows;
    const before = await metadata();
    const patch = await readFile("supabase/migrations/" + migration, "utf8");
    await db.exec(patch);
    await db.exec(patch);
    assert.deepEqual(await metadata(), before);
    await db.query("insert into auth.users(id) values($1),($2)", [
      ADMIN,
      MEMBER,
    ]);
    await db.query("update profiles set role='admin' where id=$1", [ADMIN]);
    await db.query(
      "insert into universities(id,name,slug,country_code,published) values($1,'Fixture institution','guard-fixture','CA',true)",
      [UNI],
    );
    await db.query(
      "insert into data_sources(id,name,url) values($1,'Official fixture','https://example.test/fees')",
      [SOURCE],
    );
    const owner = async (id: string) => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    await owner(ADMIN);
    const stage = async (raw: unknown, metric = "tuition") =>
      (
        await db.query<{ id: string }>(
          "insert into source_records(university_id,source_id,metric,year,normalized_value,unit,status,raw_value,source_url) values($1,$2,$3,2026,54600000,'UZS/year','pending',$4::jsonb,'https://example.test/fees') returning id",
          [UNI, SOURCE, metric, JSON.stringify(raw)],
        )
      ).rows[0].id;
    await t.test(
      "two scoped tuition populations remain pending with no canonical overwrite",
      async () => {
        for (const population of ["domestic", "international"]) {
          const id = await stage({
            target_table: "costs",
            population,
            cycle: "2026/27",
          });
          await assert.rejects(
            db.query("select approve_observation($1)", [id]),
            /Structured observations require a section-specific review workflow/,
          );
          assert.equal(
            (
              await db.query<{ status: string }>(
                "select status from source_records where id=$1",
                [id],
              )
            ).rows[0].status,
            "pending",
          );
        }
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::integer n from data_points",
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "deadlines and malformed target declarations cannot bypass dedicated review",
      async () => {
        for (const target_table of ["deadlines", "requirements", null, 42]) {
          const id = await stage({ target_table });
          await assert.rejects(
            db.query("select approve_observation($1)", [id]),
            /section-specific review workflow/,
          );
        }
      },
    );
    await t.test(
      "ordinary numeric observations and explicit data_points retain publication",
      async () => {
        for (const raw of [{}, { target_table: "data_points" }]) {
          const id = await stage(raw, "fixture_numeric");
          await db.query("select approve_observation($1)", [id]);
          assert.equal(
            (
              await db.query<{ status: string }>(
                "select status from source_records where id=$1",
                [id],
              )
            ).rows[0].status,
            "approved",
          );
        }
        const rows = (
          await db.query<{ canonical: boolean }>(
            "select canonical from data_points order by created_at",
          )
        ).rows;
        assert.equal(rows.length, 2);
        assert.equal(rows.filter((r) => r.canonical).length, 1);
      },
    );
    await t.test(
      "ranking guard and nonadmin denial remain in force",
      async () => {
        const id = await stage({}, "ranking:herd:Total R&D");
        await assert.rejects(
          db.query("select approve_observation($1)", [id]),
          /dedicated ranking review/,
        );
        await owner(MEMBER);
        await assert.rejects(
          db.query("select approve_observation($1)", [id]),
          /Administrator required/,
        );
      },
    );
  } finally {
    await db.close();
  }
});
