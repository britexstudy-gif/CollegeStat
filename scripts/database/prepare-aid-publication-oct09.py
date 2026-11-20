#!/usr/bin/env python3
"""Prepare an explicitly reviewed, insert-only publication of the installed SFA receipt.

Does not connect to a database. Every hosted value and population must match the
reviewed receipt before publication; unrelated and historical facts are untouched.
"""
import argparse, hashlib, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
IMPORT = '8f5ce106-bf76-5bec-8c2f-44f9fb3e0a53'
SOURCE = '37c312bf-a9b9-531f-8afa-f353417afe4a'
def literal(value):
    return "'" + str(value).replace("'", "''") + "'"
def prepare(out):
    receipt_path = ROOT/'data/published/reviewed-ipeds-aid.json'
    receipt = json.loads(receipt_path.read_text())
    source, dictionary = receipt['source'], receipt['dictionary']
    assert receipt['counts']['observations'] == 44600
    assert source['sha256'] == hashlib.sha256((ROOT/'data/raw/ipeds/SFA2324.zip').read_bytes()).hexdigest()
    assert dictionary['sha256'] == hashlib.sha256((ROOT/'data/raw/ipeds/SFA2324_Dict.zip').read_bytes()).hexdigest()
    rows=[]
    for row in receipt['records']:
        for field, fact in row['values'].items():
            m=receipt['mappings'][field]
            assert fact['flag'] in ('R','Z') and fact['value'] >= 0
            rows.append(':'.join(map(str,[row['university_id'],m['metric'],2024,fact['value'],m['unit'],field,fact['flag']])))
    signature=hashlib.md5('\n'.join(sorted(rows)).encode()).hexdigest()
    assert signature=='87c27d5e550d2f11e9e7bf2b272a4b70'
    mapping={field:{key:m[key] for key in ('metric','unit','cohort','dictionary_title')} for field,m in receipt['mappings'].items()}
    sql=f'''-- Explicit source/dictionary review, separate from automatic ingestion.
-- 19 distinct SFA metrics; no changes to generic aid, tuition or admission facts.
begin;
lock table public.source_records in share row exclusive mode;
lock table public.data_points in share row exclusive mode;
do $review$
declare n integer; sig text; bad integer;
begin
 select count(*),md5(string_agg(university_id::text||':'||metric||':'||year::text||':'||normalized_value::text||':'||unit||':'||(raw_value#>>'{{evidence,raw_field}}')||':'||(raw_value#>>'{{evidence,reporting_flag}}'),E'\\n' order by university_id,metric)) into n,sig from public.source_records where import_id='{IMPORT}';
 if n<>44600 or sig<>'{signature}' then raise exception 'SFA receipt parity failed'; end if;
 select count(*) into bad from public.source_records s left join lateral (select value m from jsonb_each({literal(json.dumps(mapping,ensure_ascii=False))}::jsonb) where key=s.raw_value#>>'{{evidence,raw_field}}') x on true join public.universities u on u.id=s.university_id where s.import_id='{IMPORT}' and (
 x.m is null or not u.published or u.country_code<>'US' or s.status not in ('pending','approved') or s.source_id<>'{SOURCE}' or s.source_url<>{literal(source['url'])} or s.year<>2024 or s.metric is distinct from x.m->>'metric' or s.unit is distinct from x.m->>'unit' or s.raw_value#>>'{{evidence,population}}' is distinct from x.m->>'cohort' or s.raw_value#>>'{{evidence,reporting_period}}' is distinct from {literal(source['period'])} or s.raw_value#>>'{{evidence,dataset_sha256}}' is distinct from {literal(source['sha256'])} or s.raw_value#>>'{{evidence,dictionary_sha256}}' is distinct from {literal(dictionary['sha256'])} or s.retrieved_at is distinct from {literal(source['retrieved_at'])}::timestamptz or s.notes is distinct from (x.m->>'dictionary_title')||'. '||(x.m->>'cohort')||'. 2023–2024 academic year. R=Reported; Z=Implied zero. Recipient averages are not promised awards; not an international-eligibility determination.');
 if bad<>0 then raise exception 'SFA source, dictionary or population mismatch'; end if;
 if exists(select 1 from public.source_records s join public.data_points d on d.id=s.id or (d.university_id=s.university_id and d.metric=s.metric and d.year=s.year and d.canonical) where s.import_id='{IMPORT}' and (d.observation_id is distinct from s.id or d.source_id is distinct from s.source_id or d.value is distinct from s.normalized_value or d.unit is distinct from s.unit or not d.canonical or d.verification_status<>'verified')) then raise exception 'Existing SFA fact conflict: nothing overwritten'; end if;
end $review$;
insert into public.data_points(id,university_id,metric,year,value,unit,source_id,source_url,observation_id,confidence,canonical,verification_status,verified_at,notes,evidence)
 select s.id,s.university_id,s.metric,s.year,s.normalized_value,s.unit,s.source_id,s.source_url,s.id,s.confidence,true,'verified',now(),s.notes,s.raw_value->'evidence'||jsonb_build_object('review_method','Exact cached SFA2324 source/dictionary/UNITID parity; reported or implied-zero fields only','reviewed_at',now()) from public.source_records s where s.import_id='{IMPORT}' on conflict do nothing;
do $check$ begin if (select count(*) from public.data_points d join public.source_records s on s.id=d.observation_id where s.import_id='{IMPORT}' and d.canonical and d.verification_status='verified')<>44600 then raise exception 'SFA publication incomplete: rolled back'; end if; end $check$;
update public.source_records set status='approved' where import_id='{IMPORT}' and status='pending';
commit;
select count(*) published_observations,count(distinct university_id) universities,count(distinct metric) metrics from public.data_points where observation_id in(select id from public.source_records where import_id='{IMPORT}') and canonical and verification_status='verified';
'''
    out.mkdir(parents=True,exist_ok=True)
    path=out/'publish-reviewed-aid.sql';path.write_text(sql)
    manifest={'source_receipt_sha256':hashlib.sha256(receipt_path.read_bytes()).hexdigest(),'source_sha256':source['sha256'],'dictionary_sha256':dictionary['sha256'],'value_parity_md5':signature,'observations':44600,'universities':2469,'metrics':19,'mode':'explicit_review_insert_only_hold_conflicts','sql_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    return manifest
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',type=Path,default=ROOT/'outputs/reviewed-aid-publication-oct09');args=parser.parse_args();print(json.dumps(prepare(args.out)))
