#!/usr/bin/env python3
"""Validate the Codex gap-fill results and build an import package. Never touches the database.

Reads data/review/codex-gaps-nov18/out/batch-*.json and writes:
  import/rows.json      accepted rows in the DB tables' shapes (data_sources, requirements,
                        costs, deadlines, admissions)
  import/flagged.json   values held back, each with the reason
  import/summary.md     counts per field
  import/apply.sql      idempotent SQL (insert ... on conflict do nothing), for the owner to run

Checks: https source on an official host (the university's own domain, a national
application service or a government/edu domain; never rankings, portals, forums or Wikipedia),
plausible ranges, real dates in the 2026-27 window, ISO currency codes."""
import glob, json, re, uuid
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "data/review/codex-gaps-nov18"
import os
# GAPS_INPUT=<dir> builds from <dir>/out-*.json into <dir>/import (agent batches); default is the Codex run.
IN_DIR = Path(os.environ["GAPS_INPUT"]) if os.environ.get("GAPS_INPUT") else None
OUT = (IN_DIR or DIR) / "import"
OUT.mkdir(exist_ok=True)
CHECKED = os.environ.get("GAPS_CHECKED", "2026-11-18")
NS = uuid.UUID("6f1c3a52-9a0e-4b8e-9d1e-3c1d2f0b7a11")  # stable ids: same input, same uuid
NOTE = f"Researched by an AI agent from the official page on {CHECKED}."

targets = {t["id"]: t for t in json.load(open(DIR / "targets-all.json"))}
for _f in ("targets.json", "targets-retry.json"):
    if (DIR / _f).exists():
        targets.update({t["id"]: t for t in json.load(open(DIR / _f))})
# Extra target lists (colon-separated), e.g. the DeepSeek regional run's.
for _p in filter(None, os.environ.get("GAPS_TARGETS", "").split(":")):
    targets.update({t["id"]: {**targets.get(t["id"], {}), **t} for t in json.load(open(ROOT / _p))})

SERVICES = {
    "ucas.com", "commonapp.org", "ouac.on.ca", "uni-assist.de", "hochschulstart.de", "studyinkorea.go.kr",
    "studyinjapan.go.jp", "jasso.go.jp", "campusfrance.org", "studyinholland.nl", "studielink.nl", "universityadmissions.se",
    "antagning.se", "samordnaopptak.no", "optagelse.dk", "studyinfo.fi", "opintopolku.fi", "cao.ie", "uac.edu.au",
    "vtac.com.au", "qtac.edu.au", "satac.edu.au", "tisc.edu.au", "studylink.govt.nz", "jupas.edu.hk", "studyinchina.edu.cn",
    "cucas.cn", "yok.gov.tr", "turkiyeburslari.gov.tr", "universitaly.it", "studyinaustria.at", "studyinpoland.pl",
    "studyinhungary.hu", "studyin.cz", "educationusa.state.gov", "nces.ed.gov", "collegescorecard.ed.gov",
}
BLOCK = re.compile(
    r"(wikipedia|wikimedia|topuniversities|timeshighereducation|studyportals|bachelorsportal|mastersportal|shiksha|collegedunia|"
    r"usnews|niche\.com|prepscholar|collegevine|reddit|quora|medium\.com|blogspot|wordpress|leverageedu|yocket|idp\.com|"
    r"educations\.com|unipage|studyabroad|applyboard|collegesimply|univstats|forbes|bestcolleges)",
    re.I,
)
TZ = {
    "US": "America/New_York", "CA": "America/Toronto", "GB": "Europe/London", "IE": "Europe/Dublin", "DE": "Europe/Berlin",
    "FR": "Europe/Paris", "NL": "Europe/Amsterdam", "BE": "Europe/Brussels", "CH": "Europe/Zurich", "AT": "Europe/Vienna",
    "IT": "Europe/Rome", "ES": "Europe/Madrid", "PT": "Europe/Lisbon", "SE": "Europe/Stockholm", "NO": "Europe/Oslo",
    "DK": "Europe/Copenhagen", "FI": "Europe/Helsinki", "PL": "Europe/Warsaw", "CZ": "Europe/Prague", "HU": "Europe/Budapest",
    "TR": "Europe/Istanbul", "RU": "Europe/Moscow", "KR": "Asia/Seoul", "JP": "Asia/Tokyo", "CN": "Asia/Shanghai",
    "HK": "Asia/Hong_Kong", "TW": "Asia/Taipei", "SG": "Asia/Singapore", "MY": "Asia/Kuala_Lumpur", "AU": "Australia/Sydney",
    "NZ": "Pacific/Auckland", "AE": "Asia/Dubai", "SA": "Asia/Riyadh", "QA": "Asia/Qatar", "IL": "Asia/Jerusalem",
    "IN": "Asia/Kolkata", "KZ": "Asia/Almaty", "UZ": "Asia/Tashkent", "KG": "Asia/Bishkek", "TJ": "Asia/Dushanbe",
    "TM": "Asia/Ashgabat", "BR": "America/Sao_Paulo", "MX": "America/Mexico_City", "AR": "America/Argentina/Buenos_Aires",
    "CL": "America/Santiago", "ZA": "Africa/Johannesburg", "EG": "Africa/Cairo",
}


def host(u):
    return (urlparse(u).hostname or "").lower().removeprefix("www.")


def base(h):
    parts = h.split(".")
    # keep three labels for second-level country domains (ac.uk, edu.au, ac.kr, ...)
    if len(parts) >= 3 and parts[-2] in ("ac", "edu", "co", "gov", "or", "go", "com", "org", "net"):
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def official(url, uni):
    if not isinstance(url, str) or not url.startswith("https://"):
        return "not https"
    h = host(url)
    if not h or BLOCK.search(h):
        return "not an official host: " + h
    site = host(uni.get("website") or "")
    if site and base(h) == base(site):
        return None
    if base(h) in SERVICES or h in SERVICES:
        return None
    if re.search(r"(\.gov(\.[a-z]{2})?|\.gob\.[a-z]{2}|\.go\.[a-z]{2}|\.gouv\.fr|\.bund\.de)$", h):
        return None
    if re.search(r"(\.edu|\.ac\.[a-z]{2}|\.edu\.[a-z]{2})$", h):
        return None
    return "host differs from the university site: " + h


def sid(url):
    return str(uuid.uuid5(NS, "source:" + url))


def rid(*parts):
    return str(uuid.uuid5(NS, "|".join(str(p) for p in parts)))


ENGLISH = {
    "IELTS": ("IELTS", "IELTS Academic · overall", 4, 9),
    "TOEFL iBT": ("TOEFL", "TOEFL iBT · total", 30, 120),
    "Duolingo": ("other", "Duolingo English Test · overall", 60, 160),
    "PTE Academic": ("other", "PTE Academic · overall", 30, 90),
    "Cambridge C1/C2": ("other", "Cambridge C1 Advanced / C2 Proficiency · overall", 140, 230),
}

rows = {"data_sources": {}, "requirements": [], "costs": [], "deadlines": [], "admissions": []}
flagged = []
counts = {k: 0 for k in ("universities", "english", "tuition", "application_fee", "deadlines", "sat", "acceptance_rate")}


def source(url, uni):
    s = sid(url)
    rows["data_sources"].setdefault(
        s, {"id": s, "name": uni["name"] + " · official page", "organization": uni["name"], "url": url, "source_type": "official", "trust_level": "high", "retrieved_at": CHECKED}
    )
    return s


def flag(uni, field, value, why):
    flagged.append({"university_id": uni["id"], "university": uni["name"], "field": field, "value": value, "reason": why})


files = sorted(glob.glob(str(IN_DIR / "out-*.json"))) if IN_DIR else sorted(glob.glob(str(DIR / "out-retry/batch-*.json"))) + sorted(glob.glob(str(DIR / "out/batch-*.json")))
seen = set()
for f in files:
    try:
        data = json.load(open(f))["universities"]
    except Exception:
        continue
    for r in data:
        uni = targets.get(r["id"])
        if not uni or r["id"] in seen:
            continue
        seen.add(r["id"])
        counts["universities"] += 1
        base_row = {"university_id": uni["id"], "verification_status": "verified", "verified_at": CHECKED, "notes": NOTE}

        for e in r.get("english") or []:
            if not e.get("minimum"):
                continue  # 0 = no published number
            kind, label, lo, hi = ENGLISH[e["test"]]
            if e["test"] == "TOEFL iBT" and 1 <= e["minimum"] <= 6:
                # The 2026 TOEFL band scale (1-6) must never be read as a 0-120 total.
                kind, label, lo, hi = "other", "TOEFL iBT · band score (1-6 scale)", 1, 6
            why = official(e["source_url"], uni)
            if why:
                flag(uni, "english", e, why)
                continue
            if not (lo <= e["minimum"] <= hi):
                flag(uni, "english", e, f"{e['test']} {e['minimum']} outside {lo}-{hi}")
                continue
            rows["requirements"].append(
                dict(base_row, id=rid(uni["id"], "req", e["test"]), source_id=source(e["source_url"], uni), source_url=e["source_url"], year=2027,
                     program_id=None, kind=kind, label=label, minimum=e["minimum"], maximum=None,
                     student_category="International first-year undergraduate applicants", required=True,
                     notes=(e.get("detail") or "")[:300] + " " + NOTE)
            )
            counts["english"] += 1

        t = r.get("tuition")
        if t:
            why = official(t["source_url"], uni)
            ok_cur = re.fullmatch(r"[A-Z]{3}", t["currency"] or "")
            if why or not ok_cur or t["amount"] < 0:
                flag(uni, "tuition", t, why or "bad currency or amount")
            else:
                y = re.search(r"20\d\d", t.get("academic_year") or "")
                rows["costs"].append(
                    dict(base_row, id=rid(uni["id"], "tuition"), source_id=source(t["source_url"], uni),
                         year=int(y.group()) if y else 2026, program_id=None, category="tuition", amount=t["amount"], currency=t["currency"],
                         period=t["period"], student_category="international", confidence="medium",
                         notes=((t.get("detail") or "") + (f" Range up to {t['amount_max']} {t['currency']}." if t.get("amount_max") and t["amount_max"] != t["amount"] else "") + " " + NOTE)[:600])
                )
                counts["tuition"] += 1

        fee = r.get("application_fee")
        if fee:
            why = official(fee["source_url"], uni)
            if why or not re.fullmatch(r"[A-Z]{3}", fee["currency"] or "") or fee["amount"] < 0:
                flag(uni, "application_fee", fee, why or "bad currency or amount")
            else:
                rows["costs"].append(
                    dict(base_row, id=rid(uni["id"], "fee"), source_id=source(fee["source_url"], uni), year=2027,
                         program_id=None, category="application_fee", amount=fee["amount"], currency=fee["currency"], period="total",
                         student_category="international", confidence="medium")
                )
                counts["application_fee"] += 1

        for d in r.get("deadlines") or []:
            why = official(d["source_url"], uni)
            try:
                day = date.fromisoformat(d["due_at"][:10])
            except Exception:
                day = None
            if why or not day or not (date(2026, 9, 1) <= day <= date(2027, 12, 31)):
                flag(uni, "deadline", d, why or "date missing or outside Sep 2026 - Dec 2027")
                continue
            cycle = "2026 entry" if "2026 entry" in d["title"].lower() or "2026 fall" in d["title"].lower() else "2027 entry"
            rows["deadlines"].append(
                dict(base_row, id=rid(uni["id"], "dl", d["title"], d["due_at"]), source_id=source(d["source_url"], uni), source_url=d["source_url"],
                     year=day.year, title=d["title"][:200], program_id=None, student_category="International first-year undergraduate applicants",
                     cycle=cycle, due_at=day.isoformat() + "T23:59:00Z", timezone=TZ.get(uni["country_code"], "UTC"),
                     application_url=d["source_url"], notes=(d.get("route") or "") + ". " + NOTE)
            )
            counts["deadlines"] += 1

        sat, rate = r.get("sat"), r.get("acceptance_rate")
        adm = {}
        if sat and sat.get("policy") in ("required", "optional", "not_considered") and sat.get("source_url"):
            # The SAT policy itself (many universities publish no score range).
            if not official(sat["source_url"], uni):
                label = {"required": "SAT · required", "optional": "SAT · test-optional", "not_considered": "SAT · not considered"}[sat["policy"]]
                rows["requirements"].append(
                    dict(base_row, id=rid(uni["id"], "req", "SAT-policy"), source_id=source(sat["source_url"], uni), source_url=sat["source_url"], year=2027,
                         program_id=None, kind="SAT", label=label, minimum=None, maximum=None,
                         student_category="International first-year undergraduate applicants", required=sat["policy"] == "required",
                         notes=NOTE)
                )
                counts["sat"] += 1
                if sat.get("minimum") and 400 <= sat["minimum"] <= 1600:
                    rows["requirements"].append(
                        dict(base_row, id=rid(uni["id"], "req", "SAT-min"), source_id=source(sat["source_url"], uni), source_url=sat["source_url"], year=2027,
                             program_id=None, kind="SAT", label="SAT · minimum", minimum=sat["minimum"], maximum=None,
                             student_category="International first-year undergraduate applicants", required=sat["policy"] == "required", notes=NOTE)
                    )
        if sat and sat.get("p25") and sat.get("p75"):
            why = official(sat["source_url"], uni)
            if why or not (400 <= sat["p25"] <= sat["p75"] <= 1600):
                flag(uni, "sat", sat, why or "range out of bounds")
            else:
                adm.update(sat_min=int(sat["p25"]), sat_max=int(sat["p75"]), src=sat["source_url"])
                counts["sat"] += 1
        if rate:
            why = official(rate["source_url"], uni)
            if why or not (0 < rate["percent"] <= 100):
                flag(uni, "acceptance_rate", rate, why or "percent out of bounds")
            else:
                adm.update(acceptance_rate=rate["percent"], src=adm.get("src") or rate["source_url"])
                counts["acceptance_rate"] += 1
        if adm:
            src = adm.pop("src")
            y = re.search(r"20\d\d", (rate or {}).get("year") or "")
            rows["admissions"].append(
                dict(base_row, id=rid(uni["id"], "adm"), source_id=source(src, uni), year=int(y.group()) if y else 2025, program_id=None,
                     confidence="medium", **adm)
            )

rows["data_sources"] = list(rows["data_sources"].values())
json.dump(rows, open(OUT / "rows.json", "w"), indent=1, ensure_ascii=False)
json.dump(flagged, open(OUT / "flagged.json", "w"), indent=1, ensure_ascii=False)


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


sql = ["-- Codex gap-fill import (generated by scripts/data-ops/codex-gaps-build.py). Review before running.", "begin;"]
for table in ("data_sources", "requirements", "costs", "deadlines", "admissions"):
    for r in rows[table]:
        cols = list(r.keys())
        sql.append(f"insert into public.{table} ({', '.join(cols)}) values ({', '.join(lit(r[c]) for c in cols)}) on conflict do nothing;")
sql.append("commit;")
(OUT / "apply.sql").write_text("\n".join(sql) + "\n")

lines = ["# Codex gap-fill: import package", "", f"Universities researched: {counts['universities']} (of {len(json.load(open(DIR / 'targets.json')))} targets)", ""]
lines += ["| Field | Accepted rows |", "|---|---|"] + [f"| {k} | {v} |" for k, v in counts.items() if k != "universities"]
lines += ["", f"Held back for review: {len(flagged)} values (import/flagged.json).", f"Sources: {len(rows['data_sources'])} official pages."]
(OUT / "summary.md").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
