#!/usr/bin/env python3
"""Build the public directory from Hipo identities and reported IPEDS fields.

Run after downloading data/raw/hipo/universities.json and the IPEDS pilot ZIPs.
Only unique exact website hosts are joined; ambiguous matches stay separate.
Missing/suppressed/imputed values are omitted, and out-of-state tuition is never
relabeled as an international fee. This script uses the Python standard library.
"""
import csv, hashlib, io, json, pathlib, re, unicodedata, urllib.parse, uuid, zipfile
ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT / 'data/raw'
OUT = ROOT / 'data/published'
def host(url):
    return urllib.parse.urlparse(url if '://' in url else 'https://' + url).hostname.removeprefix('www.') if url else ''
def rows(table):
    with zipfile.ZipFile(RAW / 'ipeds' / (table + '.zip')) as z:
        name = next((n for n in z.namelist() if '_RV' in n), z.namelist()[0])
        yield from csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig', errors='replace'))
def number(row, field, flag=None):
    if flag and row.get(flag, '').strip() not in ('R', 'Z'): return None
    raw = row.get(field, '')
    if raw is None: return None
    s = str(raw).strip().replace(',', '').replace('\xa0', '').strip()
    if not s or s in ('–', '—', '-', 'N/A', 'NA', 'n/a', 'NULL', 'null', 'PrivacySuppressed', ''):
        return None
    try:
        n = float(s)
        return n if n >= 0 else None
    except (ValueError, TypeError): return None
def coord(value):
    """Safe latitude/longitude parse: None on blank/en-dash/em-dash/N/A, else float."""
    if value is None: return None
    s = str(value).strip().replace(',', '').replace('\xa0', '').strip()
    if not s or s in ('–', '—', '-', 'N/A', 'NA', 'n/a', 'NULL', 'null', 'PrivacySuppressed', ''):
        return None
    try:
        return float(s)
    except (ValueError, TypeError): return None
def slug(name):
    return re.sub('[^a-z0-9]+', '-', unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()).strip('-')[:130] or 'university'
hipo = json.loads((RAW / 'hipo/universities.json').read_text())
reference = json.loads((ROOT / 'supabase/reference-catalogue.json').read_text())
refs = {host(u['website']): u for u in reference}
hd = [r for r in rows('HD2023') if r['DEGGRANT'] == '1' and r['ICLEVEL'] == '1' and r['CYACTIVE'] == '1']
hosts = {}
for r in hd: hosts.setdefault(host(r['WEBADDR']), []).append(r)
fees = {r['UNITID']: r for r in rows('IC2023_AY')}
admissions = {r['UNITID']: r for r in rows('ADM2023')}
enroll = {r['UNITID']: r for r in rows('EFFY2023') if r['EFFYALEV'] == '1' and r['LSTUDY'] == '999'}
result, seen, units = [], set(), set()
for raw in hipo:
    urls = [u for u in raw['web_pages'] if u.startswith(('http://', 'https://'))]
    if not urls or not re.fullmatch('[A-Z]{2}', raw['alpha_two_code']): continue
    domain = host(urls[0])
    key = (raw['name'].strip().casefold(), raw['alpha_two_code'])
    if key in seen: continue
    seen.add(key)
    matches = hosts.get(domain, []) if raw['alpha_two_code'] == 'US' else []
    ipeds = matches[0] if len(matches) == 1 and matches[0]['UNITID'] not in units else None
    ref = refs.get(domain)
    uid = ref['id'] if ref else str(uuid.uuid5(uuid.NAMESPACE_URL, 'https://collegestat.app/directory/' + '|'.join(key)))
    item = dict(id=uid, slug=ref['slug'] if ref else slug(raw['name']) + '-' + uid[:8], name=raw['name'].strip(), country_code=raw['alpha_two_code'], country=raw['country'], website=urls[0], state=raw.get('state-province'), domains=raw['domains'])
    if ipeds:
        units.add(ipeds['UNITID'])
        item.update(unitid=ipeds['UNITID'], city=ipeds['CITY'], state=ipeds['STABBR'], university_type='Public' if ipeds['CONTROL'] == '1' else 'Private', latitude=coord(ipeds.get('LATITUDE')), longitude=coord(ipeds.get('LONGITUD')), admissions_url=ipeds['ADMINURL'].strip())
        cost = fees.get(ipeds['UNITID'], {})
        population = enroll.get(ipeds['UNITID'], {})
        admission = admissions.get(ipeds['UNITID'], {})
        for field, key, flag in [('APPLCN','applicants','XAPPLCN'),('ADMSSN','admitted','XADMSSN'),('ACTCM25','act_25','XACTCM25'),('ACTCM75','act_75','XACTCM75'),('SATVR25','sat_reading_25','XSATVR25'),('SATVR75','sat_reading_75','XSATVR75'),('SATMT25','sat_math_25','XSATMT25'),('SATMT75','sat_math_75','XSATMT75')]:
            v = number(admission, field, flag)
            if v is not None: item[key] = v
        if item.get('applicants',0)>0 and item.get('admitted') is not None and item['admitted']<=item['applicants']:
            item['acceptance_rate'] = round(item['admitted'] / item['applicants'] * 100, 2)
        for field, key, flag in [('TUITION2', 'tuition_in_state', 'XTUIT2'), ('TUITION3', 'tuition_out_of_state', 'XTUIT3'), ('FEE3', 'fees_out_of_state', 'XFEE3'), ('CHG5AY3', 'room_board_on_campus', 'XCHG5AY3')]:
            v = number(cost, field, flag)
            if v is not None: item[key] = v
        for field, key, flag in [('EFYTOTLT', 'enrollment_12_month', 'XEYTOTLT'), ('EFYNRALT', 'nonresident_enrollment_12_month', 'XEYNRALT')]:
            v = number(population, field, flag)
            if v is not None: item[key] = v
    result.append(item)
OUT.mkdir(exist_ok=True)
(OUT / 'global-directory.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
(OUT / 'directory-countries.json').write_text(json.dumps(dict(sorted({r['country_code']:r['country'] for r in result}.items())), indent=2) + '\n')
manifest = {'source':'https://github.com/Hipo/university-domains-list', 'download_url':'https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json', 'retrieved_at':'2026-09-26', 'license':'MIT', 'sha256':hashlib.sha256((RAW/'hipo/universities.json').read_bytes()).hexdigest(), 'institutions':len(result), 'catalogue_total':len(result)+sum(not any(row['id']==ref['id'] for row in result) for ref in reference), 'countries':len({r['country_code'] for r in result}), 'ipeds_linked':len(units), 'ipeds_year':2023, 'admissions_linked':sum('acceptance_rate' in r for r in result), 'identity_note':'Community-maintained directory; listing is not accreditation or independent identity verification.', 'joins':'Unique exact website host in the same country; one IPEDS UNITID per directory identity.'}
(OUT / 'directory-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(OUT / 'HIPO-LICENSE.txt').write_text((RAW / 'hipo/LICENSE.txt').read_text())
print(json.dumps(manifest, indent=2))
