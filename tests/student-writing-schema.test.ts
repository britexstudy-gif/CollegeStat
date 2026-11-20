import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID = "11111111-1111-4111-8111-111111111111",
  OTHER = "22222222-2222-4222-8222-222222222222";
const code = (expected: string) => (error: unknown) => {
  assert.equal((error as { code: string }).code, expected);
  return true;
};
test("writing migration enforces private ownership, immutable versions and bounded personal content", async (t) => {
  const db = new PGlite();
  const as = async (role: string, owner = "") => {
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
  };
  const insert = (
    id = ID,
    owner = A,
    format = "statement",
    body = "An original private essay.",
  ) =>
    db.query<{ user_id: string; created_at: string }>(
      "insert into public.writing_draft_versions(id,user_id,format,body) values($1,$2,$3,$4) returning *",
      [id, owner, format, body],
    );
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; grant usage on schema public,auth to anon,authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.profiles(id uuid primary key,role text not null default 'student');
      insert into public.profiles(id,role) values('${A}','student'),('${B}','admin');`);
    const profiles = (
      await db.query("select * from public.profiles order by id")
    ).rows;
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261010041157_student_writing_versions.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (await db.query("select * from public.profiles order by id")).rows,
      profiles,
    );
    await t.test(
      "RLS is enabled and no body auditing trigger exists",
      async () => {
        assert.equal(
          (
            await db.query<{ enabled: boolean }>(
              "select relrowsecurity enabled from pg_class where oid='public.writing_draft_versions'::regclass",
            )
          ).rows[0].enabled,
          true,
        );
        assert.equal(
          (
            await db.query(
              "select * from pg_trigger where tgrelid='public.writing_draft_versions'::regclass and not tgisinternal",
            )
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "a student can save and read an immutable own version",
      async () => {
        await as("authenticated", A);
        const saved = (await insert()).rows[0];
        assert.equal(saved.user_id, A);
        assert.ok(saved.created_at);
        assert.equal(
          (await db.query("select * from public.writing_draft_versions")).rows
            .length,
          1,
        );
        await assert.rejects(
          db.query(
            "update public.writing_draft_versions set body=$1 where id=$2",
            ["Overwrite", ID],
          ),
          code("42501"),
        );
      },
    );
    await t.test(
      "another student or staff member cannot read, edit, delete or insert another owner’s essay",
      async () => {
        await as("authenticated", B);
        assert.equal(
          (await db.query("select * from public.writing_draft_versions")).rows
            .length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "delete from public.writing_draft_versions where id=$1 returning id",
              [ID],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(insert(OTHER, A), code("42501"));
        await assert.rejects(
          db.query(
            "update public.writing_draft_versions set user_id=$1 where id=$2",
            [B, ID],
          ),
          code("42501"),
        );
      },
    );
    await t.test("anonymous visitors have no table grants", async () => {
      await as("anon");
      await assert.rejects(
        db.query("select * from public.writing_draft_versions"),
        code("42501"),
      );
      await assert.rejects(insert(OTHER), code("42501"));
      await assert.rejects(
        db.query("delete from public.writing_draft_versions where id=$1", [ID]),
        code("42501"),
      );
      await assert.rejects(
        db.query(
          "update public.writing_draft_versions set body=$1 where id=$2",
          ["Anonymous edit", ID],
        ),
        code("42501"),
      );
    });
    await t.test(
      "authenticated requests without an owner cannot read or write versions",
      async () => {
        await as("authenticated");
        assert.equal(
          (await db.query("select * from public.writing_draft_versions")).rows
            .length,
          0,
        );
        await assert.rejects(insert(OTHER), code("42501"));
      },
    );
    await t.test(
      "retry ids deduplicate without replacing the prior body",
      async () => {
        await as("authenticated", A);
        const retry = await db.query(
          "insert into public.writing_draft_versions(id,user_id,format,body) values($1,$2,$3,$4) on conflict(id) do nothing returning id",
          [ID, A, "statement", "Must never replace first saved essay"],
        );
        assert.equal(retry.rows.length, 0);
        assert.equal(
          (
            await db.query<{ body: string }>(
              "select body from public.writing_draft_versions where id=$1",
              [ID],
            )
          ).rows[0].body,
          "An original private essay.",
        );
      },
    );
    await t.test(
      "new versions preserve older content and cannot set their timestamp",
      async () => {
        await insert(OTHER, A, "motivation", "A second version.");
        assert.equal(
          (await db.query("select * from public.writing_draft_versions")).rows
            .length,
          2,
        );
        await assert.rejects(
          db.query(
            "insert into public.writing_draft_versions(id,user_id,format,body,created_at) values(gen_random_uuid(),$1,$2,$3,$4)",
            [A, "statement", "A forged timestamp.", "2001-01-01"],
          ),
          code("42501"),
        );
      },
    );
    await t.test(
      "empty, whitespace, oversize and invalid formats fail database constraints",
      async () => {
        for (const body of ["", "   ", "x".repeat(20001)])
          await assert.rejects(
            db.query(
              "insert into public.writing_draft_versions(id,user_id,format,body) values(gen_random_uuid(),$1,$2,$3)",
              [A, "statement", body],
            ),
            code("23514"),
          );
        await assert.rejects(
          db.query(
            "insert into public.writing_draft_versions(id,user_id,format,body) values(gen_random_uuid(),$1,$2,$3)",
            [A, "unknown", "Valid text"],
          ),
          code("23514"),
        );
      },
    );
    await t.test("own removal preserves other saved versions", async () => {
      await db.query("delete from public.writing_draft_versions where id=$1", [
        OTHER,
      ]);
      assert.deepEqual(
        (
          await db.query<{ id: string }>(
            "select id from public.writing_draft_versions",
          )
        ).rows.map((r) => r.id),
        [ID],
      );
    });
    await t.test(
      "removing a profile removes its private essays through the existing lifecycle",
      async () => {
        await as("authenticated", B);
        await insert(OTHER, B);
        await db.exec("reset role");
        await db.query("delete from public.profiles where id=$1", [A]);
        assert.deepEqual(
          (
            await db.query<{ id: string }>(
              "select id from public.writing_draft_versions",
            )
          ).rows.map((r) => r.id),
          [OTHER],
        );
      },
    );
  } finally {
    await db.close();
  }
});
