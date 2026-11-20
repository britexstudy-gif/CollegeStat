"""Merge transcribed Common Data Set extracts into data/published/common-data-set.json.

Every record comes from a university's own CDS document (cds_url). Values that
fail basic consistency checks are dropped rather than corrected.

Usage: python3 scripts/ingestion/build-common-data-set.py <extract.json> [<extract.json> ...]
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "data" / "published" / "common-data-set.json"
LEVELS = {"very_important", "important", "considered", "not_considered"}
POLICIES = {"required", "optional", "blind", "considered_not_required"}


def number(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str):
        v = v.replace(",", "").replace("%", "").strip()
        try:
            return float(v) if "." in v else int(v)
        except ValueError:
            return None
    return None


def counts(d):
    if not isinstance(d, dict):
        return None
    out = {k: number(d.get(k)) for k in ("men", "women", "total")}
    out = {k: int(v) for k, v in out.items() if v is not None and v >= 0}
    return out or None


def triple(r, lo, hi):
    if not isinstance(r, list) or len(r) != 3:
        return None
    vals = [number(x) for x in r]
    known = [v for v in vals if v is not None]
    if len(known) < 2 or any(not lo <= v <= hi for v in known) or known != sorted(known):
        return None
    return vals


def pct(v):
    v = number(v)
    return v if v is not None and 0 <= v <= 100 else None


def clean(raw):
    url = raw.get("cds_url")
    if not url or not str(url).startswith("http"):
        return None
    rec = {"cds_year": raw.get("cds_year") or "", "cds_url": url}
    apps, adm = counts(raw.get("applicants")), counts(raw.get("admitted"))
    if apps and adm and apps.get("total") and adm.get("total") and adm["total"] > apps["total"]:
        apps = adm = None
    if apps:
        rec["applicants"] = apps
    if adm:
        rec["admitted"] = adm
    enrolled = number(raw.get("enrolled_first_year"))
    if enrolled and (not adm or not adm.get("total") or enrolled <= adm["total"]):
        rec["enrolled_first_year"] = int(enrolled)
    if isinstance(raw.get("waitlist"), dict):
        w = {k: number(raw["waitlist"].get(k)) for k in ("offered", "accepted_place", "admitted")}
        w = {k: int(v) for k, v in w.items() if v is not None and v >= 0}
        if w.get("offered"):
            rec["waitlist"] = w
    factors = raw.get("factors")
    if isinstance(factors, dict):
        f = {k: v for k, v in factors.items() if v in LEVELS}
        if len(f) >= 5:
            rec["factors"] = f
    if raw.get("test_policy") in POLICIES:
        rec["test_policy"] = raw["test_policy"]
    for key in ("pct_submitting_sat", "pct_submitting_act", "pct_submitting_gpa"):
        if pct(raw.get(key)) is not None:
            rec[key] = pct(raw.get(key))
    sat = triple(raw.get("sat_composite"), 400, 1600)
    act = triple(raw.get("act_composite"), 1, 36)
    if sat:
        rec["sat_composite"] = sat
    if act:
        rec["act_composite"] = act
    rank = raw.get("class_rank")
    if isinstance(rank, dict):
        r = {k: pct(rank.get(k)) for k in ("top10_pct", "top25_pct")}
        r = {k: v for k, v in r.items() if v is not None}
        if r:
            rec["class_rank"] = r
    gpa = raw.get("gpa_distribution")
    if isinstance(gpa, dict):
        g = {k: pct(v) for k, v in gpa.items()}
        g = {k: v for k, v in g.items() if v is not None}
        if g and 95 <= sum(g.values()) <= 101:
            rec["gpa_distribution"] = g
    avg = number(raw.get("avg_gpa"))
    if avg and 1.5 <= avg <= 5:
        rec["avg_gpa"] = avg
    fee = number(raw.get("application_fee"))
    if fee is not None and 0 <= fee <= 150:
        rec["application_fee"] = int(fee)
    deadlines = raw.get("deadlines")
    if isinstance(deadlines, dict):
        d = {k: v for k, v in deadlines.items() if isinstance(v, str) and re.fullmatch(r"(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])", v)}
        if d:
            rec["deadlines"] = d
    return rec if len(rec) > 3 else None


def main(paths):
    current = json.loads(TARGET.read_text()) if TARGET.exists() else {"records": {}}
    records = current.get("records", {})
    added = 0
    for path in paths:
        for raw in json.loads(Path(path).read_text()):
            rec = clean(raw) if isinstance(raw, dict) and raw.get("id") else None
            if rec:
                records[raw["id"]] = rec
                added += 1
    out = {
        "source": {
            "name": "Common Data Set (each university's own publication)",
            "url": "https://commondataset.org/",
            "notes": [
                "Figures are transcribed from each university's official CDS document, linked per record in cds_url.",
                "Values failing consistency checks (e.g. admitted > applicants, GPA bands not summing to ~100%) were dropped.",
            ],
        },
        "records": records,
    }
    TARGET.write_text(json.dumps(out, separators=(",", ":")))
    print(f"{added} merged, {len(records)} total -> {TARGET}")


if __name__ == "__main__":
    main(sys.argv[1:])
