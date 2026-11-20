#!/usr/bin/env python3
"""Review exact registry/UNITID matches without altering the catalogue.

Keeps combined HERD reporting units unlinked. New identities are proposals,
not published profiles. Never invent a website or logo from a ranking name.
"""
import argparse
import collections
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlparse
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("national_rankings", ROOT / "scripts/ingestion/review-national-rankings.py")
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
ARCHIVE = ROOT / "data/raw/ror/v2.13-2026-09-22-ror-data.zip"
DOI = "https://doi.org/10.5281/zenodo.22902037"


def hostname(site):
    try:
        value = urlparse(site)
        return value.hostname.lower().removeprefix("www.") if value.scheme in ("https", "http") and value.hostname and not value.username else ""
    except ValueError:
        return ""


def candidate_keys(name):
    # The PIB separately appends city after a comma. Registered campus
    # qualifiers are never shortened. Acronyms are removed only on the source
    # side and only when the complete registered name independently matches.
    names = {name, name.split(",", 1)[0]}
    names |= {re.sub(r"\s*\([A-Z][A-Z. -]{1,12}\)", "", n) for n in names}
    return {adapter.exact_name(n) for n in names if n.strip()}


def build_plan(receipt, catalogue):
    if hashlib.md5(ARCHIVE.read_bytes()).hexdigest() != "a935217de21e7983b977f5419f1a6b20":
        raise ValueError("ROR archive does not match the official immutable release")
    with zipfile.ZipFile(ARCHIVE) as archive:
        registry = json.loads(archive.read(next(n for n in archive.namelist() if n.endswith(".json"))))
    by_name = collections.defaultdict(dict)
    for record in registry:
        if record["status"] != "active" or "education" not in record["types"]:
            continue
        countries = {loc["geonames_details"]["country_code"] for loc in record["locations"]}
        if len(countries) != 1:
            continue
        country = next(iter(countries))
        for name in record["names"]:
            by_name[country, adapter.exact_name(name["value"])][record["id"]] = record
    existing_ror = collections.defaultdict(list)
    existing_hosts = collections.defaultdict(set)
    existing_names = collections.defaultdict(set)
    for institution in catalogue:
        if institution.get("ror"):
            existing_ror[institution["ror"]].append(institution)
        if hostname(institution["website"]):
            existing_hosts[institution["country_code"], hostname(institution["website"])].add(institution["id"])
        for name in [institution["name"], *institution.get("aliases", [])]:
            existing_names[institution["country_code"], adapter.exact_name(name)].add(institution["id"])
    microdata = adapter.herd_microdata(ROOT / "data/raw/ncses-herd")
    micros = {str(r["public_use_inst_id"]): r for r in microdata.values()}
    proposals, mappings, held = {}, [], []
    for provider in receipt["providers"]:
        for rank in provider["records"]:
            if rank["university_id"]:
                continue
            if rank["identity_status"] == "aggregate_reporting_unit":
                held.append({"record_id": rank["id"], "name": rank["name"], "reason": "aggregate_reporting_unit_not_a_single_profile"})
                continue
            source_name = rank["name"]
            if provider["provider"] == "herd":
                source = micros.get(str(rank.get("public_use_inst_id")))
                if not source or not source["unitid"]:
                    held.append({"record_id": rank["id"], "name": rank["name"], "reason": "missing_unique_official_UNITID_crosswalk"})
                    continue
                source_name = source["name"]
            keys = candidate_keys(source_name) if provider["provider"] == "nirf" else {adapter.exact_name(source_name)}
            candidates = {}
            for key in keys:
                candidates.update(by_name.get((rank["country_code"], key), {}))
            if len(candidates) != 1:
                held.append({"record_id": rank["id"], "name": rank["name"], "reason": "no_unique_exact_active_education_ROR", "candidate_count": len(candidates)})
                continue
            record = next(iter(candidates.values()))
            current = existing_ror.get(record["id"], [])
            if len(current) > 1:
                held.append({"record_id": rank["id"], "name": rank["name"], "reason": "ambiguous_existing_ROR"})
                continue
            if current:
                mappings.append({"record_id": rank["id"], "university_id": current[0]["id"], "ror": record["id"], "status": "additional_existing_identity_match", "basis": "Unique exact complete registered ROR name/alias in same country; existing unique ROR"})
                continue
            sites = [l["value"] for l in record["links"] if l["type"] == "website" and hostname(l["value"])]
            if not sites:
                held.append({"record_id": rank["id"], "name": rank["name"], "reason": "no_registered_official_website"})
                continue
            if any(existing_hosts.get((rank["country_code"], hostname(site))) for site in sites):
                held.append({"record_id": rank["id"], "name": rank["name"], "ror": record["id"], "reason": "registered_website_already_present_identity_review_required"})
                continue
            if any(existing_names.get((rank["country_code"], adapter.exact_name(name["value"]))) for name in record["names"]):
                held.append({"record_id": rank["id"], "name": rank["name"], "ror": record["id"], "reason": "registered_name_already_present_identity_review_required"})
                continue
            if provider["provider"] == "herd":
                # A same-name ROR alone cannot resolve US campus UNITID or
                # medical units. Keep these as explicit evidence proposals.
                held.append({"record_id": rank["id"], "name": rank["name"], "ror": record["id"], "unitid": rank["unitid"], "reason": "new_US_identity_requires_current_HD2025_corroboration"})
                continue
            identity = proposals.get(record["id"])
            if identity is None:
                location = record["locations"][0]["geonames_details"]
                name = next(n["value"] for n in record["names"] if "ror_display" in n["types"])
                uid = str(uuid.uuid5(uuid.NAMESPACE_URL, record["id"]))
                slug = re.sub("[^a-z0-9]+", "-", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()).strip("-")[:130] or "university"
                identity = {"id": uid, "slug": slug + "-" + uid[:8], "name": name, "country_code": rank["country_code"], "country": location["country_name"], "city": location["name"], "website": sites[0], "domains": [hostname(sites[0])], "ror": record["id"], "aliases": [n["value"] for n in record["names"]], "identity_source": record["id"], "identity_release": "ROR 2.13 · 2026-09-22", "identity_retrieved_at": "2026-09-26", "verification_status": "needs_review", "publication_status": "review", "evidence": {"ranking_source_url": rank["source_url"], "ranking_record_ids": [], "identity_source_url": record["id"], "registry_doi": DOI, "registry_sha256": hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(), "registry_license": "CC0-1.0", "location_source": "GeoNames via ROR; CC BY 4.0; https://www.geonames.org/", "basis": "Unique exact registered name/alias in publisher country; no existing ROR, registered hostname or name collision; no logo/ownership/admissions facts inferred"}}
                proposals[record["id"]] = identity
            identity["evidence"]["ranking_record_ids"].append(rank["id"])
            mappings.append({"record_id": rank["id"], "proposed_university_id": identity["id"], "ror": record["id"], "status": "private_new_identity_proposal"})
    return {"schema_version": 1, "status": "private_identity_review_proposals_no_catalogue_or_hosted_writes", "reviewed_at": "2026-10-09", "source_receipt_sha256": hashlib.sha256(json.dumps(receipt, sort_keys=True).encode()).hexdigest(), "catalogue_sha256": hashlib.sha256(json.dumps(catalogue, sort_keys=True).encode()).hexdigest(), "registry_source": {"url": DOI, "license": "CC0-1.0", "sha256": hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(), "retrieved_at": "2026-09-26"}, "counts": {"new_identity_proposals": len(proposals), "additional_existing_position_matches": sum(m["status"] == "additional_existing_identity_match" for m in mappings), "positions_with_new_identity_proposals": sum(m["status"] == "private_new_identity_proposal" for m in mappings), "held_positions": len(held), "new_universities_published": 0, "hosted_writes": 0}, "identity_proposals": list(proposals.values()), "mappings": mappings, "held": held}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "data/published/reviewed-national-ranking-identities.json")
    args = parser.parse_args()
    plan = build_plan(json.loads((ROOT / "data/published/reviewed-national-rankings.json").read_text()), json.loads((ROOT / "data/published/global-directory.json").read_text()))
    body = json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
    if args.out.exists() and args.out.read_text() != body:
        raise ValueError("An existing identity receipt must never be silently replaced")
    if not args.out.exists():
        args.out.write_text(body)
    print(json.dumps(plan["counts"], indent=2))
