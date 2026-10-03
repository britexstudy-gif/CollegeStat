#!/usr/bin/env python3
"""Read each verified directory homepage once; discover only links actually present.
Website icons are distinct from official logos; no requirements or scholarships inferred.
"""
import argparse,concurrent.futures,datetime,hashlib,json,pathlib,re,time,urllib.parse
from public_fetch import fetch_public
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'data/published/official-web-profiles.json';CACHE=ROOT/'data/raw/official-web-profiles';CACHE.mkdir(parents=True,exist_ok=True)
rows=json.loads((ROOT/'data/published/global-directory.json').read_text());existing=json.loads(OUT.read_text()) if OUT.exists() else {}
parser=argparse.ArgumentParser()
parser.add_argument('--limit',type=int,default=200)
parser.add_argument('--max-age-days',type=int,default=30)
parser.add_argument('--workers',type=int,default=4)
args=parser.parse_args()
TODAY=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
ATTEMPTS=CACHE/'attempts.json'
attempts=json.loads(ATTEMPTS.read_text()) if ATTEMPTS.exists() else {}
rows.sort(key=lambda r:attempts.get(r['id'],existing.get(r['id'],{}).get('checked_at','')))
if args.limit:rows=rows[:args.limit]
class Page(HTMLParser):
 def __init__(self):super().__init__();self.icons=[];self.anchors=[];self.href=None;self.label='';self.title='';self.in_title=False
 def handle_starttag(self,t,attrs):
  a=dict(attrs)
  if t=='link' and 'icon' in a.get('rel','').lower() and a.get('href'):self.icons.append((a.get('rel',''),a['href']))
  if t=='a':self.href=a.get('href');self.label=''
  if t=='title':self.in_title=True
 def handle_data(self,d):
  if self.href:self.label+=d
  if self.in_title:self.title+=d
 def handle_endtag(self,t):
  if t=='a' and self.href:self.anchors.append((self.href,' '.join(self.label.split())[:150]));self.href=None
  if t=='title':self.in_title=False

def read(r):
 uid=r['id'];url=r.get('website','')
 if not url.startswith(('https://','http://')):return
 cache=CACHE/(uid+'.json')
 if cache.exists() and time.time()-cache.stat().st_mtime < args.max_age_days*86400:return uid,json.loads(cache.read_text())
 try:
  body,url,content_type=fetch_public(url)
  if 'html' not in content_type:return
  text=body.decode('utf-8',errors='replace');p=Page();p.feed(text)
 except Exception:return
 if any(x in p.title.lower() for x in ['domain for sale','access denied','just a moment','attention required','403 forbidden']):return
 def absolute(v):
  result=urllib.parse.urljoin(url,v);return result if result.startswith(('https://','http://')) else None
 icons=[absolute(v) for _,v in sorted(p.icons,key=lambda i:'apple-touch' not in i[0])];links={};social=[]
 for href,label in p.anchors:
  dest=absolute(href)
  if not dest:continue
  host=urllib.parse.urlparse(dest).hostname or '';s=(label+' '+urllib.parse.urlparse(dest).path).lower()
  for category,pattern in [('admissions',r'\badmissions?\b|\bapply\b'),('requirements',r'entry.requirements|admission.requirements'),('scholarships',r'scholarship|financial.aid|bursar'),('programs',r'degree.program|study.program|course.finder|course.catalog|programmes'),('research',r'\bresearch\b'),('enrollment',r'facts.and.figures|university.facts|key.figures'),('alumni',r'\balumni\b')]:
   if category not in links and re.search(pattern,s):links[category]={'url':dest,'label':label or category}
  for name,domains in [('Instagram',['instagram.com']),('Facebook',['facebook.com']),('YouTube',['youtube.com','youtu.be']),('LinkedIn',['linkedin.com']),('X',['twitter.com','x.com'])]:
   if any(host==d or host.endswith('.'+d) for d in domains) and not any(k in dest.lower() for k in ['share?','sharer','intent/']):
    if not any(v['label']==name for v in social):social.append({'label':name,'url':dest,'source_url':url})
 data={'source_url':url,'checked_at':TODAY,'title':p.title[:250],'icon_url':next((v for v in icons if v),None),'links':links,'socials':social,'response_sha256':hashlib.sha256(body).hexdigest()}
 cache.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n');return uid,data
def save(data):
 temporary=OUT.with_suffix('.tmp');temporary.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n');temporary.replace(OUT)
with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(args.workers,8))) as pool:
 for i,result in enumerate(pool.map(read,rows)):
  attempts[rows[i]["id"]]=TODAY
  if result:existing[result[0]]=result[1]
  if i%100==0:save(existing);print('Checked',i,'/',len(rows),'homepages:',len(existing),'icons:',sum(bool(r['icon_url']) for r in existing.values()),flush=True)
save(existing);print('Finished',len(existing),'homepages;',sum(bool(r['icon_url']) for r in existing.values()),'website icons',flush=True)

ATTEMPTS.write_text(json.dumps(attempts)+"\n")
