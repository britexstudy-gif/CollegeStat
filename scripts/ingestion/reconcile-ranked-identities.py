#!/usr/bin/env python3
"""Restore missing ranking-to-profile joins from the cached ROR registry.

Only one active Education ROR identity with an exact normalized registered name
or alias in the publisher's country is accepted. Existing IDs are preserved.
No fuzzy matching, fabricated ranks, or new verification dates are introduced.
Run after curate-directory.py and link-rankings.py; reruns are idempotent.
"""
import collections, hashlib, html, json, pathlib, re, unicodedata, urllib.parse, uuid, zipfile
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/published'
REGISTRY = ROOT / 'data/raw/ror/v2.13-2026-09-22-ror-data.zip'
assert hashlib.md5(REGISTRY.read_bytes()).hexdigest() == 'a935217de21e7983b977f5419f1a6b20', 'ROR checksum mismatch'
with zipfile.ZipFile(REGISTRY) as archive:
    registry = json.loads(archive.read(next(n for n in archive.namelist() if n.endswith('.json'))))
def norm(value):
    value = html.unescape(value)
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode().lower().replace('&', 'and')
    return re.sub('[^a-z0-9]', '', re.sub(r'\bthe\b', '', value))
def website(record):
    return next((l['value'] for l in record['links'] if l['type'] == 'website' and l['value'].startswith(('https://', 'http://'))), None)
index = collections.defaultdict(dict)
for record in registry:
    if record['status'] != 'active' or 'education' not in record['types'] or not website(record): continue
    for location in record['locations']:
        for name in record['names']:
            key = norm(name['value'])
            if key: index[(location['geonames_details']['country_code'], key)][record['id']] = record
rows = json.loads((OUT / 'global-directory.json').read_text())
rankings = json.loads((OUT / 'ranking-all.json').read_text())
report_path = OUT / 'ranking-identity-reconciliation.json'
previous = json.loads(report_path.read_text()) if report_path.exists() else {}
# Re-evaluate only this step's own earlier joins. A registry alias containing a
# parenthetical campus qualifier must never collapse to its parent institution.
owned = {(r['provider'],r['year'],r['name'],r['university_id']) for r in previous.get('restored',[])}
for rank in rankings:
    if (rank['provider'],rank['year'],rank['name'],rank['university_id']) in owned: rank['university_id'] = None
added_before = set(previous.get('added_ror_ids',[]))
rows = [r for r in rows if not (r.get('ror') in added_before and r['id'] == str(uuid.uuid5(uuid.NAMESPACE_URL,r['ror'])))]
existing = collections.defaultdict(list)
for row in rows:
    if row.get('ror'): existing[row['ror']].append(row)
restored, added = [], []
for rank in rankings:
    if rank['university_id']: continue
    candidates = index.get((rank['country_code'], norm(rank['name'])), {})
    if not candidates:
        # Publisher parentheticals commonly contain acronyms. Only the publisher
        # name is shortened; registered campus qualifiers remain intact.
        candidates = index.get((rank['country_code'], norm(re.sub(r'\([^)]*\)', '', rank['name']))), {})
    if len(candidates) != 1: continue
    record = next(iter(candidates.values()))
    if len(existing[record['id']]) > 1: continue
    if existing[record['id']]: row = existing[record['id']][0]
    else:
        name = next(n['value'] for n in record['names'] if 'ror_display' in n['types'])
        location = next(l['geonames_details'] for l in record['locations'] if l['geonames_details']['country_code'] == rank['country_code'])
        uid = str(uuid.uuid5(uuid.NAMESPACE_URL, record['id']))
        slug = re.sub('[^a-z0-9]+', '-', unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()).strip('-')[:130] or 'university'
        site = website(record)
        row = dict(id=uid, slug=slug+'-'+uid[:8], name=name, country_code=rank['country_code'], country=location['country_name'], website=site,
            domains=[urllib.parse.urlparse(site).hostname.removeprefix('www.')], ror=record['id'], city=location['name'], latitude=location['lat'], longitude=location['lng'],
            founded_year=record['established'], aliases=[n['value'] for n in record['names']], identity_source=record['id'], identity_release='ROR 2.13 · 2026-09-22',
            identity_retrieved_at='2026-09-26', external_ids={x['type']:x['preferred'] or x['all'][0] for x in record['external_ids'] if x['all']})
        rows.append(row); existing[record['id']].append(row); added.append(record['id'])
    rank['university_id'] = row['id']
    restored.append(dict(provider=rank['provider'],year=rank['year'],name=rank['name'],university_id=row['id'],ror=record['id'],source_url=rank['url']))
assert len({r['id'] for r in rows}) == len(rows), 'Duplicate directory IDs'
assert len({r['slug'] for r in rows}) == len(rows), 'Duplicate routes'
for filename, value in [('global-directory.json',rows),('ranking-all.json',rankings),('ranking-records.json',[r for r in rankings if r['university_id']])]:
    (OUT / filename).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n')
unmatched = [dict(**{k:v for k,v in r.items() if k not in ['university_id','rank','tied','band','score','scores','country_position','country_total']},reason='unmatched or ambiguous') for r in rankings if not r['university_id']]
(OUT / 'ranking-unmatched.json').write_text(json.dumps(unmatched,ensure_ascii=False,indent=2)+'\n')
manifest = json.loads((OUT / 'ranking-manifest.json').read_text())
manifest.update(linked=sum(bool(r['university_id']) for r in rankings),unmatched=len(unmatched),by_provider=dict(collections.Counter(r['provider'] for r in rankings if r['university_id'])),
    matching='Unique exact normalized registered name or alias in the same country, with active ROR Education reconciliation; ambiguous identities remain unlinked.')
(OUT / 'ranking-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
refs = json.loads((ROOT / 'supabase/reference-catalogue.json').read_text())
directory = json.loads((OUT / 'directory-manifest.json').read_text())
directory.update(institutions=len(rows),catalogue_total=len(rows)+sum(not any(u['id']==r['id'] for u in rows) for r in refs),countries=len({r['country_code'] for r in rows}),ror_linked=len({r['ror'] for r in rows if r.get('ror')}),sha256=hashlib.sha256((OUT/'global-directory.json').read_bytes()).hexdigest(),identity_note='Active ROR Education records corroborated by exact country and official host or unique exact registered name/alias in a sourced publisher table, plus active IPEDS degree-granting four-year institutions and reviewed reference profiles. Registry inclusion is not accreditation.')
(OUT / 'directory-manifest.json').write_text(json.dumps(directory,indent=2)+'\n')
(OUT / 'directory-countries.json').write_text(json.dumps(dict(sorted({r['country_code']:r['country'] for r in rows}.items())),indent=2)+'\n')
report = {'registry_release':'ROR 2.13 · 2026-09-22','source_retrieved_at':'2026-09-26','reviewed_at':'2026-10-01','restored':[],'added_ror_ids':[]}
report['restored'] = restored; report['added_ror_ids'] = sorted(set(added))
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'new_identities':len(added),'restored_ranking_links':len(restored),'catalogue_total':directory['catalogue_total'],'unmatched':len(unmatched)},indent=2))
