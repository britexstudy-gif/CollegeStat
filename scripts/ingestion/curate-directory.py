#!/usr/bin/env python3
"""Publish corroborated directory identities using ROR active Education and IPEDS.
Run build-global.py first. Exact country + website joins only; no fuzzy merging.
Each released directory preserves prior IDs/slugs when matched.
"""
import csv, datetime, hashlib, io, json, pathlib, re, urllib.parse, uuid, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[2]; RAW=ROOT/'data/raw'; OUT=ROOT/'data/published'
TODAY=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
def host(url):
 try:return (urllib.parse.urlparse(url if '://' in url else 'https://'+url).hostname or '').lower().removeprefix('www.')
 except ValueError:return ''
def url(s):
 s=(s or '').strip()
 return ('https://'+s if '://' not in s else s) if s and '.' in s and not s.startswith(('-', 'mailto:')) else None
def rows(t):
 with zipfile.ZipFile(RAW/'ipeds'/(t+'.zip')) as z:
  n=next(n for n in z.namelist() if n.lower().endswith('.csv'))
  return list(csv.DictReader(io.TextIOWrapper(z.open(n),encoding='utf-8-sig',errors='replace')))
def num(r,f,flag):
 if r.get(flag,'').strip() not in ['R','Z']:return None
 try:
  n=float(r[f]);return n if n>=0 else None
 except (ValueError,KeyError):return None
p=RAW/'ror/v2.13-2026-09-22-ror-data.zip'
assert hashlib.md5(p.read_bytes()).hexdigest()=='a935217de21e7983b977f5419f1a6b20','ROR checksum mismatch'
with zipfile.ZipFile(p) as z: ror=json.loads(z.read(next(n for n in z.namelist() if n.endswith('.json'))))
rindex={}
for r in ror:
 if r['status']!='active' or 'education' not in r['types']:continue
 for loc in r['locations']:
  for link in r['links']:
   if link['type']=='website':rindex.setdefault((loc['geonames_details']['country_code'],host(link['value'])),[]).append(r)
hd=[r for r in rows('HD2025') if r['DEGGRANT']=='1' and r['ICLEVEL']=='1' and r['CYACTIVE']=='1' and r['ACT'] in ['A','N','R'] and r['CLOSEDAT'] in ['-2','']]
hindex={}
for r in hd:hindex.setdefault(host(r['WEBADDR']),[]).append(r)
old=json.loads((OUT/'global-directory.json').read_text());result=[];seen_ror=set();seen_unit=set()
refs={r['id'] for r in json.loads((ROOT/'supabase/reference-catalogue.json').read_text())}
for item in old:
 matches=rindex.get((item['country_code'],host(item['website'])),[])
 unique={r['id']:r for r in matches};r=next(iter(unique.values())) if len(unique)==1 else None
 hmatches=hindex.get(host(item['website']),[]) if item['country_code']=='US' else []
 h=next((h for h in hmatches if h['UNITID']==item.get('unitid')),None) or (hmatches[0] if len(hmatches)==1 else None)
 if not r and not h and item['id'] not in refs:continue
 if r and r['id'] in seen_ror:continue
 if h and h['UNITID'] in seen_unit:continue
 if r:
  seen_ror.add(r['id']);item['ror']=r['id'];item['identity_source']=r['id'];item['identity_release']='ROR 2.13 · 2026-09-22';item['founded_year']=r['established'];item['aliases']=[n['value'] for n in r['names']];
  loc=next((l['geonames_details'] for l in r['locations'] if l['geonames_details']['country_code']==item['country_code']),None)
  if loc:item.update(city=loc['name'],latitude=loc['lat'],longitude=loc['lng'])
  item['external_ids']={x['type']:x['preferred'] or x['all'][0] for x in r['external_ids'] if x['all']}
 if h:item['unitid']=h['UNITID'];seen_unit.add(h['UNITID'])
 result.append(item)
# Include active, degree-granting four-year institutions absent from the old directory.
for h in hd:
 if h['UNITID'] in seen_unit or not url(h['WEBADDR']):continue
 uid=str(uuid.uuid5(uuid.NAMESPACE_URL,'https://nces.ed.gov/ipeds/institution/'+h['UNITID']))
 name=re.sub('[^a-z0-9]+','-',h['INSTNM'].lower()).strip('-')[:130]
 result.append(dict(id=uid,slug=name+'-'+uid[:8],name=h['INSTNM'],country_code='US',country='United States',website=url(h['WEBADDR']),domains=[host(h['WEBADDR'])],unitid=h['UNITID']))
 seen_unit.add(h['UNITID'])
cost={r['UNITID']:r for r in rows('COST1_2024')};hby={h['UNITID']:h for h in hd};adm={r['UNITID']:r for r in rows('ADM2024')};enr={r['UNITID']:r for r in rows('EFFY2025') if r['EFFYALEV']=='1' and r['LSTUDY']=='999'}
for item in result:
 item['identity_retrieved_at']='2026-09-26' # Actual cached snapshot retrieval; rebuild time is not a new verification.
 h=hby.get(item.get('unitid'))
 if not h:continue
 item.update(name=h['INSTNM'],city=h['CITY'],state=h['STABBR'],university_type='Public' if h['CONTROL']=='1' else 'Private',identity_source='https://nces.ed.gov/ipeds/complete-data-files/HD2025.zip',identity_release='IPEDS 2025–26 directory',address=', '.join([h['ADDR'],h['CITY'],h['STABBR'],h['ZIP']]),phone=h['GENTELE'].strip(),admissions_url=url(h['ADMINURL']),application_url=url(h['APPLURL']),financial_aid_url=url(h['FAIDURL']),net_price_url=url(h['NPRICURL']))
 item['current_observations']=[]
 for table,row,year,period,cohort,fields in [
 ('COST1_2024',cost.get(h['UNITID'],{}),2024,'2024–2025 academic year','Full-time undergraduate · residency as labeled',[('TUITION2','tuition_in_state','XTUIT2','USD'),('TUITION3','tuition_out_of_state','XTUIT3','USD'),('FEE3','fees_out_of_state','XFEE3','USD'),('ROOMAMT','housing_on_campus','XROOMAMT','USD'),('BOARDAMT','food_on_campus','XBORDAMT','USD'),('APPLFEEU','undergraduate_application_fee','XAPPFEEU','USD')]),
 ('ADM2024',adm.get(h['UNITID'],{}),2024,'Fall 2024','First-time degree/certificate-seeking undergraduates',[('APPLCN','applicants','XAPPLCN','students'),('ADMSSN','admitted','XADMSSN','students'),('SATVR25','sat_reading_25','XSATVR25','score'),('SATVR75','sat_reading_75','XSATVR75','score'),('SATMT25','sat_math_25','XSATMT25','score'),('SATMT75','sat_math_75','XSATMT75','score'),('ACTCM25','act_25','XACTCM25','score'),('ACTCM75','act_75','XACTCM75','score')]),
 ('EFFY2025',enr.get(h['UNITID'],{}),2025,'July 2024–June 2025','All levels · 12-month unduplicated headcount',[('EFYTOTLT','enrollment_12_month','XEYTOTLT','students'),('EFYNRALT','nonresident_enrollment_12_month','XEYNRALT','students')])]:
  obs=[]
  for f,m,flag,unit in fields:
   v=num(row,f,flag)
   if v is not None:obs.append(dict(metric=m,value=v,unit=unit))
  if table=='ADM2024':
   applicants=num(row,'APPLCN','XAPPLCN');admitted=num(row,'ADMSSN','XADMSSN')
   if applicants and admitted is not None and admitted<=applicants:obs.append(dict(metric='acceptance_rate',value=round(admitted/applicants*100,2),unit='%'))
  item['current_observations'] += [dict(**o,table=table,year=year,period=period,cohort=cohort) for o in obs]
# Reconcile exact country/name matches to existing public reference routes.
reference_rows=json.loads((ROOT/'supabase/reference-catalogue.json').read_text())
redirect_file=OUT/'identity-redirects.json'
redirects=json.loads(redirect_file.read_text()) if redirect_file.exists() else {}
for item in result:
 candidates=[r for r in reference_rows if r['country_code']==item['country_code'] and r['name'].casefold()==item['name'].casefold()]
 if len(candidates)==1 and item['id']!=candidates[0]['id']:
  r=candidates[0];redirects[item['id']]={'id':r['id'],'slug':r['slug'],'old_slug':item['slug']};item['id']=r['id'];item['slug']=r['slug']
redirect_file.write_text(json.dumps(redirects,indent=2)+'\n')
assert 5000<=len(result)<=10000, f'Curated count outside requested bounds: {len(result)}'
(OUT/'global-directory.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
(OUT/'directory-countries.json').write_text(json.dumps(dict(sorted({r['country_code']:r['country'] for r in result}.items())),indent=2)+'\n')
manifest=dict(source='ROR + IPEDS',retrieved_at=TODAY,ror_release='2.13 · 2026-09-22',ror_doi='https://doi.org/10.5281/zenodo.22902037',ror_license='CC0',institutions=len(result),catalogue_total=len(result)+sum(not any(u['id']==r for u in result) for r in refs),countries=len({r['country_code'] for r in result}),ror_linked=len(seen_ror),ipeds_linked=len(seen_unit),ipeds_year=2025,admissions_year=2024,identity_note='Active ROR Education records corroborated by exact country and official host, plus active IPEDS degree-granting four-year institutions and reviewed reference profiles. Registry inclusion is not accreditation.',sha256=hashlib.sha256((OUT/'global-directory.json').read_bytes()).hexdigest())
(OUT/'directory-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest,indent=2))
