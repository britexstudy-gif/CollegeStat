#!/usr/bin/env python3
"""More national rules, each from the official legal or government source:

- Kazakhstan: enrolment on a grant or paid place runs 20 June - 25 August every
  year (Standard admission rules, order No. 600, para 33-3, as amended 2026;
  adilet.zan.kz) -> 2027 deadline 25 August. Nazarbayev University has its own
  admissions and is left out.
- Germany, Baden-Wuerttemberg: public universities charge non-EU/EEA students
  1,500 EUR per semester (state ministry, since winter 2017/18) -> 3,000 EUR a
  year. Public universities only (private, church, dual-study and civil-service
  colleges are left out).

Output: data/review/national-rules-nov21/import/rows.json."""
import glob, json, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/review/national-rules-nov21/import"
NS = uuid.UUID("8e3b6d2a-4c71-4b0f-a9d5-1f2e3c4b5a69")
KZ_URL = "https://adilet.zan.kz/rus/docs/V1800017650"
BW_URL = "https://mwk.baden-wuerttemberg.de/de/hochschulen-studium/studium/studienfinanzierung/gebuehren-fuer-internationale-studierende-und-zweitstudium/tuition-fees-for-international-students"
src = {
    "kz": {"id": str(uuid.uuid5(NS, KZ_URL)), "name": "Standard rules for admission to higher education (order No. 600)", "organization": "Ministry of Science and Higher Education of Kazakhstan",
           "url": KZ_URL, "source_type": "official", "trust_level": "high", "retrieved_at": "2026-11-21"},
    "dk": {"id": str(uuid.uuid5(NS, "https://www.optagelse.dk/")), "name": "Danish coordinated admission (optagelse.dk): 15 March deadline for international applicants", "organization": "Danish Ministry of Higher Education and Science (coordinated admission)",
           "url": "https://www.optagelse.dk/", "source_type": "official", "trust_level": "high", "retrieved_at": "2026-11-21"},
    "bw": {"id": str(uuid.uuid5(NS, BW_URL)), "name": "Tuition fees for international students in Baden-Württemberg", "organization": "Ministry of Science, Research and the Arts Baden-Württemberg",
           "url": BW_URL, "source_type": "official", "trust_level": "high", "retrieved_at": "2026-11-21"},
}
BW_PUBLIC = {
    "Staatliche Hochschule für Gestaltung Karlsruhe", "HTWG Hochschule Konstanz - Technik, Wirtschaft und Gestaltung", "Pädagogische Hochschule Ludwigsburg",
    "Universität Konstanz", "University of Applied Sciences Ravensburg-Weingarten", "Karlsruher Institut für Technologie", "Pforzheim University of Applied Sciences",
    "Pädagogische Hochschule Heidelberg", "Karlsruhe University of Applied Sciences", "Stuttgart Technical University of Applied Sciences", "Universität Stuttgart",
    "Nürtingen-Geislingen University of Applied Science", "Pädagogische Hochschule Karlsruhe", "Universität Hohenheim", "Technische Hochschule Ulm",
    "Hochschule für Musik Karlsruhe", "Fachhochschule Stuttgart, Hochschule der Medien", "Pädagogische Hochschule Weingarten", "Ruprecht-Karls-Universität Heidelberg",
    "Heilbronn University", "Eberhard-Karls-Universität Tübingen", "Reutlingen University", "Fachhochschule Schwäbisch Gmünd, Hochschule für Gestaltung",
    "Rottenburg University of Applied Forest Sciences", "Universität Mannheim", "Mannheim University of Music and Performing Arts", "Offenburg University of Applied Sciences",
    "Pädagogische Hochschule Schwäbisch Gmünd", "Universität Ulm", "Hochschule Albstadt-Sigmaringen", "Pädagogische Hochschule Freiburg",
    "Albert-Ludwigs-Universität Freiburg", "Hochschule für Musik und Darstellende Kunst Stuttgart",
}
rows = {"data_sources": list(src.values()), "requirements": [], "costs": [], "deadlines": [], "admissions": []}
kz = bw = dk = 0
for f in glob.glob(str(ROOT / "data/generated/catalogue/shard-*.json")):
    for u in json.load(open(f)).values():
        if u.get("published") is False:
            continue
        base = {"university_id": u["id"], "verification_status": "verified", "verified_at": "2026-11-21", "program_id": None}
        if u.get("country_code") == "KZ" and "nazarbayev" not in u["name"].lower():
            kz += 1
            rows["deadlines"].append(dict(base, id=str(uuid.uuid5(NS, u["id"] + "|kz")), source_id=src["kz"]["id"], source_url=KZ_URL, year=2027,
                title="Enrolment closes (grant and paid places)", student_category="Bachelor applicants", cycle="2027 entry",
                due_at="2027-08-25T18:00:00+05:00", timezone="Asia/Almaty", application_url="https://egov.kz/",
                notes="National rule: enrolment runs 20 June - 25 August every year (order No. 600, para 33-3). Grant competition applications have their own July window."))
        if u.get("country_code") == "DK":
            dk += 1
            rows["deadlines"].append(dict(base, id=str(uuid.uuid5(NS, u["id"] + "|dk")), source_id=src["dk"]["id"], source_url="https://www.optagelse.dk/", year=2027,
                title="Application deadline for international applicants (optagelse.dk)", student_category="Non-EU applicants and applicants with a non-Danish upper secondary qualification (incl. IB)",
                cycle="2027 entry", due_at="2027-03-15T12:00:00+01:00", timezone="Europe/Copenhagen", application_url="https://www.optagelse.dk/",
                notes="National coordinated admission: all international bachelor applicants apply on optagelse.dk by 15 March, 12:00 noon CET (quota 2). Also stated by Aarhus, CBS, Aalborg and SDU."))
        if u.get("country_code") == "DE" and u["name"] in BW_PUBLIC:
            bw += 1
            rows["costs"].append(dict(base, id=str(uuid.uuid5(NS, u["id"] + "|bw")), source_id=src["bw"]["id"], source_url=BW_URL, year=2026,
                category="tuition", amount=3000, currency="EUR", period="year", student_category="international",
                notes="Baden-Württemberg state fee for non-EU/EEA students: 1,500 EUR per semester at public universities (plus the semester contribution)."))
OUT.mkdir(parents=True, exist_ok=True)
json.dump(rows, open(OUT / "rows.json", "w"), indent=1, ensure_ascii=False)
print(f"Kazakhstan deadlines: {kz}; Denmark deadlines: {dk}; Baden-Württemberg tuition: {bw}")
