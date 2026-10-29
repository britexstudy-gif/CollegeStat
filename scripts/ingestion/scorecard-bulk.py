#!/usr/bin/env python3
"""Turn the College Scorecard institution file into review-only observations.

Download "Most Recent Institution-Level Data" from https://collegescorecard.ed.gov/data/ (CC0), then:

  python3 scripts/ingestion/scorecard-bulk.py --file Most-Recent-Cohorts-Institution.csv \
    --source-url https://ed-public-download.app.cloud.gov/downloads/<file> --year 2023 --label 2026-10

Rows are matched to the catalogue by UNITID only. Suppressed and null values are skipped.
Scorecard rates are fractions; they are written as percentages and the notes say so. The output goes to
data/review/scorecard-<label>/ and reaches the app only through stage_observations and staff approval.
--year is the reporting year from the data dictionary; pass --field-year FIELD=YEAR where a field differs
(earnings and debt lag the enrollment fields).
"""
import argparse, csv, hashlib, io, json, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# field: (metric, unit, scale, description)
FIELDS = {
    "C150_4": ("graduation_rate", "%", 100, "Completion within 150% of normal time · first-time, full-time students at four-year institutions"),
    "RET_FT4": ("retention_rate", "%", 100, "First-year retention · first-time, full-time students at four-year institutions"),
    "MD_EARN_WNE_P10": ("earnings_10yr_after_entry", "USD", 1, "Median earnings of working, not-enrolled former students 10 years after entry"),
    "GRAD_DEBT_MDN": ("median_debt_completers", "USD", 1, "Median federal loan debt of completers"),
    "NPT4_PUB": ("average_net_price_public", "USD", 1, "Average net price · Title IV first-time, full-time undergraduates · public institution"),
    "NPT4_PRIV": ("average_net_price_private", "USD", 1, "Average net price · Title IV first-time, full-time undergraduates · private institution"),
    "PCTPELL": ("pell_grant_rate", "%", 100, "Share of undergraduates receiving a Pell grant"),
    "UGDS": ("undergraduate_enrollment", "students", 1, "Degree-seeking undergraduate enrollment"),
    "UGDS_NRA": ("international_students", "%", 100, "Share of degree-seeking undergraduates who are U.S. nonresidents"),
}
MISSING = {"", "NULL", "NA", "PrivacySuppressed", "PS"}


def read_rows(path):
    p = Path(path)
    if p.suffix == ".zip":
        with zipfile.ZipFile(p) as z:
            names = [n for n in z.namelist() if n.endswith(".csv") and "Institution" in n] or [n for n in z.namelist() if n.endswith(".csv")]
            if len(names) != 1:
                sys.exit(f"Expected one institution CSV in the archive, found {names}")
            text = io.TextIOWrapper(z.open(names[0]), encoding="utf-8-sig")
            yield from csv.DictReader(text)
    else:
        with p.open(encoding="utf-8-sig", newline="") as f:
            yield from csv.DictReader(f)


def convert(raw, scale, unit):
    if raw is None or raw.strip() in MISSING:
        return None
    try:
        v = float(raw)
    except ValueError:
        return None
    if v < 0 or (scale == 100 and v > 1):
        return None
    v = round(v * scale, 2) if scale != 1 else v
    return int(v) if unit in ("USD", "students") and v == int(v) else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--source-url", required=True)
    ap.add_argument("--year", required=True, type=int)
    ap.add_argument("--field-year", action="append", default=[], help="FIELD=YEAR override")
    ap.add_argument("--label", required=True)
    a = ap.parse_args()
    if not a.source_url.startswith("https://"):
        sys.exit("--source-url must be the https download URL")
    years = {f: a.year for f in FIELDS}
    for o in a.field_year:
        f, _, y = o.partition("=")
        if f not in FIELDS or not y.isdigit():
            sys.exit(f"Bad --field-year {o}")
        years[f] = int(y)

    by_unitid = {r["unitid"]: r["id"] for r in json.loads((ROOT / "data/published/global-directory.json").read_text()) if r.get("unitid")}
    observations, matched, seen = [], set(), 0
    for row in read_rows(a.file):
        seen += 1
        u = by_unitid.get((row.get("UNITID") or "").strip())
        if not u:
            continue
        for field, (metric, unit, scale, description) in FIELDS.items():
            value = convert(row.get(field), scale, unit)
            if value is None:
                continue
            note = f"{description}. College Scorecard field {field}"
            if scale == 100:
                note += " (published as a fraction; shown as a percentage)"
            observations.append({"university_id": u, "metric": metric, "year": years[field], "value": value, "unit": unit,
                                 "source_url": a.source_url, "notes": note + ". Check the cohort year in the data dictionary before approving."})
            matched.add(u)

    out = ROOT / "data/review" / f"scorecard-{a.label}"
    out.mkdir(parents=True, exist_ok=True)
    (out / "observations.json").write_text(json.dumps(observations, indent=1) + "\n")
    summary = {"source_url": a.source_url, "file_sha256": hashlib.sha256(Path(a.file).read_bytes()).hexdigest(), "rows_read": seen,
               "universities_matched": len(matched), "catalogue_unitids": len(by_unitid), "observations": len(observations),
               "years": years, "status": "needs_review · not published"}
    (out / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    print(json.dumps({k: v for k, v in summary.items() if k != "years"}))


if __name__ == "__main__":
    main()
