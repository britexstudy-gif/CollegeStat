#!/usr/bin/env python3
"""Uzbekistan national admission rules for state universities, from Cabinet of
Ministers resolution No. 578 (13 Sep 2025, as amended in 2026) on lex.uz:

- bachelor registration runs 5-25 June every year (para 10) -> 2027 deadline 25 June;
- SAT 1200+ (75% of the maximum): admission on an additional state grant;
- IELTS Academic 5.5 / TOEFL iBT 72 / Cambridge B2 First+ (or national B2):
  the maximum score for the English entrance subject without the exam;
- A Level grade B+ / IB 32+: additional admission on the basic fee-contract.

Applies to state universities only (private and foreign-branch universities run
their own admissions). Output: data/review/uz-rules-nov21/import/rows.json."""
import glob, json, re, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/review/uz-rules-nov21/import"
URL = "https://lex.uz/uz/docs/-7726569"
NS = uuid.UUID("5c0e2a7b-91d4-4f63-8b2e-7a6d3c1f0e94")
src = {"id": str(uuid.uuid5(NS, URL)), "name": "Cabinet of Ministers resolution No. 578 (13.09.2025) on admission to higher education",
       "organization": "Cabinet of Ministers of the Republic of Uzbekistan", "url": URL, "source_type": "official", "trust_level": "high", "retrieved_at": "2026-11-21"}
STATE = re.compile(r"\bstate\b|davlat|national university of uzbekistan|national pedagogical university|world economy and diplomacy|"
                   r"tashkent university of information technologies|pharmaceutical institute|silk road|teachers training institute", re.I)
RULES = [
    ("sat", "SAT 1200+ → additional state grant", "SAT score of 1200 or higher (75% of the maximum): admission on an additional state grant to bachelor programmes whose entrance subjects match the certificate. Send the score electronically (College Board DI code)."),
    ("eng", "IELTS 5.5 / TOEFL iBT 72 / Cambridge B2 → full English score", "IELTS Academic 5.5, TOEFL iBT 72, Cambridge B2 First / C1 Advanced / C2 Proficiency, or a national B2 certificate: the maximum score for the English entrance subject without sitting the exam."),
    ("alevel", "A Level B+ / IB 32+ → contract place", "A Level grade B or higher, or International Baccalaureate 32 or higher: additional admission on the basic fee-contract to programmes whose entrance subjects match the certificate."),
]
rows = {"data_sources": [src], "requirements": [], "costs": [], "deadlines": [], "admissions": []}
names = []
for f in glob.glob(str(ROOT / "data/generated/catalogue/shard-*.json")):
    for u in json.load(open(f)).values():
        if u.get("country_code") != "UZ" or u.get("published") is False or not STATE.search(u["name"]):
            continue
        names.append(u["name"])
        base = {"university_id": u["id"], "verification_status": "verified", "verified_at": "2026-11-21", "source_id": src["id"], "source_url": URL, "program_id": None}
        rows["deadlines"].append(dict(base, id=str(uuid.uuid5(NS, u["id"] + "|reg")), year=2027, title="State admission registration closes (my.uzbmb.uz)",
            student_category="Bachelor applicants (state admission)", cycle="2027 entry", due_at="2027-06-25T23:59:00+05:00", timezone="Asia/Tashkent",
            application_url="https://my.uzbmb.uz/", notes="National rule: registration runs 5-25 June every year (resolution No. 578, para 10)."))
        for k, label, note in RULES:
            rows["requirements"].append(dict(base, id=str(uuid.uuid5(NS, u["id"] + "|" + k)), year=2027, kind="other", label=label, minimum=None, maximum=None,
                student_category="Bachelor applicants (state admission)", required=False, notes=note + " National rule (resolution No. 578)."))
OUT.mkdir(parents=True, exist_ok=True)
json.dump(rows, open(OUT / "rows.json", "w"), indent=1, ensure_ascii=False)
print(len(names), "state universities:", "; ".join(sorted(names)))
