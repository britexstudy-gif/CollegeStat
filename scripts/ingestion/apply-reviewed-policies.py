#!/usr/bin/env python3
"""Append the checked policy receipt to published equivalents, retaining history."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT/'data/published'

def main():
    receipt=json.loads((PUB/'reviewed-requirements-oct05.json').read_text())
    records=json.loads((PUB/'requirements-current.json').read_text()); by_id={r['id']:r for r in records}
    directory={r['id']:r for r in json.loads((PUB/'global-directory.json').read_text())}
    for ref in json.loads((ROOT/'supabase/reference-catalogue.json').read_text()):directory.setdefault(ref['id'],ref)
    for row in receipt['records']:
        assert row['university_id'] in directory and row['source_url'].startswith('https://')
        assert row['evidence']['university_wide'] is False
        if row['id'] in by_id:
            assert by_id[row['id']]==row, 'Conflicting version must get a distinct evidence ID'
        else:records.append(row);by_id[row['id']]=row
    (PUB/'requirements-current.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
    programs=json.loads((PUB/'official-programs.json').read_text())
    for link in receipt['university_programs']:
        uni=directory[link['university_id']];host=uni['website'].split('/')[2].removeprefix('www.')
        p=next(p for p in receipt['programs'] if p['id']==link['program_id'])
        row={'id':p['id'],'name':p['name'],'award':'BSc (Hons)','level':p['degree_level'],'language':p['language'],
            'url':link['source_url'],'source_url':link['source_url'],'checked_at':link['verified_at'],
            'notes':'Course-specific admissions evidence; confirm the current intake on the official course page.'}
        group=programs.setdefault(host,[])
        existing=next((x for x in group if x['id']==row['id']),None)
        if existing:assert existing==row
        else:group.append(row)
    (PUB/'official-programs.json').write_text(json.dumps(programs,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({'requirements':len(records),'programmes_added':len(receipt['programs'])}))
if __name__=='__main__':main()
