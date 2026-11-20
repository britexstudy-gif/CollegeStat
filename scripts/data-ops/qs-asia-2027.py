#!/usr/bin/env python3
"""QS World University Rankings: Asia 2027 (published 3 Nov 2026) -> catalogue.

Input: data/raw/rankings/qs-asia-2027.xlsx (QS results table, downloaded from qs.com).
Matches by exact normalized name or alias within the same country, the same rule
as scripts/ingestion/link-rankings.py. Writes a "patches" package setting the
`qs_asia` field: {rank, rank_label, year, url}."""
import difflib, glob, json, re, unicodedata
from pathlib import Path
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[2]
URL = "https://www.topuniversities.com/asia-university-rankings"
COUNTRY = {"Hong Kong SAR, China": "HK", "China (Mainland)": "CN", "Macau SAR, China": "MO", "Taiwan": "TW", "South Korea": "KR", "Korea, Republic of": "KR", "Japan": "JP", "Singapore": "SG", "Malaysia": "MY", "Thailand": "TH", "Indonesia": "ID", "Philippines": "PH", "Vietnam": "VN", "Viet Nam": "VN", "India": "IN", "Pakistan": "PK", "Bangladesh": "BD", "Sri Lanka": "LK", "Nepal": "NP", "Kazakhstan": "KZ", "Uzbekistan": "UZ", "Kyrgyzstan": "KG", "Tajikistan": "TJ", "Turkmenistan": "TM", "Mongolia": "MN", "Brunei": "BN", "Brunei Darussalam": "BN", "Cambodia": "KH", "Myanmar": "MM", "Laos": "LA", "Macao SAR, China": "MO", "Republic of Korea": "KR", "Iran (Islamic Republic of)": "IR", "Iran": "IR", "Lao People's Democratic Republic": "LA"}
norm = lambda s: re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()).strip()
index = {}
for f in glob.glob(str(ROOT / "data/generated/catalogue/shard-*.json")):
    for u in json.load(open(f)).values():
        if u.get("published") is False:
            continue
        for n in [u.get("name"), u.get("short_name"), *(u.get("aliases") or [])]:
            if n:
                index.setdefault((norm(n), u.get("country_code")), set()).add(u["id"])
rows = list(load_workbook(ROOT / "data/raw/rankings/qs-asia-2027.xlsx", read_only=True, data_only=True).active.values)[4:]
patches, missed = [], []
for r in rows:
    if not r or not r[3] or r[1] is None:
        continue
    label = str(r[1]).strip()
    m = re.match(r"^=?(\d+)", label)
    if not m:
        continue
    code = COUNTRY.get(str(r[4]).strip())
    name = str(r[3])
    variants = [name, re.sub(r"\s*\([^)]*\)\s*$", "", name), re.sub(r"^The\s+", "", re.sub(r"\s*\([^)]*\)\s*$", "", name))]
    short = re.search(r"\(([^)]+)\)\s*$", name)
    if short:
        variants.append(short.group(1))
    ids = set()
    for v in variants:
        hit = index.get((norm(v), code))
        if hit and len(hit) == 1:
            ids = hit
            break
    if not ids and code:
        # Careful fuzzy match: same country, very similar name, clear winner.
        target = norm(re.sub(r"\s*\([^)]*\)", " ", re.sub(r"named after|«|»|^NLC", " ", name)))
        scored = sorted(((difflib.SequenceMatcher(None, target, k[0]).ratio(), v) for k, v in index.items() if k[1] == code and len(v) == 1), key=lambda x: -x[0])
        if scored and scored[0][0] >= 0.9 and (len(scored) < 2 or scored[0][0] - scored[1][0] >= 0.04 or scored[0][1] == scored[1][1]):
            ids = scored[0][1]
    if len(ids) != 1:
        missed.append(f"{r[3]} ({r[4]})")
        continue
    patches.append({"university_id": next(iter(ids)), "fields": {"qs_asia": {"rank": int(m.group(1)), "rank_label": label, "year": 2027, "url": URL}}})
out = ROOT / "data/review/qs-asia-2027/import"
out.mkdir(parents=True, exist_ok=True)
json.dump({"data_sources": [], "requirements": [], "costs": [], "deadlines": [], "admissions": [], "patches": patches}, open(out / "rows.json", "w"))
(out / "unmatched.txt").write_text("\n".join(missed))
print(f"QS Asia 2027: {len(patches)} matched, {len(missed)} unmatched (see unmatched.txt)")
