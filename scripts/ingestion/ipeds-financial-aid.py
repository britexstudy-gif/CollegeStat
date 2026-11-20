#!/usr/bin/env python3
"""Stage dictionary-backed IPEDS SFA2324 facts; never mutate the catalogue or DB.

The official ZIPs and their original retrieval receipts must already be cached.
Run from any directory. Output creation is exclusive: existing reviewed receipts
are not overwritten. The XLSX dictionary is read with the standard library.
"""
import argparse
import collections
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/raw/ipeds"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
SOURCE_URL = "https://nces.ed.gov/ipeds/complete-data-files/SFA2324.zip"
DICTIONARY_URL = "https://nces.ed.gov/ipeds/complete-data-files/SFA2324_Dict.zip"
PERIOD = "2023–2024 academic year"
UNDERGRADUATE = "All undergraduate students in the SFA financial-aid cohort"
FIRST_TIME = "Full-time, first-time degree/certificate-seeking undergraduate students in the SFA financial-aid cohort"

# Column identities are deliberately fixed and validated against this release's
# official Varlist/Description sheets; no heuristic name-to-metric guessing.
FIELDS = [
    ("SCUGRAD", "financial_aid_undergraduate_cohort", "students", UNDERGRADUATE),
    ("SCUGFFN", "financial_aid_first_time_cohort", "students", FIRST_TIME),
    ("UAGRNTN", "undergraduate_grant_recipients", "students", UNDERGRADUATE),
    ("UAGRNTP", "undergraduate_grant_recipients_percent", "%", UNDERGRADUATE),
    ("UAGRNTA", "undergraduate_grant_average_award", "USD", UNDERGRADUATE),
    ("UPGRNTN", "undergraduate_pell_recipients", "students", UNDERGRADUATE),
    ("UPGRNTP", "undergraduate_pell_recipients_percent", "%", UNDERGRADUATE),
    ("UPGRNTA", "undergraduate_pell_average_award", "USD", UNDERGRADUATE),
    ("ANYAIDN", "first_time_any_aid_recipients", "students", FIRST_TIME),
    ("ANYAIDP", "first_time_any_aid_recipients_percent", "%", FIRST_TIME),
    ("AGRNT_N", "first_time_grant_recipients", "students", FIRST_TIME),
    ("AGRNT_P", "first_time_grant_recipients_percent", "%", FIRST_TIME),
    ("AGRNT_A", "first_time_grant_average_award", "USD", FIRST_TIME),
    ("PGRNT_N", "first_time_pell_recipients", "students", FIRST_TIME),
    ("PGRNT_P", "first_time_pell_recipients_percent", "%", FIRST_TIME),
    ("PGRNT_A", "first_time_pell_average_award", "USD", FIRST_TIME),
    ("IGRNT_N", "first_time_institutional_grant_recipients", "students", FIRST_TIME),
    ("IGRNT_P", "first_time_institutional_grant_recipients_percent", "%", FIRST_TIME),
    ("IGRNT_A", "first_time_institutional_grant_average_award", "USD", FIRST_TIME),
]


def verified_archive(filename, expected_url):
    path = RAW / filename
    metadata = json.loads(path.with_name(filename + ".meta.json").read_text())
    if metadata.get("url") != expected_url or not metadata.get("retrieved_at"):
        raise ValueError("Missing original official source/retrieval receipt: " + filename)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != metadata.get("sha256") or path.stat().st_size != metadata.get("bytes"):
        raise ValueError("Archive does not match its original receipt: " + filename)
    return path, {
        "url": expected_url,
        "retrieved_at": metadata["retrieved_at"],
        "sha256": digest,
        "bytes": path.stat().st_size,
    }


def read_dictionary(path):
    with zipfile.ZipFile(path) as outer:
        members = [name for name in outer.namelist() if name.lower().endswith(".xlsx")]
        if members != ["sfa2324.xlsx"]:
            raise ValueError("Unexpected official dictionary archive layout")
        with zipfile.ZipFile(io.BytesIO(outer.read(members[0]))) as workbook:
            strings = ["".join(item.itertext()) for item in ET.fromstring(workbook.read("xl/sharedStrings.xml")).findall("m:si", NS)]

            def rows(sheet):
                xml = ET.fromstring(workbook.read("xl/worksheets/sheet" + str(sheet) + ".xml"))
                for row in xml.findall(".//m:row", NS):
                    values = {}
                    for cell in row.findall("m:c", NS):
                        value = cell.find("m:v", NS)
                        value = value.text if value is not None else ""
                        column = re.sub(r"[0-9]", "", cell.attrib["r"])
                        values[column] = strings[int(value)] if cell.attrib.get("t") == "s" and value else value
                    yield values

            intro = list(rows(1))
            descriptions = {r["B"]: r.get("C", "").replace("_x000D_", "").strip() for r in rows(3) if r.get("B")}
            variables = {r["B"]: r for r in rows(2) if r.get("B") and r["B"] != "varName"}
            flags = {r["A"]: r.get("B", "") for r in rows(5) if r.get("A") and r["A"] != "CodeValue"}
            if flags.get("R") != "Reported" or flags.get("Z") != "Implied zero":
                raise ValueError("Release reporting-flag meanings changed")
            if not any("2023-24" in r.get("A", "") for r in intro):
                raise ValueError("Wrong financial-aid dictionary year")
            if not any("average net price" in r.get("B", "").lower() and "new IPEDS Cost Survey" in r.get("B", "") for r in intro):
                raise ValueError("Expected net-price scope note is missing")
            mapping = {}
            for field, metric, unit, cohort in FIELDS:
                variable = variables.get(field)
                if not variable or variable.get("F") != "X" + field or not descriptions.get(field):
                    raise ValueError("Dictionary does not validate mapped column " + field)
                mapping[field] = {
                    "metric": metric,
                    "unit": unit,
                    "cohort": cohort,
                    "imputation_variable": variable["F"],
                    "dictionary_title": variable["G"],
                    "dictionary_description": descriptions[field],
                }
            return mapping, flags


def normalize_number(row, field, mapping, exclusions):
    flag = row.get(mapping["imputation_variable"], "").strip()
    if flag not in ("R", "Z"):
        exclusions["reporting_flag_" + (flag or "empty")] += 1
        return None
    try:
        value = float(row[field].strip())
    except (KeyError, ValueError, AttributeError):
        exclusions["non_numeric"] += 1
        return None
    if not math.isfinite(value) or value < 0:
        exclusions["missing_or_suppressed_numeric"] += 1
        return None
    if flag == "Z" and value != 0:
        raise ValueError("Implied-zero flag with nonzero figure: " + row["UNITID"] + "/" + field)
    if mapping["unit"] == "%" and value > 100:
        exclusions["percentage_out_of_range"] += 1
        return None
    if not value.is_integer():
        # These dictionary fields have integer counts, whole percentages, or USD
        # average amounts. Preserve that release formatting rather than rounding.
        raise ValueError("Unexpected noninteger figure: " + row["UNITID"] + "/" + field)
    return {"value": int(value), "flag": flag}


def map_existing_unitids(catalogue):
    """Return only unique US identities; retain every ambiguity for review."""
    by_unitid = collections.defaultdict(list)
    for university in catalogue:
        if university.get("country_code") == "US" and str(university.get("unitid", "")).isdigit():
            by_unitid[str(university["unitid"])].append(university)
    ambiguous = [
        {"unitid": unitid, "reason": "multiple_existing_canonical_candidates", "candidates": [{"id": u["id"], "name": u["name"], "website": u["website"]} for u in universities]}
        for unitid, universities in sorted(by_unitid.items()) if len(universities) != 1
    ]
    identities = {unitid: rows[0] for unitid, rows in by_unitid.items() if len(rows) == 1}
    return identities, ambiguous, by_unitid


def build_receipt(reviewed_at):
    data_path, source = verified_archive("SFA2324.zip", SOURCE_URL)
    dictionary_path, dictionary = verified_archive("SFA2324_Dict.zip", DICTIONARY_URL)
    mapping, flags = read_dictionary(dictionary_path)
    catalogue_path = ROOT / "data/published/global-directory.json"
    catalogue = json.loads(catalogue_path.read_text())
    identities, ambiguous, by_unitid = map_existing_unitids(catalogue)
    records = []
    exclusions = collections.Counter()
    observations = 0
    seen = set()
    source_rows = 0
    with zipfile.ZipFile(data_path) as archive:
        if archive.namelist() != ["sfa2324.csv"]:
            raise ValueError("Unexpected official data archive layout")
        reader = csv.DictReader(io.TextIOWrapper(archive.open("sfa2324.csv"), encoding="utf-8-sig"))
        required = {"UNITID"} | set(mapping) | {m["imputation_variable"] for m in mapping.values()}
        if not required.issubset(set(reader.fieldnames or [])):
            raise ValueError("Official CSV does not contain the dictionary columns")
        for row in reader:
            source_rows += 1
            unitid = row["UNITID"].strip()
            if unitid in seen:
                raise ValueError("Duplicate source UNITID " + unitid)
            seen.add(unitid)
            university = identities.get(unitid)
            if not university:
                exclusions["ambiguous_unitid" if unitid in by_unitid else "no_existing_unitid_identity"] += 1
                continue
            values = {}
            for field, field_mapping in mapping.items():
                value = normalize_number(row, field, field_mapping, exclusions)
                if value is not None:
                    values[field] = value
            if not values:
                exclusions["no_publishable_selected_fields"] += 1
                continue
            records.append({"university_id": university["id"], "unitid": unitid, "name": university["name"], "values": values})
            observations += len(values)
    records.sort(key=lambda row: int(row["unitid"]))
    return {
        "schema_version": 1,
        "status": "reviewed_staging_receipt",
        "reviewed_at": reviewed_at,
        "source": {**source, "name": "NCES IPEDS Student Financial Aid 2023–24", "organization": "National Center for Education Statistics", "source_type": "government", "release": "SFA2324 provisional release, as identified in the cached dictionary", "reporting_year": 2024, "period": PERIOD, "license_note": "Public-use institution-level NCES IPEDS survey data, offered by NCES for research and analysis; citation and source definitions retained.", "reuse_evidence_url": "https://nces.ed.gov/ipeds/use-the-data"},
        "dictionary": dictionary,
        "identity_basis": {"file": "data/published/global-directory.json", "sha256": hashlib.sha256(catalogue_path.read_bytes()).hexdigest(), "join": "Exact existing unique UNITID within country US; ambiguous mappings excluded; no profile IDs changed"},
        "publication_rules": {
            "accepted_reporting_flags": {code: flags[code] for code in ("R", "Z")},
            "excluded_reporting_flags": {code: label for code, label in flags.items() if code not in ("R", "Z")},
            "missing": "Missing, negative, suppressed, imputed/generated/corrected, invalid percent, and unmapped values are absent, never converted to zero",
            "dates": "The year 2024 identifies the end of the 2023–24 academic year; retrieval date is separate and is never substituted for observation year",
            "cohorts": "Standard-term institutions use the October 15/official fall cohort; program reporters use the September 1–August 31 full-year cohort, as defined by this release's dictionary",
            "average_awards": "Published recipient averages, not promised awards or total cost; generic grant aid includes the sources named in each dictionary definition",
            "net_price": "Not present in SFA2324: its Introduction says average net price moved to the new IPEDS Cost Survey beginning in 2024; no net-price observations are created here",
            "deduplication_key": "source URL + UNITID + field + reporting year; integrate idempotently after checking for an existing source with this URL",
            "publication": "No database write or existing catalogue mutation is performed by this script",
        },
        "mappings": mapping,
        "counts": {"source_rows": source_rows, "unique_existing_unitids": len(identities), "ambiguous_existing_unitids": len(ambiguous), "universities_with_reported_aid": len(records), "observations": observations, "field_counts": {field: sum(field in r["values"] for r in records) for field in mapping}, "exclusions": dict(sorted(exclusions.items()))},
        "identity_review": ambiguous,
        "records": records,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "data/published/reviewed-ipeds-aid.json")
    parser.add_argument("--reviewed-at", default="2026-10-05", help="Actual dictionary/source mapping review date, distinct from original retrieval")
    args = parser.parse_args()
    if not re.fullmatch(r"20\d{2}-\d{2}-\d{2}", args.reviewed_at):
        raise ValueError("Invalid review date")
    receipt = build_receipt(args.reviewed_at)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("x", encoding="utf-8") as output:
        # Compact per-institution values avoid repeating dictionary prose for each
        # observation; the complete definitions are preserved once above.
        output.write(json.dumps(receipt, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"output": str(args.out.relative_to(ROOT)) if args.out.is_relative_to(ROOT) else str(args.out), "sha256": hashlib.sha256(args.out.read_bytes()).hexdigest(), **receipt["counts"]}, indent=2))


if __name__ == "__main__":
    main()
