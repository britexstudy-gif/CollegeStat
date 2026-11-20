#!/usr/bin/env python3
"""Generate reviewed link-metadata SQL, reusing sources and preserving versions.
No network/database writes; third-party question content is not imported.
"""
import argparse, hashlib, json, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def lit(v): return "'"+v.replace("'","''")+"'"
def prepare(out):
 p=ROOT/'data/published/study-resources-oct09.json'; data=json.loads(p.read_text()); rows=data['records']; assert data['question_imports']==0 and len(rows)==19
 sql=['begin;','lock table public.data_sources in share row exclusive mode;']
 for r in rows:
  assert r['url'].startswith('https://') and r['evidence']['content_imported'] is False and r['reuse_mode']=='link_metadata_only'
  sid=str(uuid.uuid5(uuid.NAMESPACE_URL,r['url']))
  sql.append(f"insert into public.data_sources(id,name,organization,url,source_type,license_notes,retrieved_at,trust_level) select '{sid}',{lit(r['title'])},{lit(r['provider'])},{lit(r['url'])},'official','Link metadata and original CollegeStat synopsis only; no copied question content.',{lit(r['retrieved_at'])}::timestamptz,'high' where not exists(select 1 from public.data_sources where url={lit(r['url'])}) on conflict do nothing;")
  fields=['id','slug','title','provider','kind','subject','url','summary','access','country_code','population','publication_year','retrieved_at','verification_state','reuse_mode','steps','evidence']
  vals=[]
  for f in fields:
   v=r[f];vals.append('null' if v is None else str(v) if isinstance(v,int) else lit(json.dumps(v,ensure_ascii=False))+'::jsonb' if isinstance(v,(list,dict)) else lit(v))
  fields+=['source_id','verified_at','published'];vals+=[f"(select id from public.data_sources where url={lit(r['url'])} order by id limit 1)",'now()','true']
  sql.append('insert into public.learning_resources('+','.join(fields)+') values('+','.join(vals)+') on conflict(slug,retrieved_at) do nothing;')
 sql+=['commit;',"select kind,count(*) published_links from public.learning_resources where published and verification_state='verified' group by kind;"]
 out.mkdir(parents=True,exist_ok=True);target=out/'publish-reviewed-resource-links.sql';target.write_text('\n'.join(sql)+'\n');manifest={'resources':len(rows),'question_imports':0,'input_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'sql_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'mode':'reviewed_link_metadata_insert_only'};(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');return manifest
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--out',type=Path,default=ROOT/'outputs/learning-resources-publication-oct09');print(json.dumps(prepare(parser.parse_args().out)))
