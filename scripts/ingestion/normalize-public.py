#!/usr/bin/env python3
"""Normalize the bounded official-source pilot; deterministic and review aware.
Use bundled Python with openpyxl. Raw files are never changed. Full releases can be
processed in streaming ZIP/CSV mode with the same dictionaries and ID crosswalk.
"""
import csv, datetime, hashlib, html, io, json, pathlib, re, uuid, zipfile
from html.parser import HTMLParser
import openpyxl
ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT/'data/raw'; OUT = ROOT/'data/processed'; PUBLISHED = ROOT/'data/published'
REFERENCE = json.loads((ROOT/'supabase/reference-catalogue.json').read_text())
BY_SLUG={u['slug']:u for u in REFERENCE}
ROR={'stanford':'00f54p054','mit':'042nb2s44','oxford':'052gg0110','tum':'02kkvpp62','toronto':'03dbr7087','wiut':'032vgar48'}
UNIT={'166683':'mit','243744':'stanford'}
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
RELEASE={'ror':'ROR API v2.1','openalex':'OpenAlex institution API snapshot '+NOW[:10],'wikidata':'Wikidata EntityData '+NOW[:10],'scorecard':'2023 institution API; 2026-06-10 dictionary','ipeds':'2023 annual survey','carnegie':'2025 public file','leiden':'Leiden Open Edition 2025, 2020–2023'}
LICENSE={'ror':'CC0-1.0','openalex':'CC0-1.0','wikidata':'CC0-1.0 for structured Wikidata facts; Commons files have separate licenses','scorecard':'US government public data','ipeds':'US government public data','carnegie':'CC BY-NC-SA 4.0; local review only, no commercial publication','leiden':'CC0-1.0'}
records=[]; reviews=[]; identities={}; summaries={}

def uid(key):return str(uuid.uuid5(uuid.NAMESPACE_URL,'https://collegestat.app/import/'+key))
def meta(source,filename):return json.loads((RAW/source/(filename+'.meta.json')).read_text())
def emit(source, slug, record_id, metric, value, unit=None, year=None, cohort=None, period=None, url=None, raw_file=None, raw_field=None, publication='review', notes=None, extra=None):
    if value is None or value=='' or value in ('NA','PrivacySuppressed','NULL'):
        return False
    if isinstance(value,float) and not (-1e20<value<1e20):return False
    raw_file = raw_file or ''
    info=meta(source,raw_file) if raw_file else {}
    row={'id':uid(f'{source}:{record_id}:{metric}:{year}:{period}:{cohort}'),'university_id':BY_SLUG[slug]['id'],'source':source,'source_name':{'ror':'Research Organization Registry','openalex':'OpenAlex','wikidata':'Wikidata / Wikimedia Commons','scorecard':'US College Scorecard','ipeds':'IPEDS NCES','carnegie':'Carnegie Classifications','leiden':'CWTS Leiden Ranking Open Edition'}[source],'source_record_id':str(record_id),'source_url':url or info.get('url'),'release':RELEASE[source],'reporting_year':year,'period':period,'cohort':cohort,'retrieved_at':info.get('retrieved_at'),'last_verified_at':NOW if publication=='published' else None,'license_note':LICENSE[source],'raw_file':info.get('file'),'raw_field':raw_field,'metric':metric,'value':value,'unit':unit,'verification_status':'verified' if publication=='published' else 'needs_review','publication_status':publication,'notes':notes}
    if extra:row.update(extra)
    records.append(row)
    return True

def review(source,rid,reason,slug=None,candidates=None): reviews.append({'source':source,'source_record_id':str(rid),'reason':reason,'university_id':BY_SLUG[slug]['id'] if slug else None,'possible_university_ids':[BY_SLUG[x]['id'] for x in candidates or []]})
def val(x):
    if x is None:return None
    s=str(x).strip()
    if not s or s in ('-1','-2','-3','-4','-5','-6','-7','-8','-9','PrivacySuppressed','NULL','NA'):return None
    try:return float(s) if '.' in s else int(s)
    except ValueError:return None

def ziprows(name):
    with zipfile.ZipFile(RAW/'ipeds'/(name+'.zip')) as z:
        with io.TextIOWrapper(z.open(z.namelist()[0]),encoding='utf-8-sig',errors='replace') as f:
            yield from csv.DictReader(f)

def xdict(name):
    with zipfile.ZipFile(RAW/'ipeds'/(name+'_Dict.zip')) as z:
        w=openpyxl.load_workbook(io.BytesIO(z.read(z.namelist()[0])),read_only=True,data_only=True)
        s=w['varlist'] if 'varlist' in w else w['Varlist']
        return {str(r[1]).upper():{'title':r[6],'imputation_flag':r[5]} for r in list(s.values)[1:] if len(r)>6 and r[1]}

def ipeds_emit(slug,unitid,table,row,field,metric,unit,period,cohort=None,conditions=True):
    if not conditions:return
    dictionary=xdicts[table]
    if field not in dictionary:
        review('ipeds',unitid,'dictionary_field_missing_'+table+'_'+field,slug);return
    flag=dictionary[field]['imputation_flag'] or ('X'+field)
    raw_flag=(row.get(flag) or '').strip()
    # R=reported, Z=reported zero; any other value is held for explicit review.
    status='published' if raw_flag in ('R','Z','') else 'review'
    v=val(row.get(field))
    if v is None:return
    if raw_flag=='Z' and v!=0:review('ipeds',unitid,'zero_flag_conflict_'+field,slug);return
    emit('ipeds',slug,unitid+':'+table+':'+field+':'+str(row.get('CIPCODE',''))+':'+str(row.get('AWLEVEL','')),metric,v,unit,2023,cohort,period,'https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx?rtid=7&year=2023',table+'.zip',field,status,notes=dictionary[field]['title'],extra={'imputation_flag':raw_flag,'dictionary_url':meta('ipeds',table+'_Dict.zip')['url']})
    if status!='published':review('ipeds',unitid,'imputed_or_suppressed_'+field,slug)

for slug,rid in ROR.items():
    p=RAW/'ror'/(slug+'.json');r=json.loads(p.read_text());uni=BY_SLUG[slug]
    names=[n['value'] for n in r['names'] if 'ror_display' in n['types']]
    domains=set(r.get('domains') or []);ref_domain=re.sub('^www\\.','',uni['website'].split('/')[2])
    country=r['locations'][0]['geonames_details']['country_code'] if r.get('locations') else None
    if r['id']!='https://ror.org/'+rid or names!=[uni['name']] or country!=uni['country_code'] or ref_domain not in domains:
        review('ror',rid,'stable_id_identity_conflict',slug);continue
    aliases=sorted({n['value'] for n in r['names'] if not 'ror_display' in n['types']})
    qids=[x.get('preferred') or x['all'][0] for x in r.get('external_ids',[]) if x['type']=='wikidata']
    identities[slug]={'id':uni['id'],'ror':rid,'wikidata':qids[0] if qids else None,'unitid':next((k for k,v in UNIT.items() if v==slug),None),'aliases':aliases,'domains':r.get('domains',[]),'website':next((x['value'] for x in r['links'] if x['type']=='website'),None),'status':r['status'],'types':r['types'],'city':r['locations'][0]['geonames_details']['name'],'city_coordinates':{'latitude':r['locations'][0]['geonames_details']['lat'],'longitude':r['locations'][0]['geonames_details']['lng'],'precision':'city, not campus'},'founded_year':r.get('established')}
    emit('ror',slug,rid,'institution_identity',uni['name'],year=None,url=r['id'],raw_file=slug+'.json',publication='published',extra={'aliases':aliases,'domains':r.get('domains',[]),'status':r['status'],'city_coordinates':identities[slug]['city_coordinates']})
    for metric,v,unit in [('founded_year',r.get('established'),'year'),('city',identities[slug]['city'],None),('website',identities[slug]['website'],None)]:emit('ror',slug,rid,metric,v,unit,url=r['id'],raw_file=slug+'.json',publication='published')

for slug,identity in identities.items():
    p=RAW/'openalex'/(slug+'.json')
    if not p.exists():continue
    r=json.loads(p.read_text());rid=identity['ror']
    if r.get('ror')!='https://ror.org/'+rid:review('openalex',r.get('id',''), 'ror_mismatch',slug);continue
    oid=r['id'].rsplit('/',1)[-1];identity['openalex']=oid
    emit('openalex',slug,oid,'openalex_identity',oid,url=r['id'],raw_file=slug+'.json',publication='published')
    for x in r.get('counts_by_year',[]):
        year=x.get('year')
        if not isinstance(year,int) or year<1900 or year>int(NOW[:4]):
            review('openalex',oid,'invalid_observation_year_'+str(year),slug);continue
        if year not in (2023,2024,2025):continue
        for field,unit in [('works_count','works'),('cited_by_count','citations')]:emit('openalex',slug,oid,field,x.get(field),unit,year,period=str(year),url=r['id'],raw_file=slug+'.json',raw_field='counts_by_year.'+field,publication='published',notes='OpenAlex institution attribution; counts may change as the index updates.')
    for topic in r.get('topics',[])[:5]:
        if isinstance(topic,dict) and topic.get('display_name'):emit('openalex',slug,oid+':'+str(topic.get('id')),'research_topic',topic['display_name'],year=None,url=r['id'],raw_file=slug+'.json',publication='published')

for slug,identity in identities.items():
    qid=identity.get('wikidata');p=RAW/'wikidata'/(slug+'.json')
    if not qid or not p.exists():continue
    r=json.loads(p.read_text())['entities'].get(qid)
    if not r:review('wikidata',qid,'qid_missing',slug);continue
    get=lambda prop:[c['mainsnak']['datavalue']['value'] for c in r.get('claims',{}).get(prop,[]) if c.get('rank')!='deprecated' and c['mainsnak'].get('datavalue')]
    rors=[v.rsplit('/',1)[-1] for v in get('P6782') if isinstance(v,str)]
    if rors and identity['ror'] not in rors:review('wikidata',qid,'ror_statement_conflict',slug);continue
    emit('wikidata',slug,qid,'wikidata_identity',qid,url='https://www.wikidata.org/wiki/'+qid,raw_file=slug+'.json',publication='published')
    for field,prop in [('official_website','P856'),('commons_image','P18'),('commons_logo','P154')]:
        for i,v in enumerate(get(prop)[:2]):emit('wikidata',slug,qid+':'+str(i),field,v,url='https://www.wikidata.org/wiki/'+qid,raw_file=slug+'.json',raw_field=prop,publication='review' if field.startswith('commons') else 'published')
    cp=RAW/'wikidata'/(slug+'-commons.json')
    if cp.exists():
        data=json.loads(cp.read_text())
        for page in data.get('query',{}).get('pages',{}).values():
            for info in page.get('imageinfo',[]):
                metadata=info.get('extmetadata',{});license_name=html.unescape(re.sub('<[^>]+>','',metadata.get('LicenseShortName',{}).get('value','')))
                creator=html.unescape(re.sub('<[^>]+>','',metadata.get('Artist',{}).get('value','')))
                emit('wikidata',slug,page.get('title',''),'commons_file',page.get('title'),url=info.get('descriptionurl'),raw_file=slug+'-commons.json',publication='review',extra={'creator':creator,'file_license':license_name,'license_url':metadata.get('LicenseUrl',{}).get('value'),'reuse_status':'needs_review'})

# Scorecard fields are interpreted using the downloaded 2026 dictionary and cohort map.
sp=RAW/'scorecard/2023-api.json'
if sp.exists():
    data=json.loads(sp.read_text());dictionary=openpyxl.load_workbook(RAW/'scorecard/dictionary.xlsx',read_only=True,data_only=True)
    entries={r[2]:{'variable':r[5],'notes':r[10],'label':r[0]} for r in list(dictionary['Institution_Data_Dictionary'].values)[1:] if r[2]}
    cohort_sheet=list(dictionary['Institution_Cohort_Map'].values);headers=cohort_sheet[0];column=headers.index('MERGED_2023-24 datafile');cohorts={r[0]:r[column] for r in cohort_sheet[1:] if r[0]}
    mapping={'admissions.admission_rate.overall':('admission_rate','%',100),'admissions.sat_scores.25th_percentile.critical_reading':('sat_reading_p25','SAT points',1),'admissions.sat_scores.75th_percentile.critical_reading':('sat_reading_p75','SAT points',1),'admissions.sat_scores.25th_percentile.math':('sat_math_p25','SAT points',1),'admissions.sat_scores.75th_percentile.math':('sat_math_p75','SAT points',1),'admissions.act_scores.25th_percentile.cumulative':('act_p25','ACT points',1),'admissions.act_scores.75th_percentile.cumulative':('act_p75','ACT points',1),'student.size':('undergraduate_enrollment','students',1),'cost.tuition.in_state':('tuition_in_state','USD/year',1),'cost.tuition.out_of_state':('tuition_out_of_state','USD/year',1),'cost.avg_net_price.private':('average_net_price_private','USD/year',1),'completion.completion_rate_4yr_150nt':('graduation_rate_150pct','%',100),'aid.median_debt.completers.overall':('median_debt_completers','USD',1),'aid.pell_grant_rate':('pell_grant_rate','%',100),'earnings.10_yrs_after_entry.median':('earnings_10yr_after_entry','USD',1),'academics.program_percentage.computer':('computer_science_degree_share','%',100),'academics.program_percentage.engineering':('engineering_degree_share','%',100)}
    for row in data.get('results',[]):
        unitid=str(row.get('id'));slug=UNIT.get(unitid)
        if not slug:review('scorecard',unitid,'unmapped_unitid');continue
        for field,(metric,unit,scale) in mapping.items():
            d=entries.get(field.split('.',1)[1])
            if not d:review('scorecard',unitid,'dictionary_field_missing_'+field,slug);continue
            raw=row.get('2023.'+field)
            if raw is None:continue
            if not isinstance(raw,(int,float)):
                review('scorecard',unitid,'suppressed_or_invalid_'+field,slug);continue
            cohort=cohorts.get(d['variable'])
            status='published' if cohort not in (None,'NA') else 'review'
            if status=='review':review('scorecard',unitid,'cohort_unavailable_'+field,slug)
            emit('scorecard',slug,unitid,metric,round(raw*scale,4),unit,2023,cohort,None,'https://collegescorecard.ed.gov/school/?'+unitid,'2023-api.json','2023.'+field,status,notes=d['notes'] or d['label'],extra={'raw_value':raw,'dictionary_url':meta('scorecard','dictionary.xlsx')['url']})

# IPEDS annual survey mapping: report raw and approved values separately, preserve flags.
xdicts={n:xdict(n) for n in ['HD2023','IC2023_AY','EFFY2023','C2023_A','S2023_IS']}
for row in ziprows('HD2023'):
    unitid=row.get('UNITID');slug=UNIT.get(unitid)
    if not slug:continue
    if row.get('INSTNM')!=BY_SLUG[slug]['name']:
        review('ipeds',unitid,'unitid_name_conflict',slug);continue
    identities[slug]['opeid']=row.get('OPEID','').strip()
    for field,metric,unit in [('INSTNM','institution_name',None),('CITY','city',None),('STABBR','state',None),('WEBADDR','website',None),('OPEID','opeid',None)]:
        v=row.get(field,'').strip();
        if v:emit('ipeds',slug,unitid,'hd_'+metric,v,unit,2023,url='https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx?rtid=7&year=2023',raw_file='HD2023.zip',raw_field=field,publication='published')
    for field in ['LATITUDE','LONGITUD']:
        v=val(row.get(field))
        if v is not None:emit('ipeds',slug,unitid,'reported_'+field.lower(),v,'degrees',2023,url='https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx?rtid=7&year=2023',raw_file='HD2023.zip',raw_field=field,publication='published',notes='IPEDS institutional location. Campus precision not independently verified.')
for row in ziprows('IC2023_AY'):
    unitid=row.get('UNITID');slug=UNIT.get(unitid)
    if not slug:continue
    for field,metric,cohort in [('TUITION1','tuition_in_district','full-time undergraduate, academic year'),('TUITION2','tuition_in_state','full-time undergraduate, academic year'),('TUITION3','tuition_out_of_state','full-time undergraduate, academic year'),('FEE1','fees_in_district','full-time undergraduate, academic year'),('FEE2','fees_in_state','full-time undergraduate, academic year'),('FEE3','fees_out_of_state','full-time undergraduate, academic year')]:ipeds_emit(slug,unitid,'IC2023_AY',row,field,metric,'USD', 'academic year 2023–24',cohort)
for row in ziprows('EFFY2023'):
    unitid=row.get('UNITID');slug=UNIT.get(unitid)
    if slug and row.get('EFFYLEV','').strip() in ('1','2'):
        ipeds_emit(slug,unitid,'EFFY2023',row,'EFYTOTLT','twelve_month_enrollment_'+row['EFFYLEV'],'students','July 2022–June 2023','all students' if row['EFFYLEV'].strip()=='1' else 'undergraduates')
for row in ziprows('C2023_A'):
    unitid=row.get('UNITID');slug=UNIT.get(unitid)
    if slug and row.get('MAJORNUM','').strip()=='1':
        cip=row.get('CIPCODE','').strip();award=row.get('AWLEVEL','').strip()
        if cip and re.fullmatch(r'\d{2}\.\d{4}',cip):
            ipeds_emit(slug,unitid,'C2023_A',row,'CTOTALT','completions_cip_'+cip+'_award_'+award,'awards','July 2022–June 2023','CIP2020 '+cip+'; award level '+award)
for row in ziprows('S2023_IS'):
    unitid=row.get('UNITID');slug=UNIT.get(unitid)
    if slug and row.get('SISCAT','').strip()=='1' and row.get('FACSTAT','').strip()=='0' and row.get('ARANK','').strip()=='0':
        ipeds_emit(slug,unitid,'S2023_IS',row,'HRTOTLT','full_time_instructional_staff','staff','fall 2023','all full-time instructional staff')

# Carnegie's public file is a real local import, with redistribution held for license review.
cp=RAW/'carnegie/2025-public.xlsx'
if cp.exists():
    w=openpyxl.load_workbook(cp,read_only=True,data_only=True)['data'];it=w.iter_rows(values_only=True);header=next(it)
    for cells in it:
        r=dict(zip(header,cells));unitid=str(r.get('unitid') or '').strip();slug=UNIT.get(unitid)
        if not slug:continue
        if r.get('instnm')!=BY_SLUG[slug]['name']:
            review('carnegie',unitid,'unitid_name_conflict',slug);continue
        for field in ['ic2025name','research2025name','saec2025name']:
            emit('carnegie',slug,unitid,field,r.get(field),year=2025,url='https://carnegieclassifications.acenet.edu/data-center/',raw_file='2025-public.xlsx',raw_field=field,publication='review',notes='Public file license restricts commercial use; await distribution review.')

class LeidenParser(HTMLParser):
    def __init__(self):super().__init__();self.row=None;self.cell=None;self.rows=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='tr':self.row={'id':None,'name':None,'cells':[]}
        if tag=='td' and self.row is not None:self.cell=[];self.row['cells'].append(self.cell);self.row['id']=a.get('id') or self.row['id']
        if tag=='span' and self.row is not None and self.row['id'] and not self.row['name'] and a.get('data-tooltip'):self.row['name']=a['data-tooltip']
    def handle_data(self,data):
        if self.cell is not None:self.cell.append(data.strip())
    def handle_endtag(self,tag):
        if tag=='td':self.cell=None
        if tag=='tr' and self.row and self.row['id']:
            self.row['cells']=[' '.join(x).strip() for x in self.row['cells']];self.rows.append(self.row);self.row=None
lp=RAW/'leiden/indicators-2025.html'
if lp.exists():
    cw=openpyxl.load_workbook(RAW/'leiden/Universities.xlsx',read_only=True,data_only=True).active
    cross={name:rid for name,rid,_ in list(cw.values)[1:] if rid}
    parser=LeidenParser();parser.feed(lp.read_text())
    seen=set()
    for r in parser.rows:
        name=r['name'];rid=cross.get(name)
        if not rid:continue
        slug=next((s for s,i in identities.items() if i['ror']==rid),None)
        if not slug:continue
        source_id=str(r['id']);seen.add(slug)
        for index,metric,unit in [(2,'publications_fractional_core','publications'),(3,'international_collaboration_publications','publications'),(4,'international_collaboration_share','%')]:
            if index>=len(r['cells']):continue
            raw=r['cells'][index].replace(',','').rstrip('%')
            value=val(raw)
            if value is None:continue
            emit('leiden',slug,source_id,metric,value,unit,2025,'2020–2023 publications; citations observed through end 2024','2020–2023','https://open.leidenranking.com/ranking/2025/university/'+source_id,'indicators-2025.html',metric,'published',notes='All sciences; core publications; fractional counting. These are indicator values, not CollegeStat scores or an overall quality rank.',extra={'field':'All sciences','indicator_definition_url':'https://open.leidenranking.com/information/indicators','counting_method':'fractional; core publications'})
    for slug in identities:
        if slug not in seen:review('leiden',identities[slug]['ror'],'not_in_2025_open_edition_or_unmatched',slug)

# Source reports are calculated from actual records; missing/suppressed fields remain absent.
for source in RELEASE:
    source_rows=[r for r in records if r['source']==source]
    source_reviews=[r for r in reviews if r['source']==source]
    files=sorted(str(p.relative_to(ROOT)) for p in (RAW/source).glob('*') if not p.name.endswith('.meta.json')) if (RAW/source).exists() else []
    summaries[source]={'release':RELEASE[source],'retrieved_at':min((r['retrieved_at'] for r in source_rows if r['retrieved_at']),default=None),'source_urls':sorted(set(r['source_url'] for r in source_rows if r['source_url']))[:8],'files':files,'imported_records':len(source_rows),'imported_universities':len(set(r['university_id'] for r in source_rows)),'rejected_records':len([r for r in source_reviews if 'invalid' in r['reason'] or 'conflict' in r['reason'] or 'missing' in r['reason']]),'uncertain_matches':len([r for r in source_reviews if 'match' in r['reason'] or 'mapping' in r['reason'] or 'unmapped' in r['reason']]),'review_items':len(source_reviews),'fields_populated':sorted(set(r['metric'] for r in source_rows)),'license_note':LICENSE[source]}
if (RAW/'discover-uni/download-page.html.meta.json').exists():
    summaries['discover-uni']={'release':'2025/26 Discover Uni dataset','retrieved_at':NOW,'source_urls':['https://www.hesa.ac.uk/support/tools-and-downloads/unistats'],'files':[],'imported_records':0,'imported_universities':0,'rejected_records':0,'uncertain_matches':0,'review_items':0,'fields_populated':[],'license_note':'CC BY 4.0; HESA official download returned HTTP 403 from this environment','blocker':meta('discover-uni','download-page.html').get('error')}
OUT.mkdir(parents=True,exist_ok=True);PUBLISHED.mkdir(parents=True,exist_ok=True)
installed={'generated_at':NOW,'universities':identities,'source_records':sorted(records,key=lambda r:(r['source'],r['university_id'],r['metric'],r['id'])),'review_queue':reviews,'summary':summaries}
(OUT/'installed.json').write_text(json.dumps(installed,indent=2,ensure_ascii=False)+'\n')
# Checked ROR identifier joins and dictionary-backed observations may be used in local mode.
public={'generated_at':NOW,'identities':identities,'records':[r for r in installed['source_records'] if r['publication_status']=='published' and r['source']!='carnegie'],'summary':summaries}
(PUBLISHED/'imported.json').write_text(json.dumps(public,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({s:{k:v[k] for k in ['imported_records','rejected_records','uncertain_matches','review_items']} for s,v in summaries.items()},indent=2))
