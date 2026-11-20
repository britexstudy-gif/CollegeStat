import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("compact observation audit preserves provenance history, actual edits, deletes and other-table auditing", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create schema auth;create function auth.uid() returns uuid language sql as $$select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid$$;create table audit_logs(id serial primary key,actor_id uuid,table_name text,record_id text,operation text,old_value jsonb,new_value jsonb);create table source_records(id uuid primary key,university_id uuid,metric text,year int,normalized_value numeric,unit text,status text,raw_value jsonb);create table data_points(id uuid primary key,value numeric,verification_status text,evidence jsonb);create table profiles(id uuid primary key,role text,preferences jsonb);insert into audit_logs(table_name,record_id,operation,old_value,new_value) values('historical','preserved','UPDATE','{\"before\":true}','{\"after\":true}');",
    );
    const historical = (await db.query("select * from audit_logs")).rows;
    await db.exec(
      await readFile(
        new URL(
          "../supabase/proposals/compact-catalogue-audit-oct12.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (await db.query("select * from audit_logs")).rows,
      historical,
    );
    for (const table of ["source_records", "data_points", "profiles"])
      await db.exec(
        `create trigger audit_test after insert or update or delete on ${table} for each row execute function audit_content();`,
      );
    const id = "11111111-1111-4111-8111-111111111111",
      source = {
        snapshot: "source-content ".repeat(4000),
        raw_field: "UFLOANN",
        scope: "All undergraduate",
        value: 17,
      };
    await db.query(
      "insert into source_records values($1,$2,'loan_recipients',2024,17,'students','pending',$3)",
      [id, "22222222-2222-4222-8222-222222222222", JSON.stringify(source)],
    );
    const created = (
      await db.query<{
        new_value: {
          representation: string;
          normalized_value: number;
          row_md5: string;
        };
      }>(
        "select new_value from audit_logs where table_name='source_records' order by id desc limit 1",
      )
    ).rows[0].new_value;
    assert.equal(created.representation, "catalogue_reference_v1");
    assert.equal(created.normalized_value, 17);
    assert.ok(JSON.stringify(created).length < 1000);
    assert.equal(
      created.row_md5,
      (
        await db.query<{ hash: string }>(
          "select md5(to_jsonb(s)::text) hash from source_records s",
        )
      ).rows[0].hash,
    );
    assert.deepEqual(
      (
        await db.query<{ raw_value: unknown }>(
          "select raw_value from source_records",
        )
      ).rows[0].raw_value,
      source,
    );
    await db.query("update source_records set status='approved' where id=$1", [
      id,
    ]);
    const approved = (
      await db.query<{
        old_value: { status: string };
        new_value: { status: string; representation: string };
      }>(
        "select old_value,new_value from audit_logs where table_name='source_records' order by id desc limit 1",
      )
    ).rows[0];
    assert.equal(approved.old_value.status, "pending");
    assert.equal(approved.new_value.status, "approved");
    assert.equal(approved.new_value.representation, "catalogue_reference_v1");
    await db.query(
      "update source_records set normalized_value=18,raw_value=$2 where id=$1",
      [id, JSON.stringify({ ...source, value: 18 })],
    );
    const edited = (
      await db.query<{
        old_value: { raw_value: unknown };
        new_value: { raw_value: unknown };
      }>(
        "select old_value,new_value from audit_logs where table_name='source_records' order by id desc limit 1",
      )
    ).rows[0];
    assert.deepEqual(edited.old_value.raw_value, source);
    assert.deepEqual(edited.new_value.raw_value, { ...source, value: 18 });
    await db.query("delete from source_records where id=$1", [id]);
    const removed = (
      await db.query<{ old_value: { raw_value: unknown }; new_value: unknown }>(
        "select old_value,new_value from audit_logs where table_name='source_records' order by id desc limit 1",
      )
    ).rows[0];
    assert.deepEqual(removed.old_value.raw_value, { ...source, value: 18 });
    assert.equal(removed.new_value, null);
    await db.query("insert into data_points values($1,0,'needs_review',$2)", [
      id,
      JSON.stringify(source),
    ]);
    const zero = (
      await db.query<{ new_value: { value: number } }>(
        "select new_value from audit_logs where table_name='data_points'",
      )
    ).rows[0];
    assert.equal(zero.new_value.value, 0);
    await db.query(
      "insert into profiles values($1,'student','{\"synthetic\":true}')",
      [id],
    );
    const profile = (
      await db.query<{ new_value: { preferences: unknown; role: string } }>(
        "select new_value from audit_logs where table_name='profiles'",
      )
    ).rows[0].new_value;
    assert.deepEqual(profile.preferences, { synthetic: true });
    assert.equal(profile.role, "student");
    assert.deepEqual(
      (await db.query("select * from audit_logs where table_name='historical'"))
        .rows,
      historical,
    );
  } finally {
    await db.close();
  }
});
