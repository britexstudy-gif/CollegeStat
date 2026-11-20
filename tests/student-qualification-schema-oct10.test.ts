import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const code = (expected: string) => (error: unknown) => {
  assert.equal((error as { code: string }).code, expected);
  return true;
};
test("private qualifications enforce ownership, original score context and bounded immutable history", async (t) => {
  const db = new PGlite();
  const as = async (owner: string, role = "authenticated") => {
    await db.exec(`reset role;set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
  };
  const education = (
    owner = A,
    label = "National diploma",
    scale: string | null = null,
    grade: string | null = null,
  ) =>
    db.query(
      "insert into student_education(id,user_id,qualification,curriculum,level,status,grade_scale,grade_label) values(gen_random_uuid(),$1,$2,'national','secondary','completed',$3,$4) returning id",
      [owner, label, scale, grade],
    );
  const attempt = (
    owner = A,
    status = "taken",
    score: string | null = "7.0",
    scale: string | null = "IELTS band as reported",
    date: string | null = "2026-10-01",
  ) =>
    db.query(
      "insert into student_test_attempts(id,user_id,kind,label,status,score_label,scale_label,taken_on) values(gen_random_uuid(),$1,'IELTS Academic','Academic result',$2,$3,$4,$5) returning id",
      [owner, status, score, scale, date],
    );
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;grant usage on schema public,auth to anon,authenticated;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table profiles(id uuid primary key,role text);insert into profiles values('${A}','student'),('${B}','admin');`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261010180158_private_student_qualifications.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await t.test(
      "owner can save exact scale, unknown fields and original history",
      async () => {
        await as(A);
        await education();
        await attempt();
        await education(A, "IB diploma", "IB total as reported", "38");
        assert.equal(
          (await db.query("select * from student_education")).rows.length,
          2,
        );
        assert.equal(
          (
            await db.query<{ score_label: string }>(
              "select score_label from student_test_attempts",
            )
          ).rows[0].score_label,
          "7.0",
        );
        for (const table of ["student_education", "student_test_attempts"])
          await assert.rejects(
            db.exec(`update ${table} set user_id='${B}'`),
            code("42501"),
          );
      },
    );
    await t.test(
      "staff has no access to another student's qualifications",
      async () => {
        await as(B);
        for (const table of ["student_education", "student_test_attempts"]) {
          assert.equal(
            (await db.query(`select * from ${table}`)).rows.length,
            0,
          );
          assert.equal(
            (await db.query(`delete from ${table} returning id`)).rows.length,
            0,
          );
        }
        await assert.rejects(education(A), code("42501"));
        await assert.rejects(attempt(A), code("42501"));
      },
    );
    await t.test(
      "anonymous or ownerless sessions cannot access records",
      async () => {
        await as("", "anon");
        for (const table of ["student_education", "student_test_attempts"])
          await assert.rejects(
            db.exec(`select * from ${table}`),
            code("42501"),
          );
        await as("");
        assert.equal(
          (await db.query("select * from student_education")).rows.length,
          0,
        );
        await assert.rejects(education(), code("42501"));
      },
    );
    await t.test(
      "raw payload bounds and paired grade/score context are enforced",
      async () => {
        await as(A);
        for (const text of [
          "",
          "   ",
          "x".repeat(121),
          " ".repeat(10000) + "x",
        ])
          await assert.rejects(education(A, text), code("23514"));
        await assert.rejects(education(A, "Diploma", null, "A"), code("23514"));
        await assert.rejects(
          education(A, "Diploma", "scale", null),
          code("23514"),
        );
        await assert.rejects(attempt(A, "taken", "7.0", null), code("23514"));
        await assert.rejects(attempt(A, "planned"), code("23514"));
        await assert.rejects(attempt(A, "registered"), code("23514"));
        await attempt(A, "planned", null, null, null);
      },
    );
    await t.test(
      "invalid variants, impossible dates and forged creation dates fail",
      async () => {
        await assert.rejects(
          db.query(
            "insert into student_education(id,user_id,qualification,curriculum,level,status,graduation_year) values(gen_random_uuid(),$1,'Diploma','fake','secondary','completed',2026)",
            [A],
          ),
          code("23514"),
        );
        await assert.rejects(
          attempt(A, "taken", "7.0", "scale", "2026-02-30"),
          code("22008"),
        );
        await assert.rejects(
          db.query(
            "insert into student_test_attempts(id,user_id,kind,label,status,created_at) values(gen_random_uuid(),$1,'SAT','Test','planned','2001-01-01')",
            [A],
          ),
          code("42501"),
        );
      },
    );
    await t.test(
      "RLS and indexes exist, no content audit trigger or public policy",
      async () => {
        await db.exec("reset role");
        for (const table of ["student_education", "student_test_attempts"]) {
          assert.equal(
            (
              await db.query<{ enabled: boolean }>(
                "select relrowsecurity enabled from pg_class where oid=$1::regclass",
                [table],
              )
            ).rows[0].enabled,
            true,
          );
          assert.equal(
            (
              await db.query(
                "select * from pg_trigger where tgrelid=$1::regclass and not tgisinternal",
                [table],
              )
            ).rows.length,
            0,
          );
        }
      },
    );
    await t.test(
      "existing account deletion removes private qualification rows",
      async () => {
        await db.query("delete from profiles where id=$1", [A]);
        assert.equal(
          (await db.query("select * from student_education")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from student_test_attempts")).rows.length,
          0,
        );
        assert.equal((await db.query("select * from profiles")).rows.length, 1);
      },
    );
  } finally {
    await db.close();
  }
});
