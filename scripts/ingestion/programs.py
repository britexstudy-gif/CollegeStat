#!/usr/bin/env python3
"""IPEDS program completion evidence; never claims these are current admissions openings."""
import csv,io,json,pathlib,zipfile,hashlib
from openpyxl import load_workbook
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'data/published';RAW=ROOT/'data/raw/ipeds'
with zipfile.ZipFile(RAW/'C2025_A_Dict.zip') as z:w=load_workbook(io.BytesIO(z.read(z.namelist()[0])),read_only=True,data_only=True)
f=list(w['Frequencies'].values);cip={str(r[3]):str(r[4]) for r in f if r[0]=='CIPCODE'};levels={str(r[3]):str(r[4]) for r in f if r[0]=='AWLEVEL'}
ids={str(u['unitid']):u['id'] for u in json.loads((OUT/'global-directory.json').read_text()) if u.get('unitid')};result={}
with zipfile.ZipFile(RAW/'C2025_A.zip') as z:
 for r in csv.DictReader(io.TextIOWrapper(z.open(z.namelist()[0]),encoding='utf-8-sig')):
  uid=ids.get(r['UNITID']);code=r['CIPCODE'];level=r['AWLEVEL']
  if not uid or r['MAJORNUM']!='1' or '.' not in code or len(code)!=7 or r['XCTOTALT'] not in ['R','Z']:continue
  value=int(r['CTOTALT'] or 0)
  if value<=0:continue
  result.setdefault(uid,[]).append([code,level,value])
for rows in result.values():rows.sort(key=lambda r:(-r[2],r[0]))
(OUT/'program-dictionary.json').write_text(json.dumps({'cip':cip,'awards':levels},ensure_ascii=False,separators=(',',':'))+'\n')
(OUT/'program-catalogue.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
(OUT/'program-manifest.json').write_text(json.dumps({'source_url':'https://nces.ed.gov/ipeds/complete-data-files/C2025_A.zip','dictionary_url':'https://nces.ed.gov/ipeds/complete-data-files/C2025_A_Dict.zip','period':'July 2024–June 2025','retrieved_at':'2026-09-28','institutions':len(result),'program_records':sum(map(len,result.values())),'sha256':hashlib.sha256((RAW/'C2025_A.zip').read_bytes()).hexdigest()},indent=2)+'\n')
print('Programs',len(result),sum(map(len,result.values())))
