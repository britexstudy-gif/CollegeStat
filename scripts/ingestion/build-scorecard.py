"""Build data/published/college-scorecard.json from the official College
Scorecard "Most Recent Institution-Level Data" CSV (US Department of
Education, public domain). Records are keyed by CollegeStat university id,
joined through the IPEDS UNITID stored in global-directory.json.

Usage: python3 scripts/ingestion/build-scorecard.py <Most-Recent-Cohorts-Institution.csv> <release yyyy-mm-dd>
"""

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLISHED = ROOT / "data" / "published"
BRACKETS = ["0-30000", "30001-48000", "48001-75000", "75001-110000", "110001+"]


def num(value, kind=float):
    if value in (None, "", "NULL", "PrivacySuppressed", "PS"):
        return None
    try:
        return kind(float(value))
    except ValueError:
        return None


def pct(value):
    v = num(value)
    return None if v is None else round(v * 100, 1)


def unitid_index():
    directory = json.loads((PUBLISHED / "global-directory.json").read_text())
    rows = directory["records"] if isinstance(directory, dict) else directory
    return {str(r["unitid"]): r["id"] for r in rows if r.get("unitid")}


def build(csv_path, release):
    ids = unitid_index()
    records = {}
    with open(csv_path, newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            uid = ids.get(row["UNITID"])
            if not uid:
                continue
            private = row.get("CONTROL") in ("2", "3")
            suffix = "_PRIV" if private else "_PUB"
            net_by_income = {
                b: num(row.get(f"NPT4{i + 1}{suffix}"), int) for i, b in enumerate(BRACKETS)
            }
            rec = {
                "net_price": num(row.get("NPT4" + suffix), int),
                "net_price_by_income": {k: v for k, v in net_by_income.items() if v is not None} or None,
                "cost_of_attendance": num(row.get("COSTT4_A"), int),
                "earnings_1yr": num(row.get("MD_EARN_WNE_1YR"), int),
                "earnings_6yr": num(row.get("MD_EARN_WNE_P6"), int),
                "earnings_10yr": num(row.get("MD_EARN_WNE_P10"), int),
                "earning_above_hs_pct": pct(row.get("GT_THRESHOLD_P10")),
                "median_debt": num(row.get("GRAD_DEBT_MDN"), int),
                "completion_4yr_pct": pct(row.get("C100_4")),
                "completion_6yr_pct": pct(row.get("C150_4")),
                "retention_pct": pct(row.get("RET_FT4")),
                "pell_pct": pct(row.get("PCTPELL")),
                "federal_loan_pct": pct(row.get("PCTFLOAN")),
                "international_pct": pct(row.get("UGDS_NRA")),
                "undergrads": num(row.get("UGDS"), int),
                "student_faculty_ratio": num(row.get("STUFACR"), int),
                "avg_faculty_salary_month": num(row.get("AVGFACSAL"), int),
                "sat_avg": num(row.get("SAT_AVG"), int),
                "act_mid": num(row.get("ACTCMMID"), int),
                "admission_rate_pct": pct(row.get("ADM_RATE")),
                "endowment": num(row.get("ENDOWBEGIN"), int),
                "net_price_calculator": (row.get("NPCURL") or "").strip() or None,
            }
            if rec["net_price_calculator"] and not rec["net_price_calculator"].startswith("http"):
                rec["net_price_calculator"] = "https://" + rec["net_price_calculator"]
            rec = {k: v for k, v in rec.items() if v is not None}
            if len(rec) > 2:
                records[uid] = rec
    out = {
        "source": {
            "name": "U.S. Department of Education College Scorecard, Most Recent Institution-Level Data",
            "url": "https://collegescorecard.ed.gov/data/",
            "release": release,
            "license": "Public domain (U.S. federal government work)",
            "notes": [
                "Net price is the average annual cost after grants for full-time first-year students receiving federal aid.",
                "Earnings are median earnings of federally aided students who started at the institution, measured 1, 6 and 10 years after entry.",
                "Median debt is federal loan debt at graduation.",
            ],
        },
        "records": records,
    }
    path = PUBLISHED / "college-scorecard.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    print(f"{len(records)} records -> {path} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
