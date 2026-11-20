import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("student AI quota cannot choose another account, bypass the fixed limit or read rate storage", async () => {
  const db = new PGlite();
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  try {
    await db.exec(
      "create role anon;create role authenticated;create schema auth;grant usage on schema public,auth to anon,authenticated;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create table public.rate_limits(bucket text primary key,hits integer not null default 0,reset_at timestamptz not null);alter table rate_limits enable row level security;",
    );
    const original = await readFile(
      new URL(
        "../supabase/migrations/202609230001_collegestat.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(
      original.match(
        /create function public\.consume_rate_limit[\s\S]+?end \$\$;/,
      )![0],
    );
    await db.exec(
      "revoke all on function public.consume_rate_limit(text,integer,integer) from public;",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261012015911_student_ai_owner_quota.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec("set role anon");
    await assert.rejects(db.query("select consume_student_ai_limit()"));
    await db.exec("reset role;set role authenticated");
    await assert.rejects(
      db.query("select consume_student_ai_limit()"),
      /Sign in required/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    for (let i = 0; i < 12; i++)
      assert.equal(
        (
          await db.query<{ ok: boolean }>(
            "select consume_student_ai_limit() ok",
          )
        ).rows[0].ok,
        true,
      );
    assert.equal(
      (await db.query<{ ok: boolean }>("select consume_student_ai_limit() ok"))
        .rows[0].ok,
      false,
    );
    await assert.rejects(
      db.query("select consume_rate_limit('student-ai:another',999999,1)"),
    );
    await assert.rejects(db.query("select * from rate_limits"));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal(
      (await db.query<{ ok: boolean }>("select consume_student_ai_limit() ok"))
        .rows[0].ok,
      true,
    );
    await db.exec("reset role");
    assert.deepEqual(
      (
        await db.query(
          "select bucket,hits from rate_limits where bucket<>'student-ai:app-daily' order by bucket",
        )
      ).rows,
      [
        { bucket: "student-ai:" + a, hits: 13 },
        { bucket: "student-ai:" + b, hits: 1 },
      ],
    );
    await db.query(
      "update rate_limits set hits=49 where bucket='student-ai:app-daily'",
    );
    await db.exec("set role authenticated");
    assert.equal(
      (await db.query<{ ok: boolean }>("select consume_student_ai_limit() ok"))
        .rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query<{ ok: boolean }>("select consume_student_ai_limit() ok"))
        .rows[0].ok,
      false,
    );
    await db.exec("reset role");
    await db.query(
      "update rate_limits set reset_at=now()-interval '1 second' where bucket='student-ai:app-daily'",
    );
    await db.query(
      "update rate_limits set reset_at=now()-interval '1 second' where bucket=$1",
      ["student-ai:" + a],
    );
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    assert.equal(
      (await db.query<{ ok: boolean }>("select consume_student_ai_limit() ok"))
        .rows[0].ok,
      true,
    );
  } finally {
    await db.close();
  }
});
