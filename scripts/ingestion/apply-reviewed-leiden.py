#!/usr/bin/env python3
"""Integrate reviewed Leiden indicators locally and prepare additive research SQL.

Run with --apply-local to append correct observations to imported.json. Retains
all prior records and correction holds. The script never connects to a database.
SQL writes existing research_metrics, not ranking_entries or external_rankings.
"""
import argparse
import hashlib
import json
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "data/published"


def literal(value):
    if value is None:
        return "null"
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":")) if isinstance(value, (dict, list)) else str(value)
    return "'" + text.replace("'", "''") + "'"


def integrate_local(receipt, data):
    records = data["records"]
    by_id = {record["id"]: record for record in records}
    if len(by_id) != len(records):
        raise ValueError("Duplicate existing observation identifiers")
    held = set(receipt["quality_repairs"]["incorrect_pilot_observation_ids"])
    for record in records:
        if record["id"] not in held:
            continue
        if record.get("source") != "leiden" or record.get("metric") not in ("international_collaboration_publications", "international_collaboration_share"):
            raise ValueError("Correction hold identifier does not match the erroneous pilot mapping")
        record["verification_status"] = "needs_review"
        record["publication_status"] = "review"
        if "Mapping correction 2026-10-05" not in (record.get("notes") or ""):
            record["notes"] = (record.get("notes") or "") + " Mapping correction 2026-10-05: cached source columns are P(top 5%) and PP(top 5%), not international collaboration. Original value retained for audit; hold from public display."
    appended = 0
    for institution in receipt["records"]:
        for field, datum in institution["values"].items():
            mapping = receipt["mappings"][field]
            old = by_id.get(datum["id"])
            if old:
                if old.get("university_id") != institution["university_id"] or old.get("metric") != mapping["metric"] or old.get("value") != datum["value"]:
                    raise ValueError("Stable observation key conflicts with existing reviewed data")
                continue
            row = {
                "id": datum["id"], "university_id": institution["university_id"],
                "source": "leiden", "source_name": receipt["source"]["name"],
                "source_record_id": institution["source_record_id"], "source_url": institution["source_url"],
                "release": "Leiden Open Edition 2025, 2020–2023", "reporting_year": 2025,
                "period": receipt["context"]["publication_period"], "cohort": receipt["context"]["cohort"],
                "retrieved_at": receipt["evidence"]["indicators"]["retrieved_at"],
                "last_verified_at": receipt["reviewed_at"] + "T00:00:00Z",
                "license_note": "CC0-1.0", "raw_file": "data/raw/leiden/indicators-2025.html", "raw_field": field,
                "metric": mapping["metric"], "value": datum["value"], "unit": mapping["unit"],
                "verification_status": "verified", "publication_status": "published",
                "notes": mapping["definition"] + " All sciences; core publications; fractional counting. Indicator values, not an overall university quality rank.",
                "field": receipt["context"]["field"], "indicator_definition_url": receipt["evidence"]["definitions_url"],
                "counting_method": "fractional; core publications",
                "evidence": {"scope": "Leiden Open Edition 2025 scientific impact", "reporting_period": receipt["context"]["publication_period"], "publication_year": 2025, "source_record_id": institution["source_record_id"], "raw_field": field, "dataset_sha256": receipt["evidence"]["indicators"]["sha256"], "counting_method": "fractional", "core_publications_only": True, "citation_window_end": 2024, "license_note": "CC0-1.0"},
            }
            records.append(row)
            by_id[row["id"]] = row
            appended += 1
    records.sort(key=lambda record: (record["source"], record["university_id"], record["metric"], record["id"]))
    leiden_rows = [record for record in records if record["source"] == "leiden"]
    published = [record for record in leiden_rows if record.get("verification_status") == "verified" and record.get("publication_status") == "published"]
    data["summary"]["leiden"].update({
        "imported_records": len(leiden_rows), "imported_universities": len({record["university_id"] for record in leiden_rows}),
        "published_records": len(published), "held_mapping_corrections": len(held),
        "fields_populated": sorted({record["metric"] for record in published}),
        "review_items": len(receipt["identity_review"]) + len(held), "last_mapping_review": receipt["reviewed_at"],
        "source_urls": [receipt["source"]["url"], receipt["evidence"]["definitions_url"]],
    })
    return data, appended


def save_verified(path, body):
    # Re-running may reuse identical generated output, never silently replace a
    # different reviewed SQL batch or manifest.
    if path.exists():
        if path.read_text() != body:
            raise ValueError("Generated output differs from existing review bundle: " + str(path))
        return
    with path.open("x") as stream:
        stream.write(body)


def generate_sql(receipt, output):
    output.mkdir(parents=True, exist_ok=True)
    source_url = receipt["source"]["url"]
    source_id = str(uuid.uuid5(uuid.NAMESPACE_URL, "https://collegestat.app/evidence/" + source_url))
    source_expr = f"(select id from public.data_sources where url={literal(source_url)} order by id limit 1)"
    retrieved = receipt["evidence"]["indicators"]["retrieved_at"]
    verified = receipt["reviewed_at"] + "T00:00:00Z"
    batches = []

    def save(name, sql, scope):
        body = "begin;\n" + sql + "\ncommit;\n"
        path = output / name
        save_verified(path, body)
        batches.append({"file": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path), "sha256": hashlib.sha256(body.encode()).hexdigest(), "bytes": len(body.encode()), "scope": scope})

    source_sql = f"""insert into public.data_sources(id,name,organization,url,source_type,license_notes,retrieved_at,trust_level)
select {literal(source_id)}::uuid,{literal(receipt['source']['name'])},'Centre for Science and Technology Studies, Leiden University',{literal(source_url)},'ranking',
'CC0-1.0, verified in official Zenodo release metadata. Scientific-impact indicators; not an overall quality rank.',{literal(retrieved)}::timestamptz,'high'
where not exists(select 1 from public.data_sources where url={literal(source_url)}) on conflict do nothing;"""
    save("01-leiden-source.sql", source_sql, {"new_sources_maximum": 1, "reuse_existing_source_url": source_url, "license": "CC0-1.0"})
    mappings = {field: {"metric": m["metric"], "unit": m["unit"], "definition": m["definition"]} for field, m in receipt["mappings"].items()}
    evidence = {"scope": "Leiden Open Edition 2025 scientific impact", "reporting_period": receipt["context"]["publication_period"], "publication_year": 2025, "citation_window_end": 2024, "counting_method": "fractional", "core_publications_only": True, "field": "All sciences", "dataset_sha256": receipt["evidence"]["indicators"]["sha256"], "crosswalk_sha256": receipt["evidence"]["identity_crosswalk"]["sha256"], "license_note": "CC0-1.0", "license_url": receipt["source"]["license_url"], "license_metadata_url": receipt["source"]["license_evidence"]["url"], "source_snapshot_retrieved_at": retrieved, "minimum_publications_filter": receipt["context"]["minimum_publications_filter"], "precision": receipt["context"]["precision"]}
    for start in range(0, len(receipt["records"]), 100):
        group = receipt["records"][start:start + 100]
        # Shared context/definitions are stated once per batch, so source prose
        # is not repeated in large SQL literals and ingestion stays bounded.
        sql = f"""with mapping as (select key field,value m from jsonb_each({literal(mappings)}::jsonb)), facts as (
 select r->>'university_id' university_id,r->>'source_record_id' source_record_id,r->>'source_url' source_url,
 r->>'ror' ror,f.key field,f.value datum,m.m
 from jsonb_array_elements({literal(group)}::jsonb) r cross join lateral jsonb_each(r->'values') f join mapping m on m.field=f.key
)
insert into public.research_metrics(id,university_id,metric,value,unit,field,period,edition,source_id,source_url,source_record_id,retrieved_at,last_verified_at,verification_status,license_note,evidence)
select (datum->>'id')::uuid,university_id::uuid,m->>'metric',(datum->>'value')::numeric,m->>'unit','All sciences','2020–2023','Leiden Open Edition 2025',
{source_expr},source_url,source_record_id,{literal(retrieved)}::timestamptz,{literal(verified)}::timestamptz,'verified','CC0-1.0',
{literal(evidence)}::jsonb || jsonb_build_object('source_record_id',source_record_id,'ror_id',ror,'raw_field',field,'raw_value',datum->'value','indicator_definition',m->>'definition')
from facts on conflict do nothing;"""
        save(f"02-leiden-metrics-{start // 100 + 1:02}.sql", sql, {"universities": len(group), "research_metric_rows": len(group) * len(mappings), "ordinal_ranking_rows": 0})
    manifest = {"mode": "reviewable_additive_sql_only", "source_id_if_not_existing": source_id, "source_url": source_url, "receipt_sha256": hashlib.sha256((PUB / "reviewed-leiden-expansion.json").read_bytes()).hexdigest(), "counts": {"research_metric_rows": len(receipt["records"]) * len(mappings), "universities": len(receipt["records"]), "source_reuse_maximum": 1, "new_imported_observations": receipt["counts"]["new_observations"], "existing_correct_pilot_observations": receipt["counts"]["already_published_correct_observations"], "ordinal_ranking_rows": 0}, "batches": batches}
    save_verified(output / "manifest.json", json.dumps(manifest, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply-local", action="store_true")
    parser.add_argument("--out", type=Path, default=ROOT / "outputs/deeper-data-leiden")
    args = parser.parse_args()
    receipt = json.loads((PUB / "reviewed-leiden-expansion.json").read_text())
    manifest = generate_sql(receipt, args.out)
    appended = None
    if args.apply_local:
        path = PUB / "imported.json"
        data, appended = integrate_local(receipt, json.loads(path.read_text()))
        # Atomic replacement applies an idempotent append/correction hold only;
        # unchanged source observations and historical values remain present.
        temp = path.with_name(path.name + ".leiden.part")
        temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        temp.replace(path)
    print(json.dumps({"sql_batches": len(manifest["batches"]), "manifest": str(args.out / "manifest.json"), "appended_local_observations": appended, **manifest["counts"]}, indent=2))


if __name__ == "__main__":
    main()
