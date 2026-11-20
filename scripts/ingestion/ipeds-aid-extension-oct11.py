#!/usr/bin/env python3
"""Dry-run or prepare private SFA2324 review records from existing verified ZIPs.

No network, credentials, database connection, catalogue edit or publication.
Reuses the existing SFA archive, numeric and identity adapter; extends only the
27 unused dictionary fields listed below. --stage-review writes a new compact
receipt and guarded, pending-only SQL for independent review, never executes it.
"""
import argparse
import collections
import csv
import datetime
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("existing_ipeds_aid", ROOT / "scripts/ingestion/ipeds-financial-aid.py")
aid = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(aid)
SOURCE_SHA = "1cbcfb3194e68ce1fbca17812327c37c3a20c4cd03654c934dd50d02b18060bc"
DICTIONARY_SHA = "2f65a2d1887dbd5286f4ea59dfab9fc0d21f0783df9c0c3ba48f73b4636d9bab"
SOURCE_ID = "37c312bf-a9b9-531f-8afa-f353417afe4a"  # Reused only when no source URL already exists.
PERIOD = aid.PERIOD
COHORTS = {
    "all_undergraduate": aid.UNDERGRADUATE,
    "degree_seeking": "Degree/certificate-seeking undergraduate students in the SFA financial-aid cohort",
    "non_degree_seeking": "Non-degree/non-certificate-seeking undergraduate students in the SFA financial-aid cohort",
    "first_time": aid.FIRST_TIME,
}
# Explicit provider field/metric/population/title contracts, not column heuristics.
# Three output values per family: count, percent, recipient/borrower average.
FAMILIES = (
    ("UFLOAN", "undergraduate_federal_loan", "all_undergraduate", "loan", "", "undergraduate students awarded federal student loans", "federal student loans awarded to undergraduate students"),
    ("UDGFLOAN", "degree_seeking_undergraduate_federal_loan", "degree_seeking", "loan", "", "degree/certificate-seeking undergraduate students awarded federal student loans", "federal student loans awarded to degree/certificate-seeking undergraduate students"),
    ("UNDFLOAN", "non_degree_seeking_undergraduate_federal_loan", "non_degree_seeking", "loan", "", "non-degree/non-certificate-seeking undergraduate students awarded federal student loans", "federal student loans awarded to non-degree/non-certificate-seeking undergraduate students"),
    ("FGRNT", "first_time_federal_grant", "first_time", "grant", "_", "full-time first-time undergraduates awarded federal grant aid", "federal grant aid awarded to full-time first-time undergraduates"),
    ("OFGRT", "first_time_other_federal_grant", "first_time", "grant", "_", "full-time first-time undergraduates awarded other federal grant aid", "other federal grant aid awarded to full-time first-time undergraduates"),
    ("SGRNT", "first_time_state_local_grant", "first_time", "grant", "_", "full-time first-time undergraduates awarded state/local grant aid", "state/local grant aid awarded to full-time first-time undergraduates"),
    ("LOAN", "first_time_loan", "first_time", "loan", "_", "full-time first-time undergraduates awarded student loans", "student loans awarded to full-time first-time undergraduates"),
    ("FLOAN", "first_time_federal_loan", "first_time", "loan", "_", "full-time first-time undergraduates awarded federal student loans", "federal student loans awarded to full-time first-time undergraduates"),
    ("OLOAN", "first_time_other_loan", "first_time", "loan", "_", "full-time first-time undergraduates awarded other student loans", "other student loans awarded to full-time first-time undergraduates"),
)
FIELDS = {}
for prefix, metric, cohort, kind, separator, subject, average_subject in FAMILIES:
    for suffix, label, metric_suffix, unit in (
        ("N", "Number of ", "recipients", "students"),
        ("P", "Percent of ", "recipients_percent", "%"),
        ("A", "Average amount of ", "average_amount" if kind == "loan" else "average_award", "USD"),
    ):
        FIELDS[prefix + separator + suffix] = {
            "metric": metric + "_" + metric_suffix, "unit": unit,
            "cohort": COHORTS[cohort], "cohort_key": cohort, "aid_kind": kind,
            "expected_title": label + (average_subject if suffix == "A" else subject),
        }


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def stable(key):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "https://collegestat.app/import/" + key))


def dictionary_rows(path):
    with zipfile.ZipFile(path) as outer:
        if outer.namelist() != ["sfa2324.xlsx"]:
            raise ValueError("Unexpected SFA2324 dictionary archive layout")
        with zipfile.ZipFile(io.BytesIO(outer.read("sfa2324.xlsx"))) as workbook:
            strings = ["".join(item.itertext()) for item in ET.fromstring(workbook.read("xl/sharedStrings.xml")).findall("m:si", aid.NS)]
            result = {}
            for sheet in (1, 2, 3):
                rows = []
                for row in ET.fromstring(workbook.read(f"xl/worksheets/sheet{sheet}.xml")).findall(".//m:row", aid.NS):
                    values = {}
                    for cell in row.findall("m:c", aid.NS):
                        value = cell.find("m:v", aid.NS)
                        value = value.text if value is not None else ""
                        values[re.sub(r"[0-9]", "", cell.attrib["r"])] = strings[int(value)] if cell.attrib.get("t") == "s" and value else value
                    rows.append(values)
                result[sheet] = rows
            return result


def validate_field_contract(variables, descriptions, existing_mapping):
    mapping = {}
    if set(FIELDS) & set(existing_mapping) or {f["metric"] for f in FIELDS.values()} & {f["metric"] for f in existing_mapping.values()}:
        raise ValueError("Extension duplicates an existing SFA field or metric")
    for field, expected in FIELDS.items():
        variable = variables.get(field)
        description = descriptions.get(field)
        if not variable or variable.get("F") != "X" + field or variable.get("G") != expected["expected_title"] or not description:
            raise ValueError("Official dictionary does not validate extension field " + field)
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,79}", expected["metric"]):
            raise ValueError("Metric exceeds existing staging contract")
        mapping[field] = {**expected, "imputation_variable": variable["F"], "dictionary_title": variable["G"], "dictionary_description": description}
    return mapping


def read_dictionary(path):
    # Validate release/year/net-price note and R/Z definitions through the
    # installed adapter before extracting additional exact Varlist fields.
    existing, flags = aid.read_dictionary(path)
    sheets = dictionary_rows(path)
    variables = {r["B"]: r for r in sheets[2] if r.get("B") and r["B"] != "varName"}
    descriptions = {r["B"]: r.get("C", "").replace("_x000D_", "").strip() for r in sheets[3] if r.get("B")}
    if any(re.search(r"(21|22|23|24|25)$", field) for field in FIELDS):
        raise ValueError("Unexpected year-suffixed field; period requires new review")
    intro = [r.get("A", "") for r in sheets[1]]
    if "(Provisional release)" not in intro:
        raise ValueError("Release status differs from cached provisional dictionary")
    return validate_field_contract(variables, descriptions, existing), flags, existing


def strict_identities(catalogue):
    eligible, invalid = [], []
    for university in catalogue:
        if university.get("country_code") != "US":
            continue
        unitid = university.get("unitid")
        if type(unitid) not in (str, int) or not re.fullmatch(r"[1-9][0-9]{5}", str(unitid)):
            invalid.append({"university_id": university["id"], "reason": "missing_or_invalid_exact_us_unitid"})
            continue
        eligible.append(university)
    identities, ambiguous, all_ids = aid.map_existing_unitids(eligible)
    return identities, ambiguous, all_ids, sorted(invalid, key=lambda r: r["university_id"])


def observation_id(unitid, field, mapping):
    return stable(f"SFA2324-extension:{SOURCE_SHA}:{DICTIONARY_SHA}:{unitid}:{field}:2024:{PERIOD}:{mapping['cohort']}")


def read_source_rows(path, mapping, identities, all_ids):
    records, identity_holds = [], []
    exclusions, field_counts = collections.Counter(), collections.Counter()
    seen = set()
    with zipfile.ZipFile(path) as archive:
        if archive.namelist() != ["sfa2324.csv"]:
            raise ValueError("Unexpected SFA2324 source archive layout")
        reader = csv.DictReader(io.TextIOWrapper(archive.open("sfa2324.csv"), encoding="utf-8-sig"))
        required = {"UNITID"} | set(mapping) | {m["imputation_variable"] for m in mapping.values()}
        if not required.issubset(reader.fieldnames or []):
            raise ValueError("Source missing exact dictionary fields")
        for raw in reader:
            unitid = raw["UNITID"]
            if not re.fullmatch(r"[1-9][0-9]{5}", unitid):
                raise ValueError("Source contains invalid exact UNITID")
            if unitid in seen:
                raise ValueError("Duplicate source UNITID " + unitid)
            seen.add(unitid)
            university = identities.get(unitid)
            if not university:
                reason = "ambiguous_unitid" if unitid in all_ids else "no_existing_unitid_identity"
                exclusions[reason] += 1
                identity_holds.append({"unitid": unitid, "reason": reason})
                continue
            values = {}
            for field, definition in mapping.items():
                value = aid.normalize_number(raw, field, definition, exclusions)
                if value is not None:
                    values[field] = {**value, "id": observation_id(unitid, field, definition), "raw_value": raw[field], "raw_flag": raw[definition["imputation_variable"]]}
                    field_counts[field] += 1
            if values:
                records.append({"university_id": university["id"], "unitid": unitid, "name": university["name"], "values": values})
            else:
                exclusions["no_publishable_selected_fields"] += 1
    records.sort(key=lambda row: int(row["unitid"]))
    return records, len(seen), dict(sorted(exclusions.items())), dict(sorted(field_counts.items())), identity_holds


def value_signature(receipt):
    rows = []
    for institution in receipt["records"]:
        for field, fact in institution["values"].items():
            definition = receipt["mappings"][field]
            rows.append(":".join(map(str, [institution["university_id"], definition["metric"], 2024, fact["value"], definition["unit"], field, fact["flag"]])))
    return hashlib.md5("\n".join(sorted(rows)).encode()).hexdigest()


def build_receipt(reviewed_at="2026-10-11"):
    if datetime.date.fromisoformat(reviewed_at).isoformat() != reviewed_at:
        raise ValueError("Review date must be an ISO calendar date")
    data_path, source = aid.verified_archive("SFA2324.zip", aid.SOURCE_URL)
    dictionary_path, dictionary = aid.verified_archive("SFA2324_Dict.zip", aid.DICTIONARY_URL)
    if source["sha256"] != SOURCE_SHA or dictionary["sha256"] != DICTIONARY_SHA:
        raise ValueError("Snapshot differs from independently reviewed source/dictionary")
    for evidence in (source, dictionary):
        stamp = datetime.datetime.fromisoformat(evidence["retrieved_at"].replace("Z", "+00:00"))
        if stamp.tzinfo is None or not re.match(r"^\d{4}-\d{2}-\d{2}T", evidence["retrieved_at"]):
            raise ValueError("Original retrieval date requires an explicit timezone")
    mapping, flags, existing = read_dictionary(dictionary_path)
    catalogue_path = ROOT / "data/published/global-directory.json"
    identities, ambiguous, all_ids, invalid = strict_identities(json.loads(catalogue_path.read_text()))
    records, source_rows, exclusions, field_counts, held = read_source_rows(data_path, mapping, identities, all_ids)
    receipt = {
        "schema_version": 1, "status": "reviewed_staging_receipt", "reviewed_at": reviewed_at,
        "verification_status": "needs_review", "last_verified_at": None,
        "source": {**source, "name": "NCES IPEDS Student Financial Aid 2023–24", "organization": "National Center for Education Statistics", "source_type": "government", "release": "SFA2324 provisional release, as identified in the cached dictionary", "reporting_year": 2024, "period": PERIOD, "license_note": "Public-use institution-level NCES IPEDS data; original citation, reporting populations and dictionary definitions retained.", "reuse_evidence_url": "https://nces.ed.gov/ipeds/use-the-data"},
        "dictionary": dictionary,
        "identity_basis": {"file": "data/published/global-directory.json", "sha256": hashlib.sha256(catalogue_path.read_bytes()).hexdigest(), "join": "Exact unique existing six-digit US UNITID; no fuzzy matching, new profiles or identity edits. SQL also requires exact hosted external_identifiers(system=ipeds) parity."},
        "existing_fields_not_reimported": sorted(existing), "mappings": mapping,
        "publication_rules": {"destination": "Existing private pending source_records queue only", "accepted_flags": {c: flags[c] for c in ("R", "Z")}, "missing": "Imputed, corrected, not-applicable, suppressed, negative, missing and invalid values remain absent, never zero-filled", "cohorts": "Standard terms: October 15 or official fall reporting date; program reporters: unduplicated September 1–August 31 cohort, as defined by SFA2324", "period": "2023–24 academic year; 2024 end year is separate from collection/retrieval/mapping review dates", "averages": "Borrower/recipient averages are historical amounts, not promised aid; loans are not grants", "overlap": "Categories and populations overlap; never sum recipients across field families", "international": "No international-student eligibility, offer or guarantee is inferred", "net_price": "Not in this source: new Cost Survey beginning in 2024 collection; no net price or cost is manufactured", "verified_at": None, "publications": 0, "hosted_writes": 0, "deduplication": "Source URL + exact university UUID/UNITID + metric/raw field + year/period. Corrected snapshots require a separately reviewed receipt; historical records are never overwritten."},
        "counts": {"source_rows": source_rows, "unique_existing_unitids": len(identities), "ambiguous_existing_unitids": len(ambiguous), "universities_with_candidates": len(records), "candidate_observations": sum(field_counts.values()), "selected_fields": len(mapping), "field_counts": field_counts, "exclusions": exclusions, "existing_fields_reimported": 0, "new_profiles": 0, "schema_changes": 0, "publications": 0, "hosted_writes": 0},
        "identity_review": {"ambiguous_existing_unitids": ambiguous, "invalid_or_missing_us_unitids": invalid, "held_source_rows": held}, "records": records,
    }
    receipt["value_signature_md5"] = value_signature(receipt)
    receipt["field_contract_sha256"] = sha(mapping)
    receipt["import_id"] = stable("SFA2324-extension-import:" + SOURCE_SHA + ":" + receipt["field_contract_sha256"])
    return receipt


def notes(definition):
    return definition["dictionary_title"] + ". " + definition["cohort"] + ". 2023–2024 academic year, provisional. R=Reported; Z=Implied zero. Historical recipient/borrower averages; loans are not grants, promised awards or an international-eligibility determination."


def iter_source_records(receipt):
    source, dictionary = receipt["source"], receipt["dictionary"]
    for institution in receipt["records"]:
        for field, datum in institution["values"].items():
            definition = receipt["mappings"][field]
            yield {"id": datum["id"], "university_id": institution["university_id"], "source": "ipeds", "source_name": source["name"], "source_record_id": institution["unitid"], "source_url": source["url"], "release": source["release"], "reporting_year": 2024, "period": PERIOD, "cohort": definition["cohort"], "retrieved_at": source["retrieved_at"], "last_verified_at": None, "verification_status": "needs_review", "publication_status": "review", "status": "pending", "license_note": source["license_note"], "raw_file": "SFA2324.zip", "raw_field": field, "metric": definition["metric"], "value": datum["value"], "unit": definition["unit"], "notes": notes(definition), "evidence": {"unitid": institution["unitid"], "raw_field": field, "raw_value": datum["raw_value"], "raw_reporting_flag": datum["raw_flag"], "reporting_flag": datum["flag"], "population": definition["cohort"], "reporting_period": PERIOD, "reporting_year": 2024, "release": source["release"], "aid_kind": definition["aid_kind"], "dictionary_title": definition["dictionary_title"], "dictionary_description": definition["dictionary_description"], "dataset_sha256": source["sha256"], "dictionary_url": dictionary["url"], "dictionary_sha256": dictionary["sha256"], "dictionary_retrieved_at": dictionary["retrieved_at"], "source_retrieved_at": source["retrieved_at"], "mapping_reviewed_at": receipt["reviewed_at"], "cohort_calendar": receipt["publication_rules"]["cohorts"], "verification_status": "needs_review", "verified_at": None}}


def literal(value):
    value = canonical(value) if isinstance(value, (dict, list)) else str(value)
    if "\x00" in value:
        raise ValueError("SQL literal contains null byte")
    return "'" + value.replace("'", "''") + "'"


def candidates_cte(receipt, institutions):
    # Compact input is expanded in SQL. Definitions appear once per batch,
    # avoiding 59,829 repeated dictionary descriptions in the SQL payload.
    source, dictionary = receipt["source"], receipt["dictionary"]
    calendar = receipt["publication_rules"]["cohorts"]
    return f"""with institutions as (select value r from jsonb_array_elements({literal(institutions)}::jsonb)), definitions as (select key field,value m from jsonb_each({literal(receipt['mappings'])}::jsonb)), facts as (
select r->>'university_id' university_id,r->>'unitid' unitid,d.field,d.m,f.value datum from institutions cross join lateral jsonb_each(r->'values') f join definitions d on d.field=f.key
), candidates as (
select (datum->>'id')::uuid id,university_id::uuid university_id,unitid,m->>'metric' metric,2024 year,(datum->>'value')::numeric normalized_value,m->>'unit' unit,
{literal(source['url'])} source_url,{literal(source['retrieved_at'])}::timestamptz retrieved_at,
(m->>'dictionary_title')||'. '||(m->>'cohort')||'. 2023–2024 academic year, provisional. R=Reported; Z=Implied zero. Historical recipient/borrower averages; loans are not grants, promised awards or an international-eligibility determination.' notes,
jsonb_build_object('id',datum->>'id','university_id',university_id,'source','ipeds','source_name',{literal(source['name'])},'source_record_id',unitid,'source_url',{literal(source['url'])},'release',{literal(source['release'])},'reporting_year',2024,'period',{literal(PERIOD)},'cohort',m->>'cohort','retrieved_at',{literal(source['retrieved_at'])},'last_verified_at',null,'verification_status','needs_review','publication_status','review','status','pending','license_note',{literal(source['license_note'])},'raw_file','SFA2324.zip','raw_field',field,'metric',m->>'metric','value',datum->'value','unit',m->>'unit',
'evidence',jsonb_build_object('unitid',unitid,'raw_field',field,'raw_value',datum->>'raw_value','raw_reporting_flag',datum->>'raw_flag','reporting_flag',datum->>'flag','population',m->>'cohort','reporting_period',{literal(PERIOD)},'reporting_year',2024,'release',{literal(source['release'])},'aid_kind',m->>'aid_kind','dictionary_title',m->>'dictionary_title','dictionary_description',m->>'dictionary_description','dataset_sha256',{literal(source['sha256'])},'dictionary_url',{literal(dictionary['url'])},'dictionary_sha256',{literal(dictionary['sha256'])},'dictionary_retrieved_at',{literal(dictionary['retrieved_at'])},'source_retrieved_at',{literal(source['retrieved_at'])},'mapping_reviewed_at',{literal(receipt['reviewed_at'])},'cohort_calendar',{literal(calendar)},'verification_status','needs_review','verified_at',null)) raw_value
from facts)
select *,raw_value||jsonb_build_object('notes',notes) observation from candidates"""


def batch_sql(receipt, institutions):
    n = sum(len(row["values"]) for row in institutions)
    signature = value_signature({"records": institutions, "mappings": receipt["mappings"]})
    url = literal(receipt["source"]["url"])
    import_id = literal(receipt["import_id"]) + "::uuid"
    return f"""-- PRIVATE PENDING REVIEW ONLY. Does not publish or overwrite any facts.
begin;
set local standard_conforming_strings=on;
lock table public.source_records in share row exclusive mode;
create temporary table _aid_extension_candidates on commit drop as
{candidates_cte(receipt, institutions)};
do $guard$
declare source_uuid uuid;
begin
 if (select count(*) from public.data_sources where url={url})<>1 then raise exception 'Expected exactly one existing SFA source'; end if;
 select id into source_uuid from public.data_sources where url={url};
 if not exists(select 1 from public.data_imports where id={import_id} and source_id=source_uuid and status='review') then raise exception 'Private review import missing or changed'; end if;
 if (select count(*) from _aid_extension_candidates)<>{n} or (select count(distinct id) from _aid_extension_candidates)<>{n} then raise exception 'Candidate count or ID duplication'; end if;
 if (select md5(string_agg(university_id::text||':'||metric||':'||year::text||':'||normalized_value::text||':'||unit||':'||(raw_value#>>'{{evidence,raw_field}}')||':'||(raw_value#>>'{{evidence,reporting_flag}}'),E'\\n' order by university_id,metric)) from _aid_extension_candidates)<>{literal(signature)} then raise exception 'Candidate value signature differs from reviewed receipt'; end if;
 if exists(select 1 from _aid_extension_candidates c left join public.universities u on u.id=c.university_id left join public.external_identifiers x on x.university_id=c.university_id and x.system='ipeds' and x.external_id=c.unitid where u.id is null or u.country_code<>'US' or x.university_id is null) then raise exception 'Exact hosted UUID, country or UNITID mismatch'; end if;
 if exists(select 1 from _aid_extension_candidates c join public.source_records s on s.id=c.id where s.source_id is distinct from source_uuid or s.university_id is distinct from c.university_id or s.source_url is distinct from c.source_url or s.metric is distinct from c.metric or s.year is distinct from c.year) then raise exception 'Existing observation ID collision'; end if;
 if exists(select 1 from _aid_extension_candidates c join public.source_records s on s.university_id=c.university_id and s.source_url=c.source_url and s.metric=c.metric and s.year=c.year where s.source_id is distinct from source_uuid or s.normalized_value is distinct from c.normalized_value or s.unit is distinct from c.unit or s.raw_value#>>'{{evidence,raw_field}}' is distinct from c.raw_value#>>'{{evidence,raw_field}}' or s.raw_value#>>'{{evidence,population}}' is distinct from c.raw_value#>>'{{evidence,population}}' or s.raw_value#>>'{{evidence,reporting_period}}' is distinct from c.raw_value#>>'{{evidence,reporting_period}}' or s.raw_value#>>'{{evidence,dataset_sha256}}' is distinct from c.raw_value#>>'{{evidence,dataset_sha256}}' or s.raw_value#>>'{{evidence,dictionary_sha256}}' is distinct from c.raw_value#>>'{{evidence,dictionary_sha256}}' or s.raw_value#>>'{{evidence,reporting_flag}}' is distinct from c.raw_value#>>'{{evidence,reporting_flag}}' or s.retrieved_at is distinct from c.retrieved_at or s.status not in ('pending','approved')) then raise exception 'Existing source fact conflicts; preserve history and review independently'; end if;
 if exists(select 1 from _aid_extension_candidates c join public.data_points d on d.university_id=c.university_id and d.metric=c.metric and d.year=c.year and d.source_id=source_uuid where d.value is distinct from c.normalized_value or d.unit is distinct from c.unit or d.evidence->>'raw_field' is distinct from c.raw_value#>>'{{evidence,raw_field}}' or d.evidence->>'population' is distinct from c.raw_value#>>'{{evidence,population}}' or d.evidence->>'reporting_period' is distinct from c.raw_value#>>'{{evidence,reporting_period}}') then raise exception 'Existing public fact conflicts; no publication or overwrite'; end if;
end $guard$;
insert into public.source_records(id,import_id,source_id,university_id,metric,year,raw_value,normalized_value,unit,confidence,status,source_url,retrieved_at,notes)
select c.id,{import_id},s.id,c.university_id,c.metric,c.year,c.observation,c.normalized_value,c.unit,'high','pending',c.source_url,c.retrieved_at,c.notes
from _aid_extension_candidates c join public.data_sources s on s.url=c.source_url
where not exists(select 1 from public.source_records old where old.source_url=c.source_url and old.university_id=c.university_id and old.metric=c.metric and old.year=c.year)
on conflict do nothing;
do $parity$
begin
 if (select count(*) from _aid_extension_candidates c where exists(select 1 from public.source_records s where s.source_url=c.source_url and s.university_id=c.university_id and s.metric=c.metric and s.year=c.year and s.normalized_value=c.normalized_value and s.unit=c.unit and s.status in ('pending','approved')))<>{n} then raise exception 'Private staging incomplete; batch rolled back'; end if;
end $parity$;
commit;
"""


def source_sql(receipt):
    source = receipt["source"]
    return f"""-- Reuse existing SFA2324 source; register a separate private review import.
begin;
set local standard_conforming_strings=on;
lock table public.data_sources in share row exclusive mode;
do $guard$ begin if (select count(*) from public.data_sources where url={literal(source['url'])})>1 then raise exception 'Ambiguous existing source URL'; end if; end $guard$;
insert into public.data_sources(id,name,organization,url,source_type,license_notes,retrieved_at,trust_level)
select {literal(SOURCE_ID)}::uuid,{literal(source['name'])},{literal(source['organization'])},{literal(source['url'])},'government',{literal(source['license_note'])},{literal(source['retrieved_at'])}::timestamptz,'high'
where not exists(select 1 from public.data_sources where url={literal(source['url'])}) on conflict do nothing;
insert into public.data_imports(id,source_id,status,records_seen,warnings)
select {literal(receipt['import_id'])}::uuid,id,'review',{receipt['counts']['candidate_observations']},{literal([{'source_sha256':source['sha256'],'dictionary_sha256':receipt['dictionary']['sha256'],'field_contract_sha256':receipt['field_contract_sha256'],'value_signature_md5':receipt['value_signature_md5'],'scope':'27 unused SFA2324 fields; private review only; no current student or international eligibility claim','publications':0}])}::jsonb
from public.data_sources where url={literal(source['url'])} on conflict do nothing;
do $check$ begin
 if (select count(*) from public.data_sources where url={literal(source['url'])})<>1 then raise exception 'Existing source UUID collision or missing source'; end if;
 if not exists(select 1 from public.data_imports i join public.data_sources s on s.id=i.source_id where i.id={literal(receipt['import_id'])}::uuid and s.url={literal(source['url'])} and i.status='review' and i.records_seen={receipt['counts']['candidate_observations']}) then raise exception 'Existing private import conflicts with reviewed receipt'; end if;
end $check$;
commit;
"""


def preflight_sql(receipt):
    return f"""-- READ ONLY. Run before deciding whether any pending review SQL is appropriate.
select count(*) source_url_matches from public.data_sources where url={literal(receipt['source']['url'])};
with metrics as (select value->>'metric' metric from jsonb_each({literal(receipt['mappings'])}::jsonb))
select s.metric,s.status,count(*) existing_records from public.source_records s join metrics m on m.metric=s.metric where s.source_url={literal(receipt['source']['url'])} and s.year=2024 group by s.metric,s.status order by s.metric,s.status;
with identities as (select value r from jsonb_array_elements({literal([{'university_id':r['university_id'],'unitid':r['unitid']} for r in receipt['records']])}::jsonb))
select count(*) candidate_universities,count(*) filter(where u.id is not null and u.country_code='US' and x.university_id is not null) exact_hosted_identity_matches
from identities left join public.universities u on u.id=(r->>'university_id')::uuid left join public.external_identifiers x on x.university_id=u.id and x.system='ipeds' and x.external_id=r->>'unitid';
"""


def validate_receipt(receipt):
    if receipt["source"]["url"] != aid.SOURCE_URL or receipt["source"]["sha256"] != SOURCE_SHA or receipt["dictionary"]["sha256"] != DICTIONARY_SHA:
        raise ValueError("Receipt source evidence differs from reviewed snapshot")
    if set(receipt["mappings"]) != set(FIELDS) or receipt["field_contract_sha256"] != sha(receipt["mappings"]):
        raise ValueError("Receipt field contract changed")
    actual_mapping, _, _ = read_dictionary(aid.RAW / "SFA2324_Dict.zip")
    if receipt["mappings"] != actual_mapping:
        raise ValueError("Receipt population or definition differs from official dictionary contract")
    if receipt["verification_status"] != "needs_review" or receipt["last_verified_at"] is not None or receipt["source"]["reporting_year"] != 2024 or receipt["source"]["period"] != PERIOD:
        raise ValueError("Receipt review state or reporting period changed")
    if receipt["counts"]["candidate_observations"] != sum(len(row["values"]) for row in receipt["records"]) or receipt["value_signature_md5"] != value_signature(receipt):
        raise ValueError("Receipt value count or signature changed")
    seen, fields = set(), collections.Counter()
    for institution in receipt["records"]:
        uuid.UUID(institution["university_id"])
        if not re.fullmatch(r"[1-9][0-9]{5}", institution["unitid"]):
            raise ValueError("Receipt identity is not an exact UNITID")
        for field, fact in institution["values"].items():
            definition = receipt["mappings"][field]
            if type(fact["value"]) is not int:
                raise ValueError("Receipt figure must preserve the integer source format")
            if fact["id"] != observation_id(institution["unitid"], field, definition) or fact["id"] in seen:
                raise ValueError("Receipt observation ID changed or duplicated")
            seen.add(fact["id"])
            fields[field] += 1
            raw = {"UNITID": institution["unitid"], field: fact["raw_value"], definition["imputation_variable"]: fact["raw_flag"]}
            valid = aid.normalize_number(raw, field, definition, collections.Counter())
            if valid != {"value": fact["value"], "flag": fact["flag"]}:
                raise ValueError("Receipt raw value or reporting flag does not match normalization")
    if dict(sorted(fields.items())) != receipt["counts"]["field_counts"]:
        raise ValueError("Receipt per-field coverage changed")
    if len({r["university_id"] for r in receipt["records"]}) != receipt["counts"]["universities_with_candidates"]:
        raise ValueError("Receipt university coverage changed")


def write_outputs(receipt, output, batch_size=100):
    validate_receipt(receipt)
    if not 1 <= batch_size <= 250:
        raise ValueError("Batch size must be 1–250 universities")
    files = {"receipt.json": canonical(receipt) + "\n", "00-read-only-preflight.sql": preflight_sql(receipt), "01-private-review-import.sql": source_sql(receipt)}
    for start in range(0, len(receipt["records"]), batch_size):
        files[f"02-pending-{start // batch_size + 1:03d}.sql"] = batch_sql(receipt, receipt["records"][start:start + batch_size])
    manifest = {"mode": "local_review_receipt_and_guarded_pending_SQL_not_executed", "source_url": receipt["source"]["url"], "source_sha256": SOURCE_SHA, "dictionary_sha256": DICTIONARY_SHA, "field_contract_sha256": receipt["field_contract_sha256"], "value_signature_md5": receipt["value_signature_md5"], "identity_basis_sha256": receipt["identity_basis"]["sha256"], "import_id": receipt["import_id"], "candidate_observations": receipt["counts"]["candidate_observations"], "universities": len(receipt["records"]), "fields": len(receipt["mappings"]), "schema_changes": 0, "new_profiles": 0, "new_datasets_downloaded": 0, "publications": 0, "hosted_writes": 0, "sql_batches": len(files) - 3, "files": {name: {"sha256": hashlib.sha256(body.encode()).hexdigest(), "bytes": len(body.encode())} for name, body in files.items()}}
    files["manifest.json"] = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    # Check the entire destination before writing anything: a changed receipt
    # cannot partially overwrite a prior review directory.
    for name, body in files.items():
        path = output / name
        if path.exists() and path.read_text() != body:
            raise ValueError("Existing review artifact differs; use a new output directory: " + name)
    output.mkdir(parents=True, exist_ok=True)
    for name, body in files.items():
        path = output / name
        if not path.exists():
            with path.open("x", encoding="utf-8") as file:
                file.write(body)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed-at", default="2026-10-11", help="Actual mapping review date, not verification/retrieval date")
    parser.add_argument("--stage-review", action="store_true", help="Write private review receipt and SQL; never execute SQL")
    parser.add_argument("--out", type=Path, default=ROOT / "outputs/ipeds-aid-extension-oct11")
    parser.add_argument("--batch-size", type=int, default=100, help="Universities per pending SQL batch, maximum 250")
    args = parser.parse_args()
    receipt = build_receipt(args.reviewed_at)
    result = {"mode": "dry_run_no_writes", **receipt["counts"], "value_signature_md5": receipt["value_signature_md5"], "field_contract_sha256": receipt["field_contract_sha256"], "import_id": receipt["import_id"]}
    if args.stage_review:
        result = write_outputs(receipt, args.out, args.batch_size)
    print(json.dumps({key: value for key, value in result.items() if key != "files"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
