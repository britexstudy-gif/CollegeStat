#!/usr/bin/env python3
"""National admission-system rules applied to every university they govern.

UK: every undergraduate application goes through UCAS, whose published 2027-entry
deadline applies to all UK universities (Oxford and Cambridge: the 15 October
deadline). Rows are labelled with the national source in their notes.

Output: data/review/national-rules-nov20/import/rows.json (the gap-fill package
format read by scripts/d1/build-d1.ts)."""
import glob, json, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/review/national-rules-nov20/import"
NS = uuid.UUID("6b1f3c1e-6f0e-4b7a-9d55-2f9a7c0d1e20")
CHECKED = "2026-11-20"

UCAS_MAIN = "https://www.ucas.com/events/2027-entry-deadline-for-all-undergraduate-courses-except-those-with-a-15-october-deadline-475546"
UCAS_WHEN = "https://www.ucas.com/undergraduate/applying-university/ucas-undergraduate-when-apply"
OCT15 = ("university of oxford", "university of cambridge")

docs = {}
for f in glob.glob(str(ROOT / "data/generated/catalogue/shard-*.json")):
    for u in json.load(open(f)).values():
        if u.get("published") is not False:
            docs[u["id"]] = u

sources = {
    "main": {"id": str(uuid.uuid5(NS, "ucas-2027-main")), "name": "UCAS · 2027 entry deadline", "organization": "UCAS", "url": UCAS_MAIN, "source_type": "official", "trust_level": "high", "retrieved_at": CHECKED},
    "oct": {"id": str(uuid.uuid5(NS, "ucas-2027-oct15")), "name": "UCAS · when to apply (15 October deadline)", "organization": "UCAS", "url": UCAS_WHEN, "source_type": "official", "trust_level": "high", "retrieved_at": CHECKED},
}
rows = []
for u in docs.values():
    if u.get("country_code") != "GB":
        continue
    early = (u.get("name") or "").lower() in OCT15
    src = sources["oct" if early else "main"]
    due = "2026-10-15T18:00:00+01:00" if early else "2027-01-13T18:00:00+00:00"
    rows.append({
        "university_id": u["id"],
        "verification_status": "verified",
        "verified_at": CHECKED,
        "notes": ("UCAS 15 October deadline (Oxford, Cambridge, medicine, dentistry, veterinary). " if early else "UCAS equal-consideration deadline for all undergraduate courses; Oxford, Cambridge, medicine, dentistry and veterinary close 15 Oct 2026. ") + "National admission rule, applies to every UK university.",
        "id": str(uuid.uuid5(NS, "deadline:" + u["id"])),
        "source_id": src["id"],
        "source_url": src["url"],
        "year": 2027,
        "title": "UCAS application deadline",
        "program_id": None,
        "student_category": "All undergraduate applicants, including international",
        "cycle": "2027 entry",
        "due_at": due,
        "timezone": "Europe/London",
        "application_url": "https://www.ucas.com/",
    })
# One official national deadline per country (international / English-taught rounds).
NATIONAL = [
    ("SE", "se-2027", "Universityadmissions.se · autumn 2027 dates", "Universityadmissions.se", "https://www.universityadmissions.se/en/key-dates-and-deadlines/autumn-semester-dates/",
     "2027-01-15", "Europe/Stockholm", "First (international) admission round deadline",
     "National deadline for the international admission round (autumn 2027 start), applies to every Swedish university. Results 8 April 2027."),
    ("FI", "fi-2027", "Studyinfo · application periods", "Studyinfo.fi (Finnish National Agency for Education)", "https://opintopolku.fi/konfo/en/sivu/application-periods",
     "2027-01-21T15:00:00+02:00", "Europe/Helsinki", "Joint application, English-taught programmes",
     "National joint application 7-21 January 2027 for English-taught bachelor's programmes (autumn 2027 start), applies to Finnish universities and universities of applied sciences."),
]
for code, key, name, org, url, due, tz, title, note in NATIONAL:
    src = {"id": str(uuid.uuid5(NS, key)), "name": name, "organization": org, "url": url, "source_type": "official", "trust_level": "high", "retrieved_at": CHECKED}
    sources[key] = src
    n = 0
    for u in docs.values():
        if u.get("country_code") != code:
            continue
        n += 1
        rows.append({
            "university_id": u["id"], "verification_status": "verified", "verified_at": CHECKED,
            "notes": note + " National admission rule.",
            "id": str(uuid.uuid5(NS, "deadline:" + key + ":" + u["id"])), "source_id": src["id"], "source_url": url,
            "year": 2027, "title": title, "program_id": None, "student_category": "International bachelor's applicants",
            "cycle": "2027 entry", "due_at": due, "timezone": tz, "application_url": url,
        })
    print(f"{code}: {n} universities")
OUT.mkdir(parents=True, exist_ok=True)
json.dump({"data_sources": list(sources.values()), "requirements": [], "costs": [], "deadlines": rows, "admissions": []}, open(OUT / "rows.json", "w"), ensure_ascii=False, indent=1)
print(f"UK (UCAS): {len(rows)} universities")
