#!/usr/bin/env python3
"""Install scoped application evidence locally and generate additive SQL.

No database connection is made. --apply appends unseen observations to the
published datasets; the default only validates and writes ignored SQL outputs.
Conflicting IDs or semantic identities fail before any published file is written.
"""

import argparse
import copy
import hashlib
import json
import uuid
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "data/published"


def read(path, fallback=None):
    return json.loads(path.read_text()) if path.exists() else fallback


def append_observations(current, additions, semantic_key, label):
    result = copy.deepcopy(current)
    by_id = {row["id"]: row for row in result}
    by_key = {semantic_key(row): row for row in result}
    assert len(by_id) == len(result), f"Existing duplicate {label} ID"
    added = 0
    for row in additions:
        uuid.UUID(row["id"])
        if row["id"] in by_id:
            assert by_id[row["id"]] == row, f"Conflicting {label} ID; preserve it for review"
            continue
        key = semantic_key(row)
        assert key not in by_key, f"Conflicting semantic {label} identity; preserve it for review"
        result.append(copy.deepcopy(row))
        by_id[row["id"]] = row
        by_key[key] = row
        added += 1
    return result, added


def deadline_key(row):
    return tuple(row.get(k) for k in ("university_id", "program_id", "title", "cycle", "student_category", "source_id"))


def cost_key(row):
    return tuple(row.get(k) for k in ("university_id", "program_id", "category", "year", "student_category", "period", "source_id"))


def fee_evidence(receipt, row):
    evidence = {"university_wide": False, "scope": "programme" if row["program_id"] else "admissions_route",
                "population": row["student_category"], "reporting_period": "2027 entry",
                "publication_year": None, "retrieved_at": receipt["checked_at"],
                "fee_type": "application", "annual_tuition": False}
    if row["currency"] == "KZT":
        corresponding = next(d for d in receipt["records"] if d["program_id"] == row["program_id"]
                             and receipt["record_evidence"][d["id"]].get("application_fee", {}).get("amount") == row["amount"])
        evidence.update(copy.deepcopy(receipt["record_evidence"][corresponding["id"]]))
        evidence.update({"refundable": False, "waivable": False})
    elif row["currency"] == "EUR":
        evidence.update({"scope": "statutory_application_fee", "exemptions": ["EU citizenship", "EEA citizenship",
            "Swiss citizenship", "Qualifying Finnish residence permit valid during the application period"],
            "payment_deadline": "Within seven days of application submission",
            "exemption_document_required": True})
    elif row["currency"] == "HKD":
        evidence.update({"refundable": False, "payment_deadline": "At application submission",
            "source_retrieval": "official_page_search_index_corroborated_by_official_faq"})
    return evidence


def normalized_rows(receipt):
    sources = {row["id"]: row for row in receipt["sources"]}
    dates = [{**copy.deepcopy(row), "evidence": copy.deepcopy(receipt["record_evidence"][row["id"]])}
             for row in receipt["records"]]
    fees = [{**copy.deepcopy(row), "evidence": fee_evidence(receipt, row),
             "data_sources": copy.deepcopy(sources[row["source_id"]])} for row in receipt["costs"]]
    return dates, fees


def integrate(receipt, directory, dates, fees, official_programs):
    sources = {row["id"]: row for row in receipt["sources"]}
    universities = {row["id"]: row for row in directory}
    date_additions, fee_additions = normalized_rows(receipt)
    for row in date_additions + fee_additions:
        assert row["university_id"] in universities, "Unresolved canonical university"
        assert row["source_id"] in sources and row["source_url"] == sources[row["source_id"]]["url"]
        assert row["evidence"]["university_wide"] is False
        assert row["verification_status"] == "verified"
    new_dates, date_count = append_observations(dates, date_additions, deadline_key, "deadline")
    new_fees, fee_count = append_observations(fees, fee_additions, cost_key, "fee")
    offerings = copy.deepcopy(official_programs)
    programme_count = 0
    for link in receipt["university_programs"]:
        programme = next(p for p in receipt["programs"] if p["id"] == link["program_id"])
        host = urlparse(universities[link["university_id"]]["website"]).hostname.removeprefix("www.")
        row = {"id": programme["id"], "name": programme["name"], "award": "Executive MBA",
               "level": programme["degree_level"], "language": programme["language"],
               "subject": programme["subject"], "url": link["source_url"], "source_url": link["source_url"],
               "source_id": link["source_id"], "checked_at": link["verified_at"],
               "university_program_id": link["id"], "reporting_year": link["year"], "availability": "current",
               "evidence": copy.deepcopy(link["evidence"]),
               "notes": "Exact Executive MBA offering; 2027–2028 registration is announced. English instruction with simultaneous Russian translation. No undergraduate score threshold is implied."}
        existing = offerings.setdefault(host, [])
        prior = next((r for r in existing if r["id"] == row["id"]), None)
        if prior:
            assert prior == row, "Conflicting programme ID; preserve it for review"
        else:
            assert not any(r["name"] == row["name"] and r["level"] == row["level"]
                           and r.get("language") == row["language"] for r in existing), "Existing offering has a different canonical ID"
            existing.append(row)
            programme_count += 1
    return new_dates, new_fees, offerings, {"deadlines_added": date_count, "fees_added": fee_count,
                                          "programmes_added": programme_count}


def literal(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return "'" + str(value).replace("'", "''") + "'"


def sql_for_receipt(receipt):
    lines = ["-- Reviewed application evidence only. Apply existing schema/evidence migrations first.",
             "-- Append-only: no UPDATE/DELETE, no user data, no annualized fees or invented cutoff times.", "begin;"]
    programmes = {p["id"]: p for p in receipt["programs"]}
    def insert(table, row):
        expressions = []
        for key, value in row.items():
            if key == "program_id" and value is not None:
                p = programmes[value]
                # Reuse an existing exact programme identity without changing it.
                expressions.append("(select id from public.programs where name=" + literal(p["name"])
                    + " and degree_level=" + literal(p["degree_level"]) + " and language is not distinct from "
                    + literal(p["language"]) + ")")
            else:
                expressions.append(literal(value))
        lines.append(f"insert into public.{table} ({','.join(row)}) values ({','.join(expressions)}) on conflict do nothing;")
    for source in receipt["sources"]:
        insert("data_sources", source)
    for programme in receipt["programs"]:
        insert("programs", programme)
    for link in receipt["university_programs"]:
        row = copy.deepcopy(link)
        row["reporting_year"] = row.pop("year")
        row["availability"] = "current"
        insert("university_programs", row)
    dates, fees = normalized_rows(receipt)
    for date in dates:
        row = copy.deepcopy(date)
        row["due_date"] = row["due_at"] if len(row["due_at"]) == 10 else None
        if row["due_date"]:
            row["due_at"] = None
        insert("deadlines", row)
    for fee in fees:
        insert("costs", {key: value for key, value in fee.items() if key not in ("source_url", "data_sources")})
    lines.append("commit;")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Append to local published files; never connects to a database")
    args = parser.parse_args()
    receipt = read(PUB / "reviewed-application-rounds-oct05.json")
    old_dates = read(PUB / "application-dates-current.json")
    old_fees = read(PUB / "application-fees-current.json", [])
    old_programmes = read(PUB / "official-programs.json")
    dates, fees, programmes, counts = integrate(receipt, read(PUB / "global-directory.json"),
                                              old_dates, old_fees, old_programmes)
    sql = sql_for_receipt(receipt)
    if args.apply:
        for name, old, new, compact in (("application-dates-current.json", old_dates, dates, False),
                                      ("application-fees-current.json", old_fees, fees, False),
                                      ("official-programs.json", old_programmes, programmes, True)):
            if old != new:
                (PUB / name).write_text(json.dumps(new, ensure_ascii=False, **({"separators": (",", ":")} if compact else {"indent": 2})) + "\n")
    out = ROOT / "outputs"
    out.mkdir(exist_ok=True)
    (out / "deeper-data-applications.sql").write_text(sql)
    manifest = {"mode": "local_append_and_sql" if args.apply else "validated_sql_only", **counts,
                "existing_deadlines_preserved": len(old_dates), "existing_fees_preserved": len(old_fees),
                "sql_counts": receipt["counts"], "sql_sha256": hashlib.sha256(sql.encode()).hexdigest(),
                "sql_file": "outputs/deeper-data-applications.sql", "remote_writes": False}
    (out / "deeper-data-applications-plan.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
