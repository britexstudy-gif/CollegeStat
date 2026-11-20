import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const MIGRATIONS = new URL("../supabase/migrations/", import.meta.url);
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// Minimal stand-in for the Supabase-managed schemas the migrations reference.
const SUPABASE_STUB = `
create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions; create schema storage;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb,
  raw_app_meta_data jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select current_setting('request.jwt.claim.role', true) $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create table storage.buckets(id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as
  $$ select string_to_array($1,'/') $$;
`;

test("every migration replays in order on an empty database", async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_STUB);
  const files = (await readdir(MIGRATIONS))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db
      .exec(await readFile(new URL(file, MIGRATIONS), "utf8"))
      .catch((error: Error) => {
        throw new Error(`${file}: ${error.message}`);
      });
  }

  const unindexed = await db.query<{ fk: string }>(`
    select c.conrelid::regclass || '.' || a.attname as fk
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])`);
  assert.deepEqual(
    unindexed.rows.map((r) => r.fk),
    [],
    "foreign keys need a leading index",
  );

  const bare = await db.query<{ name: string }>(`
    select tablename || '.' || policyname as name from pg_policies
    where schemaname = 'public'
      and (qual ~ '(?<!SELECT )auth\\.uid\\(\\)' or with_check ~ '(?<!SELECT )auth\\.uid\\(\\)')
      and policyname in ('owner_access','profile_owner','profile_update')`);
  assert.deepEqual(bare.rows, [], "owner policies cache auth.uid()");

  const noRls = await db.query<{ relname: string }>(`
    select relname from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`);
  assert.deepEqual(noRls.rows, [], "every public table enables RLS");

  // Owner isolation still holds after the policy rewrite.
  await db.exec(`
    insert into auth.users(id) values ('${ALICE}'), ('${BOB}');
    insert into public.saved_searches(user_id, name, filters)
      values ('${ALICE}', 'Alice search', '{}'::jsonb);`);
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${BOB}', false);`,
  );
  const seen = await db.query(`select * from public.saved_searches`);
  assert.equal(seen.rows.length, 0, "another student cannot read the row");
  await assert.rejects(
    db.exec(
      `insert into public.saved_searches(user_id, name, filters) values ('${ALICE}', 'forged', '{}'::jsonb)`,
    ),
  );
  await db.exec("reset role");
  await db.close();
});

test("progress, leaderboard and peer insights keep XP server-side and private", async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_STUB);
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) await db.exec(await readFile(new URL(file, MIGRATIONS), "utf8"));
  const CARA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const DAN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  await db.exec(`insert into auth.users(id) values ('${ALICE}'), ('${BOB}'), ('${CARA}'), ('${DAN}');
    update public.profiles set preferences = '{"field":"Medicine","countries":["GB"]}'::jsonb;
    insert into public.universities(slug, name, country_code) values ('peer-u', 'Peer U', 'GB');
    insert into public.saved_universities(user_id, university_id)
      select u, (select id from public.universities where slug = 'peer-u')
      from unnest(array['${BOB}','${CARA}','${DAN}']::uuid[]) u;`);
  const as = (id: string) =>
    db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);

  await as(ALICE);
  await db.exec(`insert into public.student_activity(user_id, kind, ref) values ('${ALICE}', 'practice', 'math')`);
  await assert.rejects(db.exec(`insert into public.student_activity(user_id, kind, ref, xp) values ('${ALICE}', 'task', 't', 9999)`), "clients cannot set XP");
  for (let i = 0; i < 5; i++)
    await db.exec(`insert into public.student_activity(user_id, kind, ref) values ('${ALICE}', 'ai', 'q${i}')`);
  const mine = await db.query<{ total: number }>(`select sum(xp)::int as total from public.student_activity`);
  assert.equal(mine.rows[0].total, 20 + 3 * 10, "XP comes from the trigger and daily caps apply");
  await db.exec(`insert into public.leaderboard_members(user_id, display_name) values ('${ALICE}', 'Alice')`);
  const peers = await db.query<{ students: number }>(`select students::int from public.peer_insights('medicine', null)`);
  assert.deepEqual(peers.rows, [{ students: 3 }], "three peers saved the same university");

  await as(BOB);
  const hidden = await db.query(`select * from public.student_activity`);
  assert.equal(hidden.rows.length, 0, "activity is private");
  await assert.rejects(db.exec(`insert into public.student_activity(user_id, kind, ref) values ('${ALICE}', 'task', 'x')`));
  const board = await db.query<{ display_name: string; xp: number; is_me: boolean }>(
    `select display_name, xp::int, is_me from public.weekly_leaderboard(10)`);
  assert.deepEqual(board.rows, [{ display_name: "Alice", xp: 50, is_me: false }]);
  const few = await db.query(`select * from public.peer_insights(null, 'GB')`);
  assert.equal(few.rows.length, 0, "with Bob excluded only two peers remain, below k = 3");
  await db.exec("reset role");
  await db.close();
});

test("students create study groups; members stay anonymous and limits hold", async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_STUB);
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) await db.exec(await readFile(new URL(file, MIGRATIONS), "utf8"));
  await db.exec(`insert into auth.users(id) values ('${ALICE}'), ('${BOB}')`);
  const as = (id: string) =>
    db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);

  await as(ALICE);
  await db.exec(`insert into public.study_groups(slug, name, topic, created_by) values ('sat-1500-ab12', 'SAT 1500 sprint', 'test', '${ALICE}')`);
  await db.exec(`insert into public.study_group_members(user_id, group_slug) values ('${ALICE}', 'sat-1500-ab12')`);
  await assert.rejects(
    db.exec(`insert into public.study_groups(slug, name, topic, created_by) values ('fake-1', 'Fake', 'test', '${BOB}')`),
    "cannot create a group as someone else",
  );
  await assert.rejects(
    db.exec(`insert into public.study_group_members(user_id, group_slug) values ('${ALICE}', 'ielts-7')`),
    "built-in groups no longer exist",
  );
  for (let i = 2; i <= 5; i++)
    await db.exec(`insert into public.study_groups(slug, name, topic, created_by) values ('g-${i}', 'Group ${i}', 'other', '${ALICE}')`);
  await assert.rejects(
    db.exec(`insert into public.study_groups(slug, name, topic, created_by) values ('g-6', 'Group 6', 'other', '${ALICE}')`),
    "five groups per student",
  );

  await as(BOB);
  await db.exec(`insert into public.study_group_members(user_id, group_slug) values ('${BOB}', 'sat-1500-ab12')`);
  const overview = await db.query<{ group_slug: string; members: number; mine: boolean; joined: boolean }>(
    `select group_slug, members::int, mine, joined from public.study_group_overview() where group_slug = 'sat-1500-ab12'`);
  assert.deepEqual(overview.rows, [{ group_slug: "sat-1500-ab12", members: 2, mine: false, joined: true }]);
  const others = await db.query(`select * from public.study_group_members`);
  assert.equal(others.rows.length, 1, "members see only their own membership rows");
  await assert.rejects(db.exec(`select created_by from public.study_groups`), "creator is not exposed");
  await db.exec(`delete from public.study_groups where slug = 'sat-1500-ab12'`);
  const kept = await db.query(`select 1 from public.study_groups where slug = 'sat-1500-ab12'`);
  assert.equal(kept.rows.length, 1, "only the creator can delete a group");
  await db.exec("reset role");
  await db.close();
});
