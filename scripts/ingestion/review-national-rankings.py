#!/usr/bin/env python3
"""Reproduce two official, reuse-cleared national ranking snapshots.

Never rewrite existing rankings or guess an institution identity. HERD is a US
research-expenditure ranking, not an overall quality score. NIRF is only the
selection actually reproduced in the Ministry's attributed PIB release.
"""
import argparse
import collections
import csv
from decimal import Decimal, InvalidOperation
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import unicodedata
import uuid
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
NIRF_CATEGORIES = {"Overall", "Universities", "Colleges", "Research Institutions", "Innovation Institutions", "Open Universities", "Skill Universities", "State Public Universities", "SDGs Institutions", "Engineering", "Management", "Pharmacy", "Medical", "Dental", "Law", "Architecture and Planning", "Agriculture and Allied Sectors"}


def verified(raw, name):
    meta = json.loads((raw / "fetch-manifest.json").read_text())[name]
    path = raw / name
    if hashlib.sha256(path.read_bytes()).hexdigest() != meta["sha256"] or path.stat().st_size != meta["bytes"] or not meta.get("retrieved_at"):
        raise ValueError("Original snapshot receipt failed: " + name)
    return path, meta


def xlsx_rows(path):
    with zipfile.ZipFile(path) as archive:
        strings = ["".join(x.itertext()) for x in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS)]
        rows = []
        for row in ET.fromstring(archive.read("xl/worksheets/sheet1.xml")).findall(".//m:row", NS):
            values = {}
            for cell in row.findall("m:c", NS):
                value = cell.find("m:v", NS)
                value = value.text if value is not None else ""
                values[re.sub(r"[0-9]", "", cell.attrib["r"])] = strings[int(value)] if cell.attrib.get("t") == "s" and value else value
            rows.append(values)
        notes = " ".join(ET.fromstring(archive.read("xl/drawings/drawing1.xml")).itertext())
    if rows[3].get("B") != "Rank" or rows[4].get("I") != "2024.0" or rows[4].get("Q") != "2024.0" or rows[2].get("A") != "(Dollars in thousands)":
        raise ValueError("Official HERD rank/year/unit headers changed")
    return rows, notes


def exact_name(value):
    value = unicodedata.normalize("NFKD", value).casefold().replace("&", "and")
    for short, expanded in (("u", "university"), ("c", "college"), ("inst", "institute"), ("st", "saint")):
        value = re.sub(r"\b" + short + r"\.", expanded, value)
    # Articles/prepositions differ between the agency's short table labels
    # and full names. Campus, medical-center and other qualifiers remain.
    value = re.sub(r"\b(the|of|at|in)\b", "", value)
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def safe_herd_int(value):
    """Preserve integral source values; never truncate fractional data."""
    if value is None:
        return None
    s = str(value).strip().replace(",", "").replace("\xa0", "").strip()
    if not s or s in ("–", "—", "-", "N/A", "NA", "n/a", "NULL", "null", ""):
        return None
    try:
        number = Decimal(s)
        if not number.is_finite() or number < 0 or number != number.to_integral_value():
            raise ValueError("HERD integer field contains nonintegral/negative value")
        return int(number)
    except (InvalidOperation, TypeError):
        return None


def herd_microdata(raw):
    institutions = {}
    for filename in ("public-use-2024.zip", "public-use-2024-short.zip"):
        path, _ = verified(raw, filename)
        with zipfile.ZipFile(path) as archive:
            name = next(n for n in archive.namelist() if n.endswith(".csv"))
            for row in csv.DictReader(io.StringIO(archive.read(name).decode("utf-8-sig"))):
                if row["year"] != "2024":
                    raise ValueError("Wrong HERD public-use edition")
                # Some combined units have no NCSES/UNITID. The public-use
                # record's inst_id remains distinct; a blank ID must never
                # collapse unrelated institutions into one crosswalk entry.
                key = row["ncses_inst_id"] or "public-use:" + row["inst_id"]
                entry = institutions.setdefault(key, {"name": row["inst_name_long"], "unitid": row["ipeds_unitid"], "source_id": row["ncses_inst_id"] or None, "public_use_inst_id": row["inst_id"], "state": row["inst_state_code"], "total": None, "federal": None})
                if (entry["name"], entry["unitid"]) != (row["inst_name_long"], row["ipeds_unitid"]):
                    raise ValueError("HERD source identifier is ambiguous")
                if row["questionnaire_no"] == "01.g" and row["row"] == "Total":
                    entry["total"] = safe_herd_int(row["data"])
                if row["questionnaire_no"] == "01.a" and row["row"] == "Federal government":
                    entry["federal"] = safe_herd_int(row["data"])
    return institutions


def unique_unitids(catalogue):
    by_id = collections.defaultdict(list)
    for university in catalogue:
        if university.get("country_code") in ("US", "PR", "GU", "VI") and university.get("unitid"):
            by_id[str(university["unitid"])].append(university)
    return by_id


def aggregate_reporting_unit(raw_name, footnote):
    """A reporting unit must not inherit a constituent university's profile."""
    return bool(footnote or re.search(r"\band\b.*(?:medical center|health science center)", raw_name, re.I))


class PublishedRows(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.row_stack = []
        self.cell_stack = []
        self.rows = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        if tag == "tr":
            self.row_stack.append([])
        if tag in ("td", "th") and self.row_stack:
            cell = []
            self.row_stack[-1].append(cell)
            self.cell_stack.append(cell)

    def handle_data(self, data):
        if self.cell_stack and not self.skip:
            self.cell_stack[-1].append(data)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        if tag in ("td", "th") and self.cell_stack:
            self.cell_stack.pop()
        if tag == "tr" and self.row_stack:
            self.rows.append([" ".join("".join(c).split()) for c in self.row_stack.pop()])


def parse_nirf(html):
    parser = PublishedRows()
    parser.feed(html)
    category = None
    records = []
    seen = set()
    for cells in parser.rows:
        if len(cells) == 1 and cells[0] in NIRF_CATEGORIES:
            category = cells[0]
        elif category and len(cells) == 2 and cells[1].isdigit():
            rank = int(cells[1])
            if not 1 <= rank <= 10:
                raise ValueError("PIB selection extends beyond its announced top ten")
            key = (category, cells[0], rank)
            if key not in seen:
                seen.add(key)
                records.append({"category": category, "name": cells[0], "rank": rank})
    counts = collections.Counter(r["category"] for r in records)
    if set(counts) != NIRF_CATEGORIES or counts["Universities"] != 10 or counts["Overall"] != 10:
        raise ValueError("PIB category boundaries or coverage changed: " + str(counts))
    return records


def build_receipt(reviewed_at):
    catalogue = json.loads((ROOT / "data/published/global-directory.json").read_text())
    raw = ROOT / "data/raw/ncses-herd"
    path, table_meta = verified(raw, "table6.xlsx")
    licence_path, licence_meta = verified(raw, "licence.html")
    if "You may freely copy that material" not in licence_path.read_text():
        raise ValueError("NSF reuse policy not evidenced")
    rows, notes = xlsx_rows(path)
    microdata = herd_microdata(raw)
    by_values = collections.defaultdict(list)
    for institution in microdata.values():
        by_values[(institution["total"], institution["federal"])].append(institution)
    unitids = unique_unitids(catalogue)
    records = []
    skipped_invalid_numbers = 0
    for row in rows:
        if not re.fullmatch(r"[0-9]+\.0", row.get("B", "")):
            continue
        rank = safe_herd_int(row.get("B"))
        total = safe_herd_int(row.get("I"))
        federal = safe_herd_int(row.get("Q"))
        if rank is None or total is None or federal is None:
            skipped_invalid_numbers += 1
            continue
        raw_name = row["A"]
        # Lettered footnotes denote combined reporting units. Keep those rows
        # visible, but never attribute an aggregate to a constituent's profile.
        footnote = raw_name[-1] if re.search(r"[.][a-e]$", raw_name) else None
        if not footnote:
            footnote = next((letter for letter in "abcde" if raw_name.endswith(letter) and raw_name[:-1].endswith(("York", "Center", "Maryland", "Oklahoma"))), None)
        candidates = by_values.get((total, federal), [])
        # Two exact official numeric columns identify a candidate; the complete
        # expanded institution name must independently agree. No fuzzy matching.
        candidates = [c for c in candidates if exact_name(c["name"]) == exact_name(raw_name)]
        source = candidates[0] if len(candidates) == 1 else None
        aggregate = aggregate_reporting_unit(raw_name, footnote)
        country_code = source["state"] if source and source["state"] in ("PR", "GU", "VI") else "US"
        country = {"US": "United States", "PR": "Puerto Rico", "GU": "Guam", "VI": "U.S. Virgin Islands"}[country_code]
        targets = unitids.get(source["unitid"], []) if source and source["unitid"] and not aggregate else []
        university = targets[0] if len(targets) == 1 else None
        imputed = row.get("J") == "i"
        records.append({"id": str(uuid.uuid5(uuid.NAMESPACE_URL, "https://collegestat.app/ncses-herd/2024/" + raw_name)), "provider": "herd", "year": 2024, "category": "Total R&D expenditures", "country_code": country_code, "country": country, "name": raw_name, "rank": rank, "rank_label": str(rank), "total_rd_thousand_usd": total, "federal_rd_thousand_usd": federal, "imputed": imputed, "federal_imputed": row.get("R") == "i", "university_id": university["id"] if university else None, "ncses_inst_id": source["source_id"] if source else None, "public_use_inst_id": source["public_use_inst_id"] if source else None, "unitid": source["unitid"] if source else None, "identity_status": "exact_unitid" if university else "aggregate_reporting_unit" if aggregate else "needs_identity_review", "footnote": footnote, "source_row": {"name": raw_name, "rank": row["B"], "total_2024": row["I"], "total_2024_flag": row.get("J", ""), "federal_2024": row["Q"], "federal_2024_flag": row.get("R", "")}, "source_url": table_meta["url"]})
    if skipped_invalid_numbers:
        print(f"warning: skipped {skipped_invalid_numbers} HERD rows with blank/dash/N/A numeric fields")
    if len(records) + skipped_invalid_numbers != 925:
        raise ValueError("HERD Table 6 coverage changed")
    ties = collections.Counter(r["rank"] for r in records)
    for record in records:
        record["tied"] = ties[record["rank"]] > 1
        if record["tied"]:
            record["rank_label"] = "=" + str(record["rank"])
    nirf_raw = ROOT / "data/raw/nirf-pib"
    nirf_path, nirf_meta = verified(nirf_raw, "release.html")
    nirf_licence, nirf_licence_meta = verified(nirf_raw, "licence.html")
    if "reproduced free of charge" not in nirf_licence.read_text():
        raise ValueError("PIB accurate-attributed reuse policy not evidenced")
    nirf = parse_nirf(nirf_path.read_text())
    names = collections.defaultdict(list)
    for university in catalogue:
        if university.get("country_code") == "IN":
            for name in {university["name"], *(university.get("aliases") or [])}:
                names[exact_name(name)].append(university)
    for record in nirf:
        # Exact catalogue name/alias, with the release's comma-separated place
        # label removed. Ambiguous names or subsidiary colleges remain unlinked.
        key = exact_name(record["name"].split(",", 1)[0])
        targets = {u["id"]: u for u in names.get(key, [])}
        target = next(iter(targets.values())) if len(targets) == 1 else None
        record.update({"id": str(uuid.uuid5(uuid.NAMESPACE_URL, "https://collegestat.app/nirf/2025/" + record["category"] + "/" + record["name"])), "provider": "nirf", "year": 2025, "rank_label": str(record["rank"]), "country_code": "IN", "country": "India", "university_id": target["id"] if target else None, "identity_status": "exact_name_or_alias" if target else "needs_identity_review", "source_url": nirf_meta["url"]})
    receipt = {"schema_version": 2, "status": "reviewed_source_snapshot_private_publication_pending", "reviewed_at": reviewed_at, "method": "Published positions retained exactly; source scopes remain separate; no new composite rank", "identity_basis": {"file": "data/published/global-directory.json", "sha256": hashlib.sha256((ROOT / "data/published/global-directory.json").read_bytes()).hexdigest()}, "providers": [
        {"provider": "herd", "name": "NCSES HERD", "year": 2024, "scope": "US and outlying areas · total R&D expenditures", "complete": True, "licence": "Public domain · NSF web text/publication reuse policy", "licence_evidence": licence_meta, "source": table_meta, "crosswalk_sources": [verified(raw, n)[1] for n in ("public-use-2024.zip", "public-use-2024-short.zip")], "population": "925 eligible bachelor-or-higher nonprofit research institutions with at least $150,000 separately accounted R&D", "reporting_period": "Fiscal year ending 2024", "notes": notes, "identity_policy": "Exact normalized complete official name + exact total/federal numeric columns -> exact unique IPEDS UNITID; aggregate reporting units unlinked", "counts": {"positions": len(records), "profile_matches": sum(r["university_id"] is not None for r in records), "imputed_totals": sum(r["imputed"] for r in records)}, "records": records},
        {"provider": "nirf", "name": "NIRF India Rankings", "year": 2025, "scope": "India · Ministry's selected top 3/5/10 category results", "complete": False, "licence": "PIB accurate attributed reuse permission; third-party material excluded", "licence_evidence": nirf_licence_meta, "source": nirf_meta, "publication_date": "2025-09-04", "population": "Participating institutions in each named NIRF category", "reporting_period": "India Rankings 2025 edition", "notes": "Only Ministry-authored published ordinal positions in the PIB release are reused; no Scopus/Web of Science/patent data, photos, or full NIRF100 table is imported.", "counts": {"positions": len(nirf), "profile_matches": sum(r["university_id"] is not None for r in nirf), "categories": dict(sorted(collections.Counter(r["category"] for r in nirf).items()))}, "records": nirf}
    ]}
    for provider in receipt["providers"]:
        provider["publication_date"] = provider.get("publication_date", "2025-12-23")
        provider["permission_status"] = "permitted_for_attributed_source_facts"
        for index, record in enumerate(provider["records"]):
            record.update({
                "source_provider": provider["name"], "reporting_year": provider["year"],
                "publication_date": provider["publication_date"],
                "retrieved_at": provider["source"]["retrieved_at"], "last_verified_at": reviewed_at + "T00:00:00Z",
                "scope": provider["scope"], "population": provider["population"],
                "reporting_period": provider["reporting_period"],
                "verification_status": "verified", "publication_status": "review",
                "license_note": provider["licence"],
                "evidence": {"source_url": provider["source"]["url"], "source_sha256": provider["source"]["sha256"],
                    "source_retrieved_at": provider["source"]["retrieved_at"],
                    "permission_url": provider["licence_evidence"]["url"], "permission_sha256": provider["licence_evidence"]["sha256"],
                    "source_row_index": index, "raw_name": record["name"], "raw_rank": record["rank"],
                    "category": record["category"], "profile_identity_status": record["identity_status"],
                    "population": provider["population"], "scope": provider["scope"], "reporting_period": provider["reporting_period"],
                    "publication_date": provider["publication_date"], "reporting_year": provider["year"],
                    **({"source_row": record["source_row"], "imputed_total": record["imputed"], "reporting_unit_footnote": record["footnote"]} if provider["provider"] == "herd" else {})},
            })
        provider["counts"]["unlinked_positions"] = sum(r["university_id"] is None for r in provider["records"])
        provider["counts"]["unique_profile_matches"] = len({r["university_id"] for r in provider["records"] if r["university_id"]})
    receipt["counts"] = {"source_positions": sum(len(p["records"]) for p in receipt["providers"]),
        "profile_matches": sum(p["counts"]["profile_matches"] for p in receipt["providers"]),
        "new_universities_published": 0, "hosted_writes": 0}
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "data/published/reviewed-national-rankings.json")
    parser.add_argument("--reviewed-at", default="2026-10-09")
    args = parser.parse_args()
    receipt = build_receipt(args.reviewed_at)
    with args.output.open("x") as target:
        json.dump(receipt, target, ensure_ascii=False, indent=2)
        target.write("\n")
    print(json.dumps({p["provider"]: p["counts"] for p in receipt["providers"]}, indent=2))
