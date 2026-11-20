import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("additive admin session RPCs do not replace shared role/RLS helpers or service privileges", async () => {
  const db = new PGlite();
  const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    session = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    factor = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const now = Math.floor(Date.now() / 1000);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;grant usage on schema auth,private,public to authenticated;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
      create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
      create table public.profiles(id uuid primary key,role text);insert into profiles values('${owner}','admin');
      create table auth.sessions(id uuid primary key,user_id uuid,factor_id uuid,aal text,not_after timestamptz);insert into auth.sessions values('${session}','${owner}','${factor}','aal2',null);
      create table auth.mfa_factors(id uuid,user_id uuid,factor_type text,status text);insert into auth.mfa_factors values('${factor}','${owner}','totp','verified');
      create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
      revoke all on function private.is_admin() from public;grant execute on function private.is_admin() to authenticated,service_role;
      create table public.jobs(id int);alter table jobs enable row level security;create policy existing on jobs for all to authenticated using(private.is_admin()) with check(private.is_admin());grant all on jobs to service_role;`);
    const snapshot = async () =>
      (
        await db.query(
          "select pg_get_functiondef('private.is_admin()'::regprocedure) definition, (select jsonb_agg(p) from pg_policies p) policies, (select proacl::text from pg_proc where oid='private.is_admin()'::regprocedure) acl",
        )
      ).rows;
    const before = await snapshot();
    await db.exec(
      await readFile(
        new URL(
          "../supabase/proposals/staff-session-api-oct12.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(await snapshot(), before);
    const claims = {
      sub: owner,
      session_id: session,
      role: "authenticated",
      aal: "aal2",
      amr: [{ method: "totp", timestamp: now }],
    };
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify(claims),
    ]);
    await db.exec("set role authenticated");
    assert.equal(
      (
        await db.query<{ receipt: { active: boolean } }>(
          "select admin_session_start() receipt",
        )
      ).rows[0].receipt.active,
      true,
    );
    await db.exec(
      "reset role;update private.staff_sessions set last_active_at=statement_timestamp()-interval '15 minutes';set role authenticated",
    );
    assert.equal(
      (
        await db.query<{ receipt: { active: boolean } }>(
          "select admin_session_status() receipt",
        )
      ).rows[0].receipt.active,
      false,
    );
    await assert.rejects(db.query("select admin_session_touch()"), /expired/);
    await assert.rejects(
      db.query("select admin_session_start()"),
      /new authenticator/,
    );
    assert.equal(
      (await db.query<{ ok: boolean }>("select private.is_admin() ok")).rows[0]
        .ok,
      true,
      "the separate existing DB-role helper remains unchanged; app APIs still deny expired ledgers",
    );
    await db.exec("reset role;set role service_role");
    await db.query("insert into jobs values(1)");
    await db.exec("reset role");
    assert.deepEqual(await snapshot(), before);
  } finally {
    await db.close();
  }
});
