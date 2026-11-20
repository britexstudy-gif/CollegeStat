#!/usr/bin/env python3
"""Fall 2027 first-year deadlines, international application fees and test policy
from the Common App 2026-27 requirements grid (the official PDF Common App publishes
for all member colleges).

  <venv with pdfplumber>/python scripts/data-ops/commonapp-grid.py data/raw/commonapp-2026-11/ReqGrid.pdf

Output: data/review/commonapp-nov21/import/rows.json (gap-fill package format)."""
import glob, json, re, sys, uuid
from datetime import date
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/review/commonapp-nov21/import"
URL = "https://content.commonapp.org/Files/ReqGrid.pdf"
NS = uuid.UUID("0d4f9a52-6c1b-4f0e-9a8e-3c2b1d7e5f60")
src = {"id": str(uuid.uuid5(NS, URL)), "name": "Common App · 2026-27 first-year requirements grid (updated 25 Sep 2026)",
       "organization": "The Common Application", "url": URL, "source_type": "official", "trust_level": "high", "retrieved_at": "2026-11-21"}
NOTE = "Common App 2026-27 requirements grid (official, updated 25 Sep 2026)."
ROUNDS = {"ED": "Early Decision", "EDII": "Early Decision II", "EA": "Early Action", "EAII": "Early Action II", "REA": "Restrictive Early Action", "RD": "Regular Decision"}
POLICY = {"A": "SAT · required", "N": "SAT · test-optional", "I": "SAT · not considered"}
TZ = {"US": "America/New_York", "GB": "Europe/London", "CA": "America/Toronto"}

def key(s):
    s = (s or "").lower().replace("&", "and").replace("saint ", "st ").replace("st. ", "st ")
    s = re.sub(r"\(.*?\)|\bthe\b|[^a-z ]", " ", s)
    return " ".join(s.split())

unis = {}
for f in glob.glob(str(ROOT / "data/generated/catalogue/shard-*.json")):
    for u in json.load(open(f)).values():
        if u.get("published") is False:
            continue
        for n in [u["name"], *(u.get("aliases") or [])]:
            unis.setdefault(key(n), []).append(u)

rows = {"data_sources": [src], "requirements": [], "costs": [], "deadlines": [], "admissions": []}
seen, matched, total = set(), 0, 0
with pdfplumber.open(sys.argv[1]) as pdf:
    for page in pdf.pages:
        for table in page.extract_tables():
            for r in table:
                if not r or not r[0] or len(r) < 16 or r[0].startswith(("Common App", "2026-27", "First-year")):
                    continue
                name = " ".join(r[0].split())
                total += 1
                hits = {u["id"]: u for u in unis.get(key(name), [])}
                if len(hits) != 1:
                    continue  # unknown or ambiguous name: skip rather than guess
                u = next(iter(hits.values()))
                if u["id"] in seen:
                    continue
                seen.add(u["id"])
                matched += 1
                base = {"university_id": u["id"], "verification_status": "verified", "verified_at": "2026-11-21", "source_id": src["id"], "source_url": URL, "program_id": None}
                for col, rnd in zip(r[2:8], ROUNDS):
                    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", (col or "").strip())
                    if not m:
                        continue
                    day = date(int(m[3]), int(m[1]), int(m[2]))
                    if not date(2026, 9, 1) <= day <= date(2027, 9, 30):
                        continue
                    rows["deadlines"].append(dict(base, id=str(uuid.uuid5(NS, f"{u['id']}|{rnd}")), year=day.year,
                        title=f"{ROUNDS[rnd]} (Common App)", student_category="First-year applicants, including international",
                        cycle="2027 entry", due_at=day.isoformat() + "T23:59:00Z", timezone=TZ.get(u["country_code"], "UTC"),
                        application_url="https://www.commonapp.org/", notes=NOTE))
                fee = re.fullmatch(r"\$(\d+)", (r[9] or "").strip())
                if fee:
                    rows["costs"].append(dict(base, id=str(uuid.uuid5(NS, f"{u['id']}|fee")), year=2027, category="application_fee",
                        amount=int(fee[1]), currency="USD", period="total", student_category="international", notes=NOTE))
                label = POLICY.get((r[15] or "").strip())
                if label:
                    rows["requirements"].append(dict(base, id=str(uuid.uuid5(NS, f"{u['id']}|sat")), year=2027, kind="SAT", label=label,
                        minimum=None, maximum=None, student_category="First-year applicants (US policy; international may differ)",
                        required=label == "SAT · required", notes=NOTE + " Policy stated for US applicants; check international rules."))
OUT.mkdir(parents=True, exist_ok=True)
json.dump(rows, open(OUT / "rows.json", "w"), indent=1)
print(f"{total} grid rows, {matched} matched to the catalogue: {len(rows['deadlines'])} deadlines, {len(rows['costs'])} fees, {len(rows['requirements'])} test policies")
