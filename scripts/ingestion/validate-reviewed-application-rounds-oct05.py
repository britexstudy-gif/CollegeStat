#!/usr/bin/env python3
"""Read-only validation of the announced, scoped application-round receipt."""

import json
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[2]
RECEIPT = ROOT / "data/published/reviewed-application-rounds-oct05.json"


def read(path):
    return json.loads(path.read_text())


def main():
    receipt = read(RECEIPT)
    installed = read(ROOT / "data/published/application-dates-current.json")
    universities = {row["id"] for row in read(ROOT / "data/published/global-directory.json")}
    sources = {row["id"]: row for row in receipt["sources"]}
    programmes = {row["id"] for row in receipt["programs"]}
    checked = date.fromisoformat(receipt["checked_at"])
    records = receipt["records"]
    assert len(records) == receipt["counts"]["deadlines"] == 10
    assert len(sources) == receipt["counts"]["sources"]
    assert len(programmes) == receipt["counts"]["programs"]
    assert len(receipt["costs"]) == receipt["counts"]["application_fees"]
    assert len({row["university_id"] for row in records}) == receipt["counts"]["universities"]
    assert len({row["id"] for row in records}) == len(records)
    assert {row["id"] for row in records} == set(receipt["record_evidence"])
    existing = {row["id"]: row for row in installed}
    semantic = {(row["university_id"], row.get("program_id"), row["title"], row["cycle"],
                 row["student_category"], row["source_id"]) for row in installed}
    official_hosts = {"join.hkust.edu.hk", "admission.cuhk.edu.hk", "www.aalto.fi",
                      "ethz.ch", "gsb.nu.edu.kz"}
    for source in sources.values():
        uuid.UUID(source["id"])
        url = urlparse(source["url"])
        assert url.scheme == "https" and url.hostname in official_hosts
        assert source["source_type"] == "official" and source["retrieved_at"] == "2026-10-05"
    fresh = 0
    exact = 0
    for row in records:
        uuid.UUID(row["id"])
        assert row["university_id"] in universities
        assert row["program_id"] is None or row["program_id"] in programmes
        assert row["source_id"] in sources
        assert row["source_url"] == sources[row["source_id"]]["url"]
        assert row["verification_status"] == "verified"
        assert row["verified_at"] == "2026-10-05T00:00:00Z"
        assert row["year"] == 2027 and "2027" in row["cycle"]
        assert row["title"] and row["student_category"] and row["notes"]
        assert urlparse(row["application_url"]).scheme == "https"
        ZoneInfo(row["timezone"])
        evidence = receipt["record_evidence"][row["id"]]
        assert evidence["university_wide"] is False
        assert evidence["population"] == row["student_category"]
        assert evidence["publication_year"] is None
        if "T" in row["due_at"]:
            instant = datetime.fromisoformat(row["due_at"].replace("Z", "+00:00"))
            assert instant.tzinfo == timezone.utc
            assert evidence["date_precision"] == "instant"
            assert evidence["published_cutoff"]
            local = instant.astimezone(ZoneInfo(row["timezone"]))
            assert (local.hour, local.minute) in {(15, 0), (11, 59)}
            exact += 1
            due = local.date()
        else:
            due = date.fromisoformat(row["due_at"])
            assert evidence["date_precision"] == "date"
        assert due >= checked, "Past rounds must not be presented as forthcoming"
        key = (row["university_id"], row["program_id"], row["title"], row["cycle"],
               row["student_category"], row["source_id"])
        if row["id"] in existing:
            assert existing[row["id"]] == {**row, "evidence": evidence}, "Do not overwrite an installed observation"
        else:
            assert key not in semantic, "Duplicate installed deadline"
            fresh += 1
    for link in receipt["university_programs"]:
        assert link["university_id"] in universities and link["program_id"] in programmes
        assert link["source_id"] in sources and link["evidence"]["university_wide"] is False
    for fee in receipt["costs"]:
        uuid.UUID(fee["id"])
        assert fee["university_id"] in universities
        assert fee["program_id"] is None or fee["program_id"] in programmes
        assert fee["source_id"] in sources and fee["source_url"] == sources[fee["source_id"]]["url"]
        assert fee["category"] == "application_fee" and fee["period"] == "total"
        assert fee["currency"] in {"HKD", "EUR", "KZT"} and fee["amount"] > 0
        assert fee["student_category"] and fee["notes"]
        assert fee["verification_status"] == "verified" and fee["verified_at"] == receipt["checked_at"]
    print(json.dumps({"receipt": str(RECEIPT.relative_to(ROOT)), "counts": receipt["counts"],
                      "existing_deadlines_preserved": len(installed), "new_deadlines": fresh,
                      "exact_cutoff_times": exact, "date_only_deadlines": len(records) - exact,
                      "appended": 0}))


if __name__ == "__main__":
    main()
