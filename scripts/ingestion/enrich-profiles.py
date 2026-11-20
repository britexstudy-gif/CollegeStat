#!/usr/bin/env python3
"""Fetch organizational contact/media facts for ROR-linked Wikidata IDs.
No guessed email addresses, social handles, or campus photographs. Commons media
must have explicit reusable licensing. Cached batches make interrupted runs resumable.
"""
import argparse, concurrent.futures, datetime, hashlib, html, json, pathlib, re, subprocess, time, urllib.parse
ROOT=pathlib.Path(__file__).resolve().parents[2]; OUT=ROOT/'data/published'; RAW=ROOT/'data/raw/profile-enrichment';RAW.mkdir(parents=True,exist_ok=True)
TODAY=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=0);parser.add_argument('--max-age-days',type=int,default=30);parser.add_argument('--ids',help='Comma-separated reviewed institution IDs; all other published records are preserved.');args=parser.parse_args()
rows=json.loads((OUT/'global-directory.json').read_text());rows=[r for r in rows if r.get('external_ids',{}).get('wikidata')]
if args.ids:rows=[r for r in rows if r['id'] in set(args.ids.split(','))]
# Enrich featured and ranked profiles first, then the remainder in stable order.
ranked={r['university_id'] for r in json.loads((OUT/'ranking-records.json').read_text())}
rows.sort(key=lambda r:(r['id'] not in ranked,r['name']))
if args.limit:rows=rows[:args.limit]
properties=['P18','P154','P968','P2002','P2003','P2013','P4264','P2397','P856']
def fetch(url,key,attempt=0):
 p=RAW/(key+'.json')
 if p.exists() and time.time()-p.stat().st_mtime < args.max_age_days*86400:return json.loads(p.read_text())
 command=['curl','-fLsS','--max-time','55','--retry','1','--user-agent','CollegeStat/1.0 (university discovery; public organization data)',url]
 r=subprocess.run(command,capture_output=True)
 if r.returncode:
  if '429' in r.stderr.decode():raise SystemExit('Rate limited: stopped; cached batches are preserved. Resume after the server retry interval.')
  print('Fetch failed:',key,r.stderr.decode()[-100:],flush=True);return {}
 try:data=json.loads(r.stdout)
 except ValueError:return {}
 if 'error' in data:
  if data['error'].get('code')=='maxlag' and attempt<3:
   print('Server busy; respecting retry delay',flush=True);time.sleep(10);return fetch(url,key,attempt+1)
  raise RuntimeError('Source unavailable: '+str(data['error'].get('code'))+'. Existing published evidence preserved.')
 # Keep only institutional facts actually used, together with the response hash.
 if 'entities' in data:
  data={'entities':{k:{'id':v.get('id'),'lastrevid':v.get('lastrevid'),'claims':{p:v.get('claims',{}).get(p,[]) for p in properties}} for k,v in data['entities'].items()},'response_sha256':hashlib.sha256(r.stdout).hexdigest(),'retrieved_at':TODAY}
 p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n');return data
qids=sorted({r['external_ids']['wikidata'] for r in rows if re.fullmatch('Q[0-9]+',r['external_ids']['wikidata'])})
entities={}
for start in range(0,len(qids),40):
 ids=qids[start:start+40];url='https://www.wikidata.org/w/api.php?'+urllib.parse.urlencode({'action':'wbgetentities','format':'json','ids':'|'.join(ids),'props':'claims','maxlag':5})
 key='entities-'+hashlib.sha256('|'.join(ids).encode()).hexdigest()[:16]
 data=fetch(url,key);entities.update({k:dict(v,_retrieved_at=data.get('retrieved_at',TODAY)) for k,v in data.get('entities',{}).items()});print('Entities',min(start+40,len(qids)),'/',len(qids),flush=True);time.sleep(5)
def value(entity,prop):
 claims=[c for c in entity.get('claims',{}).get(prop,[]) if c.get('rank')!='deprecated']
 claims.sort(key=lambda c:c.get('rank')!='preferred')
 for c in claims:
  v=c.get('mainsnak',{}).get('datavalue',{}).get('value')
  if isinstance(v,str):return v
 return None
files=sorted({'File:'+v for e in entities.values() for p in ['P18','P154'] if (v:=value(e,p))})
media={}
for start in range(0,len(files),40):
 titles=files[start:start+40];url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','prop':'imageinfo','iiprop':'url|extmetadata|size','iiurlwidth':960,'titles':'|'.join(titles),'maxlag':5})
 key='commons-'+hashlib.sha256('|'.join(titles).encode()).hexdigest()[:16]
 data=fetch(url,key)
 aliases={x['from']:x['to'] for x in data.get('query',{}).get('normalized',[])}
 pages={p['title']:p for p in data.get('query',{}).get('pages',{}).values()}
 for title in titles:
  page=pages.get(aliases.get(title,title),{});info=(page.get('imageinfo') or [{}])[0]
  if info:media[title]=info
 print('Media',min(start+40,len(files)),'/',len(files),flush=True);time.sleep(5)
def text(s):return html.unescape(re.sub('<[^>]+>','',s or '')).strip()
result={}
for row in rows:
 qid=row['external_ids']['wikidata'];e=entities.get(qid)
 if not e:continue
 source='https://www.wikidata.org/wiki/'+qid
 item={'source_url':source,'retrieved_at':e.get('_retrieved_at',TODAY),'revision':e.get('lastrevid'),'socials':[],'media':[]}
 email=value(e,'P968')
 if email and re.fullmatch(r'mailto:[^\s@]+@[^\s@]+\.[^\s@]+',email):item['email']=email.removeprefix('mailto:')
 for prop,label,base in [('P2002','X','https://x.com/'),('P2003','Instagram','https://www.instagram.com/'),('P2013','Facebook','https://www.facebook.com/'),('P4264','LinkedIn','https://www.linkedin.com/company/'),('P2397','YouTube','https://www.youtube.com/channel/')]:
  handle=value(e,prop)
  if handle:item['socials'].append({'label':label,'url':base+urllib.parse.quote(handle,safe=''),'source_url':source})
 for prop,kind in [('P18','campus'),('P154','logo')]:
  filename=value(e,prop);info=media.get('File:'+filename,{}) if filename else {};meta=info.get('extmetadata',{})
  license=text(meta.get('LicenseShortName',{}).get('value',''));license_url=meta.get('LicenseUrl',{}).get('value','')
  if not (license.startswith(('CC BY','CC0')) or license in ['Public domain','PD','PD-textlogo']):continue
  if not info.get('url','').startswith('https://upload.wikimedia.org/'):continue
  if not license_url:license_url='https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain'
  item['media'].append({'kind':kind,'url':info.get('thumburl') or info['url'],'source_url':info.get('descriptionurl') or 'https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(filename),'creator':text(meta.get('Artist',{}).get('value','Unknown creator')),'license':license,'license_url':license_url,'width':info.get('thumbwidth') or info.get('width'),'height':info.get('thumbheight') or info.get('height'),'alt':text(meta.get('ImageDescription',{}).get('value',''))[:350] or row['name']+' '+kind})
 if item['media'] or item['socials'] or item.get('email'):result[row['id']]=item
p=OUT/'profile-enrichment.json'
existing=json.loads(p.read_text()) if p.exists() else {};existing.update(result);p.write_text(json.dumps(existing,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'profiles':len(result),'images':sum(len(r['media']) for r in result.values()),'emails':sum(bool(r.get('email')) for r in result.values()),'social_links':sum(len(r['socials']) for r in result.values()),'failed_entity_ids':len(qids)-len(entities)},indent=2))
