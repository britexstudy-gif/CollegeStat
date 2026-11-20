#!/usr/bin/env python3
"""Prepare five private review observations; never connect to or write hosted DB.

Muse receipts stay immutable. Seven undated requirements are held rather than
given a retrieval-year reporting period. Fresh corroboration is bounded to four
explicit official URLs. SQL only inserts into existing sources/imports/review
tables, with identity, historical-fact and semantic-dedup guards.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / "outputs/official-requirements-oct10/candidates.json"
OUT = ROOT / "outputs/official-requirements-staging-oct10"
WATERLOO = "808b96a5-0e59-5215-a2f5-e7c3c5d2785a"
WIUT = "66666666-6666-4666-8666-666666666666"
URLS = {
    "waterloo-deadlines": "https://uwaterloo.ca/future-students/admissions/deadlines",
    "wiut-tuition": "https://www.wiut.uz/tuition-fees",
    "wiut-international": "https://www.wiut.uz/tuition-fees-international",
    "wiut-cs": "https://www.wiut.uz/bsc-hons-in-computer-science",
}
EXPECTED = {
    "ba15f259-ff27-555c-9558-13a97e31c6cc": (WATERLOO, 2027, "2027-01-15", "application_deadline"),
    "3f39e950-6ea6-5eb5-802c-e087463ca52c": (WATERLOO, 2027, "2027-02-01", "application_deadline"),
    "888182e3-33b6-5e7c-a1b2-dfb46864ceff": (WATERLOO, 2027, "2027-02-15", "documents_deadline"),
    "6aa7b2e9-c444-5e10-b540-55e8398672d8": (WIUT, 2026, "38820000", "tuition"),
    "c5cee207-6cae-59d8-a168-e80bdf8965db": (WIUT, 2026, "54600000", "tuition"),
}
IDENTITIES = {
    WATERLOO: {"name": "University of Waterloo", "country_code": "CA", "domain": "uwaterloo.ca", "ror": "https://ror.org/01aff2v68"},
    WIUT: {"name": "Westminster International University in Tashkent", "country_code": "UZ", "domain": "wiut.uz", "ror": "https://ror.org/032vgar48"},
}
SCOPES = {
    "ba15f259-ff27-555c-9558-13a97e31c6cc": ("Undergraduate Engineering applicants · excluding Architecture", "Undergraduate Engineering applicants · excluding Architecture"),
    "3f39e950-6ea6-5eb5-802c-e087463ca52c": ("Undergraduate applicants · programmes other than Engineering", "Undergraduate applicants · programmes other than Engineering"),
    "888182e3-33b6-5e7c-a1b2-dfb46864ceff": ("Undergraduate applicants · programmes other than Engineering", "Undergraduate applicants · programmes other than Engineering"),
    "6aa7b2e9-c444-5e10-b540-55e8398672d8": ("Undergraduate students · domestic rate", "Undergraduate programmes · 2026/27"),
    "c5cee207-6cae-59d8-a168-e80bdf8965db": ("Undergraduate students · international rate", "Undergraduate programmes · international · 2026/27"),
}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def stable(value):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "https://collegestat.app/official-requirements-staging-oct10/" + value))


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


class SourceText(HTMLParser):
    """Keep table row boundaries and their latest section heading."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.rows = [], []
        self.skip = 0
        self.heading, self.heading_parts, self.row = "", None, None

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        if tag in ("h1", "h2", "h3"):
            self.heading_parts = []
        if tag == "tr":
            self.row = []

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        if tag in ("h1", "h2", "h3") and self.heading_parts is not None:
            self.heading = " ".join(self.heading_parts)
            self.heading_parts = None
        if tag == "tr" and self.row is not None:
            self.rows.append((self.heading, " ".join(self.row)))
            self.row = None

    def handle_data(self, text):
        text = " ".join(text.split())
        if not text or self.skip:
            return
        self.parts.append(text)
        if self.heading_parts is not None:
            self.heading_parts.append(text)
        if self.row is not None:
            self.row.append(text)


def parse(raw):
    parser = SourceText()
    parser.feed(raw.decode("utf-8"))
    return " ".join(parser.parts), parser.rows


def fetch_sources(out):
    folder = out / "evidence"
    folder.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for key, url in URLS.items():
        request = urllib.request.Request(url, headers={"User-Agent": "CollegeStat official fact review (bounded four pages)"})
        with urllib.request.urlopen(request, timeout=25) as response:
            final = response.url
            if urllib.parse.urlparse(final).hostname != urllib.parse.urlparse(url).hostname:
                raise ValueError("Unexpected official-source redirect")
            raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024:
                raise ValueError("Official source exceeded bounded fetch size")
            manifest[key] = {"source_url": final, "sha256": digest(raw), "bytes": len(raw), "status": response.status,
                             "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"), "file": key + ".html"}
        (folder / (key + ".html")).write_bytes(raw)
    (folder / "fetch-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")


def validate_sources(folder):
    receipts = json.loads((folder / "fetch-manifest.json").read_text())
    texts, rows = {}, {}
    if set(receipts) != set(URLS):
        raise ValueError("Four exact official sources required")
    for key, receipt in receipts.items():
        raw = (folder / receipt["file"]).read_bytes()
        if receipt["source_url"] != URLS[key] or receipt["sha256"] != digest(raw) or receipt["status"] != 200:
            raise ValueError("Official source receipt changed")
        texts[key], rows[key] = parse(raw)
    waterloo = rows["waterloo-deadlines"]
    if not any(row.startswith("Programs other than Engineering February 1, 2027 February 15, 2027") for _, row in waterloo):
        raise ValueError("Waterloo non-engineering dates unsupported")
    if not any(row.startswith("Engineering programs (other than Architecture) January 15, 2027 February 1, 2027") for _, row in waterloo):
        raise ValueError("Waterloo Engineering date/scope unsupported")
    for key, amount in (("wiut-tuition", "38,820,000"), ("wiut-international", "54,600,000")):
        if not any("2026/27" in heading and "Undergraduate Courses" in row and amount + " UZS" in row and "academic year" in row for heading, row in rows[key]):
            raise ValueError("WIUT exact undergraduate fee/year/period unsupported")
    if not re.search(r"Domestic\s*-\s*38,820,000 UZS /per year", texts["wiut-cs"]) or not re.search(r"International\s*-\s*54,600,000 UZS /per year", texts["wiut-cs"]):
        raise ValueError("WIUT domestic/international fee population unsupported")
    return receipts


def audit(candidates, preflight, receipts):
    if len(candidates) != 12 or len({c["candidate_id"] for c in candidates}) != 12:
        raise ValueError("Immutable Muse candidate population changed")
    identities = {u["id"]: u for u in preflight["identities"]}
    if preflight["identity_count"] != 2:
        raise ValueError("Ambiguous hosted identity")
    for uid, expected in IDENTITIES.items():
        actual = identities.get(uid, {})
        if any(actual.get(k) != expected[k] for k in ("name", "country_code")) or not actual.get("published") or actual.get("identifiers", {}).get("ror") != expected["ror"]:
            raise ValueError("Hosted exact identity mismatch")
        if urllib.parse.urlparse(actual.get("website", "")).hostname not in (expected["domain"], "www." + expected["domain"]):
            raise ValueError("Hosted official domain mismatch")
    staged, held = [], []
    for candidate in candidates:
        original = copy.deepcopy(candidate)
        cid = candidate["candidate_id"]
        if cid not in EXPECTED:
            if candidate.get("year") is not None:
                raise ValueError("Undated candidate reporting year manufactured")
            held.append({"candidate_id": cid, "label": candidate["label"], "university_id": candidate["university_id"], "reason": "no_explicit_reporting_year_source_records_year_is_required", "original": original})
            continue
        uid, year, value, metric = EXPECTED[cid]
        if (candidate["university_id"], candidate["year"], candidate["value_text"]) != (uid, year, value):
            raise ValueError("Approved bounded fact value/year/identity changed")
        if candidate["verification_status"] != "needs_review" or candidate["verified_at"] is not None:
            raise ValueError("Candidate must remain private/unverified")
        is_fee = metric == "tuition"
        population = candidate["population"]
        if (population, candidate["evidence"]["scope"]) != SCOPES[cid] or candidate["evidence"]["university_wide"] is not False:
            raise ValueError("Candidate population/scope changed")
        expected_cycle = "2026/27 academic year" if is_fee else "2027 entry · September intake"
        if candidate["cycle"] != expected_cycle or candidate["program"] != ("Undergraduate programmes" if is_fee else None):
            raise ValueError("Candidate programme/cycle changed")
        key = "wiut-international" if value == "54600000" else "wiut-tuition" if is_fee else "waterloo-deadlines"
        primary = receipts[key]
        semantic = {"university_id": uid, "metric": metric, "year": year, "cycle": candidate["cycle"], "population": population,
                    "program": candidate["program"], "value_text": value, "currency": candidate["currency"], "period": candidate["period"]}
        review_key = digest(canonical(semantic).encode())
        reviewed_evidence = {"review_schema": 1, "review_key": review_key, "source_url": primary["source_url"], "source_sha256": primary["sha256"], "retrieved_at": primary["retrieved_at"],
                            "reporting_period": candidate["evidence"]["reporting_period"], "reporting_year": year, "publication_year": None, "population": population,
                            "scope": candidate["evidence"]["scope"], "university_wide": False, "scale": candidate["evidence"]["scale"],
                            "year_provenance": {"source_url": primary["source_url"], "source_sha256": primary["sha256"], "cross_source_corroboration": primary["source_url"] != candidate["source_url"]},
                            "original_source_url": candidate["source_url"], "original_source_sha256": candidate["evidence"]["sha256"], "original_retrieved_at": candidate["retrieved_at"],
                            "source_receipts": [primary] + ([receipts["wiut-cs"]] if is_fee else []), "verification_status": "needs_review", "verified_at": None,
                            "license_note": "Private factual review summary only; no open reuse license or image/text republication permission asserted."}
        if is_fee:
            reviewed_evidence.update({"currency": "UZS", "period": "academic year", "source_programme_scope": "Undergraduate Courses", "programme_specific": False, "amount_scale": "nominal UZS; no thousands multiplier or currency conversion"})
        else:
            reviewed_evidence.update({"date_precision": "date", "due_date": value, "due_at": None, "cutoff_time": None, "timezone_claim": candidate["evidence"]["timezone"], "timezone_source_confirmed": False})
        raw = {**semantic, "candidate_id": cid, "label": candidate["label"], "target_table": candidate["target_table"], "original_candidate": original,
               "verification_status": "needs_review", "verified_at": None, "evidence": reviewed_evidence}
        normalized = int(value) if is_fee else None
        if is_fee and (candidate["amount"] != normalized or candidate["currency"] != "UZS" or candidate["period"] != "year"):
            raise ValueError("Tuition scale/currency/period changed")
        row = {"id": stable("observation/" + review_key), "university_id": uid, "metric": metric, "year": year, "raw_value": raw, "normalized_value": normalized,
               "unit": "UZS per academic year" if is_fee else "date", "source_url": primary["source_url"], "retrieved_at": primary["retrieved_at"], "review_key": review_key}
        # Hosted current equivalents are reviewed before SQL preparation. Exact
        # matching current typed facts must never gain a duplicate pending row.
        for table in ("source_records", "costs", "deadlines", "data_points", "imported_costs_or_deadlines"):
            for old in preflight.get(table, []):
                if old.get("university_id", uid) != uid:
                    continue
                if old.get("raw_value", {}).get("evidence", {}).get("review_key") == review_key:
                    raise ValueError("Exact hosted pending observation already installed")
                if table == "costs" and old.get("year") == year and old.get("category") == "tuition" and old.get("amount") == normalized and old.get("student_category") == population:
                    raise ValueError("Exact hosted current tuition already installed")
                if table == "deadlines" and old.get("cycle") == candidate["cycle"] and old.get("title") == candidate["label"] and old.get("student_category") == population and old.get("due_date") == value:
                    raise ValueError("Exact hosted current deadline already installed")
                if table in ("data_points", "imported_costs_or_deadlines") and old.get("year", old.get("reporting_year")) == year and old.get("metric") == metric:
                    raise ValueError("Existing generic current fact requires scope comparison")
        staged.append(row)
    if len(staged) != 5 or len(held) != 7:
        raise ValueError("Expected exactly five dated facts and seven held requirements")
    return staged, held


def staging_sql(rows, candidate_sha):
    return f"""-- Private insert-only review staging, immutable candidate SHA256 {candidate_sha}.
-- No schema changes, publication, verified timestamp or current-fact mutation.
begin;
do $staging$
declare payload jsonb := {quote(canonical(rows))}::jsonb;
 r jsonb; u public.universities; source_id uuid; import_id uuid; observation_id uuid;
 existing public.source_records; existing_import public.data_imports;
 expected_name text; expected_country text; expected_ror text; domain text; raw jsonb;
begin
 for r in select value from jsonb_array_elements(payload) loop
  perform pg_advisory_xact_lock(hashtextextended(r->>'review_key',0));
  select * into u from public.universities where id=(r->>'university_id')::uuid for share;
  if r->>'university_id'={quote(WATERLOO)} then
   expected_name='University of Waterloo'; expected_country='CA'; expected_ror='https://ror.org/01aff2v68'; domain='uwaterloo.ca';
  else
   expected_name='Westminster International University in Tashkent'; expected_country='UZ'; expected_ror='https://ror.org/032vgar48'; domain='wiut.uz';
  end if;
  if u.id is null or not u.published or u.name is distinct from expected_name or u.country_code is distinct from expected_country
   or u.identifiers->>'ror' is distinct from expected_ror or u.website !~ ('^https://(www\\.)?'||replace(domain,'.','\\.')||'/?$')
   or (select count(*) from public.universities where name=expected_name and country_code=expected_country)<>1
   or (select count(*) from public.universities where identifiers->>'ror'=expected_ror)<>1 then
   raise exception 'Official requirements staging refused: hosted identity changed';
  end if;
  raw := r->'raw_value'; observation_id := (r->>'id')::uuid;
  select * into existing from public.source_records where id=observation_id;
  if existing.id is not null then
   if existing.university_id is distinct from u.id or existing.metric is distinct from r->>'metric'
    or existing.year is distinct from (r->>'year')::integer or existing.raw_value is distinct from raw
    or existing.source_url is distinct from r->>'source_url' or existing.normalized_value is distinct from (r->>'normalized_value')::numeric
    or existing.unit is distinct from r->>'unit' then
    raise exception 'Official requirements staging refused: review ID collision';
   end if;
   continue;
  end if;
  if exists(select 1 from public.source_records s where s.university_id=u.id and s.year=(r->>'year')::integer
    and (s.raw_value->'evidence'->>'review_key'=r->>'review_key' or s.raw_value->>'candidate_id'=raw->>'candidate_id'
     or (s.metric=r->>'metric' and coalesce(s.raw_value->>'population',s.raw_value->>'student_category','')='')
     or (s.metric=r->>'metric' and s.raw_value->>'population'=raw->>'population'
      and s.raw_value->>'cycle'=raw->>'cycle' and s.raw_value->>'value_text'=raw->>'value_text'))) then
   raise exception 'Official requirements staging refused: equivalent pending/current observation';
  end if;
  if exists(select 1 from public.costs c where c.university_id=u.id and c.year=(r->>'year')::integer and r->>'metric'='tuition'
    and c.category='tuition' and c.amount=(r->>'normalized_value')::numeric and c.currency='UZS' and c.student_category=raw->>'population')
   or exists(select 1 from public.deadlines d where d.university_id=u.id and d.cycle=raw->>'cycle'
    and d.title=raw->>'label' and d.student_category=raw->>'population' and d.due_date=(raw->'evidence'->>'due_date')::date)
   or exists(select 1 from public.data_points p where p.university_id=u.id and p.year=(r->>'year')::integer and p.metric=r->>'metric') then
   raise exception 'Official requirements staging refused: current fact requires reconciliation';
  end if;
  if (select count(*) from public.data_sources s where s.url=r->>'source_url')>1 then
   raise exception 'Official requirements staging refused: duplicate source URL';
  end if;
  select id into source_id from public.data_sources s where s.url=r->>'source_url';
  if source_id is null then
   source_id := md5('official-requirements-staging-oct10/source/'||(r->>'source_url'))::uuid;
   insert into public.data_sources(id,name,organization,url,source_type,license_notes,retrieved_at,trust_level)
    values(source_id,expected_name||' official admissions/tuition facts',expected_name,r->>'source_url','official',raw->'evidence'->>'license_note',(r->>'retrieved_at')::timestamptz,'high');
  elsif not exists(select 1 from public.data_sources s where s.id=source_id and s.organization=expected_name and s.source_type='official') then
   raise exception 'Official requirements staging refused: source registry identity conflict';
  end if;
  import_id := md5('official-requirements-staging-oct10/import/'||(r->>'source_url')||'/{candidate_sha}')::uuid;
  select * into existing_import from public.data_imports i where i.id=import_id;
  if existing_import.id is null then
   insert into public.data_imports(id,source_id,started_at,status,records_seen,warnings)
    values(import_id,source_id,(r->>'retrieved_at')::timestamptz,'review',
     (select count(*) from jsonb_array_elements(payload) v where v->>'source_url'=r->>'source_url'),
     jsonb_build_array('Private review only; no publication. Seven undated requirements held. Original candidate SHA256 {candidate_sha}'));
  elsif existing_import.source_id is distinct from source_id then
   raise exception 'Official requirements staging refused: import ID collision';
  end if;
  insert into public.source_records(id,import_id,source_id,university_id,metric,year,raw_value,normalized_value,unit,confidence,status,source_url,retrieved_at,notes)
   values(observation_id,import_id,source_id,u.id,r->>'metric',(r->>'year')::integer,raw,(r->>'normalized_value')::numeric,r->>'unit','medium','pending',r->>'source_url',(r->>'retrieved_at')::timestamptz,
    'Private official fact review. Original candidate retained. Dates have day precision and no invented cutoff timestamp; tuition is nominal UZS for the stated academic year.');
 end loop;
end;
$staging$;
commit;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--fetch", action="store_true", help="Bounded official-source fetch; no database calls")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        fetch_sources(args.out)
    receipts = validate_sources(args.out / "evidence")
    candidates = json.loads(INPUT.read_text())["candidates"]
    preflight = json.loads((args.out / "hosted-preflight.json").read_text())
    rows, held = audit(candidates, preflight, receipts)
    sha = digest(INPUT.read_bytes())
    sql = staging_sql(rows, sha)
    (args.out / "stage-private-review.sql").write_text(sql)
    (args.out / "held-undated.json").write_text(json.dumps(held, indent=2, ensure_ascii=False) + "\n")
    manifest = {"candidate_sha256": sha, "staged_count": len(rows), "held_count": len(held), "university_count": 2, "source_count": len({r["source_url"] for r in rows}),
                "private_only": True, "hosted_writes": 0, "schema_changes": 0, "sql_file": str(args.out / "stage-private-review.sql"), "sql_sha256": digest(sql.encode()),
                "row_ids": [r["id"] for r in rows], "rows": rows, "preflight_sha256": digest((args.out / "hosted-preflight.json").read_bytes())}
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({k: v for k, v in manifest.items() if k not in ("rows", "row_ids")}, indent=2))


if __name__ == "__main__":
    main()
