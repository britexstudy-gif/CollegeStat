#!/usr/bin/env python3
"""Prepare six private current programme offers in existing equivalent tables.

No hosted database access, migrations, publication, guessed language/year or
institution creation. A bounded fresh official source receipt supports each
offer; null reporting years fit university_programs and never source_records.
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
INPUT = ROOT / "outputs/current-degrees-oct10/candidates.json"
OUT = ROOT / "outputs/current-programmes-staging-oct10"
WATERLOO = "808b96a5-0e59-5215-a2f5-e7c3c5d2785a"
WIUT = "66666666-6666-4666-8666-666666666666"
EXCLUDED_SOURCE = "https://www.wiut.uz/bsc-hons-in-computer-science"
EXCLUDED_OFFER = "5762602e-a256-5202-9832-75f701bab7bc"
IDENTITIES = {
    WATERLOO: {"name": "University of Waterloo", "country_code": "CA", "domain": "uwaterloo.ca", "ror": "https://ror.org/01aff2v68"},
    WIUT: {"name": "Westminster International University in Tashkent", "country_code": "UZ", "domain": "wiut.uz", "ror": "https://ror.org/032vgar48"},
}
EXPECTED = {
    "8a977e62-f183-59b5-b7b7-2fec6b4fc858": (WIUT, "BA (Hons) in Business Management", "Business Management", "Bachelor of Arts (Hons)", "https://www.wiut.uz/business-management"),
    "a2075918-aac1-5476-8cab-f606a8d63e4b": (WIUT, "BSc (Hons) in Economics", "Economics", "Bachelor of Science (Hons)", "https://www.wiut.uz/economics"),
    "dc685b65-8b1a-5a0d-bd29-fbf05c1f216f": (WIUT, "BSc (Hons) in Finance", "Finance", "Bachelor of Science (Hons)", "https://www.wiut.uz/finance"),
    "fd764037-7fb2-5740-81a2-e66325133d07": (WATERLOO, "Computer Science", "Computer Science", "Bachelor of Computer Science in Computer Science or Bachelor of Mathematics in Computer Science", "https://uwaterloo.ca/future-students/programs/computer-science"),
    "d44e33ce-7151-5d87-a836-b1346372ef98": (WATERLOO, "Data Science", "Data Science", "Bachelor of Computer Science or a Bachelor of Mathematics in Data Science", "https://uwaterloo.ca/future-students/programs/data-science"),
    "d0a5d1b7-d387-5451-9267-5dd9393da3a4": (WATERLOO, "Software Engineering", "Software Engineering", "Bachelor of Software Engineering", "https://uwaterloo.ca/future-students/programs/software-engineering"),
}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def stable(value):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "https://collegestat.app/current-programmes-staging-oct10/" + value))


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


class OfficialText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.headings = [], []
        self.skip = 0
        self.heading = None

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        if tag == "h1":
            self.heading = []

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        if tag == "h1" and self.heading is not None:
            self.headings.append(" ".join(self.heading))
            self.heading = None

    def handle_data(self, text):
        text = " ".join(text.split())
        if self.skip or not text:
            return
        self.parts.append(text)
        if self.heading is not None:
            self.heading.append(text)


def parse(raw):
    parser = OfficialText()
    parser.feed(raw.decode("utf-8"))
    return " ".join(parser.parts), parser.headings


def fetch(out):
    folder = out / "evidence"
    folder.mkdir(parents=True, exist_ok=True)
    receipts = {}
    for cid, (uid, name, subject, qualification, url) in EXPECTED.items():
        req = urllib.request.Request(url, headers={"User-Agent": "CollegeStat official programme review (bounded six pages)"})
        with urllib.request.urlopen(req, timeout=25) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
            if response.url != url or len(raw) > 2 * 1024 * 1024:
                raise ValueError("Unexpected official source redirect or size")
            receipt = {"source_url": response.url, "sha256": digest(raw), "bytes": len(raw), "status": response.status,
                       "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"), "file": cid + ".html"}
        (folder / receipt["file"]).write_bytes(raw)
        receipts[cid] = receipt
    (folder / "fetch-manifest.json").write_text(json.dumps(receipts, indent=2, sort_keys=True) + "\n")


def validate_sources(folder):
    receipts = json.loads((folder / "fetch-manifest.json").read_text())
    if set(receipts) != set(EXPECTED):
        raise ValueError("Six exact official programme receipts required")
    for cid, receipt in receipts.items():
        uid, name, subject, qualification, url = EXPECTED[cid]
        raw = (folder / receipt["file"]).read_bytes()
        if receipt["source_url"] != url or receipt["sha256"] != digest(raw) or receipt["status"] != 200:
            raise ValueError("Official programme receipt changed")
        text, headings = parse(raw)
        if not any(h.startswith(name) for h in headings):
            raise ValueError("Official programme heading mismatch")
        if uid == WIUT:
            # Source overview block, not navigation menu or unrelated modules.
            match = re.search(r"WHAT YOU NEED TO KNOW (.+?) HOW YOU WILL STUDY", text)
            if not match:
                raise ValueError("Explicit WIUT award/duration/intake block unavailable")
            block = match.group(1)
            if "Award Title " + qualification not in block or "Start Date September (each academic year) Duration 3 years (full time)" not in block:
                raise ValueError("WIUT award/duration/intake unsupported")
            if name not in text:
                raise ValueError("WIUT exact base programme not offered")
        elif "Degree: " + qualification not in text:
            raise ValueError("Waterloo exact qualification unsupported")
    return receipts


def program_matches(program, candidate):
    return program["name"].strip().casefold() == candidate["degree_name"].strip().casefold() and program["degree_level"].strip().casefold() == candidate["level"].casefold() and program["language"] == candidate["language"]


def audit(candidates, preflight, receipts):
    if len(candidates) != 6 or {c["candidate_id"] for c in candidates} != set(EXPECTED):
        raise ValueError("Bounded six-candidate population changed")
    if preflight["identity_count"] != 2:
        raise ValueError("Nonunique hosted university identity")
    identities = {u["id"]: u for u in preflight["identities"]}
    for uid, expected in IDENTITIES.items():
        u = identities.get(uid, {})
        if any(u.get(k) != expected[k] for k in ("name", "country_code")) or u.get("identifiers", {}).get("ror") != expected["ror"] or not u.get("published"):
            raise ValueError("Hosted university identity mismatch")
        if urllib.parse.urlparse(u.get("website", "")).hostname not in (expected["domain"], "www." + expected["domain"]):
            raise ValueError("Hosted university official domain mismatch")
    rows = []
    for c in candidates:
        cid = c["candidate_id"]
        uid, name, subject, qualification, url = EXPECTED[cid]
        if (c["university_id"], c["degree_name"], c["subject"], c["qualification"], c["source_url"]) != EXPECTED[cid] or c["degree_url"] != url or c["qualification_url"] != url:
            raise ValueError("Exact candidate programme/qualification/source changed")
        if c["provider"] != IDENTITIES[uid]["name"] or c["university_name"] != IDENTITIES[uid]["name"] or c["evidence"]["publication_year"] is not None or not re.fullmatch(r"[0-9a-f]{64}", c["evidence"]["sha256"]):
            raise ValueError("Original provider/year/receipt provenance changed")
        if c["level"] != "Bachelor" or any(c[k] is not None for k in ("language", "reporting_year", "reporting_period", "campus", "tuition_amount", "verified_at")):
            raise ValueError("Unknown programme year/language/campus/tuition must stay null")
        if c["verification_status"] != "needs_review" or c["evidence"]["university_wide"] is not False:
            raise ValueError("Programme must remain unverified with specific scope")
        if c["evidence"]["scope"] != name + " · prospective undergraduates" or c["population"] != "Prospective undergraduate students":
            raise ValueError("Programme scope/population changed")
        duration, intake = ("3 years (full time)", "September (each academic year)") if uid == WIUT else (None, None)
        if (c["duration"], c["intake"]) != (duration, intake):
            raise ValueError("Candidate duration/intake changed")
        if url == EXCLUDED_SOURCE:
            raise ValueError("Installed WIUT Computer Science must not be duplicated")
        equivalent = [p for p in preflight["programs"] if program_matches(p, c)]
        if len(equivalent) > 1:
            raise ValueError("Ambiguous NULL-language global programme definitions")
        if equivalent and equivalent[0]["subject"].casefold() != subject.casefold():
            raise ValueError("Existing global programme subject conflict")
        pid = equivalent[0]["id"] if equivalent else stable("program/" + canonical([name.casefold(), "Bachelor", None]))
        for offer in preflight["offers"]:
            if offer["university_id"] == uid and (offer["program_id"] == pid or offer["source_url"] == url or program_matches(offer["program"], c)):
                raise ValueError("Equivalent hosted programme offer already installed")
        fresh = receipts[cid]
        evidence = {"review_schema": 1, "candidate_id": cid, "original_candidate": copy.deepcopy(c), "scope": c["evidence"]["scope"], "population": c["population"],
                    "provider": c["provider"], "qualification": qualification, "qualification_url": url, "official_programme_url": url,
                    "source_url": fresh["source_url"], "source_sha256": fresh["sha256"], "retrieved_at": fresh["retrieved_at"], "source_receipt": fresh,
                    "original_source_sha256": c["evidence"]["sha256"], "original_retrieved_at": c["retrieved_at"], "reporting_year": None, "publication_year": None,
                    "reporting_period": None, "language": None, "campus": None, "intake": intake, "duration": duration, "mode": "full time" if uid == WIUT else None,
                    "tuition_url": c["tuition_url"], "tuition_amount": None, "university_wide": False, "verification_status": "needs_review", "verified_at": None,
                    "availability_basis": "Official degree page advertised at retrieval; admissions cycle/open places not inferred.",
                    "license_note": "Private factual programme review; no open page-text/image reuse license asserted."}
        if len(canonical(evidence).encode()) >= 16000:
            raise ValueError("Programme evidence exceeds existing schema limit")
        rows.append({"id": stable("offer/" + uid + "/" + cid), "university_id": uid, "program_id": pid, "reuse_program": bool(equivalent), "name": name, "subject": subject,
                     "degree_level": "Bachelor", "language": None, "source_url": url, "source_name": c["university_name"] + " · " + name,
                     "retrieved_at": fresh["retrieved_at"], "evidence": evidence, "reporting_year": None, "duration_months": 36 if uid == WIUT else None,
                     "campus_id": None, "intakes": ["September"] if uid == WIUT else [], "availability": "current"})
    return rows


def staging_sql(rows, candidate_sha):
    return f"""-- Insert-only private programme offers; candidate SHA256 {candidate_sha}.
-- No source_records: reporting year absent. No guessed language, publication or schema writes.
begin;
do $programmes$
declare payload jsonb := {quote(canonical(rows))}::jsonb;
 r jsonb; u public.universities; p public.programs; existing public.university_programs;
 source_id uuid; target_pid uuid; expected_name text; expected_country text; expected_ror text; domain text; matches integer;
begin
 for r in select value from jsonb_array_elements(payload) loop
  perform pg_advisory_xact_lock(hashtextextended('programme:'||lower(r->>'name')||':Bachelor:null',0));
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
   raise exception 'Current programmes staging refused: hosted university identity changed';
  end if;
  select count(*) into matches from public.programs g where lower(btrim(g.name))=lower(btrim(r->>'name')) and lower(btrim(g.degree_level))='bachelor' and g.language is null;
  if matches>1 then raise exception 'Current programmes staging refused: duplicate NULL-language programme'; end if;
  select * into p from public.programs g where lower(btrim(g.name))=lower(btrim(r->>'name')) and lower(btrim(g.degree_level))='bachelor' and g.language is null;
  target_pid := coalesce(p.id,(r->>'program_id')::uuid);
  if p.id is not null and (lower(p.subject) is distinct from lower(r->>'subject') or p.id is distinct from (r->>'program_id')::uuid) then
   raise exception 'Current programmes staging refused: programme reconciliation required';
  end if;
  select count(*) into matches from public.university_programs o where o.university_id=u.id and (o.program_id=target_pid or o.source_url=r->>'source_url' or o.id=(r->>'id')::uuid);
  if matches>1 then raise exception 'Current programmes staging refused: equivalent offer ambiguity'; end if;
  select * into existing from public.university_programs o where o.university_id=u.id and (o.program_id=target_pid or o.source_url=r->>'source_url' or o.id=(r->>'id')::uuid);
  if exists(select 1 from public.university_programs o where o.id=(r->>'id')::uuid and o.university_id<>u.id) then
   raise exception 'Current programmes staging refused: offer ID collision';
  end if;
  if existing.id is not null then
   if existing.id is distinct from (r->>'id')::uuid or existing.program_id is distinct from target_pid
    or existing.source_url is distinct from r->>'source_url' or existing.evidence is distinct from r->'evidence'
    or existing.reporting_year is not null or existing.duration_months is distinct from (r->>'duration_months')::integer
    or existing.campus_id is not null or to_jsonb(existing.intakes) is distinct from r->'intakes' or existing.availability is distinct from 'current'
    or existing.verification_status not in ('needs_review','verified')
    or not exists(select 1 from public.data_sources s where s.id=existing.source_id and s.url=r->>'source_url' and s.organization=expected_name and s.source_type='official') then
    raise exception 'Current programmes staging refused: existing offer conflict';
   end if;
   continue;
  end if;
  if p.id is null then
   if exists(select 1 from public.programs g where g.id=target_pid) then raise exception 'Current programmes staging refused: programme ID collision'; end if;
   insert into public.programs(id,name,subject,degree_level,language) values(target_pid,r->>'name',r->>'subject','Bachelor',null);
  end if;
  if (select count(*) from public.data_sources s where s.url=r->>'source_url')>1 then raise exception 'Current programmes staging refused: duplicate official source URL'; end if;
  select id into source_id from public.data_sources s where s.url=r->>'source_url';
  if source_id is null then
   source_id := md5('current-programmes-staging-oct10/source/'||(r->>'source_url'))::uuid;
   insert into public.data_sources(id,name,organization,url,source_type,license_notes,retrieved_at,trust_level)
    values(source_id,r->>'source_name',expected_name,r->>'source_url','official',r->'evidence'->>'license_note',(r->>'retrieved_at')::timestamptz,'high');
  elsif not exists(select 1 from public.data_sources s where s.id=source_id and s.organization=expected_name and s.source_type='official') then
   raise exception 'Current programmes staging refused: source identity conflict';
  end if;
  insert into public.university_programs(id,university_id,program_id,source_id,source_url,verification_status,verified_at,evidence,reporting_year,duration_months,campus_id,intakes,availability)
   values((r->>'id')::uuid,u.id,target_pid,source_id,r->>'source_url','needs_review',null,r->'evidence',null,(r->>'duration_months')::integer,null,
    array(select jsonb_array_elements_text(r->'intakes')),'current');
 end loop;
end;
$programmes$;
commit;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--fetch", action="store_true")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        fetch(args.out)
    receipts = validate_sources(args.out / "evidence")
    candidates = json.loads(INPUT.read_text())["candidates"]
    preflight = json.loads((args.out / "hosted-preflight.json").read_text())
    rows = audit(candidates, preflight, receipts)
    sha = digest(INPUT.read_bytes())
    sql = staging_sql(rows, sha)
    (args.out / "stage-private-programmes.sql").write_text(sql)
    manifest = {"candidate_sha256": sha, "staged_offers": 6, "public_offers_added": 0, "new_programs": sum(not r["reuse_program"] for r in rows),
                "reused_programs": sum(r["reuse_program"] for r in rows), "existing_wiut_computer_science_excluded": EXCLUDED_OFFER,
                "source_records_created": 0, "hosted_writes": 0, "schema_changes": 0, "sql_file": str(args.out / "stage-private-programmes.sql"), "sql_sha256": digest(sql.encode()),
                "preflight_sha256": digest((args.out / "hosted-preflight.json").read_bytes()), "rows": rows}
    (args.out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in manifest.items() if k != "rows"}, indent=2))


if __name__ == "__main__":
    main()
