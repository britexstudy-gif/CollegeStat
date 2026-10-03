#!/usr/bin/env python3
"""Cache public institution thumbnails; retain source identity and remote URLs."""
import concurrent.futures,json,pathlib,subprocess,threading,time,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/images/institutions';OUT.mkdir(parents=True,exist_ok=True)
rows=json.loads((ROOT/'data/published/openalex-current.json').read_text());manifest_path=ROOT/'data/published/institution-image-cache.json';manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {};stop=threading.Event()
def fetch(item):
 uid,r=item;url=r.get('logo_url')
 if not url or stop.is_set() or uid in manifest:return
 result=subprocess.run(['curl','-fLsS','--max-time','20','--max-filesize','2000000','--user-agent','CollegeStat institutional image cache',url],capture_output=True)
 if result.returncode:
  if '429' in result.stderr.decode():stop.set()
  return
 b=result.stdout;ext='png' if b.startswith(b'\x89PNG') else 'jpg' if b.startswith(b'\xff\xd8') else 'webp' if b[:4]==b'RIFF' and b[8:12]==b'WEBP' else None
 if not ext:return
 name=uid+'.'+ext;(OUT/name).write_bytes(b);time.sleep(.3)
 return uid,{'url':'/images/institutions/'+name,'remote_url':url,'source_url':r['source_url'],'retrieved_at':'2026-09-28','sha256':hashlib.sha256(b).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for i,result in enumerate(pool.map(fetch,rows.items())):
  if result:manifest[result[0]]=result[1]
  if i%100==0:manifest_path.write_text(json.dumps(manifest,separators=(',',':'))+'\n');print('Processed',i,'cached',len(manifest),flush=True)
manifest_path.write_text(json.dumps(manifest,separators=(',',':'))+'\n');print('Cached',len(manifest),'stopped for rate limit',stop.is_set(),flush=True)
