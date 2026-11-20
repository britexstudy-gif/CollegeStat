import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  parseDatabaseStructure,
  structureByteLimit,
  structureTables,
} from "../lib/admin-structure";
import { handleDatabaseStructure } from "../server/admin-structure";
import { HttpError } from "../server/http";

const STUDENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ADMIN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sample = () => ({
  schema: "public",
  scope: "allowlisted_application_metadata",
  checked_at: "2026-10-12T01:00:00+00:00",
  tables: [
    {
      schema: "public",
      name: "universities",
      kind: "table",
      rls_enabled: true,
      rls_forced: false,
      security_invoker: null,
      columns: [
        {
          name: "id",
          type: "uuid",
          nullable: false,
          primary_key: true,
          has_default: false,
        },
      ],
      foreign_keys: [],
      policies: [],
    },
  ],
});
const request = (body: unknown = {}) =>
  new Request("http://localhost/api/staff/structure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("actual structure SQL enforces database role/MFA and never exposes rows or expressions", async (t) => {
  const db = new PGlite();
  const as = async (role: string, owner: string, aal = "aal2", extra = {}) => {
    await db.exec(`reset role;set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ aal, ...extra }),
    ]);
  };
  const read = async () =>
    (
      await db.query<{ data: unknown }>(
        "select public.admin_database_structure() as data",
      )
    ).rows[0].data;
  const denied = (error: unknown) => {
    assert.equal((error as { code: string }).code, "42501");
    return true;
  };
  try {
    await db.exec(`
      create role anon;create role authenticated;create role service_role;
      create schema auth;create schema private;
      grant usage on schema public,auth to anon,authenticated,service_role;
      grant usage on schema private to authenticated;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
      create table auth.users(id uuid primary key);
      create table public.profiles(id uuid primary key,role text,preferences jsonb);
      insert into public.profiles values('${STUDENT}','student','{"private":"PROFILE_ROW_SECRET"}'),('${ADMIN}','admin','{}');
      create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin') and auth.jwt()->>'aal'='aal2'$$;
      create function public.admin_session_status() returns jsonb language sql stable as $$select jsonb_build_object('active',public.is_admin())$$;
      create table public.secret_tokens(id uuid primary key,secret text);
      create table public.universities(id uuid primary key,name text not null,published boolean default false,unlisted_id uuid references public.secret_tokens);
      insert into public.universities values(gen_random_uuid(),'INSTITUTION_ROW_SECRET',false,null);
      alter table public.universities enable row level security;
      alter table public.universities force row level security;
      create policy "source_read" on public.universities for select to anon using (published);
      create policy "admin_change" on public.universities as restrictive for update to authenticated using(name<>'POLICY_EXPRESSION_SECRET') with check(name<>'POLICY_EXPRESSION_SECRET');
      create table public.user_notes(id uuid primary key,user_id uuid references auth.users,body text default 'DEFAULT_EXPRESSION_SECRET');
      insert into public.user_notes values(gen_random_uuid(),null,'PRIVATE_NOTE_ROW_SECRET');
      create table public.programs(id uuid,name text,primary key(id,name));
      create table public.university_programs(id uuid primary key,program_id uuid,program_name text,foreign key(program_id,program_name) references public.programs(id,name));
      create view public.stale_evidence with(security_invoker=true) as select id,name from universities;
      create view public.university_admissions as select id from universities;
    `);
    const sql = await readFile(
      new URL(
        "../supabase/proposals/staff-database-structure.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.deepEqual(
      [...sql.matchAll(/'([a-z_]+)'/g)]
        .map((m) => m[1])
        .filter((name) => (structureTables as readonly string[]).includes(name))
        .filter((name, index, list) => list.indexOf(name) === index)
        .sort(),
      [...structureTables].sort(),
    );
    await db.exec(sql);

    await t.test(
      "anon and service-role calls have no function privilege",
      async () => {
        await as("anon", "");
        await assert.rejects(read(), denied);
        await as("service_role", ADMIN);
        await assert.rejects(read(), denied);
      },
    );
    await t.test(
      "student cannot spoof admin through editable JWT metadata",
      async () => {
        await as("authenticated", STUDENT, "aal2", {
          user_metadata: { role: "admin" },
          role: "admin",
        });
        await assert.rejects(read(), denied);
        await assert.rejects(
          db.query("select private.admin_database_structure_snapshot()"),
          denied,
        );
      },
    );
    await t.test(
      "admin needs a verified aal2 session, including direct RPC",
      async () => {
        await as("authenticated", ADMIN, "aal1");
        await assert.rejects(read(), denied);
        await as("authenticated", ADMIN, "");
        await assert.rejects(read(), denied);
        await as("authenticated", "", "aal2");
        await assert.rejects(read(), denied);
      },
    );
    await t.test(
      "verified administrator sees only allowlisted public structure metadata",
      async () => {
        await as("authenticated", ADMIN);
        const result = parseDatabaseStructure(await read());
        assert.ok(result.tables.some((table) => table.name === "user_notes"));
        assert.ok(
          !result.tables.some(
            (table) => (table.name as string) === "secret_tokens",
          ),
        );
        const serialized = JSON.stringify(result);
        for (const secret of [
          "PROFILE_ROW_SECRET",
          "INSTITUTION_ROW_SECRET",
          "PRIVATE_NOTE_ROW_SECRET",
          "DEFAULT_EXPRESSION_SECRET",
          "POLICY_EXPRESSION_SECRET",
          "secret_tokens",
        ])
          assert.ok(!serialized.includes(secret), secret);
        const university = result.tables.find(
          (table) => table.name === "universities",
        )!;
        assert.equal(university.rls_enabled, true);
        assert.equal(university.rls_forced, true);
        assert.deepEqual(
          university.policies.find((policy) => policy.name === "admin_change"),
          {
            name: "admin_change",
            command: "UPDATE",
            roles: ["authenticated"],
            permissive: false,
          },
        );
        assert.equal(university.foreign_keys.length, 0);
        const note = result.tables.find(
          (table) => table.name === "user_notes",
        )!;
        assert.equal(
          note.columns.find((column) => column.name === "body")!.has_default,
          true,
        );
        assert.deepEqual(note.foreign_keys[0].target_schema, "auth");
        assert.equal(note.foreign_keys[0].target_table, "users");
        assert.equal(
          result.tables.find((table) => table.name === "stale_evidence")!
            .security_invoker,
          true,
        );
        assert.equal(
          result.tables.find((table) => table.name === "university_admissions")!
            .security_invoker,
          false,
        );
        assert.deepEqual(
          result.tables.find((table) => table.name === "university_programs")!
            .foreign_keys[0].columns,
          ["program_id", "program_name"],
        );
        assert.deepEqual(
          result.tables.find((table) => table.name === "university_programs")!
            .foreign_keys[0].target_columns,
          ["id", "name"],
        );
      },
    );
    await t.test(
      "reading structure does not change rows or existing policies/grants",
      async () => {
        await db.exec("reset role");
        const before = (await db.query("select body from public.user_notes"))
          .rows;
        const policies = (
          await db.query(
            "select policyname,qual,with_check from pg_policies where tablename='universities' order by policyname",
          )
        ).rows;
        await as("authenticated", ADMIN);
        await read();
        await assert.rejects(
          db.query("select body from public.user_notes"),
          denied,
        );
        await db.exec("reset role");
        assert.deepEqual(
          (await db.query("select body from public.user_notes")).rows,
          before,
        );
        assert.deepEqual(
          (
            await db.query(
              "select policyname,qual,with_check from pg_policies where tablename='universities' order by policyname",
            )
          ).rows,
          policies,
        );
      },
    );
    await t.test(
      "a database role downgrade immediately prevents a still-aal2 call",
      async () => {
        await db.exec("reset role");
        await db.query(
          "update public.profiles set role='student' where id=$1",
          [ADMIN],
        );
        await as("authenticated", ADMIN);
        await assert.rejects(read(), denied);
      },
    );
  } finally {
    await db.close();
  }
});

test("structure response rejects unexpected records, expressions, scope and duplicate identities", () => {
  assert.doesNotThrow(() => parseDatabaseStructure(sample()));
  for (const value of [
    { ...sample(), rows: [{ email: "private@example.test" }] },
    {
      ...sample(),
      tables: [
        {
          ...sample().tables[0],
          policies: [
            {
              name: "policy",
              command: "SELECT",
              roles: ["authenticated"],
              permissive: true,
              qual: "private SQL",
            },
          ],
        },
      ],
    },
    {
      ...sample(),
      tables: [
        {
          ...sample().tables[0],
          columns: [{ ...sample().tables[0].columns[0], default: "secret" }],
        },
      ],
    },
    { ...sample(), tables: [{ ...sample().tables[0], name: "unlisted" }] },
    { ...sample(), tables: [sample().tables[0], sample().tables[0]] },
    {
      ...sample(),
      tables: [
        {
          ...sample().tables[0],
          columns: [
            sample().tables[0].columns[0],
            sample().tables[0].columns[0],
          ],
        },
      ],
    },
    {
      ...sample(),
      tables: [
        {
          ...sample().tables[0],
          foreign_keys: [
            {
              name: "bad",
              columns: ["unknown"],
              target_schema: "public",
              target_table: "universities",
              target_columns: ["id"],
            },
          ],
        },
      ],
    },
    { ...sample(), checked_at: "not-a-date" },
    { ...sample(), secret: "x".repeat(structureByteLimit) },
  ])
    assert.throws(() => parseDatabaseStructure(value));
});

test("structure handler authenticates before reading and preserves denied/rate-budget statuses", async () => {
  for (const status of [401, 403, 429]) {
    const response = await handleDatabaseStructure(request(), {
      authorize: async () => {
        throw new HttpError(status, "Staff check denied");
      },
    });
    assert.equal(response.status, status);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
  let reads = 0;
  const dependencies = {
    authorize: async () => ({
      read: async () => {
        reads++;
        return { data: sample(), error: null };
      },
    }),
  };
  const invalid = await handleDatabaseStructure(
    request({ sql: "select body from user_notes" }),
    dependencies,
  );
  assert.equal(invalid.status, 400);
  assert.equal(reads, 0);
  const ok = await handleDatabaseStructure(request(), dependencies);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), sample());
  assert.equal(reads, 1);
});

test("structure unavailable/malformed responses are safe 503 errors, not fake empty schema", async () => {
  for (const result of [
    { data: null, error: { message: "PRIVATE SQL QUERY" } },
    { data: { ...sample(), rows: [{ body: "PRIVATE ESSAY" }] }, error: null },
  ]) {
    const response = await handleDatabaseStructure(request(), {
      authorize: async () => ({ read: async () => result }),
    });
    assert.equal(response.status, 503);
    assert.ok(!JSON.stringify(await response.json()).includes("PRIVATE"));
  }
});

test("structure whole deadline settles stalled auth, RPC, request bodies and cancellation", async () => {
  let readSignal: AbortSignal | undefined,
    reads = 0;
  const never = new Promise<never>(() => {});
  const authTimeout = await handleDatabaseStructure(
    request(),
    {
      authorize: async () => {
        await never;
        throw new Error("not reached");
      },
    },
    20,
  );
  assert.equal(authTimeout.status, 503);
  const rpcTimeout = await handleDatabaseStructure(
    request(),
    {
      authorize: async () => ({
        read: (signal) => {
          readSignal = signal;
          return never;
        },
      }),
    },
    20,
  );
  assert.equal(rpcTimeout.status, 503);
  assert.equal(readSignal!.aborted, true);
  const controller = new AbortController();
  controller.abort();
  const cancelledRequest = new Request("http://localhost/api/staff/structure", {
    method: "POST",
    body: "{}",
    signal: controller.signal,
  });
  const cancelled = await handleDatabaseStructure(
    cancelledRequest,
    {
      authorize: async () => {
        reads++;
        return { read: () => never };
      },
    },
    20,
  );
  assert.equal(cancelled.status, 503);
  assert.equal(reads, 0);
  let bodyCancelled = false;
  const stalledBody = new Request("http://localhost/api/staff/structure", {
    method: "POST",
    body: new ReadableStream({
      start() {},
      cancel() {
        bodyCancelled = true;
      },
    }),
    duplex: "half",
  } as RequestInit);
  const bodyTimeout = await handleDatabaseStructure(
    stalledBody,
    {
      authorize: async () => ({
        read: async () => {
          reads++;
          return { data: sample(), error: null };
        },
      }),
    },
    20,
  );
  assert.equal(bodyTimeout.status, 503);
  assert.equal(reads, 0);
  assert.equal(bodyCancelled, true);
});
