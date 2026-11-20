#!/usr/bin/env python3
"""Reproducible review of university ownership tags — evening Oct 09.

Read-only over already-cached evidence. Writes only to
outputs/university-tags-evening-oct09/. No network, no hosted writes,
no crawling, no credential access (.env never read).

Scope (narrow, per owner request):
  - exact unique US UNITID matches between the installed catalogue
    (data/published/global-directory.json) and the cached official
    IPEDS HD2025 directory (data/raw/ipeds/HD2025.zip)
  - ownership derived ONLY from HD CONTROL validated against the cached
    official dictionary (data/raw/ipeds/HD2025_Dict.zip » hd2025.xlsx).
    ROR membership never implies public/private.
  - installed university_type compared; only truly new (installed missing)
    or correcting (installed differs) candidates are emitted with exact
    before/after values. Already-correct rows produce zero candidates.
  - ambiguous identities (duplicate UNITID groups), unsupported missing
    CONTROL values (-3/blank/unknown) and no-evidence rows (HD missing,
    non-US, US without UNITID) are held, never guessed.
  - media tags use ONLY already-attributed verified candidates:
    exact-domain official-logos.json, profile-enrichment Commons items
    with creator+licence+source_url, verified scholarship campus media,
    and campus-media-checks. No guessed logos, no favicons as logos,
    no borrowed parent marks, no unattributed thumbnails, no downloads.
  - never publishes automatically: every candidate is needs_review with
    writes none_until_reviewed and verified_at null (no invented date).

If the cached release lacks the dictionary or CONTROL evidence,
fail closed (no candidates guessed) and report the gap.

Existing architecture preserved: installed Public/Private vocabulary is
compared as-is. Dictionary verbatim labels (Private not-for-profit /
Private for-profit) are retained as additional_information evidence,
not as overwriting installs (a subtype split would need UI/filter work
owned by others redesigning landing/profiles/dashboard).
"""

from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import io
import json
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DEFAULT = ROOT / "outputs" / "university-tags-evening-oct09"

HD_ZIP_REL = "data/raw/ipeds/HD2025.zip"
HD_DICT_ZIP_REL = "data/raw/ipeds/HD2025_Dict.zip"
HD_URL = "https://nces.ed.gov/ipeds/complete-data-files/HD2025.zip"
HD_DICT_URL = "https://nces.ed.gov/ipeds/complete-data-files/HD2025_Dict.zip"

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


class DictionaryMissingError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path):
    return json.loads(path.read_text())


def hostname(site: str | None) -> str:
    try:
        if not site:
            return ""
        value = urllib.parse.urlparse(site)
        if value.scheme not in ("https", "http") or not value.hostname or value.username:
            return ""
        return value.hostname.lower().removeprefix("www.")
    except ValueError:
        return ""


def official_exact(host: str, domain: str) -> bool:
    """Exact hostname match only. Suffix alone never assigns a mark."""
    if not host or not domain:
        return False
    return host == domain.lower()


def _cell_text(cell: ET.Element, strings: list[str]) -> str | None:
    t = cell.get("t")
    v = cell.find("m:v", NS)
    if t == "s" and v is not None and v.text is not None:
        try:
            return strings[int(float(v.text.strip()))]
        except (ValueError, IndexError):
            return v.text
    if v is not None and v.text is not None:
        return v.text
    is_elem = cell.find("m:is", NS)
    if is_elem is not None:
        return "".join((n.text or "") for n in is_elem.findall(".//m:t", NS))
    return None


def _parse_sheet(xlsx: zipfile.ZipFile, name: str, strings: list[str]) -> list[list[str | None]]:
    root = ET.fromstring(xlsx.read(name))
    out: list[list[str | None]] = []
    for row in root.findall(".//m:row", NS):
        out.append([_cell_text(c, strings) for c in row.findall("m:c", NS)])
    return out


def load_control_dictionary(dict_zip_path: Path) -> tuple[dict, str]:
    """Return (mapping, description_excerpt) for CONTROL.

    mapping: code -> {label, frequency, percent}.
    Raises DictionaryMissingError when the cached release lacks evidence.
    """
    if not dict_zip_path.exists():
        raise DictionaryMissingError(f"dictionary archive missing: {dict_zip_path}")
    try:
        inner = zipfile.ZipFile(dict_zip_path).read("hd2025.xlsx")
    except KeyError as exc:
        raise DictionaryMissingError("hd2025.xlsx missing inside dictionary archive") from exc
    with zipfile.ZipFile(io.BytesIO(inner)) as xlsx:
        try:
            shared = ET.fromstring(xlsx.read("xl/sharedStrings.xml"))
        except KeyError as exc:
            raise DictionaryMissingError("sharedStrings.xml missing in dictionary workbook") from exc
        strings = ["".join((n.text or "") for n in si.findall(".//m:t", NS)) for si in shared.findall("m:si", NS)]
        try:
            freq = _parse_sheet(xlsx, "xl/worksheets/sheet4.xml", strings)
            desc = _parse_sheet(xlsx, "xl/worksheets/sheet3.xml", strings)
        except KeyError as exc:
            raise DictionaryMissingError("Frequencies/Description sheet missing") from exc
    mapping: dict[str, dict] = {}
    if not freq or [c for c in (freq[0] or []) if c] != ["VarName", "VarNumber", "TableName", "CodeValue", "valuelabel", "Frequency", "Percent"]:
        raise DictionaryMissingError("Frequencies header unexpected; refusing to guess")
    for row in freq[1:]:
        if not row or row[0] != "CONTROL":
            continue
        code = (row[3] or "").strip()
        label = (row[4] or "").strip()
        freq_raw = (row[5] or "").strip().replace(",", "")
        pct_raw = (row[6] or "").strip()
        try:
            frequency = int(freq_raw)
        except ValueError:
            frequency = None
        try:
            percent = float(pct_raw)
        except ValueError:
            percent = None
        if code:
            mapping[code] = {"label": label, "frequency": frequency, "percent": percent}
    excerpt = ""
    for row in desc[1:]:
        if len(row) > 2 and row[1] == "CONTROL" and row[2]:
            excerpt = str(row[2])
            break
    if "1" not in mapping or "2" not in mapping or "3" not in mapping:
        raise DictionaryMissingError("CONTROL codes 1/2/3 absent from cached dictionary; fail closed")
    # Validate expected labels verbatim from the official dictionary.
    if mapping["1"]["label"] != "Public":
        raise DictionaryMissingError(f"CONTROL 1 label unexpected: {mapping['1']['label']!r}")
    if mapping["2"]["label"] != "Private not-for-profit":
        raise DictionaryMissingError(f"CONTROL 2 label unexpected: {mapping['2']['label']!r}")
    if mapping["3"]["label"] != "Private for-profit":
        raise DictionaryMissingError(f"CONTROL 3 label unexpected: {mapping['3']['label']!r}")
    return mapping, excerpt


def map_control(code: str | None, mapping: dict) -> tuple[str | None, str | None]:
    """Map HD CONTROL to (installed-compatible coarse, dictionary verbatim detail).

    Returns (None, None) for unsupported/missing values (-3, blank, unknown).
    Never guesses; caller must hold such rows.
    """
    if code is None:
        return None, None
    key = str(code).strip()
    if key not in mapping:
        return None, None
    if key == "1":
        return "Public", mapping[key]["label"]
    if key in ("2", "3"):
        return "Private", mapping[key]["label"]
    return None, None


def load_hd_rows() -> tuple[dict[str, dict], dict]:
    hd_path = ROOT / HD_ZIP_REL
    meta_path = hd_path.with_name(hd_path.name + ".meta.json")
    if not hd_path.exists():
        raise FileNotFoundError(f"cached HD archive missing: {hd_path}")
    meta = load_json(meta_path) if meta_path.exists() else {}
    with zipfile.ZipFile(hd_path) as z:
        name = next((n for n in z.namelist() if n.lower().endswith(".csv")), z.namelist()[0])
        rows = list(csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig", errors="replace")))
    by_unit = {str(r["UNITID"]).strip(): r for r in rows if str(r.get("UNITID", "")).strip()}
    provenance = {
        "hd_source_url": meta.get("url", HD_URL),
        "hd_retrieved_at": meta.get("retrieved_at"),
        "hd_archive_sha256": meta.get("sha256", sha256_file(hd_path)),
        "hd_archive_bytes": hd_path.stat().st_size,
        "hd_csv_name": name,
        "hd_row_count": len(rows),
    }
    return by_unit, provenance


def load_dict_provenance(mapping: dict, excerpt: str) -> dict:
    dict_path = ROOT / HD_DICT_ZIP_REL
    meta_path = dict_path.with_name(dict_path.name + ".meta.json")
    meta = load_json(meta_path) if meta_path.exists() else {}
    return {
        "dictionary_source_url": meta.get("url", HD_DICT_URL),
        "dictionary_retrieved_at": meta.get("retrieved_at"),
        "dictionary_archive_sha256": meta.get("sha256", sha256_file(dict_path)),
        "dictionary_archive_bytes": dict_path.stat().st_size,
        "dictionary_workbook": "hd2025.xlsx",
        "control_mapping": {k: dict(v) for k, v in sorted(mapping.items())},
        "control_description_excerpt": excerpt[:2000],
    }


def build_review() -> tuple[dict, dict]:
    catalogue = load_json(ROOT / "data/published/global-directory.json")
    official_logos = load_json(ROOT / "data/published/official-logos.json")
    enrichment = load_json(ROOT / "data/published/profile-enrichment.json")
    scholarship = load_json(ROOT / "data/published/reviewed-scholarship-campus-media.json")
    campus_checks = load_json(ROOT / "data/published/campus-media-checks.json")
    image_cache = load_json(ROOT / "data/published/institution-image-cache.json")

    mapping, excerpt = load_control_dictionary(ROOT / HD_DICT_ZIP_REL)
    hd_by_unit, hd_prov = load_hd_rows()
    dict_prov = load_dict_provenance(mapping, excerpt)

    inputs: dict[str, str] = {}
    for rel in [
        "data/published/global-directory.json",
        "data/published/directory-manifest.json",
        "data/published/official-logos.json",
        "data/published/profile-enrichment.json",
        "data/published/reviewed-scholarship-campus-media.json",
        "data/published/campus-media-checks.json",
        "data/published/institution-image-cache.json",
        HD_ZIP_REL,
        HD_DICT_ZIP_REL,
    ]:
        inputs[rel] = sha256_file(ROOT / rel)

    by_id = {c["id"]: c for c in catalogue}
    unit_groups: dict[str, list[dict]] = collections.defaultdict(list)
    for c in catalogue:
        if c.get("unitid"):
            unit_groups[str(c["unitid"])].append(c)
    duplicate_unitids = sorted(k for k, v in unit_groups.items() if len(v) > 1)
    duplicate_row_ids = {c["id"] for k in duplicate_unitids for c in unit_groups[k]}

    official_by_domain = {str(e.get("domain", "")).lower(): e for e in official_logos}
    scholarship_by_id = {r["university_id"]: r for r in scholarship.get("records", []) if r.get("university_id")}
    campus_check_by_id = {r["university_id"]: r for r in campus_checks if r.get("university_id")}

    candidates: list[dict] = []
    held_duplicate = 0
    held_missing_hd = 0
    held_unsupported_control = 0
    held_non_us = 0
    held_us_without_unitid = 0
    evaluated = 0
    already_correct = 0
    new_count = 0
    correcting_count = 0

    control_counter: collections.Counter = collections.Counter()
    installed_counter: collections.Counter = collections.Counter()

    for c in sorted(catalogue, key=lambda x: x["id"]):
        uid = c.get("unitid")
        country = c.get("country_code")
        if country != "US":
            held_non_us += 1
            continue
        if not uid:
            held_us_without_unitid += 1
            continue
        key = str(uid).strip()
        if key in set(duplicate_unitids):
            held_duplicate += 1
            continue
        hd = hd_by_unit.get(key)
        if hd is None:
            held_missing_hd += 1
            continue
        coarse, detail = map_control(hd.get("CONTROL"), mapping)
        if coarse is None:
            held_unsupported_control += 1
            continue
        evaluated += 1
        control_counter[str(hd.get("CONTROL")).strip()] += 1
        installed = c.get("university_type")
        installed_counter[str(installed)] += 1
        if installed == coarse:
            already_correct += 1
            continue
        kind = "new_ownership" if not installed else "correct_ownership"
        if kind == "new_ownership":
            new_count += 1
        else:
            correcting_count += 1

        # Media: only already-attributed verified evidence for this exact UUID.
        host = hostname(c.get("website"))
        official_entry = official_by_domain.get(host) if host else None
        official_evidence = None
        if official_entry and official_exact(host, str(official_entry.get("domain", ""))):
            official_evidence = {
                "domain": official_entry.get("domain"),
                "local": official_entry.get("local"),
                "source": official_entry.get("source"),
                "download_url": official_entry.get("download_url"),
                "checked_at": official_entry.get("checked_at"),
                "sha256": official_entry.get("sha256"),
            }
        wikimedia_items: list[dict] = []
        for m in enrichment.get(c["id"], {}).get("media", []):
            if m.get("creator") and m.get("license") and m.get("source_url"):
                wikimedia_items.append({
                    "kind": m.get("kind"),
                    "source_url": m.get("source_url"),
                    "creator": m.get("creator"),
                    "license": m.get("license"),
                    "license_url": m.get("license_url"),
                })
        wikimedia_items.sort(key=lambda d: (str(d.get("kind")), str(d.get("source_url"))))
        scholarship_evidence = None
        sch = scholarship_by_id.get(c["id"])
        if sch and sch.get("verification_status") == "verified" and sch.get("reuse_permitted") and sch.get("creator") and sch.get("license"):
            scholarship_evidence = {
                "kind": sch.get("kind"),
                "source_url": sch.get("source_url"),
                "creator": sch.get("creator"),
                "license": sch.get("license"),
                "license_url": sch.get("license_url"),
                "source_record_id": sch.get("source_record_id"),
                "retrieved_at": sch.get("retrieved_at"),
            }
        campus_evidence = None
        chk = campus_check_by_id.get(c["id"])
        if chk and chk.get("creator") and chk.get("license") and chk.get("source_url"):
            campus_evidence = {
                "source_url": chk.get("source_url"),
                "creator": chk.get("creator"),
                "license": chk.get("license"),
                "license_url": chk.get("license_url"),
                "local": chk.get("local"),
                "checked_at": chk.get("checked_at"),
                "sha256": chk.get("sha256"),
            }
        has_verified = bool(official_evidence or wikimedia_items or scholarship_evidence or campus_evidence)
        candidates.append({
            "university_id": c["id"],
            "name": c.get("name"),
            "website": c.get("website"),
            "ror": c.get("ror"),
            "unitid": key,
            "kind": kind,
            "status": "needs_review",
            "writes": "none_until_reviewed",
            "installed_university_type": installed,
            "proposed_university_type": coarse,
            "before": installed,
            "after": coarse,
            "additional_information": {
                "control_code": str(hd.get("CONTROL")).strip(),
                "control_label": detail,
                "hd_instnm": hd.get("INSTNM"),
            },
            "evidence": {
                "hd_source_url": hd_prov["hd_source_url"],
                "hd_retrieved_at": hd_prov["hd_retrieved_at"],
                "hd_archive_sha256": hd_prov["hd_archive_sha256"],
                "dictionary_source_url": dict_prov["dictionary_source_url"],
                "dictionary_retrieved_at": dict_prov["dictionary_retrieved_at"],
                "dictionary_archive_sha256": dict_prov["dictionary_archive_sha256"],
                "dictionary_control": dict(mapping.get(str(hd.get("CONTROL")).strip(), {})),
                "catalogue_identity_source": c.get("identity_source"),
                "catalogue_identity_release": c.get("identity_release"),
                "catalogue_identity_retrieved_at": c.get("identity_retrieved_at"),
                # ROR retained as identity only; never type evidence.
                "ror_identity": c.get("ror"),
            },
            "media": {
                "status": "verified_available" if has_verified else "hold_no_verified_media",
                "official_logo": official_evidence,
                "wikimedia_attributed": wikimedia_items,
                "scholarship_campus": scholarship_evidence,
                "campus_check": campus_evidence,
                "note": ("Only exact-domain official marks and Commons items with "
                         "creator+licence+source_url are reported. Favicons, "
                         "suffix-borrowed marks and unattributed thumbnails are never used."),
            },
            "verification": {
                "verification_status": "needs_review",
                "verified_at": None,
            },
        })

    candidates.sort(key=lambda d: d["university_id"])

    # Media inventory over the evaluated already-correct set (informational; not installs).
    evaluated_ids = set()
    for c in catalogue:
        if c.get("country_code") != "US" or not c.get("unitid"):
            continue
        key = str(c.get("unitid")).strip()
        if key in set(duplicate_unitids):
            continue
        hd = hd_by_unit.get(key)
        if hd is None:
            continue
        coarse, _ = map_control(hd.get("CONTROL"), mapping)
        if coarse is None:
            continue
        evaluated_ids.add(c["id"])
    official_exact_ids = sorted(uid for uid in evaluated_ids if hostname(by_id[uid].get("website")) in official_by_domain)
    # Suffix collisions held (parent mark never borrowed).
    suffix_ids = sorted(
        uid for uid in evaluated_ids
        for dom in official_by_domain
        if hostname(by_id[uid].get("website")) and hostname(by_id[uid].get("website")).endswith("." + dom)
        and hostname(by_id[uid].get("website")) != dom
    )
    enrichment_logo_ids = sorted(
        uid for uid in evaluated_ids
        if any(m.get("kind") == "logo" and m.get("creator") and m.get("license") and m.get("source_url")
               for m in enrichment.get(uid, {}).get("media", []))
    )
    enrichment_campus_ids = sorted(
        uid for uid in evaluated_ids
        if any(m.get("kind") == "campus" and m.get("creator") and m.get("license") and m.get("source_url")
               for m in enrichment.get(uid, {}).get("media", []))
    )

    counts = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).date().isoformat(),
        "method": ("exact unique US UNITID join catalogue↔HD2025; CONTROL via cached "
                   "dictionary; installed comparison; ambiguous/missing/no-evidence held"),
        "catalogue_total": len(catalogue),
        "us_total": sum(1 for c in catalogue if c.get("country_code") == "US"),
        "us_with_unitid_rows": sum(1 for c in catalogue if c.get("country_code") == "US" and c.get("unitid")),
        "us_without_unitid_rows": held_us_without_unitid,
        "non_us_rows": held_non_us,
        "distinct_unitids": len(unit_groups),
        "duplicate_unitid_groups": len(duplicate_unitids),
        "duplicate_unitid_rows": held_duplicate,
        "duplicate_unitids": duplicate_unitids,
        "held_missing_hd_rows": held_missing_hd,
        "held_unsupported_control_rows": held_unsupported_control,
        "evaluated_unique_matches": evaluated,
        "already_correct": already_correct,
        "candidates_new": new_count,
        "candidates_correcting": correcting_count,
        "candidates_total": len(candidates),
        "control_breakdown_evaluated": dict(sorted(control_counter.items())),
        "installed_breakdown_evaluated": dict(sorted(installed_counter.items())),
        "detail_note": ("Among evaluated Private rows, CONTROL 2 = Private not-for-profit "
                        "and CONTROL 3 = Private for-profit (dictionary verbatim). The installed "
                        "Public/Private vocabulary is preserved; a subtype split would need "
                        "UI/filter work owned by others, so detail stays additional_information."),
        "media_inventory_evaluated": {
            "official_exact_ids": official_exact_ids,
            "official_exact_count": len(official_exact_ids),
            "suffix_collision_held_ids": suffix_ids,
            "enrichment_logo_count": len(enrichment_logo_ids),
            "enrichment_campus_count": len(enrichment_campus_ids),
            "scholarship_verified_count": sum(1 for uid in evaluated_ids if uid in scholarship_by_id),
            "campus_check_count": sum(1 for uid in evaluated_ids if uid in campus_check_by_id),
            "image_cache_unattributed_total": sum(1 for v in image_cache.values() if not (v.get("creator") and v.get("license"))),
            "note": ("Unattributed thumbnails and favicons are never verified logos. "
                     "No logos guessed or downloaded here."),
        },
        "provenance": {**hd_prov, **dict_prov},
        "inputs_sha256": inputs,
        "licence_notes": {
            "hd": "US government public data; reuse per https://nces.ed.gov/ipeds/use-the-data",
            "dictionary": "Official IPEDS HD2025 dictionary; code labels quoted verbatim",
            "ror": "CC0; registry membership is not accreditation, ownership, or logo proof",
            "wikimedia": "Per-file licence; thumbnail URL without creator/licence is not verified",
        },
        "limits": {
            "no_network": True,
            "no_hosted_writes": True,
            "no_new_catalogue_rows_installed": True,
            "no_auto_publish": True,
            "no_ror_implies_type": True,
            "no_invented_verified_date": True,
        },
        "status": "local_review_pending_no_catalogue_or_hosted_writes",
    }

    candidates_doc = {
        "schema_version": 1,
        "generated_at": counts["generated_at"],
        "method": counts["method"],
        "status": "local_review_pending_no_catalogue_or_hosted_writes",
        "ownership_candidate_count": len(candidates),
        "candidates": candidates,
        "provenance": counts["provenance"],
        "limits": counts["limits"],
    }
    return candidates_doc, counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = parser.parse_args()
    try:
        candidates_doc, counts = build_review()
    except DictionaryMissingError as exc:
        args.out.mkdir(parents=True, exist_ok=True)
        fail = {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).date().isoformat(),
            "status": "fail_closed_missing_dictionary",
            "error": str(exc),
            "candidates_total": 0,
            "note": "Cached release lacks CONTROL dictionary evidence; no ownership guessed.",
        }
        (args.out / "counts.json").write_text(json.dumps(fail, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        (args.out / "candidates.json").write_text(json.dumps(
            {"schema_version": 1, "status": "fail_closed_missing_dictionary",
             "ownership_candidate_count": 0, "candidates": []},
            indent=2, sort_keys=True) + "\n")
        raise SystemExit(f"fail closed: {exc}")
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "candidates.json").write_text(json.dumps(candidates_doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    (args.out / "counts.json").write_text(json.dumps(counts, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    summary = [
        "# University tags review — summary (local, read-only)",
        "",
        f"- Catalogue rows: {counts['catalogue_total']} (US {counts['us_total']})",
        f"- Evaluated exact unique US UNITID matches: {counts['evaluated_unique_matches']}",
        f"- Already correct installed types: {counts['already_correct']}",
        f"- Ownership candidates pending review: {counts['candidates_total']} (new {counts['candidates_new']}, correcting {counts['candidates_correcting']})",
        f"- Held: duplicate-UNITID {counts['duplicate_unitid_rows']} · missing HD {counts['held_missing_hd_rows']} · "
        f"unsupported CONTROL {counts['held_unsupported_control_rows']} · US without UNITID {counts['us_without_unitid_rows']} · non-US {counts['non_us_rows']}",
        f"- CONTROL breakdown (evaluated): {json.dumps(counts['control_breakdown_evaluated'], sort_keys=True)}",
        f"- Media among evaluated: official exact {counts['media_inventory_evaluated']['official_exact_count']} · "
        f"enrichment logo {counts['media_inventory_evaluated']['enrichment_logo_count']} · "
        f"campus {counts['media_inventory_evaluated']['enrichment_campus_count']}",
        "- Writes: none. All candidates are needs_review with verified_at null.",
        "",
    ]
    (args.out / "SUMMARY.md").write_text("\n".join(summary))
    print(json.dumps({
        "catalogue_total": counts["catalogue_total"],
        "evaluated": counts["evaluated_unique_matches"],
        "already_correct": counts["already_correct"],
        "candidates": counts["candidates_total"],
        "out": str(args.out),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
