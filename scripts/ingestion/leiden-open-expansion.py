#!/usr/bin/env python3
"""Stage the cached CC0 Leiden 2025 indicator snapshot by exact, unique ROR.

No overall quality rank is created. No catalogue, old observation, or database is
changed. Existing publication figures deduplicate by the pilot's stable key.
Output is exclusively created; an existing reviewed receipt is never overwritten.
"""
import argparse
import collections
import hashlib
from html.parser import HTMLParser
import json
import math
from pathlib import Path
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/raw/leiden"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
COHORT = "2020–2023 publications; citations observed through end 2024"
PERIOD = "2020–2023"
METRICS = {
    "p": {"metric": "publications_fractional_core", "label": "Core publications · P", "unit": "publications"},
    "p_top_5": {"metric": "top_5_percent_publications_fractional_core", "label": "Publications among the most cited 5% · P(top 5%)", "unit": "publications"},
    "pp_top_5": {"metric": "top_5_percent_publications_share_fractional_core", "label": "Share among the most cited 5% · PP(top 5%)", "unit": "%"},
}


def verified_file(filename):
    path = RAW / filename
    meta = json.loads(path.with_name(filename + ".meta.json").read_text())
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != meta.get("sha256") or path.stat().st_size != meta.get("bytes") or not meta.get("retrieved_at"):
        raise ValueError("Cached Leiden evidence failed its original receipt: " + filename)
    return path, {"url": meta["url"], "sha256": digest, "bytes": path.stat().st_size, "retrieved_at": meta["retrieved_at"], **({"request_body": meta["request_body"]} if meta.get("request_body") else {})}


def university_crosswalk(path):
    with zipfile.ZipFile(path) as archive:
        strings = ["".join(item.itertext()) for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS)]
        rows = []
        for element in ET.fromstring(archive.read("xl/worksheets/sheet1.xml")).findall(".//m:row", NS):
            values = {}
            for cell in element.findall("m:c", NS):
                value = cell.find("m:v", NS)
                value = value.text if value is not None else ""
                values[re.sub(r"[0-9]", "", cell.attrib["r"])] = strings[int(value)] if cell.attrib.get("t") == "s" and value else value
            rows.append(values)
        if [rows[0].get(column) for column in ("A", "B", "C")] != ["University", "ROR ID", "Country"]:
            raise ValueError("Leiden identifier crosswalk headers changed")
        by_name = collections.defaultdict(list)
        for row in rows[1:]:
            if row.get("A"):
                by_name[row["A"]].append({"ror": row.get("B", "").removeprefix("https://ror.org/"), "country": row.get("C", "")})
        return dict(by_name)


class IndicatorTableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.headers = []
        self.row = None
        self.cell = None
        self.rows = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "th":
            self.headers.append({"id": attrs.get("id"), "definition": attrs.get("data-tooltip")})
        if tag == "tr":
            self.row = {"source_record_id": None, "name": None, "country_code": None, "cells": []}
        if tag == "td" and self.row is not None:
            self.cell = []
            self.row["cells"].append(self.cell)
            if "university" in attrs.get("class", "").split():
                self.row["source_record_id"] = attrs.get("id")
        if tag == "span" and self.row and self.row["source_record_id"] and not self.row["name"] and attrs.get("data-tooltip"):
            self.row["name"] = attrs["data-tooltip"]
        if tag == "img" and self.row and attrs.get("src", "").startswith("/content/images/flags/"):
            code = attrs["src"].rsplit("/", 1)[-1].split(".", 1)[0]
            if re.fullmatch(r"[A-Z]{2}", code):
                self.row["country_code"] = code

    def handle_data(self, text):
        if self.cell is not None:
            self.cell.append(text)

    def handle_endtag(self, tag):
        if tag == "td":
            self.cell = None
        if tag == "tr" and self.row:
            if self.row["source_record_id"]:
                self.row["cells"] = ["".join(text).strip() for text in self.row["cells"]]
                self.rows.append(self.row)
            self.row = None


def parse_number(raw, field):
    if raw is None:
        return None
    s = str(raw).strip().replace("\xa0", " ").strip()
    if not s or s in ("–", "—", "-", "N/A", "NA", "n/a", "N/a", "NULL", "null", ""):
        return None
    is_percent = s.endswith("%")
    if is_percent != (METRICS[field]["unit"] == "%"):
        raise ValueError("Indicator unit does not match the official header: " + field)
    try:
        value = float(s.replace(",", "").removesuffix("%").strip())
    except (ValueError, AttributeError):
        return None
    if not math.isfinite(value) or value < 0 or (is_percent and value > 100):
        raise ValueError("Invalid Leiden indicator value")
    return int(value) if value.is_integer() else value


def observation_id(source_record_id, metric):
    # Same namespace/key as the established pilot; correct P figures deduplicate.
    key = f"leiden:{source_record_id}:{metric}:2025:{PERIOD}:{COHORT}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "https://collegestat.app/import/" + key))


def map_existing_rors(catalogue):
    mapped = collections.defaultdict(list)
    for university in catalogue:
        rid = str(university.get("ror", "")).removeprefix("https://ror.org/")
        if re.fullmatch(r"0[a-z0-9]{8}", rid):
            mapped[rid].append(university)
    return mapped


def reviewed_header_columns(headers):
    # The official response repeats its six-column header every 25 rows.
    # Validate every repeat; column indices always refer to a single row.
    if not headers or len(headers) % 6:
        raise ValueError("Unexpected Leiden header structure")
    first = headers[:6]
    if any(headers[offset:offset + 6] != first for offset in range(0, len(headers), 6)):
        raise ValueError("Leiden header meaning changes within the snapshot")
    columns = {header["id"]: index for index, header in enumerate(first) if header["id"] in METRICS}
    if set(columns) != set(METRICS):
        raise ValueError("The official table is not the reviewed P/top-5% snapshot")
    return columns


def build_receipt(reviewed_at):
    cross_path, cross_meta = verified_file("Universities.xlsx")
    table_path, table_meta = verified_file("indicators-2025.html")
    license_path, license_meta = verified_file("record-17473224.json")
    license_record = json.loads(license_path.read_text())
    if license_record["metadata"].get("license", {}).get("id") != "cc-zero" or license_record["metadata"].get("access_right") != "open":
        raise ValueError("Leiden release is not confirmed open CC0")
    cross_release = next(file for file in license_record["files"] if file["key"] == "CWTS Leiden Ranking Open Edition 2025 - Universities.xlsx")
    if cross_release["checksum"] != "md5:" + hashlib.md5(cross_path.read_bytes()).hexdigest():
        raise ValueError("Cached ROR crosswalk differs from the CC0 release")
    request = table_meta.get("request_body", {})
    if any(request.get(key) != value for key, value in {"field_id": 0, "fractional_counting": "true", "core_pubs_only": "true", "period_text": PERIOD, "order_by": "p"}.items()):
        raise ValueError("Cached indicator period/counting request differs")
    parser = IndicatorTableParser()
    parser.feed(table_path.read_text())
    field_columns = reviewed_header_columns(parser.headers)
    mappings = {field: {**METRICS[field], "definition": parser.headers[column]["definition"], "column_index": column} for field, column in field_columns.items()}
    if any(not mapping["definition"] for mapping in mappings.values()):
        raise ValueError("Official indicator definition is missing")
    catalogue_path = ROOT / "data/published/global-directory.json"
    by_ror = map_existing_rors(json.loads(catalogue_path.read_text()))
    crosswalk = university_crosswalk(cross_path)
    imported_path = ROOT / "data/published/imported.json"
    imported = json.loads(imported_path.read_text())
    # A reviewed expansion may already be integrated when this receipt is
    # reproduced. Deduplicate against the original pilot only, keeping the
    # staged receipt independent of whether its own append has run.
    pilot = {row["id"]: row for row in imported.get("records", []) if row.get("source") == "leiden" and row.get("evidence", {}).get("scope") != "Leiden Open Edition 2025 scientific impact"}
    records = []
    excluded = collections.Counter()
    review = []
    seen_source = set()
    seen_ror = set()
    deduplicated = 0
    new_observations = 0
    for row in parser.rows:
        source_id = row["source_record_id"]
        if source_id in seen_source:
            raise ValueError("Duplicate official Leiden institution ID " + source_id)
        seen_source.add(source_id)
        matches = crosswalk.get(row["name"], [])
        if len(matches) != 1 or not re.fullmatch(r"0[a-z0-9]{8}", matches[0].get("ror", "")):
            excluded["missing_or_ambiguous_official_ror_crosswalk"] += 1
            review.append({"source_record_id": source_id, "name": row["name"], "reason": "missing_or_ambiguous_official_ror_crosswalk"})
            continue
        rid = matches[0]["ror"]
        universities = by_ror.get(rid, [])
        if len(universities) != 1:
            excluded["missing_existing_ror_identity" if not universities else "multiple_existing_ror_identities"] += 1
            review.append({"source_record_id": source_id, "name": row["name"], "ror": rid, "reason": "missing_existing_ror_identity" if not universities else "multiple_existing_ror_identities"})
            continue
        university = universities[0]
        if university["country_code"] != row["country_code"]:
            excluded["ror_country_conflict"] += 1
            review.append({"source_record_id": source_id, "name": row["name"], "ror": rid, "reason": "ror_country_conflict"})
            continue
        if rid in seen_ror:
            raise ValueError("More than one Leiden institution mapped to the same ROR: " + rid)
        seen_ror.add(rid)
        values = {}
        invalid_value = None
        for field, column in field_columns.items():
            try:
                value = parse_number(row["cells"][column], field)
            except ValueError:
                value = None
                invalid_value = field
                break
            if value is None:
                invalid_value = field
                break
            stable_id = observation_id(source_id, mappings[field]["metric"])
            old = pilot.get(stable_id)
            already_published = bool(old and old.get("publication_status") == "published" and old.get("verification_status") == "verified")
            if already_published and (old.get("value") != value or old.get("university_id") != university["id"]):
                raise ValueError("An existing correct observation conflicts with the official snapshot")
            if already_published:
                deduplicated += 1
            else:
                new_observations += 1
            values[field] = {"id": stable_id, "value": value, "already_published": already_published}
        if invalid_value is not None:
            excluded["missing_or_invalid_indicator_value"] += 1
            review.append({"source_record_id": source_id, "name": row["name"], "ror": rid, "reason": "missing_or_invalid_indicator_value", "field": invalid_value, "raw": row["cells"][field_columns[invalid_value]] if field_columns.get(invalid_value) is not None and field_columns[invalid_value] < len(row["cells"]) else None})
            continue
        records.append({"university_id": university["id"], "name": row["name"], "ror": rid, "country_code": row["country_code"], "source_record_id": source_id, "source_url": "https://open.leidenranking.com/ranking/2025/university/" + source_id, "values": values})
    records.sort(key=lambda record: (-record["values"]["p"]["value"], int(record["source_record_id"])))
    incorrect = [row for row in pilot.values() if row.get("metric") in ("international_collaboration_publications", "international_collaboration_share") and row.get("raw_file", "").endswith("indicators-2025.html")]
    return {
        "schema_version": 1,
        "status": "reviewed_staging_receipt",
        "reviewed_at": reviewed_at,
        "source": {"name": "CWTS Leiden Ranking Open Edition 2025", "provider": "CWTS Leiden Open", "source_type": "ranking", "edition": 2025, "url": "https://doi.org/10.5281/zenodo.17473224", "license": "CC0-1.0", "license_url": "https://creativecommons.org/publicdomain/zero/1.0/", "license_evidence": {**license_meta, "metadata_license_id": "cc-zero", "metadata_access_right": "open"}},
        "evidence": {"indicators": table_meta, "identity_crosswalk": cross_meta, "definitions_url": "https://open.leidenranking.com/information/indicators"},
        "context": {"reporting_year": 2025, "publication_period": PERIOD, "citation_window_end": 2024, "cohort": COHORT, "field": "All sciences", "counting_method": "fractional", "core_publications_only": True, "minimum_publications_filter": request["number_of_publications"], "indicator_family": "Scientific impact", "position_rule": "Provider row order is an indicator sort, never an overall university quality rank; no numeric rank is created", "precision": "Values preserve the precision displayed by the cached official table"},
        "identity_basis": {"file": "data/published/global-directory.json", "sha256": hashlib.sha256(catalogue_path.read_bytes()).hexdigest(), "join": "Exact provider university name -> official CC0 ROR crosswalk -> unique existing ROR; source flag country must equal canonical country; no fuzzy matches"},
        "mappings": mappings,
        "counts": {"source_institutions": len(parser.rows), "matched_existing_universities": len(records), "indicator_values": len(records) * len(METRICS), "new_observations": new_observations, "already_published_correct_observations": deduplicated, "identity_review_items": len(review), "excluded": dict(sorted(excluded.items()))},
        "quality_repairs": {"incorrect_pilot_observation_ids": [row["id"] for row in incorrect], "problem": "The cached official headers are P/top-5% scientific impact. The earlier pilot incorrectly named P(top 5%) and PP(top 5%) as international collaboration. Preserve old records for history but hold them from verified public display; correct scientific-impact observations use separate stable metric IDs.", "official_header_ids": list(field_columns), "no_existing_record_mutation": True},
        "identity_review": review,
        "records": records,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "data/published/reviewed-leiden-expansion.json")
    parser.add_argument("--reviewed-at", default="2026-10-05")
    args = parser.parse_args()
    receipt = build_receipt(args.reviewed_at)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("x", encoding="utf-8") as output:
        output.write(json.dumps(receipt, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"output": str(args.out), "sha256": hashlib.sha256(args.out.read_bytes()).hexdigest(), **receipt["counts"], "incorrect_pilot_metrics_held_for_review": len(receipt["quality_repairs"]["incorrect_pilot_observation_ids"])}, indent=2))


if __name__ == "__main__":
    main()
