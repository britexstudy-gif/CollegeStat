import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { institutionLeidenMetrics } from "../server/leiden-metrics";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LeidenIndicators } from "../components/college/leiden-indicators";
import type { ResearchMetric, University } from "../lib/domain";

type Receipt = { records: { university_id: string; values: Record<string, { id: string; value: number }> }[] };
type Manifest = { source_url: string; receipt_sha256: string; batches: { file: string; sha256: string; bytes: number }[] };

test("Leiden profile display preserves scope and percentages and rejects unsafe or unrelated observations", () => {
  const observation: ResearchMetric = {
    id: "impact", university_id: "institution", metric: "top_5_percent_publications_share_fractional_core",
    value: 11.3, unit: "%", period: "2020–2023", field: "All sciences", edition: "Leiden Open Edition 2025",
    source_url: "https://open.leidenranking.com/ranking", retrieved_at: "2026-09-25T08:18:02Z", verification_status: "verified",
    evidence: { counting_method: "fractional", core_publications_only: true, publication_year: 2025, citation_window_end: 2024 },
  };
  const display = (rows: ResearchMetric[]) => renderToStaticMarkup(createElement(LeidenIndicators, { university: { id: "institution", research_metrics: rows } as University }));
  const html = display([observation]);
  assert.match(html, /11\.3%/);
  assert.match(html, /2020–2023 publications/);
  assert.match(html, /fractional counting/);
  assert.match(html, /not an overall university rank/);
  for (const patch of [{ university_id: "other" }, { verification_status: "needs_review" as const }, { source_url: "http://open.leidenranking.com/ranking" }, { source_url: "https://untrusted.example/ranking" }, { value: 101 }, { unit: "publications" }, { evidence: { counting_method: "full", core_publications_only: true } }]) {
    assert.equal(display([{ ...observation, ...patch }]), "");
  }
});

test("Leiden scientific-impact SQL preserves source/history, is idempotent and respects publication RLS", async () => {
  execFileSync("python3", ["scripts/ingestion/apply-reviewed-leiden.py"], { encoding: "utf8" });
  const receiptBytes = await readFile("data/published/reviewed-leiden-expansion.json");
  const receipt = JSON.parse(receiptBytes.toString()) as Receipt;
  const manifest = JSON.parse(await readFile("outputs/deeper-data-leiden/manifest.json", "utf8")) as Manifest;
  assert.equal(createHash("sha256").update(receiptBytes).digest("hex"), manifest.receipt_sha256);
  assert.equal(manifest.batches.length, 25);
  const batches: string[] = [];
  for (const batch of manifest.batches) {
    const bytes = await readFile(batch.file);
    assert.equal(bytes.length, batch.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), batch.sha256);
    batches.push(bytes.toString());
  }
  const db = new PGlite({ extensions: { pg_trgm } });
  const existingSource = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const historic = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',auth.uid(),'aal',current_setting('request.jwt.claim.aal',true),'role',auth.role()) $$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text); alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated;`);
    for (const file of (await readdir("supabase/migrations")).filter(f => f.endsWith(".sql")).sort()) await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    await db.query("insert into public.universities(id,name,slug,country_code,published) select id::uuid,'Reviewed institution','leiden-'||id,'US',true from unnest($1::text[]) id", [receipt.records.map(r => r.university_id)]);
    await db.query("insert into public.data_sources(id,name,url) values($1,'Retained existing source metadata',$2)", [existingSource, manifest.source_url]);
    await db.query("insert into public.research_metrics(id,university_id,metric,value,unit,field,period,edition,source_id,source_url,retrieved_at,verification_status) values($1,$2,'historic_publications',7,'publications','All sciences','2016–2019','Previous release',$3,$4,'2025-01-01','verified')", [historic, receipt.records[0].university_id, existingSource, manifest.source_url]);
    for (const sql of batches) await db.exec(sql);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.research_metrics")).rows[0].n, 7159);
    const grouped = (await db.query<{ metric: string; n: number }>("select metric,count(*)::int n from public.research_metrics where edition='Leiden Open Edition 2025' group by metric order by metric")).rows;
    assert.equal(grouped.length, 3);
    assert.ok(grouped.every(r => r.n === 2386));
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.data_sources where url=$1", [manifest.source_url])).rows[0].n, 1);
    assert.equal((await db.query<{ name: string }>("select name from public.data_sources where id=$1", [existingSource])).rows[0].name, "Retained existing source metadata");
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.research_metrics where edition='Leiden Open Edition 2025' and source_id=$1 and period='2020–2023' and evidence->>'license_note'='CC0-1.0' and evidence->>'counting_method'='fractional' and evidence->>'core_publications_only'='true' and evidence->>'dataset_sha256' is not null and evidence->>'crosswalk_sha256' is not null", [existingSource])).rows[0].n, 7158);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.ranking_entries")).rows[0].n, 0);
    await db.query("update public.research_metrics set license_note='Later staff note' where id=$1", [receipt.records[0].values.p.id]);
    const snapshot = (await db.query("select * from public.research_metrics order by id")).rows;
    for (const sql of batches) await db.exec(sql);
    assert.deepEqual((await db.query("select * from public.research_metrics order by id")).rows, snapshot);
    await db.exec("set role anon");
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.research_metrics where edition='Leiden Open Edition 2025'")).rows[0].n, 7158);
    await assert.rejects(db.query("insert into public.research_metrics(id,university_id,metric,value,period,source_id,source_url,retrieved_at) values(gen_random_uuid(),$1,'forged',1,'2026',$2,'https://example.com',now())", [receipt.records[0].university_id, existingSource]));
    await db.exec("reset role");
    await db.query("update public.universities set published=false where id=$1", [receipt.records[0].university_id]);
    await db.exec("set role anon");
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.research_metrics where edition='Leiden Open Edition 2025'")).rows[0].n, 7155);
    await db.exec("reset role");
    const first = institutionLeidenMetrics(receipt.records[0].university_id);
    assert.equal(first.length, 3);
    assert.ok(first.every(r => r.period === "2020–2023" && r.evidence?.counting_method === "fractional" && r.evidence?.core_publications_only === true));
    assert.deepEqual(institutionLeidenMetrics("unknown-institution"), []);
  } finally { await db.close(); }
});
