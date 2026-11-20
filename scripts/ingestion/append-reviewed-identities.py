#!/usr/bin/env python3
"""Append reviewed ROR + official-site identities without resetting prior routes.

The review receipt is a bounded allowlist, not an arbitrary web search import.
Reruns preserve existing records. Country, ROR, domain and aliases guard duplicates.
"""
import hashlib, json, pathlib, re, unicodedata, urllib.parse, uuid, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/published'
receipt = json.loads((OUT / 'reviewed-identity-expansion.json').read_text())
archive = ROOT / 'data/raw/ror/v2.13-2026-09-22-ror-data.zip'
assert hashlib.md5(archive.read_bytes()).hexdigest() == 'a935217de21e7983b977f5419f1a6b20'
with zipfile.ZipFile(archive) as z:
    registry = {r['id']: r for r in json.loads(z.read(next(n for n in z.namelist() if n.endswith('.json'))))}

def host(value):
    return (urllib.parse.urlparse(value).hostname or '').lower().removeprefix('www.')

def key(value):
    return ''.join(c for c in unicodedata.normalize('NFKC', value).casefold() if c.isalnum())

rows = json.loads((OUT / 'global-directory.json').read_text())
added, retained = [], []
for reviewed in receipt['records']:
    r = registry[reviewed['ror']]
    assert r['status'] == 'active' and 'education' in r['types']
    location = next(l['geonames_details'] for l in r['locations'] if l['geonames_details']['country_code'] == reviewed['country'])
    aliases = list(dict.fromkeys([reviewed['name']] + [n['value'] for n in r['names']]))
    matches = [u for u in rows if u.get('ror') == r['id'] or (u['country_code'] == reviewed['country'] and (host(u['website']) == host(reviewed['website']) or set(map(key, [u['name']] + u.get('aliases', []))) & set(map(key, aliases))))]
    assert len(matches) <= 1, 'Ambiguous identity: ' + reviewed['name']
    if matches:
        retained.append(matches[0]['id'])
        continue
    uid = str(uuid.uuid5(uuid.NAMESPACE_URL, r['id']))
    slug = re.sub('[^a-z0-9]+', '-', unicodedata.normalize('NFKD', reviewed['name']).encode('ascii', 'ignore').decode().lower()).strip('-')[:130]
    row = dict(id=uid, slug=slug+'-'+uid[:8], name=reviewed['name'], country_code=reviewed['country'], country=location['country_name'], website=reviewed['website'], domains=[host(reviewed['website'])], ror=r['id'], city=location['name'], latitude=location['lat'], longitude=location['lng'], founded_year=r['established'], aliases=aliases, identity_source=r['id'], identity_release=receipt['registry_release'], identity_retrieved_at='2026-09-26', external_ids={x['type']: x['preferred'] or x['all'][0] for x in r['external_ids'] if x['all']})
    if reviewed.get('university_type'): row['university_type'] = reviewed['university_type']
    rows.append(row)
    added.append(uid)
assert len({r['id'] for r in rows}) == len(rows)
assert len({r['slug'] for r in rows}) == len(rows)
(OUT / 'global-directory.json').write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':'))+'\n')
manifest = json.loads((OUT / 'directory-manifest.json').read_text())
manifest.update(institutions=len(rows), catalogue_total=len(rows), countries=len({r['country_code'] for r in rows}), ror_linked=len({r['ror'] for r in rows if r.get('ror')}), sha256=hashlib.sha256((OUT/'global-directory.json').read_bytes()).hexdigest(), latest_identity_review=receipt['reviewed_at'])
(OUT / 'directory-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
(OUT / 'directory-countries.json').write_text(json.dumps(dict(sorted({r['country_code']: r['country'] for r in rows}.items())), indent=2)+'\n')
print(json.dumps({'added': len(added), 'retained': len(retained), 'total': len(rows), 'ids': added}))
