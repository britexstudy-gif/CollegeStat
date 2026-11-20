#!/usr/bin/env python3
"""Reapply source-reviewed aliases before linking publisher records.

Match only the reviewed ROR identifier and country. Never infer a new identity.
"""
import collections, hashlib, json, pathlib

OUT = pathlib.Path(__file__).resolve().parents[2] / 'data/published'
receipt = json.loads((OUT / 'reviewed-ranking-aliases.json').read_text())
rows = json.loads((OUT / 'global-directory.json').read_text())
for reviewed in receipt['aliases']:
    matches = [u for u in rows if u.get('ror') == reviewed['ror'] and u['country_code'] == reviewed['country']]
    assert len(matches) == 1, 'Reviewed identity missing or ambiguous'
    row = matches[0]
    row['aliases'] = list(dict.fromkeys(row.get('aliases', []) + reviewed['names']))
(OUT / 'global-directory.json').write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n')
manifest = json.loads((OUT / 'directory-manifest.json').read_text())
manifest['sha256'] = hashlib.sha256((OUT / 'global-directory.json').read_bytes()).hexdigest()
(OUT / 'directory-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
# Restore only existing publisher observations named by the reviewed aliases.
# Provider values/edition/ties/bands remain byte-equivalent JSON values.
all_ranks = json.loads((OUT / 'ranking-all.json').read_text())
linked = json.loads((OUT / 'ranking-records.json').read_text())
added = 0
for reviewed in receipt['aliases']:
    university = next(u for u in rows if u.get('ror') == reviewed['ror'] and u['country_code'] == reviewed['country'])
    for rank in all_ranks:
        if rank['country_code'] != reviewed['country'] or rank['name'] not in reviewed['names']:
            continue
        assert rank.get('university_id') in (None, university['id']), 'Conflicting publisher identity requires review'
        rank['university_id'] = university['id']
        existing = next((r for r in linked if (r['name'], r['provider'], r['year']) == (rank['name'], rank['provider'], rank['year'])), None)
        if existing:
            assert existing.get('university_id') in (None, university['id'])
            existing['university_id'] = university['id']
        else:
            linked.append(dict(rank)); added += 1
(OUT / 'ranking-all.json').write_text(json.dumps(all_ranks, ensure_ascii=False, separators=(',', ':')) + '\n')
(OUT / 'ranking-records.json').write_text(json.dumps(linked, ensure_ascii=False, separators=(',', ':')) + '\n')
# Reconcile only derived counts/review rows after restoring existing links.
# Preserve provider positions, edition/source metadata and original retrieval date.
unmatched = [dict(**{k:v for k,v in r.items() if k not in ['university_id','rank','tied','band','score','scores','country_position','country_total']}, reason='unmatched or ambiguous') for r in all_ranks if not r.get('university_id')]
(OUT / 'ranking-unmatched.json').write_text(json.dumps(unmatched, ensure_ascii=False, indent=2) + '\n')
ranking_manifest = json.loads((OUT / 'ranking-manifest.json').read_text())
ranking_manifest.update(linked=sum(bool(r.get('university_id')) for r in all_ranks), unmatched=len(unmatched), by_provider=dict(collections.Counter(r['provider'] for r in all_ranks if r.get('university_id'))))
(OUT / 'ranking-manifest.json').write_text(json.dumps(ranking_manifest, indent=2) + '\n')
print('Applied reviewed aliases for', len(receipt['aliases']), 'existing identities.')
print('Restored existing reviewed publisher links:', added)
