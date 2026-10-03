#!/usr/bin/env python3
"""Resumable public OpenAlex identity/logo and recent paper metadata, exact ROR joins.
Only bibliographic metadata and open-access links; no paywalled full text.
"""
import concurrent.futures,datetime,hashlib,json,pathlib,subprocess,time,urllib.parse,threading
ROOT=pathlib.Path(__file__).resolve().parents[2]; RAW=ROOT/'data/raw/openalex-current';RAW.mkdir(parents=True,exist_ok=True);OUT=ROOT/'data/published';STAGE=ROOT/'data/processed';STAGE.mkdir(parents=True,exist_ok=True)
TODAY='2026-09-28';stop=threading.Event()
rows=json.loads((OUT/'global-directory.json').read_text()); rows=[r for r in rows if r.get('ror')]
ranked={r['university_id'] for r in json.loads((OUT/'ranking-records.json').read_text())};rows.sort(key=lambda r:(r['id'] not in ranked,r['name']))
def fetch(url,key):
 p=RAW/(key+'.json')
 if p.exists():return json.loads(p.read_text())
 if stop.is_set():return {}
 r=subprocess.run(['curl','-fLsS','--max-time','30',url],capture_output=True)
 if r.returncode:
  if '429' in r.stderr.decode():stop.set();print('Rate limited; stopping new requests, retaining cache.',flush=True)
  return {}
 try:d=json.loads(r.stdout)
 except ValueError:return {}
 if 'results' not in d:return {}
 p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n');return d
institutions={}
def batch(start):
 ids=[r['ror'] for r in rows[start:start+50]]
 url='https://api.openalex.org/institutions?'+urllib.parse.urlencode({'filter':'ror:'+'|'.join(ids),'per_page':100,'select':'id,ror,display_name,image_url,image_thumbnail_url,homepage_url,works_count,cited_by_count'})
 d=fetch(url,'institutions-'+hashlib.sha256('|'.join(ids).encode()).hexdigest()[:16]);time.sleep(.5);return d
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for d in pool.map(batch,range(0,len(rows),50)):
  for i in d.get('results',[]):institutions[i['ror']]=i
  print('Matched institutions',len(institutions),flush=True)
result={}
for r in rows:
 i=institutions.get(r['ror'])
 if i:result[r['id']]={'openalex_id':i['id'],'source_url':i['id'],'ror':i['ror'],'name':i['display_name'],'logo_url':i.get('image_thumbnail_url') or i.get('image_url'),'works_count':i.get('works_count'),'cited_by_count':i.get('cited_by_count'),'retrieved_at':TODAY,'papers':[]}
(STAGE/'openalex-current.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
def papers(r):
 uid=r['id'];item=result.get(uid)
 if not item or stop.is_set():return uid,None
 filt='authorships.institutions.id:'+item['openalex_id'].split('/')[-1]+',from_publication_date:2025-01-01,to_publication_date:'+TODAY+',type:article|review|preprint'
 url='https://api.openalex.org/works?'+urllib.parse.urlencode({'filter':filt,'sort':'publication_date:desc','per_page':5,'select':'id,title,doi,publication_date,type,authorships,primary_location,open_access,cited_by_count,is_retracted'})
 d=fetch(url,'papers-'+item['openalex_id'].split('/')[-1]);time.sleep(.4)
 if not d:return uid,None
 items=[]
 for w in d.get('results',[]):
  if w.get('is_retracted'):continue
  # Require the exact institution in the authorship, not a text-name match.
  if not any(i['id']==item['openalex_id'] for a in w.get('authorships',[]) for i in a.get('institutions',[])):continue
  loc=w.get('primary_location') or {};oa=w.get('open_access') or {}
  items.append({'id':w['id'],'title':w['title'],'doi':w.get('doi'),'date':w['publication_date'],'type':w['type'],'authors':[a['author']['display_name'] for a in w.get('authorships',[])[:5]],'venue':(loc.get('source') or {}).get('display_name'),'url':w.get('doi') or loc.get('landing_page_url') or w['id'],'open_access_url':oa.get('oa_url') if oa.get('is_oa') else None,'citations':w.get('cited_by_count',0)})
 return uid,{'papers':items,'recent_works_count':d.get('meta',{}).get('count'),'papers_source_url':url}
finished=0
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for uid,data in pool.map(papers,rows):
  if data:result[uid].update(data)
  finished+=1
  if finished%100==0:
   (STAGE/'openalex-current.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n');print('Paper profiles checked',finished,'/',len(rows),flush=True)
(OUT/'openalex-current.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print('Published',len(result),'identities;',sum(bool(r['papers']) for r in result.values()),'with recent papers; stopped=',stop.is_set(),flush=True)
