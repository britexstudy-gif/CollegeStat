#!/usr/bin/env python3
"""Parse only named courses and qualification labels from the official TUM listing."""
import html,json,pathlib,re,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2];raw=ROOT/'data/raw/official-guidance/tum-programs.html'
text='\n'.join(p.read_text() for p in sorted(raw.parent.glob('tum-programs*.html')));rows=[]
clean=lambda s:html.unescape(re.sub('<[^>]+>','',s)).strip()
for ident,article in re.findall(r'<article id="(course-\d+)"[^>]*>(.*?)</article>',text,re.S):
 name=re.search(r'<h3[^>]*>(.*?)</h3>',article,re.S);award=re.search(r'<p class="roofline">(.*?)</p>',article,re.S);url=re.search(r'href="([^"]+/degree-programs/detail/[^"]+)"',article)
 if not (name and award and url):continue
 label=clean(award[1]);rows.append({'id':ident,'name':clean(name[1]),'award':label,'level':'Bachelor' if 'Bachelor' in label else 'Master' if 'Master' in label else label,'url':'https://www.tum.de'+html.unescape(url[1]),'source_url':'https://www.tum.de/en/studies/degree-programs','checked_at':'2026-09-28'})
assert len(rows)>100
out={'tum.de':rows};(ROOT/'data/published/official-programs.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n');print(len(rows),'official courses',hashlib.sha256(raw.read_bytes()).hexdigest())
