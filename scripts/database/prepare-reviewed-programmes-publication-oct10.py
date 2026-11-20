#!/usr/bin/env python3
"""Prepare a bounded, reviewable publication of five installed official offers.

Run after independent official-source review. No network or hosted writes occur.
The generic economics offer remains private because its exact pathway is unclear.
"""
from __future__ import annotations
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "outputs/current-programmes-staging-oct10"
spec = importlib.util.spec_from_file_location("staging", ROOT / "scripts/database/prepare-current-programmes-staging-oct10.py")
staging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(staging)
HELD = "abb01cfc-5706-53cf-8e84-f7750fe034ff"
APPROVED = {
    "f871fb8b-5eee-5942-88fa-7c6c339b974b",
    "c4a66051-0302-590e-b506-fc56a825adc4",
    "0bf7ff30-b1a0-5ae6-a289-183777b77d84",
    "4f77c970-262e-5748-b999-d071f400c71e",
    "37072b72-5fb3-5f7f-82a3-ef0c5095eb64",
}


def prepare(manifest, preflight, receipts, verified_at):
    if len(manifest["rows"]) != 6 or {r["id"] for r in manifest["rows"]} != APPROVED | {HELD}:
        raise ValueError("The six bounded staged offers changed")
    hosted = {r["id"]: r for r in preflight["offers"]}
    if set(hosted) != APPROVED | {HELD}:
        raise ValueError("Exact staged hosted offers required")
    rows = []
    for candidate in manifest["rows"]:
        if candidate["id"] not in APPROVED:
            continue
        expected = copy.deepcopy(hosted[candidate["id"]])
        program, source = expected.pop("program"), expected.pop("source")
        cid = candidate["evidence"]["candidate_id"]
        receipt = receipts[cid]
        if expected["evidence"] != candidate["evidence"] or expected["verification_status"] != "needs_review" or expected["verified_at"] is not None:
            raise ValueError("Installed candidate evidence or verification state changed")
        if any(expected[k] != candidate[k] for k in ("university_id", "program_id", "source_url", "reporting_year", "duration_months", "campus_id", "intakes", "availability")):
            raise ValueError("Installed scope or facts differ from reviewed offer")
        if any(program[k] != candidate[k] for k in ("name", "subject", "degree_level", "language")):
            raise ValueError("Exact global programme definition changed")
        if source["id"] != expected["source_id"] or source["url"] != candidate["source_url"] or source["source_type"] != "official" or source["organization"] != candidate["evidence"]["provider"]:
            raise ValueError("Exact official source identity changed")
        if receipt["sha256"] != candidate["evidence"]["source_sha256"] or receipt["source_url"] != source["url"]:
            raise ValueError("Official source receipt changed")
        if any(candidate[k] is not None for k in ("language", "reporting_year", "campus_id")) or candidate["evidence"]["tuition_amount"] is not None:
            raise ValueError("Unknown values must remain absent")
        if cid.startswith("a207"):
            raise ValueError("Unreconciled economics pathways must not publish")
        evidence = copy.deepcopy(candidate["evidence"])
        evidence.update(verification_status="verified", verified_at=verified_at,
                        license_note="Official factual programme description with source link; no open page-text or image reuse licence asserted.",
                        independent_review={"reviewed_at": verified_at, "method": "Official heading and exact award independently checked; duration/intake only from explicit programme overview. Source receipts validated by SHA256.",
                                            "scope": evidence["scope"], "no_admission_opening_inferred": True,
                                            "prior_verification_status": "needs_review"})
        rows.append({"id": candidate["id"], "expected": expected, "program": program, "source": source,
                     "evidence": evidence, "verified_at": verified_at, "candidate": candidate})
    return rows


def sql(rows):
    payload = staging.quote(staging.canonical([{k:v for k,v in r.items() if k != "candidate"} for r in rows]))
    return """-- Independently reviewed official programme facts; exact existing rows only.
-- Five offers publish; generic economics stays private. No inserts/deletes/schema changes.
begin;
set local timezone='UTC';
do $review$
declare payload jsonb := """ + payload + """::jsonb; r jsonb; o public.university_programs;
begin
 perform pg_advisory_xact_lock(hashtextextended('reviewed-programmes-oct10',0));
 for r in select value from jsonb_array_elements(payload) loop
  select * into o from public.university_programs where id=(r->>'id')::uuid for update;
  if o.id is null then raise exception 'Reviewed programme absent'; end if;
  if (select to_jsonb(p) from public.programs p where p.id=o.program_id) is distinct from r->'program'
   or (select to_jsonb(s) from public.data_sources s where s.id=o.source_id) is distinct from r->'source'
   or not exists(select 1 from public.universities u where u.id=o.university_id and u.published
      and u.name=r->'evidence'->>'provider') then
   raise exception 'Programme/source/institution identity changed';
  end if;
  if (to_jsonb(o)-'verification_status'-'verified_at'-'evidence') = ((r->'expected')-'verification_status'-'verified_at'-'evidence')
   and o.verification_status='verified' and o.verified_at=(r->>'verified_at')::timestamptz and o.evidence=r->'evidence' then continue; end if;
  if to_jsonb(o) is distinct from r->'expected' then raise exception 'Programme observation changed since review'; end if;
  update public.university_programs set verification_status='verified', verified_at=(r->>'verified_at')::timestamptz, evidence=r->'evidence' where id=o.id;
 end loop;
end;
$review$;
commit;
"""


def main():
    manifest = json.loads((OUT / "manifest.json").read_text())
    preflight = json.loads((OUT / "publication-preflight.json").read_text())
    receipts = staging.validate_sources(OUT / "evidence")
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    rows = prepare(manifest, preflight, receipts, timestamp)
    statement = sql(rows)
    (OUT / "publish-reviewed-programmes.sql").write_text(statement)
    # Publication file is kept in outputs until a hosted receipt confirms success.
    records = []
    for row in rows:
        candidate = row["candidate"]
        records.append({**row["expected"], "verification_status": "verified", "verified_at": timestamp,
                        "evidence": row["evidence"], "programs": row["program"], "data_sources": row["source"]})
    result = {"status": "prepared_not_published", "reviewed_at": timestamp,
              "records": records, "held": [{"id": HELD, "reason": "Official page names Economics with Data Science and Economics with Finance pathways; generic base award not reconciled."}],
              "source_candidate_sha256": manifest["candidate_sha256"],
              "sql_sha256": hashlib.sha256(statement.encode()).hexdigest()}
    (OUT / "reviewed-programmes-publication.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"prepared": len(rows), "held": 1, "hosted_writes": 0, "sql_sha256": result["sql_sha256"]}))


if __name__ == "__main__":
    main()
