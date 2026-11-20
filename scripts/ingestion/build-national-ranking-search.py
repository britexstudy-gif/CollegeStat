#!/usr/bin/env python3
"""Project existing reconciled names for national-table search, without adding facts."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def build_identity_links(snapshot, directory):
    """Project only reviewed, installed identities without rewriting source receipts."""
    records = {row["id"]: row for provider in snapshot["providers"] for row in provider["records"]}
    links = {}
    for university in directory:
        evidence = university.get("identity_evidence", {})
        if evidence.get("verification_state") != "verified_registry_identity":
            continue
        for record_id in evidence.get("ranking_record_ids", []):
            record = records.get(record_id)
            if (not record or record["university_id"] or record["identity_status"] == "aggregate_reporting_unit"
                    or record["country_code"] != university["country_code"]
                    or record["source_url"] != evidence.get("ranking_source_url")):
                continue
            if record_id in links and links[record_id] != university["id"]:
                raise ValueError("Conflicting reviewed national identity link")
            links[record_id] = university["id"]
    return links


def build_index(snapshot, directory):
    ids = {row["university_id"] for provider in snapshot["providers"]
           for row in provider["records"] if row["university_id"]}
    ids.update(build_identity_links(snapshot, directory).values())
    return {
        university["id"]: list(dict.fromkeys([
            university["name"], *university.get("aliases", [])
        ]))
        for university in directory if university["id"] in ids
    }


def main():
    snapshot_path = ROOT / "data/published/reviewed-national-rankings.json"
    directory_path = ROOT / "data/published/global-directory.json"
    snapshot_bytes = snapshot_path.read_bytes()
    directory_bytes = directory_path.read_bytes()
    output = {
        "schema_version": 1,
        "basis": "Search projection of existing reconciled catalogue identities; source positions and raw labels unchanged",
        "source_sha256": hashlib.sha256(snapshot_bytes).hexdigest(),
        "directory_sha256": hashlib.sha256(directory_bytes).hexdigest(),
        "names": build_index(json.loads(snapshot_bytes), json.loads(directory_bytes)),
        "identity_links": build_identity_links(json.loads(snapshot_bytes), json.loads(directory_bytes)),
    }
    target = ROOT / "data/published/national-ranking-search.json"
    target.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"Projected names for {len(output['names'])} existing identities")


if __name__ == "__main__":
    main()
