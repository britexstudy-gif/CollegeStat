import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { publicReadCache } from "../server/public-read-cache";

test("a waiter on a fill that never settles recovers instead of hanging", async () => {
  // Models a Workers fill owned by a finished request: its promise never settles.
  const cache = publicReadCache<string>(4, 60000, Date.now, 30);
  const stuck = cache("catalogue", () => new Promise<string>(() => {}));
  void stuck;
  await Promise.resolve();
  const started = Date.now();
  const value = await cache("catalogue", async () => "own load");
  assert.equal(value, "own load");
  assert.ok(Date.now() - started < 1000);
  // The recovered caller does not poison the key; the next request fills it.
  assert.equal(await cache("catalogue", async () => "fresh"), "fresh");
  assert.equal(await cache("catalogue", async () => "unused"), "fresh");
});

test("waiters still share a fill that completes in time", async () => {
  let loads = 0;
  let release!: (value: string) => void;
  const cache = publicReadCache<string>(4, 60000, Date.now, 5000);
  const load = () => {
    loads++;
    return new Promise<string>((resolve) => (release = resolve));
  };
  const first = cache("k", load);
  await Promise.resolve();
  const second = cache("k", load);
  release("shared");
  assert.deepEqual(await Promise.all([first, second]), ["shared", "shared"]);
  assert.equal(loads, 1);
});

test("proposed Free AI limit: 5 per account per day, shared cost guard, no plan bypass", async () => {
  const db = new PGlite();
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const consume = async () =>
    (await db.query<{ ok: boolean }>("select consume_student_ai_limit() ok"))
      .rows[0].ok;
  try {
    await db.exec(
      "create role anon;create role authenticated;create schema auth;grant usage on schema public,auth to anon,authenticated;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create table public.rate_limits(bucket text primary key,hits integer not null default 0,reset_at timestamptz not null);alter table rate_limits enable row level security;",
    );
    const original = await readFile(
      new URL("../supabase/migrations/202609230001_collegestat.sql", import.meta.url),
      "utf8",
    );
    await db.exec(
      original.match(/create function public\.consume_rate_limit[\s\S]+?end \$\$;/)![0],
    );
    await db.exec(
      "revoke all on function public.consume_rate_limit(text,integer,integer) from public;",
    );
    for (const file of [
      "../supabase/migrations/20261012015911_student_ai_owner_quota.sql",
      "../supabase/proposals/student-ai-free-daily-limit-nov14.sql",
    ])
      await db.exec(await readFile(new URL(file, import.meta.url), "utf8"));
    await db.exec("set role anon");
    await assert.rejects(db.query("select consume_student_ai_limit()"));
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    for (let i = 0; i < 5; i++) assert.equal(await consume(), true);
    assert.equal(await consume(), false);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal(await consume(), true);
    await db.exec("reset role");
    // Window is 24 hours, not one hour.
    const reset = await db.query<{ hours: number }>(
      "select round(extract(epoch from reset_at-now())/3600) hours from rate_limits where bucket=$1",
      ["student-ai-day:" + a],
    );
    assert.equal(Number(reset.rows[0].hours), 24);
    await db.query(
      "update rate_limits set hits=1000 where bucket='student-ai:app-daily'",
    );
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal(await consume(), false);
  } finally {
    await db.close();
  }
});
