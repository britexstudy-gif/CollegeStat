#!/usr/bin/env python3
"""Review installed registry additions and generate insert-only publication SQL.

Uses immutable cached ROR evidence, reproduces the conservative selection,
preserves all old records and holds database identity conflicts. No DB writes.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def prepare(output):
    spec = importlib.util.spec_from_file_location("registry", ROOT / "scripts/ingestion/expand-registry-identities.py")
    registry = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(registry)
    receipt_path = ROOT / "data/published/registry-identity-expansion-oct06.json"
    receipt = json.loads(receipt_path.read_text())
    catalogue = json.loads((ROOT / "data/published/global-directory.json").read_text())
    archive = ROOT / "data/raw/ror/v2.13-2026-09-22-ror-data.zip"
    archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
    assert archive_hash == receipt["source_sha256"], "Immutable registry checksum changed"
    with zipfile.ZipFile(archive) as z:
        records = json.loads(z.read(next(n for n in z.namelist() if n.endswith(".json"))))
    additions, _, _, _ = registry.build_plan(catalogue[:receipt["base_count"]], records, receipt["target"])
    assert additions == receipt["records"], "Conservative registry selection does not reproduce"
    assert catalogue[receipt["base_count"]:receipt["target"]] == additions, "Installed additions differ from reviewed receipt"
    by_ror = {r["id"]: r for r in records}
    national = [r for r in catalogue if r.get("identity_evidence", {}).get("identity_reviewed_at") == "2026-10-09"]
    for row in national:
        r = by_ror[row["ror"]]
        assert r["status"] == "active" and "education" in r["types"]
        assert row["identity_evidence"]["registry_sha256"] == archive_hash
        assert any(row["name"] == n["value"] for n in r["names"])
        assert registry.hostname(row["website"]) in {registry.hostname(l["value"]) for l in r["links"] if l["type"] == "website"}
    proposed = [*additions, *national]
    output.mkdir(parents=True, exist_ok=True)
    batches = []
    columns = "id uuid,slug text,name text,country_code text,city text,website text,founded_year integer,latitude double precision,longitude double precision,published boolean,reference_url text,reference_retrieved_at timestamptz,identity_release text,identifiers jsonb,aliases jsonb"
    names = ",".join(c.split()[0] for c in columns.split(","))
    def host_sql(col):
        return "lower(regexp_replace(split_part(regexp_replace(" + col + ", '^https?://', '', 'i'), '/', 1), '^www\\.', '', 'i'))"
    guard = f"""not exists (select 1 from public.universities u where
u.id=x.id or u.slug=x.slug or u.identifiers->>'ror'=x.reference_url or
(u.country_code=x.country_code and
 (lower(u.name)=lower(x.name) or {host_sql('u.website')}={host_sql('x.website')})))"""
    for start in range(0, len(proposed), 50):
        items = proposed[start:start+50]
        rows = [{"id": r["id"], "slug": r["slug"], "name": r["name"], "country_code": r["country_code"], "city": r["city"], "website": r["website"], "founded_year": r.get("founded_year"), "latitude": r["latitude"], "longitude": r["longitude"], "published": True, "reference_url": r["ror"], "reference_retrieved_at": r["identity_retrieved_at"], "identity_release": r["identity_release"], "identifiers": {"ror": r["ror"], **r["external_ids"]}, "aliases": r["aliases"]} for r in items]
        payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).replace("'", "''")
        cte = f"with incoming as (select * from jsonb_to_recordset('{payload}'::jsonb) x({columns}))"
        preflight = f"{cte} select count(*) proposed,count(*) filter(where {guard}) safe_new,count(*) filter(where not ({guard})) existing_or_conflicting from incoming x;\n"
        insert = f"begin;\n{cte}, inserted as (insert into public.universities({names}) select {','.join('x.'+n for n in names.split(','))} from incoming x where {guard} on conflict do nothing returning id) select count(*) inserted from inserted;\ncommit;\n"
        stem = f"{1+start//50:03d}"
        (output / f"{stem}-preflight.sql").write_text(preflight)
        target = output / f"{stem}-insert.sql"
        target.write_text(insert)
        batches.append({"stem": stem, "records": len(rows), "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
    manifest = {"mode": "reviewed_registry_identity_only_insert_new_hold_conflicts", "registry_sha256": archive_hash, "source_receipt_sha256": hashlib.sha256(receipt_path.read_bytes()).hexdigest(), "reviewed_at": "2026-10-09", "proposed": len(proposed), "registry_additions": len(additions), "national_additions": len(national), "existing_records_updated": 0, "admission_or_ranking_facts_added": 0, "batches": batches}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
    return manifest


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", type=Path, default=ROOT / "outputs/registry-publication-oct09")
    a = p.parse_args()
    manifest = prepare(a.out)
    print(json.dumps({k:v for k,v in manifest.items() if k!="batches"}))
