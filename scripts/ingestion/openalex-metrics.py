#!/usr/bin/env python3
"""Versioned institution metrics, exact ROR joins; no papers/full text duplicated.
Default reads installed detailed institution responses and dated caches. --fetch
adds a dated, bounded API cache; never overwrites an older response. API failures
remain review gaps. This command writes an inspectable receipt, not the database.
"""
import argparse, datetime, hashlib, json, pathlib, re, time, urllib.error, urllib.request, uuid
ROOT = pathlib.Path(__file__).resolve().parents[2]
PUBLISHED = ROOT / 'data/published'

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def normalize(raw, meta, university):
    ror = university.get('ror')
    institution_id = raw.get('id')
    if not isinstance(ror, str) or not re.fullmatch(r'https://ror\.org/0[a-z0-9]{8}', ror) or raw.get('ror') != ror or not isinstance(institution_id, str) or not re.fullmatch(r'https://openalex\.org/I[0-9]+', institution_id):
        raise ValueError('Exact institution identifier mismatch')
    allowed_sources = {'https://api.openalex.org/institutions/' + value for value in (ror, institution_id, institution_id.rsplit('/', 1)[-1])}
    if not isinstance(meta.get('url'), str) or meta['url'] not in allowed_sources:
        raise ValueError('Source must be the exact HTTPS OpenAlex institution lookup')
    stamp = meta.get('retrieved_at')
    try:
        checked = datetime.datetime.fromisoformat(stamp.replace('Z', '+00:00'))
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError('Invalid source retrieval timestamp') from exc
    if checked.tzinfo is None or not re.match(r'^\d{4}-\d{2}-\d{2}T', stamp):
        raise ValueError('Retrieval timestamp must include a timezone')
    if not isinstance(meta.get('sha256'), str) or not re.fullmatch(r'[a-f0-9]{64}', meta['sha256']):
        raise ValueError('Invalid source cache checksum')
    year_limit = checked.year; rows = []; excluded = []
    def emit(metric, value, period, field=None, raw_field=None, reporting_year=None):
        if isinstance(value,bool) or not isinstance(value,int) or value < 0: return
        evidence = {'population':'Works affiliated with this exact OpenAlex institution; database coverage is incomplete',
            'scope':'institution','reporting_period':period,'publication_year':None,'retrieved_at':stamp,
            'source_record_id':raw['id'],'raw_field':raw_field,'raw_value':value,'dataset_sha256':meta['sha256'],
            'dictionary_url':'https://help.openalex.org/data/common-attributes/','license_note':'CC0-1.0',
            'provider_updated_at':raw.get('updated_date'),'field_id':field.get('id') if field else None}
        key = f"{university['id']}:{raw['id']}:{metric}:{period}:{field.get('id') if field else ''}:{meta['sha256']}"
        rows.append({'id':str(uuid.uuid5(uuid.NAMESPACE_URL,'https://collegestat.app/research/'+key)),
            'university_id':university['id'],'source':'openalex','source_url':meta['url'],'metric':metric,
            'value':value,'unit':'citations' if 'citation' in metric else 'works','period':period,
            'field':field.get('display_name') if field else None,'edition':stamp[:10],
            'reporting_year':reporting_year,'retrieved_at':stamp,'verification_status':'verified',
            'last_verified_at':stamp,'license_note':'CC0-1.0','evidence':evidence,
            'notes':'OpenAlex indexed counts are bibliographic coverage, not university output or quality rankings. Yearly cited_by_count is the provider rollup; do not label it citations received during that calendar year.'})
    emit('indexed_works',raw.get('works_count'),'All years · snapshot '+stamp[:10],raw_field='works_count')
    emit('indexed_citations',raw.get('cited_by_count'),'All years · snapshot '+stamp[:10],raw_field='cited_by_count')
    annual = []
    seen_years = set()
    yearly = raw.get('counts_by_year') or []
    if not isinstance(yearly, list):
        raise ValueError('Invalid source year collection')
    for item in yearly:
        year = item.get('year') if isinstance(item, dict) else None
        if isinstance(year, bool) or not isinstance(year,int) or not 1900 <= year <= year_limit:
            excluded.append({'reason':'future_or_invalid_rollup_year','year':year}); continue
        if year in seen_years:
            raise ValueError('Duplicate source rollup year')
        seen_years.add(year)
        annual.append(item)
    # Keep prior numeric exclusions in their original chronological order. Invalid
    # types remain inspectable without participating in the source-year sort.
    excluded.sort(key=lambda entry: (0, entry['year']) if type(entry['year']) is int else (1, repr(entry['year'])))
    for item in sorted(annual, key=lambda item: item['year']):
        year=item['year']
        for field,metric in [('works_count','yearly_indexed_works'),('cited_by_count','yearly_citation_rollup'),('oa_works_count','yearly_open_access_works')]:
            emit(metric,item.get(field),str(year),raw_field='counts_by_year.'+field,reporting_year=year)
    topics = raw.get('topics') or []
    if not isinstance(topics, list):
        raise ValueError('Invalid source topics collection')
    for topic in topics[:10]:
        if not isinstance(topic, dict) or not re.fullmatch(r'https://openalex\.org/T[0-9]+', str(topic.get('id', ''))) or not isinstance(topic.get('display_name'), str) or not topic['display_name'].strip(): continue
        emit('topic_indexed_works',topic.get('count'),'All years · snapshot '+stamp[:10],field=topic,raw_field='topics.count')
    return rows,excluded

def cached_institutions(directory, root=ROOT):
    """Read historical source files without altering a response or its metadata."""
    by_ror = {}
    for university in directory:
        if university.get('ror'):
            by_ror.setdefault(university['ror'], []).append(university)
    paths = list((root/'data/raw/openalex').glob('*.json')) + list((root/'data/raw/openalex-metrics').glob('*/*.json'))
    cache = []; gaps = []; seen = set()
    for path in sorted(paths):
        if path.name.endswith('.meta.json'): continue
        meta_path = path.with_name(path.name + '.meta.json')
        try:
            if not meta_path.exists(): raise ValueError('missing_cache_metadata')
            meta = json.loads(meta_path.read_text()); raw = json.loads(path.read_text())
            if not isinstance(raw, dict) or not isinstance(meta, dict): raise ValueError('invalid_cache_object')
            if not isinstance(raw.get('ror'), str): raise ValueError('invalid_source_ror_identity')
            identities = by_ror.get(raw.get('ror'), [])
            if len(identities) != 1: raise ValueError('missing_or_ambiguous_ror_identity')
            if meta.get('sha256') != digest(path): raise ValueError('cache_checksum_mismatch')
            university = identities[0]
            normalize(raw, meta, university)
            key = (university['id'], meta['sha256'])
            if key not in seen:
                cache.append((raw, meta, university)); seen.add(key)
        except (ValueError, OSError) as exc:
            gaps.append({'cache_file': str(path.relative_to(root)), 'reason': str(exc)})
    return cache, gaps

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--fetch',action='store_true');ap.add_argument('--limit',type=int,default=12);args=ap.parse_args()
    if not 1 <= args.limit <= 30: ap.error('limit must be 1–30')
    directory=json.loads((PUBLISHED/'global-directory.json').read_text())
    cache, gaps = cached_institutions(directory)
    if args.fetch:
        selected=list({u['id']:u for _,_,u in cache}.values())
        selected += [u for u in directory if u.get('ror') and u['id'] not in {x['id'] for x in selected} and u['country_code'] in ('UZ','TJ','KZ','KG')]
        today=datetime.datetime.now(datetime.timezone.utc).date().isoformat();folder=ROOT/'data/raw/openalex-metrics'/today;folder.mkdir(parents=True,exist_ok=True)
        for u in selected[:args.limit]:
            rid=u['ror'].rsplit('/',1)[-1];path=folder/(rid+'.json');mp=path.with_name(path.name+'.meta.json');url='https://api.openalex.org/institutions/'+u['ror']
            try:
                if path.exists() != mp.exists():
                    raise ValueError('incomplete_cache_pair')
                if not path.exists():
                    req=urllib.request.Request(url,headers={'User-Agent':'CollegeStat/0.1 (institution metadata; sourced research)'})
                    with urllib.request.urlopen(req,timeout=20) as res:body=res.read(1_000_001)
                    if len(body)>1_000_000:raise ValueError('response_size_limit')
                    raw=json.loads(body)
                    if raw.get('ror')!=u['ror']:raise ValueError('identity_mismatch')
                    meta={'url':url,'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(body).hexdigest()}
                    normalize(raw,meta,u)
                    with path.open('xb') as output:output.write(body)
                    with mp.open('x',encoding='utf-8') as output:output.write(json.dumps(meta,indent=2)+'\n')
                raw=json.loads(path.read_text());meta=json.loads(mp.read_text())
                if digest(path)!=meta['sha256']:raise ValueError('cache_checksum_mismatch')
                normalize(raw,meta,u)
                if not any(existing['sha256'] == meta['sha256'] and identity['id'] == u['id'] for _,existing,identity in cache):
                    cache.append((raw,meta,u))
                print('Cached institution',rid,flush=True)
                time.sleep(.2)
            except (urllib.error.URLError,ValueError,OSError) as exc:
                gaps.append({'university_id':u['id'],'ror':u['ror'],'reason':type(exc).__name__})
                if isinstance(exc,urllib.error.HTTPError) and exc.code in (401,403,429):break
    records={}; excluded=[]
    for raw,meta,u in cache:
        rows,bad=normalize(raw,meta,u)
        for row in rows: records[row['id']]=row
        excluded += [{'university_id':u['id'],**x} for x in bad]
    receipt={'dataset':'OpenAlex institution metrics · existing cache plus optional dated refresh','license':'CC0-1.0',
        'records':sorted(records.values(),key=lambda x:(x['university_id'],x['edition'],x['metric'],x['period'],x['field'] or '')),'excluded':excluded,'gaps':gaps,
        'note':'Exact ROR identity only. Snapshot dates are not publication years. Historical revisions retain distinct evidence IDs; future/invalid years are excluded.'}
    (PUBLISHED/'reviewed-openalex-metrics.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'records':len(records),'universities':len({r['university_id'] for r in records.values()}),'excluded':len(excluded),'gaps':len(gaps)}))
if __name__=='__main__':main()
