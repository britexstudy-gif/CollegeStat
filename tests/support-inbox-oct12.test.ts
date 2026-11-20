import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { handleSupport } from "../server/support-handler";
import { readJSON } from "../server/http";
import { sendSupport } from "../services/support-client";
import { AccountScope } from "../lib/account-owner";
import { reportedPath, type SupportInput } from "../lib/support-requests";
const STUDENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID = "11111111-1111-4111-8111-111111111111";
const input = (): SupportInput => ({
  id: ID,
  kind: "issue",
  name: "Synthetic guest",
  email: "fixture@example.test",
  subject: "Test issue report",
  message: "Synthetic message about a broken comparison control.",
  page_path: "/compare",
  consent: true,
  website: "",
});
const request = (body: unknown = input()) =>
  new Request("https://example.test/api/support", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.test",
    },
    body: JSON.stringify(body),
  });
test("support metadata excludes URL queries and never attaches profile data", () => {
  assert.equal(
    reportedPath("/dashboard/profile?token=private#grades"),
    "/dashboard/profile",
  );
});
test("cancelled body reads release the stream and cannot become a delayed submission", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const pending = readJSON(
    new Request("https://example.test/api/support", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit),
    24000,
    controller.signal,
  );
  controller.abort(new Error("Synthetic cancelled request"));
  await assert.rejects(pending, /cancelled request/);
  assert.equal(cancelled, true);
});
test("support handler bounds and validates requests before storage, and verifies its receipt", async () => {
  let sent = 0;
  const deps = {
    sameOrigin: () => true,
    send: async () => {
      sent++;
      return { id: ID, status: "new", created_at: "2026-10-12T01:00:00Z" };
    },
  };
  assert.equal(
    (await handleSupport(request(), { ...deps, sameOrigin: () => false }))
      .status,
    403,
  );
  assert.equal(
    (await handleSupport(request({ ...input(), consent: false }), deps)).status,
    400,
  );
  assert.equal(
    (await handleSupport(request({ ...input(), user_id: ADMIN }), deps)).status,
    400,
  );
  assert.equal(
    (
      await handleSupport(
        request({ ...input(), message: "A".repeat(30000) }),
        deps,
      )
    ).status,
    413,
  );
  assert.equal(sent, 0);
  const response = await handleSupport(request(), deps);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(
    (
      await handleSupport(request(), {
        ...deps,
        send: async () => ({
          id: STUDENT,
          status: "new",
          created_at: "2026-10-12T01:00:00Z",
        }),
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await handleSupport(request(), {
        ...deps,
        send: async () => ({ error_code: "limit" }),
      })
    ).status,
    429,
  );
});
test("a replacement account cancels support dispatch and stale success", async () => {
  const scope = new AccountScope();
  scope.changeOwner(STUDENT);
  let dispatch = 0,
    finish!: (value: { owner: string; token: string }) => void;
  const session = new Promise<{ owner: string; token: string }>(
    (resolve) => (finish = resolve),
  );
  const pending = sendSupport(scope, scope.capture(), input(), {
    session: () => session,
    fetch: async () => {
      dispatch++;
      return Response.json({});
    },
  });
  scope.changeOwner(ADMIN);
  finish({ owner: STUDENT, token: "synthetic-token" });
  await assert.rejects(pending, /account changed/);
  assert.equal(dispatch, 0);
});
test("support clients preserve a retry id and reject wrong receipts", async () => {
  const scope = new AccountScope();
  let body: unknown;
  const pending = sendSupport(scope, scope.capture(), input(), {
    session: async () => null,
    fetch: async function (_url, init) {
      assert.equal(
        this,
        undefined,
        "native browser fetch must not receive the dependency object as its receiver",
      );
      body = JSON.parse(String(init?.body));
      return Response.json({
        receipt: {
          id: STUDENT,
          status: "new",
          created_at: "2026-10-12T01:00:00Z",
        },
      });
    },
  });
  await assert.rejects(pending, /did not match/);
  assert.deepEqual(body, input());
});
test("actual inbox SQL protects messages, fixed ownership/quotas, retries and concurrent staff edits", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private; grant usage on schema public,auth to anon,authenticated;
      create table auth.users(id uuid primary key); insert into auth.users values('${STUDENT}'),('${ADMIN}');
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
      create function public.is_admin() returns boolean language sql stable as $$select auth.uid()='${ADMIN}'::uuid and auth.jwt()->>'aal'='aal2'$$;
      create function public.admin_session_status() returns jsonb language sql stable as $$select jsonb_build_object('active',auth.uid()='${ADMIN}'::uuid and auth.jwt()->>'aal'='aal2')$$;
      create table public.rate_limits(bucket text primary key,hits int not null,reset_at timestamptz not null); alter table rate_limits enable row level security;
      create table public.audit_logs(actor_id uuid,old_value jsonb,new_value jsonb);
      create function public.audit_content() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.audit_logs values(auth.uid(),to_jsonb(old),to_jsonb(new)); return coalesce(new,old); end$$;`);
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
          "../supabase/proposals/support-inbox-oct12.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const as = async (role: string, owner = "", aal = "aal1") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        owner,
      ]);
      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ aal }),
      ]);
      await db.exec("set role " + role);
    };
    const submit = async (id = ID, message = input().message) =>
      (
        await db.query<{
          receipt: { id: string; created_at: string; error_code?: string };
        }>(
          "select public.submit_support_request($1,'issue','Synthetic guest','fixture@example.test','Test issue report',$2,'/compare',true,'') receipt",
          [id, message],
        )
      ).rows[0].receipt;
    await as("anon");
    const receipt = await submit();
    assert.equal(receipt.id, ID);
    assert.deepEqual(await submit(), receipt);
    assert.equal(
      (await submit(ID, "A different synthetic message for the same id."))
        .error_code,
      "conflict",
    );
    await assert.rejects(
      db.query("select * from support_requests"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("insert into support_requests(id) values($1)", [STUDENT]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select consume_rate_limit('fake',999,1)"),
      /permission denied/,
    );
    await as("authenticated", STUDENT);
    assert.equal(
      (await db.query("select * from support_requests")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select review_support_request($1,'resolved','note',now())", [
        ID,
      ]),
      /Verified administrator/,
    );
    await as("authenticated", ADMIN, "aal1");
    assert.equal(
      (await db.query("select * from support_requests")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select review_support_request($1,'resolved','note',now())", [
        ID,
      ]),
      /Verified administrator/,
    );
    await as("authenticated", ADMIN, "aal2");
    const row = (
      await db.query<{ user_id: unknown; updated_at: string }>(
        "select * from support_requests",
      )
    ).rows[0];
    assert.equal(row.user_id, null);
    const reviewed = (
      await db.query<{ record: { status: string; admin_note: string } }>(
        "select review_support_request($1,'in_progress','Investigating',$2) record",
        [ID, row.updated_at],
      )
    ).rows[0].record;
    assert.equal(reviewed.status, "in_progress");
    assert.equal(reviewed.admin_note, "Investigating");
    assert.equal(
      (
        await db.query<{ record: unknown }>(
          "select review_support_request($1,'resolved','stale draft',$2) record",
          [ID, row.updated_at],
        )
      ).rows[0].record,
      null,
    );
    await as("anon");
    for (let n = 2; n <= 5; n++)
      assert.ok(
        (await submit(`11111111-1111-4111-8111-${String(n).padStart(12, "0")}`))
          .id,
      );
    assert.equal(
      (await submit("11111111-1111-4111-8111-000000000006")).error_code,
      "limit",
    );
    await as("authenticated", STUDENT);
    const owned = await submit("11111111-1111-4111-8111-000000000007");
    assert.ok(owned.id);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ user_id: string }>(
          "select user_id from support_requests where id=$1",
          [owned.id],
        )
      ).rows[0].user_id,
      STUDENT,
    );
    assert.equal(
      (
        await db.query<{ new_value: { message: string } }>(
          "select new_value from audit_logs",
        )
      ).rows[0].new_value.message,
      input().message,
    );
  } finally {
    await db.close();
  }
});
