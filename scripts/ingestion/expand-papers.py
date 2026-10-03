#!/usr/bin/env python3
"""Bounded OpenAlex refresh. No LLM calls; failed sources never replace prior evidence."""
import argparse, concurrent.futures, datetime, json, pathlib, re, threading, urllib.parse
from public_fetch import fetch_public
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'data/published/openalex-current.json'
CACHE=ROOT/'data/raw/openalex-current'
CACHE.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser()
parser.add_argument('--limit',type=int,default=50)
parser.add_argument('--max-age-days',type=int,default=7)
args=parser.parse_args()
if args.limit<1 or args.max_age_days<1:parser.error('Limits and cache age must be positive')
rows=json.loads(OUT.read_text())
today=datetime.datetime.now(datetime.timezone.utc).date()
cutoff=(today-datetime.timedelta(days=args.max_age_days)).isoformat()
start=f'{today.year-1}-01-01'
stop=threading.Event()
attempt_path=CACHE/'attempts.json'
attempts=json.loads(attempt_path.read_text()) if attempt_path.exists() else {}
ids=sorted((uid for uid,r in rows.items() if r.get('papers_checked_at','')<cutoff),key=lambda uid:attempts.get(uid,rows[uid].get('papers_checked_at','')))[:args.limit]
def fetch(uid):
 if stop.is_set():return uid,None,'rate-limited'
 r=rows[uid];identifier=r['openalex_id'].split('/')[-1]
 if not re.fullmatch(r'I\d+',identifier):return uid,None,'invalid identifier'
 url='https://api.openalex.org/works?'+urllib.parse.urlencode({'filter':f'authorships.institutions.id:{identifier},from_publication_date:{start},to_publication_date:{today},type:article|review|preprint','sort':'publication_date:desc','per_page':25,'select':'id,title,doi,publication_date,type,authorships,primary_location,open_access,cited_by_count,is_retracted'})
 try:
  body,_,_=fetch_public(url,max_bytes=2500000,timeout=20);d=json.loads(body)
  if not isinstance(d.get('results'),list) or not isinstance(d.get('meta',{}).get('count'),int):raise ValueError('Invalid source schema')
  papers=[]
  for w in d['results']:
   if w.get('is_retracted') or not w.get('title'):continue
   if not any(i.get('id')==r['openalex_id'] for a in w.get('authorships',[]) for i in a.get('institutions',[])):continue
   loc=w.get('primary_location') or {};oa=w.get('open_access') or {}
   papers.append({'id':w['id'],'title':w['title'],'doi':w.get('doi'),'date':w['publication_date'],'type':w['type'],'authors':[a['author']['display_name'] for a in w['authorships'][:5]],'venue':(loc.get('source') or {}).get('display_name'),'url':w.get('doi') or loc.get('landing_page_url') or w['id'],'open_access_url':oa.get('oa_url') if oa.get('is_oa') else None,'citations':w.get('cited_by_count',0)})
  (CACHE/(identifier+'.json')).write_bytes(body)
  return uid,dict(papers=papers,recent_works_count=d['meta']['count'],papers_source_url=url,papers_checked_at=str(today),papers_from_date=start,papers_to_date=str(today),paper_limit=25),None
 except Exception as e:
  if '429' in str(e):stop.set()
  return uid,None,str(e)[:100]
updated=0;failures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for uid,result,error in pool.map(fetch,ids):
  if error!='rate-limited':attempts[uid]=str(today)
  if result:rows[uid].update(result);updated+=1
  else:failures.append({'id':uid,'error':error})
# Atomic publication retains original identity-count timestamps.
temporary=OUT.with_suffix('.tmp');temporary.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n');temporary.replace(OUT)
attempt_path.write_text(json.dumps(attempts)+'\n')
report={'checked_at':str(today),'attempted':len(ids),'updated':updated,'failures':failures,'rate_limited':stop.is_set()}
(CACHE/'refresh-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='failures'}),flush=True)
if ids and updated==0:raise SystemExit('No sources refreshed; existing records preserved. Inspect refresh-report.json.')
