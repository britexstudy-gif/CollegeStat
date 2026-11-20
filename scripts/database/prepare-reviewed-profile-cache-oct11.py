#!/usr/bin/env python3
"""Prepare a guarded repair of two derived THE profile caches, without touching source tables."""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IDS = {
    'University of Education, Lahore': ('3f15a83c-c1d9-50da-85e9-4cfa84fe5c04', 'ea9f6e8c1f2b49fe8bebc4d2458d0b4a', 'http://www.ue.edu.pk/'),
    'University of Okara': ('fcd1cd76-2c2e-526f-acd6-38a74eb5954d', '92a2b5e2803c7dcf69b527b4235bdabb', 'https://www.uo.edu.pk'),
}
SHA = '6c49df7f49b9dd69f60bc86b1aac237e69cedb53f1099219687b7a070ca8ffbd'

def numeric(value):
    value = str(value).replace(',', '').replace('%', '').strip()
    assert re.fullmatch(r'\d+(?:\.\d+)?', value), 'No inferred numeric values'
    return float(value)

def prepare(rows, snapshots, raw, manifest):
    result = []
    for name, (uid, expected, website) in IDS.items():
        linked = [r for r in rows if r['provider'] == 'the' and r['year'] == 2026 and r['name'] == name]
        assert len(linked) == 1
        row = linked[0]
        assert row['university_id'] == uid and row['country_code'] == 'PK'
        source = [r for r in raw if r['name'] == name and r['location'] == 'Pakistan' and 'https://www.timeshighereducation.com' + r['url'] == row['url']]
        assert len(source) == 1
        source = source[0]
        assert source['rank'] == row['rank_label'] and source['scores_overall'] == row['score']
        for key, value in row['scores'].items():
            assert value == source['scores_' + key], 'Published scores must remain exact'
        snapshot = json.loads(json.dumps(snapshots[uid]))
        assert snapshot['edition'] == 2026 and snapshot['source_url'] == row['url']
        for field, original in [('students', 'stats_number_students'), ('student_staff_ratio', 'stats_student_staff_ratio'), ('international_percent', 'stats_pc_intl_students')]:
            assert snapshot[field] == numeric(source[original])
        assert snapshot['female_male_ratio'] == source['stats_female_male_ratio']
        assert snapshot['subjects'] == [v.strip() for v in source['subjects_offered'].split(',') if v.strip()]
        snapshot.setdefault('evidence', {
            'provider': 'Times Higher Education', 'retrieved_at': manifest['retrieved_at'],
            'raw_snapshot_sha256': SHA, 'scope': 'Publisher institution snapshot; student census year not specified',
            'source_name': name, 'verification_status': 'verified_source_identity',
            'identity_reviewed_at': '2026-10-11',
        })
        result.append({'id': uid, 'name': name, 'website': website, 'before_md5': expected, 'rankings': [row], 'publisher_students': snapshot})
    return result

def sql(records):
    payload = json.dumps(records, ensure_ascii=False, separators=(',', ':'))
    assert '$review$' not in payload
    return f"""-- Derived cache only. Exact before hashes; atomic, repeatable; no source/schema deletion.
do $repair$
declare item jsonb; previous jsonb; desired jsonb; changed integer := 0;
begin
 for item in select * from jsonb_array_elements($review${payload}$review$::jsonb) loop
  select profile_resources into previous from public.universities
   where id=(item->>'id')::uuid and country_code='PK' and website=item->>'website' for update;
  if not found then raise exception 'Reviewed identity changed'; end if;
  desired := jsonb_set(jsonb_set(coalesce(previous,'{{}}'::jsonb),'{{rankings}}',item->'rankings'), '{{publisher_students}}',item->'publisher_students');
  if previous=desired then continue; end if;
  if md5(previous::text) <> item->>'before_md5' then raise exception 'Cache changed since exact preflight'; end if;
  update public.universities set profile_resources=desired where id=(item->>'id')::uuid;
  if (previous-'rankings'-'publisher_students') <> (desired-'rankings'-'publisher_students') then raise exception 'Unrelated profile facts changed'; end if;
  changed := changed + 1;
 end loop;
 raise notice 'Reviewed profile caches changed: %', changed;
end $repair$;
select jsonb_agg(jsonb_build_object('id',id,'name',name,'resources_md5',md5(profile_resources::text),'rankings',profile_resources->'rankings','publisher_students',profile_resources->'publisher_students')) as repaired
from public.universities where id in ('3f15a83c-c1d9-50da-85e9-4cfa84fe5c04','fcd1cd76-2c2e-526f-acd6-38a74eb5954d');
"""

if __name__ == '__main__':
    path = ROOT / 'data/raw/rankings/the-2026.json'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == SHA, 'Raw publisher source changed'
    p = ROOT / 'data/published'
    records = prepare(json.loads((p/'ranking-all.json').read_text()), json.loads((p/'publisher-students.json').read_text()), json.loads(path.read_text())['data'], json.loads((p/'ranking-manifest.json').read_text()))
    if '--print-sql' in sys.argv:
        print(sql(records))
        sys.exit(0)
    output = ROOT / 'outputs/reviewed-profile-cache-oct11.sql'
    output.write_text(sql(records))
    (ROOT/'data/review/reviewed-profile-cache-oct11.json').write_text(json.dumps({'status':'prepared','source_sha256':SHA,'records':records,'scope':'Two existing public profile caches only; original ranking and source tables unchanged'},ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'records':len(records),'sql':str(output),'source_sha256':SHA,'executed':False}))
