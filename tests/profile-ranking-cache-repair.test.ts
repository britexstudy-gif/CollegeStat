import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";

test("reviewed profile repair is atomic, idempotent and preserves unrelated history", async () => {
  const repair = execFileSync("python3", ["scripts/database/prepare-reviewed-profile-cache-oct11.py", "--print-sql"], {encoding:"utf8"});
  const db = new PGlite();
  const a="3f15a83c-c1d9-50da-85e9-4cfa84fe5c04", b="fcd1cd76-2c2e-526f-acd6-38a74eb5954d";
  try {
    await db.exec("create table public.universities(id uuid primary key,name text,country_code text,website text,profile_resources jsonb);");
    await db.query("insert into public.universities values($1,'Lahore','PK','http://www.ue.edu.pk/',$2),($3,'Okara','PK','https://www.uo.edu.pk',$4)",[a,JSON.stringify({rankings:[],history:[{year:2020,value:17}],other:{campus:"Retained"}}),b,JSON.stringify({rankings:[{name:"Wrong identity"}],history:[{year:2021,value:23}],other:{campus:"Kept"}})]);
    const before=(await db.query<{id:string,hash:string}>("select id,md5(profile_resources::text) hash from universities order by id")).rows;
    const fixture = repair.replaceAll("ea9f6e8c1f2b49fe8bebc4d2458d0b4a",before.find(r=>r.id===a)!.hash).replaceAll("92a2b5e2803c7dcf69b527b4235bdabb",before.find(r=>r.id===b)!.hash);
    const original=(await db.query("select id,profile_resources-'rankings'-'publisher_students' facts from universities order by id")).rows;
    // The second conflict rolls the first repair back too.
    await db.query("update universities set profile_resources=jsonb_set(profile_resources,'{concurrent}', 'true') where id=$1",[b]);
    await assert.rejects(db.exec(fixture),/Cache changed since exact preflight/);
    assert.deepEqual((await db.query("select profile_resources->'rankings' ranks from universities where id=$1",[a])).rows,[{ranks:[]}]);
    await db.query("update universities set profile_resources=profile_resources-'concurrent' where id=$1",[b]);
    await db.exec(fixture);
    const repaired=(await db.query<{id:string,profile_resources:{rankings:{name:string,rank_label:string}[],publisher_students:{students:number}}}>("select id,profile_resources from universities order by id")).rows;
    assert.equal(repaired.find(r=>r.id===a)!.profile_resources.rankings[0].name,"University of Education, Lahore");
    assert.equal(repaired.find(r=>r.id===b)!.profile_resources.rankings[0].name,"University of Okara");
    assert.equal(repaired.find(r=>r.id===a)!.profile_resources.publisher_students.students,29744);
    assert.equal(repaired.find(r=>r.id===b)!.profile_resources.publisher_students.students,19640);
    assert.deepEqual((await db.query("select id,profile_resources-'rankings'-'publisher_students' facts from universities order by id")).rows,original);
    await db.exec(fixture);
    assert.deepEqual((await db.query("select id,profile_resources from universities order by id")).rows,repaired);
    await db.query("update universities set website='https://different.example' where id=$1",[b]);
    await assert.rejects(db.exec(fixture),/Reviewed identity changed/);
  } finally {await db.close();}
});
