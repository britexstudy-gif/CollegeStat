#!/usr/bin/env python3
"""Generate bounded additive SQL batches from reviewed receipts. No DB connection.
Schema migrations must be applied first. Review the manifest before execution.
SFA stays in the existing PRIVATE review queue; this script cannot approve it.
"""
import hashlib, json, pathlib, uuid
ROOT=pathlib.Path(__file__).resolve().parents[2]; PUB=ROOT/'data/published'; OUT=ROOT/'outputs/deeper-data';OUT.mkdir(parents=True,exist_ok=True)
def lit(v):
    if v is None:return 'null'
    if isinstance(v,bool):return str(v).lower()
    if isinstance(v,(int,float)):return str(v)
    return "'"+(json.dumps(v,ensure_ascii=False,separators=(',',':')) if isinstance(v,(dict,list)) else str(v)).replace("'","''")+"'"
def uid(key):return str(uuid.uuid5(uuid.NAMESPACE_URL,'https://collegestat.app/evidence/'+key))
def insert(table,row):
    return f"insert into public.{table} ({','.join(row)}) values ({','.join(lit(x) for x in row.values())}) on conflict do nothing;"
batches=[]
def save(name,sql,scope):
    body='begin;\n'+sql+'\ncommit;\n';path=OUT/name;path.write_text(body)
    batches.append({'file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(body.encode()).hexdigest(),'scope':scope})

# Verified policy facts and the single officially named current course.
req=json.loads((PUB/'reviewed-requirements-oct05.json').read_text());sql=[]
for row in req['sources']:sql.append(insert('data_sources',row))
for row in req['programs']:sql.append(insert('programs',row))
for row in req['university_programs']:
    row=dict(row);row['reporting_year']=row.pop('year',None);row['availability']='current';sql.append(insert('university_programs',row))
for row in req['records']:sql.append(insert('requirements',{k:v for k,v in row.items() if k!='data_sources'}))
for row in json.loads((PUB/'requirements-current.json').read_text()):
    if row['university_id']=='9e20a5d2-bafa-5857-8f5d-4a89874bb2f1':
        sql.append(f"update public.requirements set evidence={lit(row['evidence'])}::jsonb where id={lit(row['id'])} and source_url={lit(row['source_url'])} and evidence='{{}}'::jsonb;")
# Hold wrong pilot labels without deleting their source values or editing ranks.
sql.append("""update public.universities u set imported_records=(select jsonb_agg(case when r->>'source'='leiden' and r->>'metric' in ('international_collaboration_publications','international_collaboration_share') then r || jsonb_build_object('verification_status','needs_review','publication_status','review','notes',coalesce(r->>'notes','') || ' Mapping correction 2026-10-05: these cached columns are top-5-percent scientific-impact counts/share, not international collaboration. Original value retained for audit.') else r end order by ord) from jsonb_array_elements(u.imported_records) with ordinality x(r,ord)) where exists(select 1 from jsonb_array_elements(u.imported_records) r where r->>'source'='leiden' and r->>'metric' in ('international_collaboration_publications','international_collaboration_share') and r->>'publication_status'='published');""")
save('01-requirements.sql','\n'.join(sql),{'verified_requirements':len(req['records']),'official_programmes':len(req['programs']),'held_mislabeled_pilot_metrics':10})

# Existing normalized identity crosswalk: only globally unique exact identifiers.
sql="""
with candidates as (
 select u.id university_id,i.key system,i.value external_id,u.reference_url,u.reference_retrieved_at
 from public.universities u cross join lateral jsonb_each_text(coalesce(u.identifiers,'{}')) i
 where i.key in ('ipeds','ror','openalex','wikidata','ukprn') and i.value<>''
), unique_ids as (select system,external_id from candidates group by system,external_id having count(distinct university_id)=1)
insert into public.external_identifiers(university_id,system,external_id,source_url,retrieved_at,evidence)
select c.university_id,c.system,c.external_id,
 case when c.system='ror' then c.external_id when c.system='ipeds' then 'https://nces.ed.gov/ipeds/complete-data-files/HD2025.zip' when c.system='wikidata' then 'https://www.wikidata.org/wiki/'||c.external_id when c.system='openalex' then c.external_id else c.reference_url end,
 c.reference_retrieved_at,jsonb_build_object('scope','Exact reviewed identifier from the existing catalogue; not a new accreditation claim')
from candidates c join unique_ids z using(system,external_id)
where (c.system='ror' and c.external_id ~ '^https://ror.org/0[a-z0-9]{8}$') or (c.system='ipeds' and c.external_id ~ '^[0-9]+$') or (c.system='wikidata' and c.external_id ~ '^Q[0-9]+$') or (c.system='openalex' and c.external_id ~ '^https://openalex.org/I[0-9]+$')
on conflict do nothing;
"""
save('02-identifiers.sql',sql,{'action':'Reuse existing crosswalk; ambiguous identifiers excluded, existing claims untouched'})

# OpenAlex: separate sources per retrieved snapshot/hash retain revised history.
oa=json.loads((PUB/'reviewed-openalex-metrics.json').read_text());sources={};rows=[]
for r in oa['records']:
    sid=uid('openalex:'+r['source_url']+':'+r['evidence']['dataset_sha256'])
    sources[sid]={'id':sid,'name':'OpenAlex institution metrics · '+r['edition'],'organization':'OpenAlex / OurResearch','url':r['source_url'],'source_type':'secondary','license_notes':'CC0-1.0 institution bibliographic metadata; not a university quality ranking.','retrieved_at':r['retrieved_at'],'trust_level':'medium'}
    rows.append({k:r.get(k) for k in ['id','university_id','metric','value','unit','field','period','edition','source_url','retrieved_at','last_verified_at','verification_status','license_note','evidence']}|{'source_id':sid,'source_record_id':r['evidence']['source_record_id']})
save('03-research-sources.sql','\n'.join(insert('data_sources',r) for r in sources.values()),{'source_versions':len(sources)})
for start in range(0,len(rows),300):
    save(f'04-research-{start//300+1:02}.sql','\n'.join(insert('research_metrics',r) for r in rows[start:start+300]),{'verified_research_observations':len(rows[start:start+300])})

# SFA is staged, never automatically promoted to canonical public data_points.
aid=json.loads((PUB/'reviewed-ipeds-aid.json').read_text());s=aid['source'];sid=uid(s['url']);iid=uid(s['url']+':'+s['sha256']);source_expr=f"(select id from public.data_sources where url={lit(s['url'])} order by id limit 1)"
sql=f"insert into public.data_sources(id,name,organization,url,source_type,license_notes,retrieved_at,trust_level) select {lit(sid)}::uuid,{lit(s['name'])},{lit(s['organization'])},{lit(s['url'])},'government',{lit(s['license_note'])},{lit(s['retrieved_at'])}::timestamptz,'high' where not exists(select 1 from public.data_sources where url={lit(s['url'])}) on conflict do nothing;\n"
sql+=f"insert into public.data_imports(id,source_id,status,records_seen,warnings) values({lit(iid)},{source_expr},'review',{aid['counts']['observations']},{lit(['IPEDS SFA2324; dictionary-checked R/Z only; 14 ambiguous UNITIDs excluded; requires explicit staff publication.'])}::jsonb) on conflict do nothing;"
save('05-aid-source.sql',sql,{'staged_import':iid,'total_observations':aid['counts']['observations']})
mapping={k:{key:m[key] for key in ['metric','unit','cohort','dictionary_title']} for k,m in aid['mappings'].items()}
for start in range(0,len(aid['records']),100):
    group=aid['records'][start:start+100]
    sql=f"""
with mapping as (select key field,value m from jsonb_each({lit(mapping)}::jsonb)), facts as (
 select r->>'university_id' university_id,r->>'unitid' unitid,f.key field,f.value val,m.m
 from jsonb_array_elements({lit(group)}::jsonb) r cross join lateral jsonb_each(r->'values') f join mapping m on m.field=f.key
), normalized as (
 select *,jsonb_build_object('value',(val->>'value')::numeric,'year',2024,'unit',m->>'unit','evidence',jsonb_build_object(
 'scope','IPEDS SFA2324','population',m->>'cohort','reporting_period',{lit(s['period'])},'publication_year',null,
 'retrieved_at',{lit(s['retrieved_at'])},'source_record_id',unitid,'raw_field',field,'raw_value',val->'value','reporting_flag',val->>'flag',
 'dataset_sha256',{lit(s['sha256'])},'dictionary_sha256',{lit(aid['dictionary']['sha256'])},'dictionary_url',{lit(aid['dictionary']['url'])},'license_note','US government public-use IPEDS data')) raw
 from facts where val->>'flag' in ('R','Z')
)
insert into public.source_records(id,import_id,source_id,university_id,metric,year,raw_value,normalized_value,unit,confidence,status,source_url,retrieved_at,notes)
select md5({lit(s['url'])}||':'||unitid||':'||field||':2024')::uuid,{lit(iid)}::uuid,{source_expr},university_id::uuid,m->>'metric',2024,raw,(val->>'value')::numeric,m->>'unit','high','pending',{lit(s['url'])},{lit(s['retrieved_at'])}::timestamptz,
 (m->>'dictionary_title')||'. '||(m->>'cohort')||'. 2023–2024 academic year. R=Reported; Z=Implied zero. Recipient averages are not promised awards; not an international-eligibility determination.'
from normalized on conflict do nothing;
"""
    save(f'06-aid-{start//100+1:02}.sql',sql,{'universities':len(group),'staged_observations':sum(len(r['values']) for r in group)})
save('07-aid-finish.sql',f"update public.data_imports set created=(select count(*) from public.source_records where import_id={lit(iid)}),completed_at=now() where id={lit(iid)} and status='review';",{'action':'Finalize review receipt, not publication'})
(OUT/'manifest.json').write_text(json.dumps({'mode':'reviewable_sql_only','batches':batches,'counts':{'requirements':len(req['records']),'research_metrics':len(rows),'aid_staged':aid['counts']['observations'],'aid_universities':len(aid['records'])}},indent=2)+'\n')
print(json.dumps({'batches':len(batches),'manifest':str((OUT/'manifest.json').relative_to(ROOT)),'counts':{'requirements':len(req['records']),'research':len(rows),'aid_staged':aid['counts']['observations']}}))
