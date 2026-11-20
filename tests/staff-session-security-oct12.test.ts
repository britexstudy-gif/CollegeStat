import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  StaffSessionScope,
  StaffSessionExpiredError,
  STAFF_IDLE_MS,
  staffTokenSessionId,
} from "../lib/staff-session";
import { createStaffFetch } from "../services/admin-client";
import { AccountScope } from "../lib/account-owner";
import { assertAdminSession } from "../server/admin-session-access";

const ADMIN = "10000000-0000-4000-8000-000000000001",
  STUDENT = "10000000-0000-4000-8000-000000000002",
  SESSION = "20000000-0000-4000-8000-000000000001";

test("the real SQL enforces authenticator, live session, owner and an unrevivable 15-minute idle window", async (t) => {
  const db = new PGlite();
  const now = Math.floor(Date.now() / 1000);
  const claims = async (overrides: Record<string, unknown> = {}) => {
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({
        sub: ADMIN,
        session_id: SESSION,
        role: "authenticated",
        aal: "aal2",
        amr: [{ method: "totp", timestamp: now }],
        ...overrides,
      }),
    ]);
  };
  const rpc = async (name = "status") =>
    (
      await db.query<{ value: { active: boolean; expires_at: string | null } }>(
        `select public.admin_session_${name}() as value`,
      )
    ).rows[0].value;
  const denied = (error: unknown) => {
    assert.equal((error as { code: string }).code, "42501");
    return true;
  };
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;create schema storage;
 grant usage on schema auth,private,public,storage to authenticated;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 create table public.profiles(id uuid primary key,role text);insert into public.profiles values('${ADMIN}','admin'),('${STUDENT}','student');
      create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz,factor_id uuid);insert into auth.sessions values('${SESSION}','${ADMIN}','aal2',null,'30000000-0000-4000-8000-000000000001');
      create table auth.mfa_factors(id uuid,user_id uuid,factor_type text,status text);insert into auth.mfa_factors values('30000000-0000-4000-8000-000000000001','${ADMIN}','totp','verified');
 create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin')$$;
 create function public.is_admin() returns boolean language sql stable security invoker set search_path='' as $$select private.is_admin()$$;
 grant execute on function private.is_admin(),public.is_admin() to authenticated;
 create table public.source_records(id uuid primary key,published boolean,payload text);alter table public.source_records enable row level security;
 create policy staff_all on public.source_records for all to authenticated using(public.is_admin()) with check(public.is_admin());
 create policy published on public.source_records for select to authenticated using(published);
 grant select,insert,update,delete on public.source_records to authenticated;
 insert into public.source_records values(gen_random_uuid(),false,'HELD_EVIDENCE'),(gen_random_uuid(),true,'PUBLIC_EVIDENCE');
 create table storage.objects(id uuid primary key,bucket_id text);alter table storage.objects enable row level security;
 create policy logo_admin on storage.objects for all to authenticated using(bucket_id='university-logos' and public.is_admin()) with check(bucket_id='university-logos' and public.is_admin());grant select,insert,update,delete on storage.objects to authenticated;
 create function public.review_fixture() returns boolean language plpgsql security definer set search_path='' as $$begin if not public.is_admin() then raise exception 'denied' using errcode='42501'; end if;return true;end$$;grant execute on function public.review_fixture() to authenticated;
 `);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/proposals/staff-session-security-oct12.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await t.test(
      "mere enrolled factor, phone MFA and editable role metadata cannot open staff access",
      async () => {
        await claims({ aal: "aal1" });
        await assert.rejects(rpc("start"), denied);
        await claims({ aal: null });
        await assert.rejects(rpc("start"), denied);
        await claims({ role: null });
        await assert.rejects(rpc("start"), denied);
        await claims({ amr: [{ method: "phone", timestamp: now }] });
        await assert.rejects(rpc("start"), denied);
        await claims({ sub: STUDENT, user_metadata: { role: "admin" } });
        await assert.rejects(rpc("start"), denied);
        await claims({ session_id: "malformed" });
        await assert.rejects(rpc("start"), denied);
        await claims({ amr: [{ method: "totp", timestamp: now - 301 }] });
        await assert.rejects(rpc("start"), denied);
      },
    );
    await t.test(
      "verified session opens with server clock and preserves existing public access",
      async () => {
        await claims();
        assert.equal((await rpc()).active, false);
        await db.exec(
          "reset role;update auth.sessions set factor_id=gen_random_uuid();insert into auth.mfa_factors values(gen_random_uuid(),'" +
            ADMIN +
            "','totp','verified')",
        );
        await claims({ amr: [{ method: "totp", timestamp: now + 2 }] });
        assert.equal((await rpc()).active, false);
        await assert.rejects(rpc("start"), denied);
        await db.exec(
          "reset role;update auth.sessions set factor_id='30000000-0000-4000-8000-000000000001'",
        );
        await claims();
        assert.deepEqual(
          (await db.query("select payload from source_records")).rows,
          [{ payload: "PUBLIC_EVIDENCE" }],
        );
        await assert.rejects(
          db.query("select public.review_fixture()"),
          denied,
        );
        assert.equal((await rpc("start")).active, true);
        assert.equal(
          (await db.query<{ v: boolean }>("select public.is_admin() v")).rows[0]
            .v,
          true,
        );
        assert.equal(
          (await db.query("select payload from source_records")).rows.length,
          2,
        );
        await db.query(
          "insert into storage.objects values(gen_random_uuid(),'university-logos')",
        );
        await assert.rejects(
          db.query("select * from private.staff_sessions"),
          denied,
        );
      },
    );
    await t.test(
      "status and background reads never refresh idle activity; exact boundary denies reads, writes, RPC and Storage",
      async () => {
        await db.exec(
          "reset role;update private.staff_sessions set last_active_at=statement_timestamp()-interval '15 minutes'",
        );
        await claims();
        assert.equal((await rpc()).active, false);
        assert.deepEqual(
          (await db.query("select payload from source_records")).rows,
          [{ payload: "PUBLIC_EVIDENCE" }],
        );
        await assert.rejects(
          db.query(
            "insert into source_records values(gen_random_uuid(),false,'BAD')",
          ),
          denied,
        );
        await assert.rejects(
          db.query("select public.review_fixture()"),
          denied,
        );
        await assert.rejects(
          db.query(
            "insert into storage.objects values(gen_random_uuid(),'university-logos')",
          ),
          denied,
        );
        await assert.rejects(rpc("touch"), denied);
        await assert.rejects(rpc("start"), denied);
        await claims({
          iat: now + 900,
          amr: [
            { method: "token_refresh", timestamp: now + 900 },
            { method: "totp", timestamp: now },
          ],
        });
        await assert.rejects(rpc("start"), denied);
      },
    );
    await t.test(
      "only a newer verified authenticator event can reopen an expired session",
      async () => {
        await claims({ amr: [{ method: "totp", timestamp: now + 1 }] });
        assert.equal((await rpc("start")).active, true);
        assert.equal((await rpc("touch")).active, true);
        assert.equal((await rpc("end")).active, false);
        await assert.rejects(rpc("touch"), denied);
        await assert.rejects(rpc("start"), denied);
      },
    );
    await t.test(
      "removing factor, session, role or provider session lifetime immediately withdraws access",
      async () => {
        await claims({ amr: [{ method: "totp", timestamp: now + 2 }] });
        assert.equal((await rpc("start")).active, true);
        await db.exec(
          "reset role;update auth.mfa_factors set status='unverified'",
        );
        await claims({ amr: [{ method: "totp", timestamp: now + 2 }] });
        assert.equal((await rpc()).active, false);
        await db.exec(
          "reset role;update auth.mfa_factors set status='verified';update auth.sessions set not_after=statement_timestamp()-interval '1 second'",
        );
        await claims({ amr: [{ method: "totp", timestamp: now + 2 }] });
        assert.equal((await rpc()).active, false);
        await db.exec(
          "reset role;update auth.sessions set not_after=null;update profiles set role='student' where id='" +
            ADMIN +
            "'",
        );
        await claims({ amr: [{ method: "totp", timestamp: now + 2 }] });
        assert.equal((await rpc()).active, false);
        await db.exec(
          "reset role;update profiles set role='admin' where id='" +
            ADMIN +
            "';delete from auth.sessions",
        );
        await claims({ amr: [{ method: "totp", timestamp: now + 2 }] });
        assert.equal((await rpc()).active, false);
      },
    );
    await t.test(
      "anonymous and service roles cannot manipulate activity; no caller-chosen IDs/time API exists",
      async () => {
        await db.exec("reset role;set role anon");
        await assert.rejects(rpc("start"), denied);
        await db.exec("reset role;set role service_role");
        await assert.rejects(rpc("start"), denied);
        await db.exec("reset role");
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from source_records",
            )
          ).rows[0].n,
          2,
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from pg_proc where proname like 'admin_session_%' and pronargs<>0",
            )
          ).rows[0].n,
          0,
        );
      },
    );
  } finally {
    await db.close();
  }
});

test("local boundary uses monotonic server duration and cannot revive captured in-flight requests", () => {
  let time = 100;
  const scope = new StaffSessionScope(() => time);
  const server = "2026-10-12T01:00:00.000Z";
  scope.accept({
    active: true,
    server_time: server,
    expires_at: "2026-10-12T01:15:00.000Z",
  });
  const generation = scope.capture();
  assert.equal(scope.remaining(), STAFF_IDLE_MS);
  scope.assertCurrent(generation);
  time += STAFF_IDLE_MS;
  assert.equal(scope.active(), false);
  assert.throws(
    () => scope.assertCurrent(generation),
    StaffSessionExpiredError,
  );
  scope.close();
  scope.accept({
    active: true,
    server_time: server,
    expires_at: "2026-10-12T01:15:00.000Z",
  });
  assert.throws(
    () => scope.assertCurrent(generation),
    StaffSessionExpiredError,
  );
  scope.accept({ active: false, server_time: server, expires_at: null });
  assert.equal(scope.active(), false);
});

test("closing the admin boundary aborts in-flight tools immediately even when the account remains signed in", async () => {
  const account = new AccountScope();
  account.changeOwner(ADMIN);
  const boundary = new StaffSessionScope(() => 0);
  boundary.identify(SESSION);
  const accessToken =
    "header." +
    Buffer.from(JSON.stringify({ session_id: SESSION })).toString("base64url") +
    ".fixture";
  boundary.accept({
    active: true,
    server_time: "2026-10-12T00:00:00Z",
    expires_at: "2026-10-12T00:15:00Z",
  });
  let dispatched!: () => void;
  const sent = new Promise<void>((resolve) => (dispatched = resolve));
  let networkSignal: AbortSignal | undefined;
  const request = createStaffFetch({
    getSession: async () => ({
      data: { session: { access_token: accessToken, user: { id: ADMIN } } },
    }),
    fetch: async (_path, init) => {
      networkSignal = init?.signal ?? undefined;
      dispatched();
      return new Promise<Response>(() => {});
    },
  });
  const pending = request(
    "/api/staff/mcp",
    { method: "tools/call" },
    undefined,
    { scope: account, staffSession: boundary },
  );
  await sent;
  boundary.close();
  await assert.rejects(pending, StaffSessionExpiredError);
  assert.equal(networkSignal?.aborted, true);
  assert.equal(account.capture().owner, ADMIN);
  await assert.rejects(
    request("/api/admin", { action: "save" }, undefined, {
      scope: account,
      staffSession: boundary,
    }),
    StaffSessionExpiredError,
  );
});

test("server authorization rejects aal1, expired or unavailable ledgers and never treats decoding as verification", async () => {
  let reads = 0;
  const db = {
    auth: {
      getClaims: async () => ({
        data: { claims: { aal: "aal1" } },
        error: null,
      }),
    },
    rpc: async () => {
      reads++;
      return {
        data: {
          active: true,
          server_time: "2026-10-12T00:00:00Z",
          expires_at: "2026-10-12T00:15:00Z",
        },
        error: null,
      };
    },
  };
  await assert.rejects(assertAdminSession(db, "fixture"), (error: unknown) => {
    assert.equal((error as { status: number }).status, 403);
    return true;
  });
  assert.equal(reads, 0);
  db.auth.getClaims = async () => ({
    data: { claims: { aal: "aal2" } },
    error: null,
  });
  await assertAdminSession(db, "fixture");
  assert.equal(reads, 1);
  db.rpc = async () => ({
    data: {
      active: false,
      server_time: "2026-10-12T00:00:00Z",
      expires_at: "2026-10-12T00:15:00Z",
    },
    error: null,
  });
  await assert.rejects(assertAdminSession(db, "fixture"), (error: unknown) => {
    assert.equal((error as { status: number }).status, 403);
    return true;
  });
});

test("same-owner replacement sessions invalidate pending access while token refresh retains the session partition", () => {
  const token = (session_id: string) =>
    "header." +
    Buffer.from(JSON.stringify({ session_id })).toString("base64url") +
    ".fixture";
  assert.equal(staffTokenSessionId("invalid"), null);
  assert.equal(staffTokenSessionId(token("not-a-uuid")), null);
  const boundary = new StaffSessionScope(() => 0);
  boundary.identify(SESSION);
  boundary.accept({
    active: true,
    server_time: "2026-10-12T00:00:00Z",
    expires_at: "2026-10-12T00:15:00Z",
  });
  const generation = boundary.capture();
  assert.equal(boundary.identify(SESSION), false);
  assert.equal(boundary.matchesToken(token(SESSION)), true);
  boundary.assertCurrent(generation);
  assert.equal(boundary.identify("20000000-0000-4000-8000-000000000002"), true);
  assert.equal(boundary.matchesToken(token(SESSION)), false);
  assert.throws(
    () => boundary.assertCurrent(generation),
    StaffSessionExpiredError,
  );
});
