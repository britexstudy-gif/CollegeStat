#!/usr/bin/env python3
"""Audit cached national positions and prepare guarded partial publication SQL.

This script never connects to a database, reads credentials, changes installed
receipts, derives a rank, or adds institutions. It approves only existing staged
entries with independent exact identity evidence. Aggregate reporting units,
system offices, unavailable current identities and lifecycle changes stay held.
"""
from __future__ import annotations

import argparse
import collections
import copy
import csv
from datetime import datetime, timezone
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "outputs/national-publication-oct10"
RECEIPT = ROOT / "data/published/reviewed-national-rankings.json"
DIRECTORY = ROOT / "data/published/global-directory.json"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


adapter = module("national_publication_source", ROOT / "scripts/ingestion/review-national-rankings.py")
staging = module("national_publication_staging", ROOT / "scripts/ingestion/stage-national-rankings.py")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def verified_file(path, meta):
    data = path.read_bytes()
    if sha256(data) != meta["sha256"] or len(data) != meta["bytes"] or not meta.get("retrieved_at"):
        raise ValueError("Evidence receipt failed: " + str(path))
    return data


def cached_hd():
    path = ROOT / "data/raw/ipeds/HD2025.zip"
    meta = json.loads(path.with_suffix(".zip.meta.json").read_text())
    data = verified_file(path, meta)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        rows = list(csv.DictReader(io.StringIO(archive.read("hd2025.csv").decode("utf-8-sig"))))
    dictionary = ROOT / "data/raw/ipeds/HD2025_Dict.zip"
    dictionary_meta = json.loads(dictionary.with_suffix(".zip.meta.json").read_text())
    verified_file(dictionary, dictionary_meta)
    with zipfile.ZipFile(dictionary) as outer, zipfile.ZipFile(io.BytesIO(outer.read("hd2025.xlsx"))) as book:
        strings = ["".join(x.itertext()) for x in ET.fromstring(book.read("xl/sharedStrings.xml")).findall("m:si", NS)]
        labels = {}
        for row in ET.fromstring(book.read("xl/worksheets/sheet4.xml")).findall(".//m:row", NS):
            cells = []
            for cell in row.findall("m:c", NS):
                value = cell.find("m:v", NS)
                value = value.text if value is not None else ""
                cells.append(strings[int(value)] if cell.get("t") == "s" and value else value)
            if cells and cells[0] in {"CYACTIVE", "SECTOR"}:
                labels[cells[0], cells[3]] = cells[4]
    if labels.get(("CYACTIVE", "1")) != "Yes" or labels.get(("SECTOR", "0")) != "Administrative Unit":
        raise ValueError("Current HD identity dictionary changed")
    by_id = collections.defaultdict(list)
    for row in rows:
        by_id[row["UNITID"]].append(row)
    return by_id, {"source": meta, "dictionary": dictionary_meta}


def source_facts(receipt):
    value = copy.deepcopy(receipt)
    for key in ("identity_basis", "counts", "reviewed_at"):
        value.pop(key, None)
    for provider in value["providers"]:
        for key in ("profile_matches", "unlinked_positions", "unique_profile_matches"):
            provider["counts"].pop(key, None)
        for row in provider["records"]:
            row.pop("university_id")
            row.pop("identity_status")
            row["evidence"].pop("profile_identity_status")
    return value


def validate_receipt(receipt):
    """Reparse original physical publisher files; receipt labels are not proof."""
    reproduced = adapter.build_receipt(receipt["reviewed_at"])
    if source_facts(reproduced) != source_facts(receipt):
        raise ValueError("Installed source facts do not reproduce exactly")
    ids = [r["id"] for p in receipt["providers"] for r in p["records"]]
    if len(ids) != len(set(ids)) or set(p["provider"] for p in receipt["providers"]) != {"herd", "nirf"}:
        raise ValueError("Duplicate source rows or unexpected provider")
    return reproduced


def fetch_evidence(output, receipt):
    """Bounded primary URLs only; retain new bytes without replacing old files."""
    targets = {
        "nsf-policy.html": "https://www.nsf.gov/policies/digital",
        "pib-policy.html": "https://www.pib.gov.in/ContentPage.aspx?lang=2&menuid=102&reg=48",
        "herd-methodology.html": "https://ncses.nsf.gov/surveys/higher-education-research-development/2024",
        "herd-table6.xlsx": receipt["providers"][0]["source"]["url"],
        "nirf-release.html": receipt["providers"][1]["source"]["url"],
    }
    folder = output / "evidence"
    folder.mkdir(parents=True, exist_ok=True)
    if (folder / "fetch-manifest.json").exists():
        raise ValueError("Current review evidence already exists; use a new output path")
    manifest = {}
    for name, url in targets.items():
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "CollegeStat source review/1.0"}), timeout=25) as response:
            data = response.read(2 * 1024 * 1024 + 1)
            if len(data) > 2 * 1024 * 1024 or response.status != 200:
                raise ValueError("Bounded official evidence fetch failed")
        (folder / name).write_bytes(data)
        manifest[name] = {"url": url, "retrieved_at": datetime.now(timezone.utc).isoformat(), "sha256": sha256(data), "bytes": len(data)}
    (folder / "fetch-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def current_permissions(folder, receipt):
    manifest = json.loads((folder / "fetch-manifest.json").read_text())
    urls = {"nsf-policy.html": "https://www.nsf.gov/policies/digital", "pib-policy.html": "https://www.pib.gov.in/ContentPage.aspx?lang=2&menuid=102&reg=48", "herd-methodology.html": "https://ncses.nsf.gov/surveys/higher-education-research-development/2024", "herd-table6.xlsx": receipt["providers"][0]["source"]["url"], "nirf-release.html": receipt["providers"][1]["source"]["url"]}
    if set(manifest) != set(urls) or any(manifest[name]["url"] != url for name,url in urls.items()):
        raise ValueError("Review evidence is not from the exact primary URLs")
    content = {name: verified_file(folder / name, meta) for name, meta in manifest.items()}
    nsf = content["nsf-policy.html"].decode("utf-8")
    pib = content["pib-policy.html"].decode("utf-8")
    if "You may freely copy that material" not in nsf or "specifically identified" not in nsf:
        raise ValueError("NSF downloadable publication permission is not evidenced")
    if not all(text in pib for text in ("reproduced free of charge", "third-party material", "prominently acknowledged")):
        raise ValueError("PIB text permission/attribution limits are not evidenced")
    if manifest["herd-table6.xlsx"]["sha256"] != receipt["providers"][0]["source"]["sha256"]:
        raise ValueError("Current official HERD Table 6 differs; new snapshot review required")
    original_nirf = [(r["category"], r["name"], r["rank"]) for r in receipt["providers"][1]["records"]]
    live_nirf = [(r["category"], r["name"], r["rank"]) for r in adapter.parse_nirf(content["nirf-release.html"].decode("utf-8"))]
    if original_nirf != live_nirf:
        raise ValueError("Current Ministry selection differs; new snapshot review required")
    for filename, metadata in manifest.items():
        timestamp = datetime.fromisoformat(metadata["retrieved_at"].replace("Z", "+00:00"))
        if not timestamp.tzinfo or timestamp > datetime.now(timezone.utc):
            raise ValueError("Invalid review retrieval date: " + filename)
    return manifest


def audit(receipt, directory):
    validate_receipt(receipt)
    by_id = {u["id"]: u for u in directory}
    by_unitid = adapter.unique_unitids(directory)
    hd, hd_evidence = cached_hd()
    microdata = adapter.herd_microdata(ROOT / "data/raw/ncses-herd")
    micro_by_id = {r["public_use_inst_id"]: r for r in microdata.values()}
    safe, held = [], []
    for provider in receipt["providers"]:
        for record in provider["records"]:
            university = by_id.get(record.get("university_id"))
            reason = None
            if record["identity_status"] == "aggregate_reporting_unit":
                reason = "combined_reporting_unit_not_a_single_university"
            elif not record["university_id"]:
                reason = "unmatched_original_staging_identity"
            elif not university:
                raise ValueError("Linked identity missing or country conflict")
            elif university["country_code"] != record["country_code"] and not (
                provider["provider"] == "herd" and record["country_code"] in {"PR", "GU", "VI"}
                and university["country_code"] == "US" and university.get("state") == record["country_code"]
            ):
                raise ValueError("Linked identity country conflict")
            elif provider["provider"] == "herd":
                official = micro_by_id.get(record.get("public_use_inst_id"))
                if not official or official["unitid"] != record.get("unitid") or str(university.get("unitid")) != record["unitid"] or len(by_unitid[record["unitid"]]) != 1:
                    raise ValueError("Nonunique or inconsistent official HERD UNITID crosswalk")
                if official["total"] != record["total_rd_thousand_usd"] or official["federal"] != record["federal_rd_thousand_usd"] or adapter.exact_name(official["name"]) != adapter.exact_name(record["name"]):
                    raise ValueError("HERD reporting unit does not exactly match original official name/totals")
                current = hd.get(record["unitid"], [])
                if len(current) != 1:
                    reason = "current_HD_identity_unavailable_or_nonunique"
                elif current[0]["SECTOR"] == "0":
                    reason = "system_administrative_unit_scope_requires_separate_review"
                elif current[0]["CYACTIVE"] != "1" or current[0]["NEWID"] not in ("", "-2", "0"):
                    reason = "closed_combined_or_renumbered_identity_requires_historical_review"
                elif record["country_code"] in {"PR", "GU", "VI"} and (
                    official["state"] != record["country_code"] or current[0]["STABBR"] != record["country_code"]
                ):
                    raise ValueError("Source territory is not independently corroborated")
                elif adapter.exact_name(current[0]["INSTNM"]) not in {adapter.exact_name(n) for n in [university["name"], *university.get("aliases", [])]}:
                    raise ValueError("Current exact HD name/alias does not match target")
            else:
                name = adapter.exact_name(record["name"].split(",", 1)[0])
                candidates = {u["id"] for u in directory if u["country_code"] == "IN" and name in {adapter.exact_name(n) for n in [u["name"], *u.get("aliases", [])]}}
                if candidates != {record["university_id"]}:
                    raise ValueError("NIRF selected institution is not an exact unique existing name/alias")
            if reason:
                held.append({"id": record["id"], "provider": provider["provider"], "name": record["name"], "rank": record["rank"], "category": record["category"], "university_id": record["university_id"], "reason": reason})
                continue
            row = copy.deepcopy(record)
            row["review_row_id"] = staging.stable("ranking-source-row/" + provider["source"]["sha256"] + "/" + record["id"])
            row["publication_target_name"] = university["name"]
            row["publication_target_country"] = university["country_code"]
            safe.append(row)
    return safe, held, hd_evidence


CORE_CHECKSUM = "select md5(coalesce(string_agg(to_jsonb(core_r)::text, E'\\n' order by core_r.id),'')) from public.ranking_entries core_r join public.ranking_editions core_e on core_e.id=core_r.edition_id join public.ranking_providers core_p on core_p.id=core_e.provider_id where core_p.slug in ('qs','the','arwu')"


def preparation_sql(rows, review_evidence, receipt_sha):
    expected = []
    for row in rows:
        raw = copy.deepcopy(row)
        raw.pop("publication_target_name")
        raw.pop("publication_target_country")
        expected.append({"raw": raw, "target_name": row["publication_target_name"], "target_country": row["publication_target_country"]})
    evidence = {"receipt_sha256": receipt_sha, "method": "Exact original publisher positions; independent current official identity review", "permission_checks": review_evidence, "attribution": {"herd": "NCSES, U.S. National Science Foundation, HERD Survey FY 2024", "nirf": "Government of India, Ministry of Education / Press Information Bureau, India Rankings 2025, 4 September 2025"}, "scope_limits": "HERD is FY2024 research expenditure position, not overall quality. NIRF is only Ministry-authored selected top 3/5/10 category positions; no full category tables, third-party analytical inputs, images or logos."}
    # JSONB comparison accepts key order differences but rejects any changed fact.
    return f"""-- Reviewed partial publication only. No schema, identity or original source fact changes.
begin;
do $review$
declare facts jsonb := {staging.literal(expected)}::jsonb;
 item jsonb; raw jsonb; s public.source_records; r public.ranking_entries; e public.ranking_editions;
 p public.ranking_providers; u public.universities; source_url text; core_before text;
begin
 select ({CORE_CHECKSUM}) into core_before;
 for item in select value from jsonb_array_elements(facts) loop
  raw := item->'raw';
  select * into s from public.source_records where id=(raw->>'review_row_id')::uuid for update;
  select * into r from public.ranking_entries where id=(raw->>'review_row_id')::uuid for update;
  select * into e from public.ranking_editions where id=r.edition_id;
  select * into p from public.ranking_providers where id=e.provider_id;
  select * into u from public.universities where id=r.university_id;
  select url into source_url from public.data_sources where id=r.source_id;
  if s.id is null or r.id is null or s.raw_value is distinct from raw or s.university_id is distinct from r.university_id
   or s.normalized_value is distinct from (raw->>'rank')::numeric or s.source_id is distinct from r.source_id
   or s.source_url is distinct from raw->>'source_url' or source_url is distinct from raw->>'source_url'
   or s.metric is distinct from 'ranking:'||(raw->>'provider')||':'||(raw->>'category')
   or s.year is distinct from (raw->>'year')::integer or s.retrieved_at is distinct from (raw->>'retrieved_at')::timestamptz
   or r.rank is distinct from (raw->>'rank')::integer or r.rank_label is distinct from raw->>'rank_label'
   or r.year is distinct from (raw->>'year')::integer or r.score is not null
   or p.slug is distinct from raw->>'provider' or p.license_status is distinct from 'permitted'
   or e.year is distinct from (raw->>'year')::integer or e.subject is distinct from raw->>'category'
   or e.region is distinct from (case when p.slug='herd' then 'United States and outlying areas' else 'India' end)
   or u.id is distinct from (raw->>'university_id')::uuid or not u.published
   or u.country_code is distinct from item->>'target_country' or u.name is distinct from item->>'target_name'
   or (p.slug='herd' and (u.identifiers->>'ipeds' is distinct from raw->>'unitid'
      or (select count(*) from public.universities x where x.identifiers->>'ipeds'=raw->>'unitid')<>1))
   or s.status not in ('pending','approved') or r.verification_status not in ('needs_review','verified')
   or (r.evidence - 'publication_review') is distinct from raw->'evidence'
  then raise exception 'National publication refused: fact, identity, evidence or status conflict for %',raw->>'review_row_id'; end if;
  if r.verification_status='needs_review' then
   update public.ranking_entries set evidence=evidence||jsonb_build_object('publication_review',{staging.literal(evidence)}::jsonb),verification_status='verified',verified_at=now() where id=r.id;
  end if;
  update public.source_records set status='approved' where id=s.id and status='pending';
 end loop;
 if ({CORE_CHECKSUM}) is distinct from core_before then raise exception 'Original QS/THE/ARWU observations changed'; end if;
end; $review$;
commit;
"""


def enable_sql(rows, receipt_sha):
    ids = [r["review_row_id"] for r in rows]
    return f"""-- Run only after all guarded batches. Partially reviewed batches stay private until this succeeds.
begin;
do $publish$
declare ids uuid[] := array(select value::uuid from jsonb_array_elements_text({staging.literal(ids)}::jsonb));
begin
 if (select count(*) from public.ranking_entries r join public.source_records s on s.id=r.id
  join public.universities u on u.id=r.university_id where r.id=any(ids) and r.verification_status='verified'
  and r.verified_at is not null and s.status='approved' and u.published
  and r.evidence#>>'{{publication_review,receipt_sha256}}'={staging.literal(receipt_sha)}
  and r.rank=s.normalized_value and r.rank_label=s.raw_value->>'rank_label') <> cardinality(ids)
 then raise exception 'Reviewed publication is incomplete'; end if;
 if exists(select 1 from public.ranking_entries r where r.verification_status='verified' and not(r.id=any(ids))
   and r.edition_id in(select x.edition_id from public.ranking_entries x where x.id=any(ids)))
 then raise exception 'Unexpected verified observations would be exposed in a reviewed edition'; end if;
 update public.ranking_editions e set permitted=true where not e.permitted and
  exists(select 1 from public.ranking_entries r where r.edition_id=e.id and r.id=any(ids));
end; $publish$;
commit;
"""


def generate(output, receipt, directory, evidence):
    safe, held, hd = audit(receipt, directory)
    receipt_sha = sha256(RECEIPT.read_bytes())
    report = {"mode": "guarded_partial_review_SQL_no_connection", "reviewed_at": max(meta["retrieved_at"] for meta in evidence.values()), "receipt_sha256": receipt_sha, "directory_sha256": sha256(DIRECTORY.read_bytes()), "source_rows": 1039, "existing_entries": 860, "recommended_entries": len(safe), "recommended_profiles": len({r["university_id"] for r in safe}), "counts_by_provider": dict(collections.Counter(r["provider"] for r in safe)), "held_reasons": dict(collections.Counter(r["reason"] for r in held)), "held_existing_entries": [r for r in held if r["university_id"]], "held_unmatched_source_rows": sum(r["university_id"] is None for r in held), "source_territory_labels_retained": sum(r["country_code"] in {"PR", "GU", "VI"} for r in safe), "new_rows": 0, "new_institutions": 0, "schema_changes": 0, "hosted_writes": 0, "current_permission_evidence": evidence, "identity_evidence": hd, "recommended_row_ids": [r["review_row_id"] for r in safe], "files": []}
    output.mkdir(parents=True, exist_ok=True)
    for start in range(0, len(safe), 100):
        name = f"review-{start // 100 + 1:02d}.sql"
        body = preparation_sql(safe[start:start + 100], evidence, receipt_sha)
        path = output / name
        if path.exists() and path.read_text() != body:
            raise ValueError("Existing reviewed SQL differs; use a new output path")
        path.write_text(body)
        report["files"].append({"file": str(path), "sha256": sha256(body.encode()), "bytes": len(body.encode()), "entries": len(safe[start:start + 100])})
    path = output / "publish-reviewed-editions.sql"
    body = enable_sql(safe, receipt_sha)
    path.write_text(body)
    report["files"].append({"file": str(path), "sha256": sha256(body.encode()), "bytes": len(body.encode()), "enabled_editions": len({(r["provider"],r["category"]) for r in safe})})
    (output / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--fetch-evidence", action="store_true")
    args = parser.parse_args()
    receipt = json.loads(RECEIPT.read_text())
    if args.fetch_evidence:
        fetch_evidence(args.out, receipt)
    evidence = current_permissions(args.out / "evidence", receipt)
    report = generate(args.out, receipt, json.loads(DIRECTORY.read_text()), evidence)
    print(json.dumps({k:v for k,v in report.items() if k not in {"files", "recommended_row_ids", "current_permission_evidence", "identity_evidence"}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
