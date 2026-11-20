"""Review the author's public July 2026 v3 PDF against exact catalog identities.

Usage: python review-webometrics-oct15.py /path/to/july2026.pdf /path/to/metadata.json
Requires pypdf. No hosted writes, fuzzy matching, or commercial full-table access.
"""
import collections
import hashlib
import json
from pathlib import Path
import re
import sys

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "https://doi.org/10.6084/m9.figshare.33062150.v3"


def review(pdf_path, metadata_path):
    metadata = json.loads(metadata_path.read_text())
    assert metadata["doi"] == "10.6084/m9.figshare.33062150.v3"
    assert metadata["license"]["name"] == "CC BY 4.0"
    checksum = hashlib.md5(pdf_path.read_bytes()).hexdigest()
    assert checksum == metadata["files"][0]["computed_md5"]
    pdf = PdfReader(pdf_path)
    rows, excluded = [], []
    for page_number, page in enumerate(pdf.pages[4:], 5):
        raw = []

        def finish():
            if not raw:
                return
            full = " ".join(raw)
            match = re.fullmatch(
                r"(\d+)\s+(\d+)\s+(.+?)\s+(?:(https://ror\.org/[a-z0-9]+)\s+)?([a-z]{2})\s+([A-Z]{2,3})\s+(.+)", full
            )
            if not match:
                excluded.append({"page": page_number, "raw_row": full,
                                 "reason": "Country code absent or international reporting unit"})
                return
            wr, cr, name, ror, code, region, domains = match.groups()
            rows.append({"world_rank": int(wr), "country_rank": int(cr),
                         "name": name, "ror": ror,
                         "country_code": {"uk": "GB"}.get(code, code.upper()),
                         "region": region, "domains": domains.split(), "page": page_number})

        for line in page.extract_text().splitlines():
            line = " ".join(line.split())
            if not line or line.startswith(("WR CR", "RANKING WEB")):
                continue
            if re.match(r"^\d+\s+\d+\s+", line):
                finish()
                raw = [line]
            elif raw:
                raw.append(line)
        finish()

    assert len(rows) == 2250 and len(excluded) == 14
    assert len({(r["country_code"], r["name"], tuple(r["domains"])) for r in rows}) == len(rows)
    assert all(1 <= r["country_rank"] <= 15 for r in rows)
    world_rank_counts = collections.Counter(r["world_rank"] for r in rows)
    for row in rows:
        row["world_tied"] = world_rank_counts[row["world_rank"]] > 1
    directory = json.loads((ROOT / "data/published/global-directory.json").read_text())
    rors, domains = collections.defaultdict(list), collections.defaultdict(list)
    for university in directory:
        if university.get("ror"):
            rors[university["ror"]].append(university)
        for domain in university.get("domains", []):
            domains[(university["country_code"], domain.lower().removeprefix("www."))].append(university)
    methods = collections.Counter()
    for row in rows:
        candidates = [u for u in rors[row["ror"]] if u["country_code"] == row["country_code"]] if row["ror"] else []
        method = "exact_ror_and_country"
        if len(candidates) != 1:
            candidates = list({u["id"]: u for domain in row["domains"]
                               for u in domains[(row["country_code"], domain.lower().removeprefix("www."))]
                               if not row["ror"] or not u.get("ror") or u["ror"] == row["ror"]}.values())
            method = "exact_domain_and_country"
        match = candidates[0] if len(candidates) == 1 else None
        row.update(university_id=match["id"] if match else None,
                   slug=match["slug"] if match else None,
                   identity_method=method if match else "unmatched")
        methods[row["identity_method"]] += 1
    linked_ids = [r["university_id"] for r in rows if r["university_id"]]
    assert len(set(linked_ids)) == len(linked_ids), "A profile must not receive multiple source institutions"
    snapshot = {
        "status": "reviewed_published", "reviewed_at": "2026-10-15",
        "provider": "webometrics", "year": 2026, "edition": "July 2026 · corrected v3",
        "author": "Isidro F. Aguillo · Cybermetrics Lab (IPP-CSIC)",
        "source_url": SOURCE, "download_url": metadata["files"][0]["download_url"],
        "source_md5": checksum, "source_published_at": metadata["published_date"],
        "license": "CC BY 4.0", "license_url": metadata["license"]["url"],
        "complete": False,
        "coverage": "Public top-15-per-country selection only. Published omissions and gaps are retained; the paid complete table is not included.",
        "counts": {"country_coded_source_records": len(rows), "excluded_source_records": len(excluded),
                   "countries": len({r["country_code"] for r in rows}), "profile_matches": len(linked_ids),
                   "identity_methods": dict(methods)},
        "records": rows,
    }
    (ROOT / "data/published/reviewed-webometrics-oct15.json").write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n")
    # Profile clients need only positions/identity guards, not the full table's
    # multilingual names, domains and unmatched source institutions.
    profile_index = {
        "source_url": SOURCE, "download_url": snapshot["download_url"],
        "year": 2026, "edition": snapshot["edition"],
        "fields": ["country_code", "ror", "world_rank", "country_rank", "world_tied", "page"],
        "records": {r["university_id"]: [r[key] for key in
                    ["country_code", "ror", "world_rank", "country_rank", "world_tied", "page"]]
                    for r in rows if r["university_id"]},
    }
    (ROOT / "data/published/reviewed-webometrics-profile-index-oct15.json").write_text(json.dumps(profile_index, ensure_ascii=False, separators=(",", ":")) + "\n")
    (ROOT / "data/review/webometrics-source-review-oct15.json").write_text(json.dumps({
        "source_url": SOURCE, "license": metadata["license"], "source_md5": checksum,
        "counts": snapshot["counts"], "excluded_records": excluded,
        "identity_policy": "Unique exact ROR plus country, or unique exact domain plus country without a conflicting ROR. Ambiguity stays unlinked. No fuzzy matching."
    }, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(snapshot["counts"], indent=2))


if __name__ == "__main__":
    review(Path(sys.argv[1]), Path(sys.argv[2]))
