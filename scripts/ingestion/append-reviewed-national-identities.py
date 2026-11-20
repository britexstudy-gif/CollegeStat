#!/usr/bin/env python3
"""Append only ranked identity proposals that pass installed catalogue rules.

Offline and additive: verify immutable ROR and national-source receipts first.
The default is a review report; --apply appends local identities only. Ranking
observations retain their separate review/publication state. No hosted writes.
"""
import argparse
import collections
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import unicodedata
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/published"
ARCHIVE = ROOT / "data/raw/ror/v2.13-2026-09-22-ror-data.zip"
REGISTRY_MD5 = "a935217de21e7983b977f5419f1a6b20"
REGISTRY_SHA256 = "476988542f1bdd185f779386f90149371f58cb4ebdba326db3b7b428a468d4a5"
REVIEWED_AT = "2026-10-09"


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts/ingestion" / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


rules = module("ranked_identity_catalogue_rules", "expand-registry-identities.py")
reconciliation = module("ranked_identity_reconciliation", "reconcile-national-ranking-identities.py")


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def load_registry(path=ARCHIVE):
    body = Path(path).read_bytes()
    if hashlib.md5(body).hexdigest() != REGISTRY_MD5 or hashlib.sha256(body).hexdigest() != REGISTRY_SHA256:
        raise ValueError("ROR archive checksum differs from the immutable installed release")
    with zipfile.ZipFile(Path(path)) as archive:
        names = [name for name in archive.namelist() if name.endswith(".json")]
        if len(names) != 1:
            raise ValueError("Expected one official ROR registry JSON member")
        return json.loads(archive.read(names[0]))


def validate_evidence(plan, snapshot, directory, registry):
    """Reject changed evidence and tampered proposals before any local writes."""
    if plan["registry_source"]["sha256"] != REGISTRY_SHA256:
        raise ValueError("Proposal registry release checksum differs")
    if canonical_hash(snapshot) != plan["source_receipt_sha256"]:
        raise ValueError("National ranking source receipt checksum differs")
    by_ror = {row["id"]: row for row in registry}
    if len(by_ror) != len(registry):
        raise ValueError("Duplicate ROR registry identifiers")
    registry_names = collections.defaultdict(set)
    for record in registry:
        countries = {location["geonames_details"]["country_code"] for location in record["locations"]}
        if record["status"] == "active" and "education" in record["types"] and len(countries) == 1:
            country = next(iter(countries))
            for name in record["names"]:
                registry_names[country, reconciliation.adapter.exact_name(name["value"])].add(record["id"])
    positions = {row["id"]: row for provider in snapshot["providers"] for row in provider["records"]}
    if len(positions) != sum(len(provider["records"]) for provider in snapshot["providers"]):
        raise ValueError("Duplicate national ranking source record IDs")
    proposals = plan["identity_proposals"]
    if len({row["id"] for row in proposals}) != len(proposals) or len({row["ror"] for row in proposals}) != len(proposals):
        raise ValueError("Duplicate proposed canonical identity")
    proposal_ids = {row["id"] for row in proposals}
    original = [row for row in directory if row["id"] not in proposal_ids]
    if canonical_hash(original) != plan["catalogue_sha256"]:
        raise ValueError("Installed base catalogue differs from the reviewed proposal baseline; reconcile again")
    for proposal in proposals:
        record = by_ror.get(proposal["ror"])
        if not record:
            raise ValueError("Proposed ROR is missing from installed registry")
        uid = str(uuid.uuid5(uuid.NAMESPACE_URL, record["id"]))
        name = rules.display_name(record)
        stem = re.sub("[^a-z0-9]+", "-", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()).strip("-")[:130] or "university"
        if proposal["id"] != uid or proposal["slug"] != stem + "-" + uid[:8] or proposal["name"] != name:
            raise ValueError("Proposed canonical identity/name/route differs from the registered record")
        if proposal["evidence"]["registry_sha256"] != REGISTRY_SHA256 or proposal["identity_source"] != record["id"]:
            raise ValueError("Proposed identity evidence does not identify the installed ROR release")
        registered_sites = {link["value"] for link in record["links"] if link["type"] == "website" and rules.hostname(link["value"])}
        if proposal["website"] not in registered_sites:
            raise ValueError("Proposed website is not an exact registered official website")
        countries = {location["geonames_details"]["country_code"] for location in record["locations"]}
        if countries != {proposal["country_code"]}:
            raise ValueError("Proposed country is not the single registered country")
        evidence_ids = proposal["evidence"]["ranking_record_ids"]
        if not evidence_ids or len(evidence_ids) != len(set(evidence_ids)):
            raise ValueError("Proposed source positions must be nonempty and unique")
        registered_names = {reconciliation.adapter.exact_name(n["value"]) for n in record["names"]}
        for source_id in evidence_ids:
            source = positions.get(source_id)
            if not source or source["provider"] != "nirf" or source["country_code"] != proposal["country_code"]:
                raise ValueError("Proposed source position is missing, unsupported, or from another country")
            if source["source_url"] != proposal["evidence"]["ranking_source_url"] or source["identity_status"] == "aggregate_reporting_unit":
                raise ValueError("Proposed source position does not corroborate a single institution")
            if source["university_id"] is not None or source["publication_status"] != "review":
                raise ValueError("Identity append must not replace an existing source match or publish a ranking")
            if not registered_names.intersection(reconciliation.candidate_keys(source["name"])):
                raise ValueError("Source institution has no exact registered name/alias match")
            candidates = set().union(*(registry_names[source["country_code"], key] for key in reconciliation.candidate_keys(source["name"])))
            if candidates != {record["id"]}:
                raise ValueError("Source institution has an ambiguous registered name/alias match")
            matches = [m for m in plan["mappings"] if m["record_id"] == source_id]
            if len(matches) != 1 or matches[0].get("proposed_university_id") != uid or matches[0]["ror"] != record["id"]:
                raise ValueError("Proposal mapping does not preserve the source record ID")
    return by_ror


def eligible_records(plan, directory, registry):
    """Apply the same independent-university/country/host/name guards as Oct 6."""
    by_ror = {record["id"]: record for record in registry}
    registry_hosts = collections.defaultdict(set)
    for record in registry:
        if record["status"] == "active" and "education" in record["types"]:
            for location in record["locations"]:
                for link in record["links"]:
                    if link["type"] == "website" and rules.hostname(link["value"]):
                        registry_hosts[location["geonames_details"]["country_code"], rules.hostname(link["value"])].add(record["id"])
    by_id = {row["id"]: row for row in directory}
    if len(by_id) != len(directory) or len({row["slug"] for row in directory}) != len(directory):
        raise ValueError("Installed catalogue has duplicate canonical IDs or routes")
    present_ror = {row.get("ror") for row in directory}
    present_hosts = {(row["country_code"], rules.hostname(row["website"])) for row in directory}
    present_names = {(row["country_code"], rules.normalized_name(n)) for row in directory for n in [row["name"], *row.get("aliases", [])] if len(rules.normalized_name(n)) >= 10}
    records, held, installed = [], [], []
    for proposal in sorted(plan["identity_proposals"], key=lambda row: row["ror"]):
        record = by_ror[proposal["ror"]]
        name = rules.display_name(record)
        reason = None
        labels = [n["value"] for n in record["names"] if {"label", "ror_display"}.intersection(n["types"])]
        if record["status"] != "active" or "education" not in record["types"]:
            reason = "inactive_or_not_education"
        elif not any(rules.UNIVERSITY.search(n) for n in labels) or rules.UNIT.search(name):
            reason = "non_university_or_research_unit_under_existing_catalogue_scope"
        elif any(rel["type"].casefold() == "parent" and "education" in by_ror.get(rel["id"], {}).get("types", []) for rel in record["relationships"]):
            reason = "education_parent_or_constituent_campus"
        country = proposal["country_code"]
        sites = [link["value"] for link in record["links"] if link["type"] == "website" and rules.hostname(link["value"])]
        hosts = {rules.hostname(site) for site in sites}
        names = {rules.normalized_name(n["value"]) for n in record["names"] if len(rules.normalized_name(n["value"])) >= 10}
        if not reason and country == "US":
            reason = "us_requires_current_ipeds_corroboration"
        if not reason and (not sites or any(len(registry_hosts[country, host]) != 1 for host in hosts)):
            reason = "missing_or_ambiguous_registry_website"
        if reason:
            held.append({"id": proposal["id"], "ror": record["id"], "name": name, "reason": reason})
            continue
        current = by_id.get(proposal["id"])
        if current:
            if current.get("ror") != record["id"] or current["slug"] != proposal["slug"]:
                raise ValueError("An installed proposed identity has a conflicting ROR or canonical route")
            installed.append(proposal["id"])
            continue
        if record["id"] in present_ror or any((country, host) in present_hosts for host in hosts) or any((country, n) in present_names for n in names) or proposal["slug"] in {row["slug"] for row in by_id.values()}:
            held.append({"id": proposal["id"], "ror": record["id"], "name": name, "reason": "existing_or_within_batch_identity_collision"})
            continue
        location = record["locations"][0]["geonames_details"]
        row = {"id": proposal["id"], "slug": proposal["slug"], "name": name,
               "country_code": country, "country": location["country_name"],
               "website": proposal["website"], "domains": sorted(hosts), "ror": record["id"],
               "city": location["name"], "latitude": location["lat"], "longitude": location["lng"],
               "aliases": list(dict.fromkeys(n["value"] for n in record["names"])),
               "identity_source": record["id"], "identity_release": rules.RELEASE,
               "identity_retrieved_at": "2026-09-26",
               "external_ids": {entry["type"]: entry["preferred"] or entry["all"][0] for entry in record["external_ids"] if entry["all"]},
               "identity_evidence": {**proposal["evidence"], "verification_state": "verified_registry_identity",
                                     "identity_reviewed_at": REVIEWED_AT,
                                     "ranking_publication_status": "review",
                                     "scope": "Institution identity only; not accreditation, programme availability, or degree-awarding policy"}}
        if isinstance(record["established"], int) and 1 <= record["established"] <= 2100:
            row["founded_year"] = record["established"]
        records.append(row)
        by_id[row["id"]] = row
        present_ror.add(record["id"])
        present_hosts.update((country, host) for host in hosts)
        present_names.update((country, n) for n in names)
    return records, held, installed


def build_plan(proposals, snapshot, directory, registry):
    validate_evidence(proposals, snapshot, directory, registry)
    records, held, installed = eligible_records(proposals, directory, registry)
    return {"schema_version": 1, "reviewed_at": REVIEWED_AT,
            "mode": "local_identity_append_only_no_hosted_writes",
            "registry_sha256": REGISTRY_SHA256,
            "source_receipt_sha256": canonical_hash(snapshot),
            "base_catalogue_sha256": proposals["catalogue_sha256"],
            "counts": {"proposals": len(proposals["identity_proposals"]), "added": len(records),
                       "already_installed": len(installed), "held": len(held),
                       "catalogue_before": len(directory), "catalogue_after": len(directory) + len(records),
                       "hosted_writes": 0, "ranking_observations_published": 0},
            "records": records, "already_installed_ids": installed, "held": held}


def apply_local(directory, manifest, countries, report):
    """Keep existing record objects byte-for-byte equivalent at their old offsets."""
    merged = rules.merge_receipt(directory, report["records"])
    body = json.dumps(merged, ensure_ascii=False, separators=(",", ":")) + "\n"
    updated = {**manifest, "institutions": len(merged), "catalogue_total": len(merged),
               "countries": len({row["country_code"] for row in merged}),
               "ror_linked": len({row["ror"] for row in merged if row.get("ror")}),
               "sha256": hashlib.sha256(body.encode()).hexdigest(),
               "latest_identity_review": REVIEWED_AT,
               "national_identity_additions": len(report["records"]) + len(report["already_installed_ids"]),
               "national_identity_source_receipt": "reviewed-national-ranking-identities.json",
               "national_identity_append_script": "scripts/ingestion/append-reviewed-national-identities.py"}
    country_map = dict(countries)
    for row in report["records"]:
        if row["country_code"] in country_map and country_map[row["country_code"]] != row["country"]:
            raise ValueError("New registry country name conflicts with the preserved country dictionary")
        country_map[row["country_code"]] = row["country"]
    return body, updated, dict(sorted(country_map.items()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Append eligible local identities after validating all evidence")
    parser.add_argument("--out", type=Path, default=ROOT / "outputs/ranked-identity-append-oct09.json")
    args = parser.parse_args()
    directory_path = OUT / "global-directory.json"
    directory = json.loads(directory_path.read_text())
    manifest = json.loads((OUT / "directory-manifest.json").read_text())
    if manifest["sha256"] != hashlib.sha256(directory_path.read_bytes()).hexdigest():
        raise ValueError("Installed directory manifest checksum differs")
    proposals = json.loads((OUT / "reviewed-national-ranking-identities.json").read_text())
    snapshot = json.loads((OUT / "reviewed-national-rankings.json").read_text())
    report = build_plan(proposals, snapshot, directory, load_registry())
    report["applied_local"] = args.apply
    if args.apply:
        body, updated, countries = apply_local(directory, manifest, json.loads((OUT / "directory-countries.json").read_text()), report)
        # No write is attempted until all inputs, output metadata and identity
        # collisions have passed. Source receipts remain immutable.
        if directory_path.read_text() != body:
            directory_path.write_text(body)
        manifest_path = OUT / "directory-manifest.json"
        manifest_body = json.dumps(updated, indent=2) + "\n"
        if manifest_path.read_text() != manifest_body:
            manifest_path.write_text(manifest_body)
        country_path = OUT / "directory-countries.json"
        if json.loads(country_path.read_text()) != countries:
            country_path.write_text(json.dumps(countries, indent=2) + "\n")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report["counts"], indent=2))


if __name__ == "__main__":
    main()
