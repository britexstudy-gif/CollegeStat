#!/usr/bin/env python3
"""Prepare insert-only private review SQL using existing ranking equivalents.

Never connects to Supabase. No published flag, verified rank, allowed edition,
schema change or old observation update is emitted. All source positions enter
the existing source_records review queue, including unmatched/aggregate units.
"""
import argparse
import hashlib
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[2]
RECEIPT = ROOT / "data/published/reviewed-national-rankings.json"


def literal(value):
    if value is None:
        return "null"
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":")) if isinstance(value, (dict, list)) else str(value)
    return "'" + text.replace("'", "''") + "'"


def stable(key):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "https://collegestat.app/review/" + key))


def generate(receipt, output):
    output.mkdir(parents=True, exist_ok=True)
    files = []

    def save(name, sql, counts):
        body = "-- Private review import only. Review the receipt and identities before any publication.\nbegin;\n" + sql + "\ncommit;\n"
        path = output / name
        if path.exists() and path.read_text() != body:
            raise ValueError("Existing review SQL differs; use a new output directory")
        if not path.exists():
            path.write_text(body)
        files.append({"file": str(path), "sha256": hashlib.sha256(body.encode()).hexdigest(), "bytes": len(body.encode()), **counts})

    for provider in receipt["providers"]:
        if provider["permission_status"] != "permitted_for_attributed_source_facts":
            raise ValueError("Source permission not reviewed")
        slug = provider["provider"]
        source_url = provider["source"]["url"]
        source_id = stable("source/" + source_url)
        provider_id = stable("ranking-provider/" + slug)
        import_id = stable("ranking-import/" + slug + "/" + provider["source"]["sha256"])
        source_expr = f"(select id from public.data_sources where url={literal(source_url)} order by id limit 1)"
        source_sql = f"""insert into public.data_sources(id,name,organization,url,source_type,license_notes,retrieved_at,published_at,trust_level)
select {literal(source_id)}::uuid,{literal(provider['name'])},{literal('U.S. National Science Foundation / NCSES' if slug == 'herd' else 'Government of India, Ministry of Education / Press Information Bureau')},{literal(source_url)},'government',{literal(provider['licence'])},{literal(provider['source']['retrieved_at'])}::timestamptz,{literal(provider['publication_date'])}::timestamptz,'high'
where not exists(select 1 from public.data_sources where url={literal(source_url)}) on conflict do nothing;
insert into public.ranking_providers(id,name,slug,website,license_status,methodology)
values({literal(provider_id)}::uuid,{literal(provider['name'])},{literal(slug)},{literal('https://ncses.nsf.gov/surveys/higher-education-research-development/2024' if slug == 'herd' else 'https://www.nirfindia.org/')},'permitted',{literal(provider['notes'])}) on conflict do nothing;
insert into public.data_imports(id,source_id,started_at,completed_at,status,records_seen,created,updated,rejected,warnings)
select {literal(import_id)}::uuid,{source_expr},{literal(receipt['reviewed_at'])}::timestamptz,null,'review',{len(provider['records'])},0,0,0,{literal([{'receipt':'data/published/reviewed-national-rankings.json','scope':provider['scope'],'publications':0,'note':'Private pending import; unmatched source institutions retained without guessed profiles'}])}::jsonb on conflict do nothing;"""
        editions = sorted({r["category"] for r in provider["records"]})
        region = "United States and outlying areas" if slug == "herd" else "India"
        for category in editions:
            eid = stable("ranking-edition/" + slug + "/" + str(provider["year"]) + "/" + category + "/" + region)
            source_sql += f"\ninsert into public.ranking_editions(id,provider_id,year,subject,region,permitted)\nselect {literal(eid)}::uuid,p.id,{provider['year']},{literal(category)},{literal(region)},false from public.ranking_providers p where p.slug={literal(slug)} on conflict do nothing;"
        save("01-" + slug + "-sources-and-private-editions.sql", source_sql, {"providers_maximum": 1, "sources_maximum": 1, "private_editions_maximum": len(editions), "published_rows": 0})
        for start in range(0, len(provider["records"]), 100):
            group = provider["records"][start:start + 100]
            # Snapshot hash is part of import IDs. A corrected source snapshot
            # is retained separately rather than overwriting historical facts.
            rows = [{**record, "review_row_id": stable("ranking-source-row/" + provider["source"]["sha256"] + "/" + record["id"])} for record in group]
            payload = literal(rows)
            sql = f"""with facts as (select r from jsonb_array_elements({payload}::jsonb) r)
insert into public.source_records(id,import_id,source_id,university_id,metric,year,raw_value,normalized_value,unit,confidence,status,source_url,retrieved_at,notes)
select (r->>'review_row_id')::uuid,{literal(import_id)}::uuid,{source_expr},u.id,'ranking:' || (r->>'provider') || ':' || (r->>'category'),(r->>'year')::integer,r,(r->>'rank')::numeric,'position','high','pending',r->>'source_url',(r->>'retrieved_at')::timestamptz,
'Official position preserved; scope and identity evidence in raw_value. Pending review; no anonymous publication.'
from facts left join public.universities u on u.id=nullif(r->>'university_id','')::uuid on conflict do nothing;
with facts as (select r from jsonb_array_elements({payload}::jsonb) r)
insert into public.ranking_entries(id,university_id,edition_id,year,source_id,verification_status,confidence,rank,rank_label,notes,evidence)
select (r->>'review_row_id')::uuid,u.id,e.id,(r->>'year')::integer,{source_expr},'needs_review','high',(r->>'rank')::integer,r->>'rank_label',
{literal(provider['scope'] + '. ' + ('Research expenditure position; not an overall quality rank.' if slug == 'herd' else 'Only the selected Ministry-authored PIB table; not the full NIRF category.'))},r->'evidence'
from facts join public.universities u on u.id=nullif(r->>'university_id','')::uuid
join public.ranking_providers p on p.slug=r->>'provider'
join public.ranking_editions e on e.provider_id=p.id and e.year=(r->>'year')::integer and e.subject=r->>'category' and e.region={literal(region)} on conflict do nothing;"""
            save("02-" + slug + "-pending-" + str(start // 100 + 1).zfill(2) + ".sql", sql, {"pending_source_rows_maximum": len(group), "private_ranking_rows_maximum": sum(r["university_id"] is not None for r in group), "published_rows": 0})
    manifest = {"mode": "reviewable_insert_only_SQL_no_connection", "receipt_sha256": hashlib.sha256(RECEIPT.read_bytes()).hexdigest(), "schema_changes": 0, "new_tables": 0, "hosted_writes_executed": 0, "private_source_positions": sum(len(p["records"]) for p in receipt["providers"]), "private_ranking_rows_maximum": sum(p["counts"]["profile_matches"] for p in receipt["providers"]), "public_rows": 0, "identity_proposals_imported": 0, "files": files}
    body = json.dumps(manifest, indent=2) + "\n"
    path = output / "manifest.json"
    if path.exists() and path.read_text() != body:
        raise ValueError("Existing SQL manifest differs; use a new output directory")
    if not path.exists():
        path.write_text(body)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "outputs/national-rankings-oct09-review")
    args = parser.parse_args()
    receipt = json.loads(RECEIPT.read_text())
    report = generate(receipt, args.out)
    print(json.dumps({key: value for key, value in report.items() if key != "files"}, indent=2))
