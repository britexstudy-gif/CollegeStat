#!/usr/bin/env python3
"""Validate, or append, the bounded primary-source requirements receipt.

The default is read-only validation. --append only adds previously unseen UUIDs
to the installed requirements dataset. It never revises existing observations.
Programme and source rows in the receipt must be installed before a DB import.
"""

import argparse
import json
import uuid
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
RECEIPT = ROOT / "data/published/reviewed-requirements-oct05.json"
TARGET = ROOT / "data/published/requirements-current.json"


def read(path):
    return json.loads(path.read_text())


def validate(receipt, current):
    records = receipt["records"]
    sources = {row["id"]: row for row in receipt["sources"]}
    programmes = {row["id"] for row in receipt["programs"]}
    universities = {row["id"] for row in read(ROOT / "data/published/global-directory.json")}
    assert len(records) == receipt["counts"]["requirements"]
    assert len(records) == len({row["id"] for row in records}), "Duplicate requirement UUID"
    assert len(sources) == receipt["counts"]["sources"]
    assert len({row["university_id"] for row in records}) == receipt["counts"]["universities"]
    assert len(programmes) == receipt["counts"]["programs"]
    assert receipt["checked_at"] == "2026-10-05"
    allowed = {"SAT", "ACT", "IELTS", "TOEFL", "document", "other"}
    existing = {row["id"]: row for row in current}
    additions = []
    for row in records:
        uuid.UUID(row["id"])
        assert row["university_id"] in universities, "Unresolved canonical university"
        assert row["program_id"] is None or row["program_id"] in programmes
        assert row["source_id"] in sources
        assert row["source_url"] == sources[row["source_id"]]["url"]
        assert row["data_sources"]["id"] == row["source_id"]
        assert urlparse(row["source_url"]).scheme == "https"
        assert sources[row["source_id"]]["source_type"] == "official"
        assert row["kind"] in allowed
        assert row["evidence"]["university_wide"] is False
        assert row["student_category"] and row["notes"] and row["evidence"]["scope"]
        assert row["evidence"]["publication_year"] is None
        assert row["verified_at"] == receipt["checked_at"]
        if row["year"] is not None:
            assert row["year"] in (2026, 2027)
            assert str(row["year"]) in row["evidence"]["reporting_period"]
        floor, ceiling = row["minimum"], row["maximum"]
        if floor is not None:
            assert floor >= 0
            if row["kind"] == "IELTS":
                assert floor <= 9
            elif row["kind"] == "SAT":
                assert 400 <= floor <= 1600
            elif row["kind"] == "ACT":
                assert 1 <= floor <= 36
            elif row["kind"] == "TOEFL":
                assert floor <= 120
                assert row["evidence"]["scale"] in ("TOEFL iBT 0–120", "TOEFL iBT 1–6")
                if row["evidence"]["scale"] == "TOEFL iBT 1–6":
                    assert 1 <= floor <= 6
        if ceiling is not None:
            assert floor is not None and floor <= ceiling
        if row["id"] in existing:
            assert existing[row["id"]] == row, "Existing UUID has different evidence; preserve it for review"
        else:
            additions.append(row)
    for link in receipt["university_programs"]:
        assert link["university_id"] in universities
        assert link["program_id"] in programmes
        assert link["source_id"] in sources
        assert link["evidence"]["university_wide"] is False
    return additions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--append", action="store_true", help="Append only unseen requirement UUIDs")
    parser.add_argument("--check", action="store_true", help="Read-only validation (the default)")
    args = parser.parse_args()
    if args.append and args.check:
        parser.error("Choose --append or --check")
    receipt, current = read(RECEIPT), read(TARGET)
    additions = validate(receipt, current)
    if args.append and additions:
        TARGET.write_text(json.dumps(current + additions, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"receipt": str(RECEIPT.relative_to(ROOT)), "counts": receipt["counts"],
                      "existing_observations_preserved": len(current), "new_observations": len(additions),
                      "appended": len(additions) if args.append else 0,
                      "global_filter_eligible": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
