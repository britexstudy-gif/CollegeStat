#!/usr/bin/env python3
"""International tuition for Australian universities from CRICOS, the Australian
Government register of courses offered to international students.

For each provider's current bachelor courses: yearly fee = tuition fee / (duration
in weeks / 52). The university's row is the range (lowest to highest) across its
bachelor courses. Output: data/review/cricos-nov21/import/rows.json.

  python3 scripts/data-ops/cricos-tuition.py data/raw/cricos-2026-11/courses.csv"""
import csv, glob, json, re, sys, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/review/cricos-nov21/import"
URL = "https://cricos.education.gov.au/"
src = {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, URL + "#2026-11")), "name": "CRICOS · Commonwealth Register of Institutions and Courses for Overseas Students",
       "organization": "Australian Government Department of Education", "url": URL, "source_type": "official", "trust_level": "high", "retrieved_at": "2026-11-16"}
norm = lambda s: re.sub(r"[^a-z ]", "", re.sub(r"\(.*?\)|\bthe\b", "", (s or "").lower().replace("&", "and"))).split()
key = lambda s: " ".join(norm(s))

unis = {}
for f in glob.glob(str(ROOT / "data/generated/catalogue/shard-*.json")):
    for u in json.load(open(f)).values():
        if u.get("country_code") == "AU" and u.get("published") is not False:
            for n in [u["name"], *(u.get("aliases") or [])]:
                unis.setdefault(key(n), u["id"])

money = lambda v: float(re.sub(r"[^\d.]", "", v or "") or 0)
fees = {}
for r in csv.DictReader(open(sys.argv[1], encoding="utf-8-sig")):
    if r["Expired"] != "No" or not r["Course Level"].startswith("Bachelor Degree") or r["Course Language"] != "English":
        continue
    weeks, fee = money(r["Duration (Weeks)"]), money(r["Tuition Fee"])
    if weeks < 52 or fee <= 0:
        continue
    uid = unis.get(key(r["Institution Name"]))
    if uid:
        fees.setdefault(uid, []).append(round(fee / (weeks / 52)))

costs = []
for uid, ys in fees.items():
    ys = sorted(ys)
    lo, hi = ys[len(ys) // 20], ys[-1 - len(ys) // 20]  # trim the extreme 5% (data-entry outliers)
    if not 5000 <= lo <= hi <= 150000:
        continue
    costs.append({"university_id": uid, "verification_status": "verified", "verified_at": "2026-11-21",
                  "notes": f"From {lo:,} to {hi:,} AUD a year across {len(ys)} bachelor courses. CRICOS register (Australian Government): course fee for international students divided by course length.",
                  "id": f"{uid}:cricos-tuition-international", "source_id": src["id"], "source_url": URL, "year": 2026,
                  "category": "tuition", "amount": lo, "currency": "AUD", "period": "year",
                  "student_category": "international", "program_id": None})
OUT.mkdir(parents=True, exist_ok=True)
json.dump({"data_sources": [src], "requirements": [], "costs": costs, "deadlines": [], "admissions": []}, open(OUT / "rows.json", "w"))
print(f"{len(costs)} Australian universities with international tuition (of {len(set(unis.values()))} in the catalogue)")
