#!/usr/bin/env python3
"""Install attributed media from already downloaded Commons metadata."""
import datetime, html, json, pathlib, re, subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2];RAW=ROOT/'data/raw/wikidata';OUT=ROOT/'data/published';TODAY=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
refs=json.loads((ROOT/'supabase/reference-catalogue.json').read_text());result={}
def clean(s):return html.unescape(re.sub('<[^>]+>','',s or '')).strip()
for ref in refs:
 slug=ref['slug'];p=RAW/(slug+'-commons.json')
 if not p.exists():continue
 source='https://www.wikidata.org/wiki/'+next(iter(json.loads((RAW/(slug+'.json')).read_text())['entities']))
 item={'source_url':source,'retrieved_at':TODAY,'revision':None,'socials':[],'media':[]}
 for page in json.loads(p.read_text()).get('query',{}).get('pages',{}).values():
  info=(page.get('imageinfo') or [{}])[0];meta=info.get('extmetadata',{});license=clean(meta.get('LicenseShortName',{}).get('value',''))
  if not (license.startswith(('CC BY','CC0')) or license=='Public domain'):continue
  kind='logo' if info.get('url','').split('?')[0].endswith('.svg') else 'campus'
  item['media'].append(dict(kind=kind,url=info['url'].split('?')[0],source_url=info['descriptionurl'],creator=clean(meta.get('Artist',{}).get('value','')),license=license,license_url=meta.get('LicenseUrl',{}).get('value') or 'https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain',width=info['width'],height=info['height'],alt=ref['name']+(' campus' if kind=='campus' else ' logo')))
 result[ref['id']]=item
p=OUT/'profile-enrichment.json';existing=json.loads(p.read_text()) if p.exists() else {};existing.update(result);p.write_text(json.dumps(existing,ensure_ascii=False,separators=(',',':'))+'\n');print('Installed source metadata for',len(result),'profiles')
