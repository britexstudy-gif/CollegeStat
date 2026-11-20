#!/usr/bin/env python3
"""US tuition from the College Scorecard institution file (release 2 Nov 2026).

Usage: python3 scripts/data-ops/scorecard-tuition.py path/to/Most-Recent-Cohorts-Institution.csv
Writes data/review/scorecard-nov20/import/rows.json: in-state and out-of-state
tuition and fees (2024/25) for catalogue universities matched by IPEDS UNITID.
Out-of-state tuition is never labelled international."""
import csv, glob, json, re, sys, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/review/scorecard-nov20/import"
SRC_URL = "https://collegescorecard.ed.gov/data/"
src = {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, SRC_URL + "#2026-11-02")), "name": "College Scorecard · institution data (2 Nov 2026 release)",
       "organization": "U.S. Department of Education", "url": SRC_URL, "source_type": "official", "trust_level": "high", "retrieved_at": "2026-11-20"}
ipeds = {}
for f in glob.glob(str(ROOT / "data/generated/catalogue/shard-*.json")):
    for u in json.load(open(f)).values():
        i = (u.get("identifiers") or {}).get("ipeds")
        if i and u.get("published") is not False:
            ipeds[str(i)] = u["id"]
# Universities without an IPEDS id: match by website domain (Scorecard INSTURL).
dom = lambda w: re.sub(r"^(https?://)?(www\.)?", "", (w or "").lower()).split("/")[0]
by_dom = {}
for f in glob.glob(str(ROOT / "data/generated/catalogue/shard-*.json")):
    for u in json.load(open(f)).values():
        if u.get("country_code") == "US" and u.get("published") is not False and not (u.get("identifiers") or {}).get("ipeds") and dom(u.get("website")):
            by_dom.setdefault(dom(u["website"]), []).append(u["id"])
taken = set(ipeds.values())
for r in csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")):
    hit = by_dom.get(dom(r.get("INSTURL")))
    if hit and len(hit) == 1 and r["UNITID"] not in ipeds and hit[0] not in taken:
        ipeds[r["UNITID"]] = hit[0]
        taken.add(hit[0])
costs = []
for r in csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")):
    uid = ipeds.get(r["UNITID"])
    if not uid:
        continue
    for field, cat in (("TUITIONFEE_IN", "in_state"), ("TUITIONFEE_OUT", "out_of_state")):
        v = r.get(field)
        if not v or v in ("NULL", "NA", "PrivacySuppressed"):
            continue
        costs.append({"university_id": uid, "verification_status": "verified", "verified_at": "2026-11-20",
                      "notes": "College Scorecard 2024/25 tuition and fees (U.S. Department of Education, release 2 Nov 2026).",
                      "id": f"{uid}:scorecard_2024_tuition_{cat}", "source_id": src["id"], "source_url": SRC_URL, "year": 2024,
                      "category": "tuition", "amount": round(float(v)), "currency": "USD", "period": "year", "student_category": cat, "program_id": None})
# Admitted-student test scores, acceptance rate and test policy (same release).
num = lambda v: None if v in (None, "", "NULL", "NA", "PrivacySuppressed") else float(v)
POLICY = {"1": "SAT · required", "2": "SAT · test-optional (recommended)", "5": "SAT · test-optional"}
admissions, requirements = [], []
for r in csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")):
    uid = ipeds.get(r["UNITID"])
    if not uid:
        continue
    vr25, mt25, vr75, mt75 = (num(r.get(k)) for k in ("SATVR25", "SATMT25", "SATVR75", "SATMT75"))
    rate, act25, act75 = num(r.get("ADM_RATE")), num(r.get("ACTCM25")), num(r.get("ACTCM75"))
    row = {}
    if None not in (vr25, mt25, vr75, mt75) and 400 <= vr25 + mt25 <= vr75 + mt75 <= 1600:
        row.update(sat_min=round(vr25 + mt25), sat_max=round(vr75 + mt75))
    if act25 and act75 and 1 <= act25 <= act75 <= 36:
        row.update(act_min=round(act25), act_max=round(act75))
    if rate is not None and 0 < rate <= 1:
        row["acceptance_rate"] = round(rate * 100, 1)
    if row:
        admissions.append({"university_id": uid, "verification_status": "verified", "verified_at": "2026-11-20",
                           "notes": "College Scorecard (U.S. Department of Education, release 2 Nov 2026): acceptance rate and the middle 50% SAT (reading + math percentiles added) / ACT of enrolled first-year students.",
                           "id": f"{uid}:scorecard-admissions", "source_id": src["id"], "source_url": SRC_URL, "year": 2024, "program_id": None,
                           "confidence": "high", "acceptance_rate": row.get("acceptance_rate"), "sat_min": row.get("sat_min"), "sat_max": row.get("sat_max"),
                           "act_min": row.get("act_min"), "act_max": row.get("act_max"), "ielts_min": None, "toefl_min": None,
                           "requirements": None, "language": None, "deadline": None, "application_fee": None})
    label = POLICY.get((r.get("ADMCON7") or "").strip())
    if label:
        requirements.append({"university_id": uid, "verification_status": "verified", "verified_at": "2026-11-20",
                             "notes": "College Scorecard / IPEDS admissions test-score policy (ADMCON7).",
                             "id": f"{uid}:scorecard-sat-policy", "source_id": src["id"], "source_url": SRC_URL, "year": 2024, "program_id": None,
                             "kind": "SAT", "label": label, "minimum": None, "maximum": None,
                             "student_category": "First-year undergraduate applicants", "required": label == "SAT · required"})
OUT.mkdir(parents=True, exist_ok=True)
json.dump({"data_sources": [src], "requirements": requirements, "costs": costs, "deadlines": [], "admissions": admissions}, open(OUT / "rows.json", "w"))
print(f"{len(admissions)} admissions rows ({sum(1 for a in admissions if a['sat_min'])} with SAT, {sum(1 for a in admissions if a['act_min'])} with ACT), {len(requirements)} test policies")
print(f"{len(costs)} tuition rows for {len({c['university_id'] for c in costs})} US universities")
