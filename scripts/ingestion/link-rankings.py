#!/usr/bin/env python3
"""Match publisher tables using exact normalized names/aliases and countries.
Unmatched and ambiguous rows remain in an audit file; never use fuzzy matches.
Requires pypdf for the QS publisher PDF.
"""
import collections, datetime, hashlib, html, json, pathlib, re, unicodedata, runpy
from pypdf import PdfReader
from openpyxl import load_workbook
ROOT=pathlib.Path(__file__).resolve().parents[2]; OUT=ROOT/'data/published'; RAW=ROOT/'data/raw/rankings'
rows=json.loads((OUT/'global-directory.json').read_text())
countries=json.loads((OUT/'directory-countries.json').read_text())
country_codes={v:k for k,v in countries.items()}
country_codes.update({'China-Hong Kong':'HK','China-Macau':'MO','China-Mainland':'CN','China-Taiwan':'TW','United States of America':'US','United States':'US','Hong Kong SAR, China':'HK','Hong Kong':'HK','China (Mainland)':'CN','South Korea':'KR','Republic of Korea':'KR','Iran (Islamic Republic of)':'IR','Iran':'IR','Russian Federation':'RU','Russia':'RU','Taiwan':'TW','Taiwan, China':'TW','Türkiye':'TR','Turkey':'TR','Macao SAR':'MO','Macau SAR, China':'MO','Macao SAR, China':'MO','Czech Republic':'CZ','Czechia':'CZ','Brunei Darussalam':'BN','Vietnam':'VN','Viet Nam':'VN','Luxembourg':'LU','Montenegro':'ME','Northern Cyprus':'CY-N','Palestine':'PS','Syria':'SY','Tanzania':'TZ','Venezuela':'VE','Venezuela (Bolivarian Republic of)':'VE'})
def norm(s):
 s=html.unescape(s);s=re.sub(r'\([^)]*\)','',s)
 s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower().replace('&','and')
 s=re.sub(r'\bthe\b','',s);return re.sub('[^a-z0-9]','',s)
index={}
for u in rows:
 for name in [u['name'],*u.get('aliases',[])]:
  index.setdefault((u['country_code'],norm(name)),set()).add(u['id'])
# Explicit aliases reviewed against the same institutions' official names.
aliases={'Massachusetts Institute of Technology (MIT)':'Massachusetts Institute of Technology','ETH Zurich (Swiss Federal Institute of Technology)':'ETH Zurich','UCL (University College London)':'University College London','University of California, Berkeley (UCB)':'University of California, Berkeley','University of California, Los Angeles (UCLA)':'University of California, Los Angeles','University of Michigan-Ann Arbor':'University of Michigan–Ann Arbor','King’s College London':'King\'s College London'}
qs_url='https://www.econ.muni.cz/do/econ/soubory/oddeleni/ozs/admissions/2026_QS_World_University_Rankings_1.2__For_qs.com__11.2025.pdf'
entries=[];unmatched=[];all_entries=[]
def add(name,country,provider,rank,url,score=None,scores=None,year=2026,national_rank=None,logo_url=None):
 code=country_codes.get(country);matches=index.get((code,norm(aliases.get(name,name))),set())
 record=dict(name=name,country=country,provider=provider,year=year,rank_label=str(rank),url=url,country_code=code or "",national_rank=national_rank,logo_url=logo_url)
 if not re.match(r'^=?\d+',str(rank)):return
 start=int(re.search(r'\d+',str(rank))[0]);band=bool(re.search(r'[-–+]',str(rank)))
 full=dict(**record,university_id=next(iter(matches)) if len(matches)==1 else None,rank=start,tied=str(rank).startswith('='),band=band,score=str(score) if score is not None else None,scores={k:str(v) for k,v in (scores or {}).items() if v is not None})
 all_entries.append(full)
 if len(matches)!=1:
  unmatched.append(dict(**record,reason='ambiguous' if matches else 'unmatched'));return
 entries.append(full)
qs=[]
for page in PdfReader(RAW/'qs-2026.pdf').pages:
 for line in page.extract_text().splitlines():
  m=re.match(r'^(\d+)\s+(.+)$',line)
  if not m:continue
  suffix=next((c for c in sorted(country_codes,key=len,reverse=True) if m[2].endswith(' '+c)),None)
  if suffix:qs.append((m[2][:-len(suffix)].strip(),suffix,int(m[1])))
counts=collections.Counter(r[2] for r in qs)
for name,country,rank in qs:add(name,country,'qs',('='+str(rank)) if counts[rank]>1 else str(rank),qs_url)
qs_latest_url='https://insights.qs.com/hubfs/Rankings%20Excel%20Reports/2027%20QS%20World%20University%20Rankings%201.1%20%28For%20qs.com%29.xlsx'
qs_latest=list(load_workbook(RAW/'qs-2027.xlsx',read_only=True,data_only=True).active.values)[3:]
qs_latest=[r for r in qs_latest if r[3] and r[1]]
assert len(qs_latest)==1504, f'Unexpected QS 2027 coverage: {len(qs_latest)}'
ties=collections.Counter(str(r[1]) for r in qs_latest)
score_keys=['academic_reputation','employer_reputation','faculty_student','citations_per_faculty','international_faculty','international_students','international_research_network','employment_outcomes','sustainability']
for r in qs_latest:
 rank=str(r[1]);rank='='+rank if rank.isdigit() and ties[rank]>1 else rank
 add(r[3],r[4],'qs',rank,qs_latest_url,r[28],dict(zip(score_keys,[r[i] for i in range(10,28,2)])),year=2027)
the=json.loads((RAW/'the-2026.json').read_text())['data']
for r in the:
 add(r['name'],r['location'],'the',r['rank'],'https://www.timeshighereducation.com'+r['url'],r.get('scores_overall'),{k.removeprefix('scores_'):v for k,v in r.items() if k.startswith('scores_') and not k.endswith('_rank')})
arwu=json.loads((ROOT/'data/raw/arwu/2026.json').read_text())['data'][0]['univList']
assert len(arwu)==1000
arwu_ties=collections.Counter(r['ranking'] for r in arwu)
for r in arwu:
 rank=r['ranking'];rank='='+rank if rank.isdigit() and arwu_ties[rank]>1 else rank
 add(r['univNameEn'],r['region'],'arwu',rank,'https://www.shanghairanking.com/institution/'+r['univUp'],r.get('score'),{name:r.get(code) for code,name in [('171','alumni'),('172','award'),('173','highly_cited_researchers'),('174','nature_science'),('175','publications'),('176','per_capita_performance')]},year=2026,national_rank=r['regionRanking'])
# Current institutions can be incorrectly collapsed by a historical registry
# alias. Apply only independently reviewed, exact source/identity corrections;
# preserve every publisher fact and the original registry release.
identity_review=json.loads((OUT/'reviewed-ranking-identities-oct10.json').read_text())
reconcile_identity=runpy.run_path(str(ROOT/'scripts/ingestion/apply-reviewed-ranking-identities-oct10.py'))['reconcile']
all_entries,_=reconcile_identity(all_entries,rows,identity_review)
# Keep linked records as references to these corrected observations, so the
# derived country positions below also reach the linked bundle on direct runs.
entries=[r for r in all_entries if r['university_id'] is not None]
# Publisher student snapshots have an edition, not a verified census year.
matched_the={(r['name'],r['country']):r for r in entries if r['provider']=='the'}
def numeric(v):
 text=str(v or '').replace(',','').replace('%','').strip()
 return float(text) if re.fullmatch(r'\d+(?:\.\d+)?',text) else None
snapshots={}
for r in the:
 match=matched_the.get((r['name'],r['location']))
 if not match:continue
 intl=numeric(r.get('stats_pc_intl_students'))
 snapshots[match['university_id']]={'edition':2026,'subjects':[v.strip() for v in r.get('subjects_offered','').split(',') if v.strip()],'source_url':match['url'],'students':numeric(r.get('stats_number_students')),'student_staff_ratio':numeric(r.get('stats_student_staff_ratio')),'international_percent':intl if intl is not None and 0<=intl<=100 else None,'female_male_ratio':r.get('stats_female_male_ratio') if re.fullmatch(r'\d+\s*:\s*\d+',str(r.get('stats_female_male_ratio',''))) else None}
reconcile_snapshots=runpy.run_path(str(ROOT/'scripts/ingestion/apply-reviewed-ranking-identities-oct10.py'))['reconcile_snapshots']
snapshots,_=reconcile_snapshots(snapshots,the,entries,identity_review,'2026-09-28',hashlib.sha256((RAW/'the-2026.json').read_bytes()).hexdigest())
(OUT/'publisher-students.json').write_text(json.dumps(snapshots,ensure_ascii=False,separators=(',',':'))+'\n')
assert len(qs)>=490, f'QS parser lost rows: {len(qs)}'
assert len(entries)>1000, f'Too few linked records: {len(entries)}'
# Country position within each global table, retaining uncertainty inside rank bands.
for r in all_entries:
 peers=[p for p in all_entries if (p['provider'],p['year'],p['country_code'])==(r['provider'],r['year'],r['country_code'])]
 better=sum(p['rank']<r['rank'] for p in peers);same=sum(p['rank']==r['rank'] for p in peers)
 r['country_position']=str(better+1)+('-'+str(better+same) if r['band'] and same>1 else '')
 r['country_total']=len(peers)
(OUT/'ranking-all.json').write_text(json.dumps(all_entries,ensure_ascii=False,separators=(',',':'))+'\n')
(OUT/'ranking-records.json').write_text(json.dumps(entries,ensure_ascii=False,separators=(',',':'))+'\n')
(OUT/'ranking-unmatched.json').write_text(json.dumps(unmatched,ensure_ascii=False,indent=2)+'\n')
manifest=dict(arwu_2026_rows=len(arwu),retrieved_at='2026-09-28',qs_2027_rows=len(qs_latest),linked=len(entries),by_provider=dict(collections.Counter(r['provider'] for r in entries)),qs_pdf_rows=len(qs),the_ranked_rows=sum(bool(re.match(r'^=?\d+',str(r['rank']))) for r in the),unmatched=len(unmatched),matching='Unique exact normalized name or registered alias, within the same country; unmatched/ambiguous records retained for review.',sources=[dict(file=p.name,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in [*RAW.glob('*'),ROOT/'data/raw/arwu/2026.json'] if p.suffix in ['.pdf','.json','.xlsx']])
(OUT/'ranking-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest,indent=2))
