#!/usr/bin/env python3
"""Cache official responses with hashes. No credentials needed for the bounded pilot.
Run from the repository root. Existing successful downloads are reused, never overwritten.
"""
import concurrent.futures, datetime, hashlib, json, pathlib, subprocess, urllib.parse
ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT / 'data/raw'
AGENT = 'CollegeStat/0.1 (public-data-research; source-linked university catalogue)'
ROR = {'stanford':'00f54p054','mit':'042nb2s44','oxford':'052gg0110','tum':'02kkvpp62','toronto':'03dbr7087','wiut':'032vgar48'}

def fetch(source, name, url, body=None):
    folder = RAW / source; folder.mkdir(parents=True, exist_ok=True)
    path = folder / name; meta_path = folder / (name + '.meta.json')
    if path.exists() and meta_path.exists():
        meta = json.loads(meta_path.read_text())
        if meta.get('sha256') == hashlib.sha256(path.read_bytes()).hexdigest(): return meta
    temp = path.with_name(path.name + '.part')
    cmd = ['curl','--location','--fail','--silent','--show-error','--connect-timeout','20','--max-time','180','--retry','1','--user-agent',AGENT,url,'--output',str(temp)]
    if body: cmd += ['--data',urllib.parse.urlencode(body)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    meta = {'source':source,'file':str(path.relative_to(ROOT)),'url':url,'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'request_body':body}
    if result.returncode:
        meta['error'] = result.stderr.strip()[-600:]
        if temp.exists(): temp.unlink()
    else:
        temp.replace(path); meta['bytes'] = path.stat().st_size; meta['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    meta_path.write_text(json.dumps(meta,indent=2)+'\n')
    print(source, name, meta.get('error','downloaded'),flush=True)
    return meta

def many(jobs):
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        return list(pool.map(lambda a:fetch(*a),jobs))

def main():
    jobs = [('ror',slug+'.json','https://api.ror.org/v2/organizations/'+rid) for slug,rid in ROR.items()]
    jobs += [('openalex',slug+'.json','https://api.openalex.org/institutions/https://ror.org/'+rid) for slug,rid in ROR.items()]
    jobs += [('carnegie','2025-public.xlsx','https://carnegieclassifications.acenet.edu/wp-content/uploads/2025/04/2025-Public-Data-File.xlsx'),('carnegie','terms.html','https://carnegieclassifications.acenet.edu/data-center/'),('discover-uni','download-page.html','https://www.hesa.ac.uk/support/tools-and-downloads/unistats')]
    for table in ['HD2023','ADM2023','IC2023_AY','EFFY2023','C2023_A','S2023_IS']:
        for suffix in ['', '_Dict']:
            jobs.append(('ipeds',table+suffix+'.zip','https://nces.ed.gov/ipeds/datacenter/data/'+table+suffix+'.zip'))
    for name in ['Universities','Affiliated organizations','Main fields']:
        filename='CWTS Leiden Ranking Open Edition 2025 - '+name+'.xlsx'
        jobs.append(('leiden',name.replace(' ','-')+'.xlsx','https://zenodo.org/records/17473224/files/'+urllib.parse.quote(filename)+'?download=1'))
    jobs.append(('leiden','indicators-2025.html','https://open.leidenranking.com/Ranking2025/Ranking2025ListResult',{'field_id':0,'continent_code':'','country_code':'','performance_dimension':0,'ranking_indicator':2,'fractional_counting':'true','core_pubs_only':'true','number_of_publications':100,'period_id':15,'period_text':'2020–2023','order_by':'p'}))
    jobs.append(('leiden','definitions.html','https://open.leidenranking.com/information/indicators'))
    fields=['id','school.name','school.ope8','school.ope6']+['2023.'+s for s in ['admissions.admission_rate.overall','admissions.sat_scores.25th_percentile.critical_reading','admissions.sat_scores.75th_percentile.critical_reading','admissions.sat_scores.25th_percentile.math','admissions.sat_scores.75th_percentile.math','admissions.act_scores.25th_percentile.cumulative','admissions.act_scores.75th_percentile.cumulative','student.size','cost.tuition.in_state','cost.tuition.out_of_state','cost.avg_net_price.private','completion.completion_rate_4yr_150nt','aid.median_debt.completers.overall','aid.pell_grant_rate','earnings.10_yrs_after_entry.median','academics.program_percentage.computer','academics.program_percentage.engineering']]
    url='https://api.data.gov/ed/collegescorecard/v1/schools?'+urllib.parse.urlencode({'api_key':'DEMO_KEY','id':'166683,243744','fields':','.join(fields),'per_page':100})
    jobs += [('scorecard','2023-api.json',url),('scorecard','dictionary.xlsx','https://collegescorecard.ed.gov/files/CollegeScorecardDataDictionary.xlsx'),('scorecard','documentation.pdf','https://collegescorecard.ed.gov/files/InstitutionDataDocumentation.pdf')]
    many(jobs)
    jobs=[]
    for slug in ROR:
        path=RAW/'ror'/(slug+'.json')
        if not path.exists(): continue
        r=json.loads(path.read_text()); qids=[x.get('preferred') or x['all'][0] for x in r.get('external_ids',[]) if x['type']=='wikidata']
        if qids: jobs.append(('wikidata',slug+'.json','https://www.wikidata.org/wiki/Special:EntityData/'+qids[0]+'.json'))
    many(jobs)
    jobs=[]
    for slug in ROR:
        path=RAW/'wikidata'/(slug+'.json')
        if not path.exists(): continue
        entity=next(iter(json.loads(path.read_text())['entities'].values()))
        titles=[]
        for prop in ['P18','P154']:
            for claim in entity.get('claims',{}).get(prop,[])[:1]:
                v=claim['mainsnak'].get('datavalue',{}).get('value')
                if isinstance(v,str): titles.append('File:'+v)
        if titles:
            url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','prop':'imageinfo','iiprop':'url|extmetadata|size','titles':'|'.join(titles)})
            jobs.append(('wikidata',slug+'-commons.json',url))
    many(jobs)

if __name__ == '__main__': main()
