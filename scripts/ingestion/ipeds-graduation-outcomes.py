#!/usr/bin/env python3
"""Build a review-only GR2024 count receipt from checksum-verified official ZIPs.

No fetch, catalogue edit, database write, inferred rate or inferred cohort year.
Uses only the Python standard library. Output creation is exclusive by default;
use --out for reproduction. Compact source rows can be expanded into the existing
normalized source_records contract with iter_source_records(receipt).
"""
import argparse
import collections
import csv
import datetime
import hashlib
import io
import json
from pathlib import Path
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/raw/ipeds"
SOURCE_URL = "https://nces.ed.gov/ipeds/complete-data-files/GR2024.zip"
DICTIONARY_URL = "https://nces.ed.gov/ipeds/complete-data-files/GR2024_Dict.zip"
SOURCE_SHA = "7cd2cc6bf10920c4f2eded5e7f8887602f11e84abddba3aa5267334d6c69c205"
DICTIONARY_SHA = "6e43a858c330128541b7b54f94bdfa82dace1a657870cc6b6a4bfe0e4f2553eb"
PERIOD = "GR2024; graduation status as of August 31, 2024"
POPULATION = "Full-time, first-time degree/certificate-seeking undergraduates in the GR2024 cohort or selected subcohort"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
FIELDS = {"GRTOTLT": ("Grand total", "Grand total (men and women) in cohort"),
          "GRNRALT": ("U.S. Nonresident total", "U.S. Nonresident total")}
# GRTYPE is essential: the file has multiple rows per UNITID. All selector codes
# are fixed against this exact dictionary, never inferred from a column name.
TYPES = {
    "2": ("12", "1", "1", "999", "graduation_4yr_adjusted_cohort_count", "Adjusted cohort (revised cohort minus exclusions)"),
    "3": ("13", "1", "1", "999", "graduation_4yr_completers_150pct_count", "Completers within 150% of normal time"),
    "8": ("12", "2", "2", "50", "graduation_bachelor_seeking_adjusted_cohort_count", "Adjusted cohort (revised cohort minus exclusions)"),
    "9": ("13", "2", "2", "29A", "graduation_bachelor_seeking_any_completion_150pct_count", "Completers within 150% of normal time total"),
    "12": ("16", "2", "2", "18A", "graduation_bachelor_seeking_bachelor_completion_150pct_count", "Completers of bachelor's or equivalent degrees total (150% of normal time)"),
    "29": ("12", "4", "4", "50", "graduation_2yr_adjusted_cohort_count", "Adjusted cohort (revised cohort minus exclusions)"),
    "30": ("13", "4", "4", "29A", "graduation_2yr_completers_150pct_count", "Completers within 150% of normal time total"),
}
SELECTORS = ("GRTYPE", "CHRTSTAT", "SECTION", "COHORT", "LINE")
PAIRS = (("2", "3"), ("8", "9"), ("8", "12"), ("29", "30"))
EXPECTED_FLAGS = {
    "A": "Not applicable", "B": "Institution left item blank", "C": "Analyst corrected reported value",
    "D": "Do not know", "G": "Data generated from other data values", "H": "Value not derived - data not usable",
    "J": "Logical imputation", "K": "Ratio adjustment", "L": "Imputed using the Group Median procedure",
    "N": "Imputed using Nearest Neighbor procedure", "P": "Imputed using Carry Forward procedure",
    "R": "Reported", "Z": "Implied zero",
}


def verified_archive(filename, expected_url, expected_sha):
    path = RAW / filename
    metadata = json.loads(path.with_name(filename + ".meta.json").read_text())
    stamp = metadata.get("retrieved_at")
    try:
        parsed = datetime.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError("Missing original official retrieval receipt: " + filename) from exc
    if metadata.get("url") != expected_url or parsed.tzinfo is None or not re.match(r"^\d{4}-\d{2}-\d{2}T", stamp):
        raise ValueError("Missing original official source/retrieval receipt: " + filename)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != metadata.get("sha256") or digest != expected_sha or path.stat().st_size != metadata.get("bytes"):
        raise ValueError("Archive does not match its original receipt and pinned release: " + filename)
    return path, {"url": expected_url, "file": "data/raw/ipeds/" + filename,
                  "retrieved_at": stamp, "sha256": digest, "bytes": path.stat().st_size}


def read_dictionary(path):
    with zipfile.ZipFile(path) as outer:
        if outer.namelist() != ["gr2024.xlsx"]:
            raise ValueError("Unexpected official dictionary archive layout")
        with zipfile.ZipFile(io.BytesIO(outer.read("gr2024.xlsx"))) as book:
            sheet_names = [s.attrib["name"] for s in ET.fromstring(book.read("xl/workbook.xml")).findall("m:sheets/m:sheet", NS)]
            if sheet_names != ["Introduction", "Varlist", "Description", "Frequencies", "Statistics", "Imputation values"]:
                raise ValueError("Unexpected official dictionary workbook layout")
            strings = ["".join(item.itertext()) for item in ET.fromstring(book.read("xl/sharedStrings.xml")).findall("m:si", NS)]

            def rows(sheet):
                for row in ET.fromstring(book.read(f"xl/worksheets/sheet{sheet}.xml")).findall(".//m:row", NS):
                    values = {}
                    for cell in row.findall("m:c", NS):
                        value = cell.find("m:v", NS)
                        value = value.text if value is not None else ""
                        values[re.sub(r"[0-9]", "", cell.attrib["r"])] = strings[int(value)] if cell.attrib.get("t") == "s" and value else value
                    yield values

            intro = list(rows(1))
            variables = {r["B"]: r for r in rows(2) if r.get("B") and r["B"] != "varName"}
            descriptions = {r["B"]: r.get("C", "") for r in rows(3) if r.get("B")}
            codes = collections.defaultdict(dict)
            for row in rows(4):
                if row.get("A") in SELECTORS:
                    code = row["C"].strip()
                    if code in codes[row["A"]]:
                        raise ValueError("Duplicate dictionary code")
                    # Keep the original whitespace-bearing code as evidence too.
                    codes[row["A"]][code] = {"raw_code": row["C"], "label": row["H"]}
            flags = {r["A"]: r.get("B", "") for r in rows(6) if r.get("A") and r["A"] != "CodeValue"}
            if flags != EXPECTED_FLAGS:
                raise ValueError("Release reporting-flag meanings changed")
            title = intro[0]["A"]
            overview = next(r["B"] for r in intro if r.get("A") == "Overview")
            if not title.endswith(":  2024") or "(Provisional release)" not in {r.get("A") for r in intro}:
                raise ValueError("Wrong graduation dictionary release")
            if "August 31, 2024" not in overview or "full-time, first-time degree/certificate-seeking undergraduates" not in overview:
                raise ValueError("Graduation status/population contract changed")
            if "2017 (4-year)" not in title or "2020 (2-year)" not in title or "enrolled in 2018" not in overview or "enrolled in 2021" not in overview:
                raise ValueError("Cohort-year conflict contract changed; review the dictionary")
            fields = {}
            for field, (label, description_start) in FIELDS.items():
                variable = variables.get(field, {})
                if variable.get("G") != label or variable.get("F") != "X" + field or variable.get("C") != "N" or not descriptions.get(field, "").startswith(description_start):
                    raise ValueError("Dictionary does not validate mapped column " + field)
                fields[field] = {"unit": "students", "imputation_variable": variable["F"], "dictionary_title": variable["G"],
                                 "dictionary_description": descriptions[field], "dictionary_description_text": descriptions[field].replace("_x000D_", "")}
            types = {}
            for code, (status, section, cohort, line, metric, label) in TYPES.items():
                if codes["GRTYPE"].get(code, {}).get("label") != label:
                    raise ValueError("Dictionary GRTYPE meaning changed: " + code)
                if any(value not in codes[field] for field, value in zip(SELECTORS[1:], (status, section, cohort, line))):
                    raise ValueError("Missing dictionary cohort selector")
                expected_year = "2018" if cohort in ("1", "2") else "2021"
                if expected_year not in codes["COHORT"][cohort]["label"] or expected_year not in codes["SECTION"][section]["label"]:
                    raise ValueError("Dictionary cohort label changed")
                types[code] = {"metric": metric, "selectors": dict(zip(SELECTORS, (code, status, section, cohort, line))),
                               "dictionary_label": label, "dictionary_description": descriptions["GRTYPE"],
                               "cohort_label": codes["COHORT"][cohort]["label"], "entry_cohort_year": None,
                               "source_generated_row": line == "999"}
            return {"fields": fields, "types": types, "codes": dict(codes), "reporting_flags": flags,
                    "introduction_title": title, "introduction_overview": overview,
                    "release": "Provisional release", "survey_year": 2024, "reporting_year": 2024,
                    "population": POPULATION, "entry_cohort_year": None,
                    "cohort_year_issue": "Introduction title says 2017/2020; Overview and COHORT/SECTION labels say 2018/2021. Exact evidence retained; normalized entry cohort year unresolved."}


def map_existing_unitids(catalogue):
    by_unitid = collections.defaultdict(list)
    missing = []
    for university in catalogue:
        if university.get("country_code") != "US":
            continue
        value = university.get("unitid")
        # Exact six-digit UNITID: do not strip, coerce floats, infer from names or
        # borrow a UNITID from a parent, sibling, foreign, or branch profile.
        if type(value) is int:
            value = str(value)
        if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]{5}", value):
            missing.append({"university_id": university["id"], "name": university["name"], "raw_unitid": university.get("unitid"), "reason": "missing_or_invalid_exact_us_unitid"})
            continue
        by_unitid[value].append(university)
    ambiguous = [{"unitid": unitid, "reason": "multiple_existing_us_canonical_candidates",
                  "candidates": [{"id": u["id"], "name": u["name"], "website": u.get("website")} for u in sorted(group, key=lambda u: u["id"])]}
                 for unitid, group in sorted(by_unitid.items()) if len(group) != 1]
    unique = {unitid: group[0] for unitid, group in by_unitid.items() if len(group) == 1}
    return unique, ambiguous, by_unitid, sorted(missing, key=lambda row: row["university_id"])


def normalize_count(raw_value, flag):
    """Return a count plus a distinct hold reason; never fill absent data with 0."""
    if flag not in EXPECTED_FLAGS:
        return None, "unknown_or_empty_reporting_flag"
    if flag in ("C", "G", "J", "K", "L", "N", "P"):
        return None, "imputation_generation_or_correction"
    if flag == "A":
        return None, "not_applicable"
    if flag not in ("R", "Z"):
        return None, "blank_or_unusable_reporting_flag"
    value = raw_value.strip() if isinstance(raw_value, str) else ""
    if not value or value in ("NA", "N/A", "NULL"):
        return None, "missing_numeric"
    if value == "PrivacySuppressed" or re.fullmatch(r"-\d+(?:\.\d+)?", value):
        return None, "suppressed_or_negative_numeric"
    if not re.fullmatch(r"\d+", value):
        return None, "invalid_noninteger_numeric"
    number = int(value)
    if flag == "Z" and number != 0:
        return None, "implied_zero_conflict"
    return number, None


def observation_id(unitid, grtype, field, period=PERIOD):
    key = f"ipeds:{SOURCE_URL}:{unitid}:{grtype}:{field}:{period}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "https://collegestat.app/import/" + key))


def read_source_rows(path, contract):
    with zipfile.ZipFile(path) as archive:
        if archive.namelist() != ["gr2024.csv"]:
            raise ValueError("Unexpected official data archive layout")
        reader = csv.DictReader(io.TextIOWrapper(archive.open("gr2024.csv"), encoding="utf-8-sig"))
        required = {"UNITID", *SELECTORS, *FIELDS, *("X" + field for field in FIELDS)}
        if not required.issubset(set(reader.fieldnames or [])):
            raise ValueError("Official CSV does not contain the dictionary columns")
        seen = set()
        for row in reader:
            unitid = row["UNITID"].strip()
            grtype = row["GRTYPE"].strip()
            if not re.fullmatch(r"[1-9][0-9]{5}", unitid):
                raise ValueError("Invalid source UNITID")
            if (unitid, grtype) in seen:
                raise ValueError("Duplicate source UNITID/GRTYPE: " + unitid + "/" + grtype)
            seen.add((unitid, grtype))
            if grtype in contract["types"]:
                actual = {field: row[field].strip() for field in SELECTORS}
                if actual != contract["types"][grtype]["selectors"]:
                    raise ValueError("Source cohort selector conflict: " + unitid + "/" + grtype)
            yield row


def compact_raw_row(row):
    return {"source_record_id": row["UNITID"].strip() + ":" + row["GRTYPE"].strip(),
            "unitid": row["UNITID"].strip(), "grtype": row["GRTYPE"].strip(),
            "raw_selectors": {key: row[key] for key in SELECTORS},
            "raw_values": {field: {"value": row[field], "flag": row["X" + field]} for field in FIELDS}}


def cohort_pair_gaps(rows):
    lookup = {(r["unitid"], r["grtype"]): r for r in rows}
    gaps = []
    for denominator, numerator in PAIRS:
        for (unitid, grtype), row in sorted(lookup.items()):
            if grtype != denominator:
                continue
            other = lookup.get((unitid, numerator))
            if other is None:
                gaps.append({"unitid": unitid, "denominator_grtype": denominator, "numerator_grtype": numerator,
                             "reason": "missing_source_completion_row_unknown_not_zero"})
            elif "values" in row:
                for field in FIELDS:
                    if field in row["values"] and field in other["values"] and other["values"][field]["value"] > row["values"][field]["value"]:
                        raise ValueError("Completion count exceeds matching adjusted cohort: " + unitid + "/" + field)
    return gaps


def build_receipt(reviewed_at):
    datetime.date.fromisoformat(reviewed_at)
    data_path, source = verified_archive("GR2024.zip", SOURCE_URL, SOURCE_SHA)
    dictionary_path, dictionary = verified_archive("GR2024_Dict.zip", DICTIONARY_URL, DICTIONARY_SHA)
    contract = read_dictionary(dictionary_path)
    catalogue_path = ROOT / "data/published/global-directory.json"
    catalogue_bytes = catalogue_path.read_bytes()
    catalogue = json.loads(catalogue_bytes)
    unique, ambiguous, by_unitid, missing = map_existing_unitids(catalogue)
    records, selected, identity_holds, value_holds = [], [], [], []
    source_rows, matched_rows = 0, 0
    source_unitids, observed_flags = set(), collections.Counter()
    for row in read_source_rows(data_path, contract):
        source_rows += 1
        unitid, grtype = row["UNITID"].strip(), row["GRTYPE"].strip()
        source_unitids.add(unitid)
        if grtype not in TYPES:
            continue
        raw = compact_raw_row(row)
        selected.append(raw)
        institution = unique.get(unitid)
        if institution is None:
            identity_holds.append({**raw, "reason": "ambiguous_existing_us_unitid" if unitid in by_unitid else "no_existing_exact_us_unitid_identity"})
            continue
        matched_rows += 1
        values = {}
        for field in FIELDS:
            flag = row["X" + field].strip()
            observed_flags[(field, flag)] += 1
            value, reason = normalize_count(row[field], flag)
            if reason:
                value_holds.append({"source_record_id": raw["source_record_id"], "university_id": institution["id"], "unitid": unitid,
                                    "grtype": grtype, "field": field, "raw_value": row[field], "raw_flag": row["X" + field],
                                    "flag_label": contract["reporting_flags"].get(flag), "reason": reason})
                continue
            metric = TYPES[grtype][4] + ("_us_nonresident" if field == "GRNRALT" else "")
            values[field] = {"id": observation_id(unitid, grtype, field), "metric": metric, "value": value,
                             "raw_value": row[field], "raw_flag": row["X" + field], "flag": flag,
                             "flag_label": contract["reporting_flags"][flag], "verification_status": "needs_review"}
        if values:
            type_contract = contract["types"][grtype]
            records.append({"university_id": institution["id"], "name": institution["name"], "unitid": unitid,
                            "source_record_id": raw["source_record_id"], "grtype": grtype,
                            "raw_selectors": raw["raw_selectors"], "cohort": type_contract["cohort_label"],
                            "source_generated_row": type_contract["source_generated_row"], "values": values})
    records.sort(key=lambda row: (int(row["unitid"]), int(row["grtype"])))
    identity_holds.sort(key=lambda row: (int(row["unitid"]), int(row["grtype"])))
    value_holds.sort(key=lambda row: (int(row["unitid"]), int(row["grtype"]), row["field"]))
    gaps = cohort_pair_gaps(selected)
    candidate_gaps = cohort_pair_gaps(records)
    field_counts = {grtype: {field: sum(row["grtype"] == grtype and field in row["values"] for row in records) for field in FIELDS} for grtype in TYPES}
    return {
        "schema_version": 1, "status": "review_only_receipt", "reviewed_at": reviewed_at,
        "verification_status": "needs_review", "last_verified_at": None,
        "source": {**source, "name": "NCES IPEDS Graduation Rates 2024", "organization": "National Center for Education Statistics",
                   "source_type": "government", "release": "GR2024 provisional release, as identified in the cached dictionary",
                   "survey_year": 2024, "reporting_year": 2024, "period": PERIOD, "population": POPULATION,
                   "license_note": "Official public-use institution-level IPEDS statistical data; source attribution and dictionary definitions retained. No publication approval asserted."},
        "dictionary": dictionary, "dictionary_contract": contract,
        "identity_basis": {"file": "data/published/global-directory.json", "sha256": hashlib.sha256(catalogue_bytes).hexdigest(),
                           "catalogue_rows": len(catalogue), "join": "Unique exact six-digit UNITID on US catalogue identities only; no campus name, website, parent or branch inference"},
        "publication_rules": {
            "staging_destination": "Existing source_records private pending queue; no new tables or schema",
            "verification": "Dictionary mapping review is not observation verification; every candidate remains needs_review with last_verified_at=null",
            "accepted_numeric_reporting_flags": {flag: contract["reporting_flags"][flag] for flag in ("R", "Z")},
            "source_generated_rows": "LINE=999 means Generated record not on original survey form even when numeric flag R is Reported; this evidence is retained",
            "missing": "Absent source rows, empty, suppressed, negative, invalid and held numeric values remain absent, never zero-filled",
            "cohort_year": contract["cohort_year_issue"],
            "dates": "Survey/reporting year 2024 and source status date are separate from original retrieval dates; no inferred entry cohort year",
            "nonresident": "GRNRALT is the U.S. Nonresident subgroup of this historical graduation cohort, not all international students or current enrollment",
            "completion": "Historical cohort completion is not current program availability; type 9 any completion differs from type 12 bachelor completion",
            "rates": "No rates derived or imported; counts are retained independently, and missing numerator is unknown",
            "id_key": "source URL + UNITID + GRTYPE + field + period (UUIDv5 under existing import namespace)",
            "writes": "This script writes only a new local receipt; no database connection, catalogue mutation or public observation publication",
        },
        "counts": {"source_rows": source_rows, "source_institutions": len(source_unitids), "selected_source_rows": len(selected),
                   "us_catalogue_rows": sum(u.get("country_code") == "US" for u in catalogue), "unique_existing_us_unitids": len(unique),
                   "ambiguous_existing_us_unitids": len(ambiguous), "us_catalogue_missing_or_invalid_unitid": len(missing),
                   "matched_selected_source_rows": matched_rows, "candidate_source_rows": len(records),
                   "universities_with_candidates": len({row["university_id"] for row in records}),
                   "candidate_observations": sum(len(row["values"]) for row in records), "field_counts_by_grtype": field_counts,
                   "matched_numeric_flags": {field: {flag: count for (f, flag), count in sorted(observed_flags.items()) if f == field} for field in FIELDS},
                   "held_identity_source_rows": dict(sorted(collections.Counter(row["reason"] for row in identity_holds).items())),
                   "held_numeric_values": dict(sorted(collections.Counter(row["reason"] for row in value_holds).items())),
                   "source_missing_completion_pairs": len(gaps), "candidate_missing_completion_pairs": len(candidate_gaps),
                   "candidate_generated_source_rows": sum(row["source_generated_row"] for row in records),
                   "derived_rates": 0, "publications": 0, "database_writes": 0},
        "identity_review": {"ambiguous_existing_unitids": ambiguous, "missing_or_invalid_us_catalogue_unitids": missing,
                            "held_source_rows": identity_holds},
        "numeric_review": value_holds,
        "cohort_pair_review": {"source_missing_completion_rows": gaps, "candidate_missing_completion_rows": candidate_gaps},
        "records": records,
    }


def iter_source_records(receipt):
    """Expand compact rows for the existing normalized/source_records review model."""
    source, dictionary, contract = receipt["source"], receipt["dictionary"], receipt["dictionary_contract"]
    for row in receipt["records"]:
        type_contract = contract["types"][row["grtype"]]
        for field, datum in row["values"].items():
            definition = contract["fields"][field]
            yield {"id": datum["id"], "university_id": row["university_id"], "source": "ipeds", "source_name": source["name"],
                   "source_record_id": row["source_record_id"], "source_url": source["url"], "release": source["release"],
                   "reporting_year": source["reporting_year"], "survey_year": source["survey_year"], "period": source["period"],
                   "cohort": row["cohort"], "retrieved_at": source["retrieved_at"], "last_verified_at": None,
                   "verification_status": "needs_review", "publication_status": "review", "status": "pending",
                   "license_note": source["license_note"], "raw_file": source["file"], "raw_field": field,
                   "metric": datum["metric"], "value": datum["value"], "unit": definition["unit"],
                   "notes": "Historical graduation cohort count; entry cohort year unresolved in official dictionary. No rate, enrollment, or current program claim.",
                   "evidence": {"unitid": row["unitid"], "source_record_id": row["source_record_id"], "raw_field": field,
                                "raw_value": datum["raw_value"], "reporting_flag": datum["flag"], "raw_reporting_flag": datum["raw_flag"],
                                "reporting_flag_label": datum["flag_label"], "raw_selectors": row["raw_selectors"],
                                "selector_labels": {key: contract["codes"][key][value.strip()]["label"] for key, value in row["raw_selectors"].items()},
                                "population": source["population"], "cohort_label": row["cohort"], "entry_cohort_year": None,
                                "cohort_year_issue": contract["cohort_year_issue"], "dictionary_title": definition["dictionary_title"],
                                "dictionary_description": definition["dictionary_description"], "grtype_label": type_contract["dictionary_label"],
                                "grtype_description": type_contract["dictionary_description"], "source_generated_row": row["source_generated_row"],
                                "dataset_sha256": source["sha256"], "dictionary_url": dictionary["url"], "dictionary_sha256": dictionary["sha256"],
                                "dictionary_retrieved_at": dictionary["retrieved_at"], "source_retrieved_at": source["retrieved_at"],
                                "survey_year": source["survey_year"], "reporting_year": source["reporting_year"], "period": source["period"],
                                "introduction_title": contract["introduction_title"], "introduction_overview": contract["introduction_overview"]}}


def write_receipt(receipt, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as output:
        output.write(json.dumps(receipt, ensure_ascii=False, separators=(",", ":")) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "data/published/reviewed-ipeds-graduation-outcomes.json")
    parser.add_argument("--reviewed-at", default="2026-10-09", help="Actual mapping review date; not a verification or retrieval date")
    args = parser.parse_args()
    receipt = build_receipt(args.reviewed_at)
    write_receipt(receipt, args.out)
    print(json.dumps({"output": str(args.out), "sha256": hashlib.sha256(args.out.read_bytes()).hexdigest(), **receipt["counts"]}, indent=2))


if __name__ == "__main__":
    main()
