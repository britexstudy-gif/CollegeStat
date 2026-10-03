#!/usr/bin/env python3
"""Read social links directly linked by each institution's official homepage.
Cache source HTML, record retrieval dates; never infer account handles.
"""
import concurrent.futures,html,json,pathlib,subprocess,urllib.parse
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'data/published';RAW=ROOT/'data/raw/official-socials';RAW.mkdir(parents=True,exist_ok=True)
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.footer_links=[];self.in_footer=False
 def handle_endtag(self,tag):
  if tag=='footer':self.in_footer=False
 def handle_starttag(self,tag,attrs):
  if tag=='footer':self.in_footer=True
  if tag=='a':
   for k,v in attrs:
    if k=='href' and v:
     self.links.append(v)
     if self.in_footer:self.footer_links.append(v)
rows=json.loads((OUT/'global-directory.json').read_text());byid={r['id']:r for r in rows}
ranks=json.loads((OUT/'ranking-records.json').read_text());ids=list(dict.fromkeys(r['university_id'] for r in sorted(ranks,key=lambda r:r['rank']) if r['rank']<=50))
platforms={'instagram.com':'Instagram','facebook.com':'Facebook','linkedin.com':'LinkedIn','youtube.com':'YouTube','twitter.com':'X','x.com':'X','tiktok.com':'TikTok','threads.net':'Threads','bsky.app':'Bluesky'}
def fetch(uid):
 u=byid[uid];url=u['website'];p=RAW/(uid+'.html')
 if not p.exists():
  redirects=json.loads((OUT/'identity-redirects.json').read_text())
  old=next((k for k,v in redirects.items() if v['id']==uid and (RAW/(k+'.html')).exists()),None)
  if old:p=RAW/(old+'.html')
 if not p.exists():
  r=subprocess.run(['curl','-fLsS','--max-time','25','--max-filesize','3000000',url],capture_output=True)
  if r.returncode:return None
  p.write_bytes(r.stdout)
 parser=Links();parser.feed(p.read_text(errors='replace'));socials=[]
 for href in reversed(parser.footer_links or parser.links):
  href=urllib.parse.urljoin(url,html.unescape(href));parts=urllib.parse.urlparse(href);host=parts.netloc.lower().removeprefix('www.')
  if parts.scheme!='https' or host not in platforms or not parts.path.strip('/') or any(x in href.lower() for x in ['/share','/sharer','/intent','/login','/dialog','/watch?','/embed/','/p/','/reel/','/status/','/video/','/photo.php','/feed/','/posts/','/photos/','/videos/']):continue
  if not any(s['label']==platforms[host] for s in socials):socials.append({'label':platforms[host],'url':href})
 if not socials:return None
 return uid,{'socials':socials,'source_url':url,'retrieved_at':'2026-09-28'}
result=json.loads((OUT/'official-socials.json').read_text()) if (OUT/'official-socials.json').exists() else {}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for item in pool.map(fetch,ids):
  if item:result[item[0]]=item[1];print('Official links',len(result),flush=True)
(OUT/'official-socials.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('Saved',len(result),'institutions from',len(ids),'official homepages')
