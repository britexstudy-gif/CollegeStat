#!/usr/bin/env python3
"""Cache only the bounded set of newly reviewed, reuse-approved Commons media.

Retains licence, attribution, source URL and original remote URL. Uses small WebP
assets; failed downloads leave the existing remote record intact.
"""
import hashlib, json, pathlib, subprocess, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/published'
rows = json.loads((OUT / 'global-directory.json').read_text())
receipt = json.loads((OUT / 'reviewed-identity-expansion.json').read_text())
rors = {r['ror'] for r in receipt['records']} | {'https://ror.org/02s376052'}
ids = {r['id'] for r in rows if r.get('ror') in rors}
profiles = json.loads((OUT / 'profile-enrichment.json').read_text())
done = []
for uid in sorted(ids):
    for index, media in enumerate(profiles.get(uid, {}).get('media', [])):
        url = media['url']
        if url.startswith('/'): continue
        assert urllib.parse.urlparse(url).hostname in {'thumb.wikimedia.org', 'upload.wikimedia.org'}
        assert media.get('license') and media['source_url'].startswith('https://commons.wikimedia.org/wiki/File:')
        relative = ('logos/reviewed/' if media['kind'] == 'logo' else 'images/universities/') + uid + '-' + str(index) + '.webp'
        target = ROOT / 'public' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        download = subprocess.run(['curl', '-fLsS', '--retry', '1', '--max-time', '20', '--max-filesize', '3000000', '--user-agent', 'CollegeStat attributed media cache', url], capture_output=True)
        if download.returncode:
            print('Download unavailable:', uid, media['kind'], flush=True); continue
        convert = subprocess.run(['node', '--input-type=module', '-e', "import sharp from 'sharp'; let b=[]; for await (const c of process.stdin) b.push(c); const info=await sharp(Buffer.concat(b),{limitInputPixels:20000000}).rotate().resize({width:1400,height:1000,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toFile(process.argv[1]); console.log(JSON.stringify(info));", str(target)], input=download.stdout, capture_output=True, cwd=ROOT)
        if convert.returncode:
            print('Conversion unavailable:', uid, flush=True); continue
        info = json.loads(convert.stdout)
        media.update(remote_url=url, url='/' + relative, width=info['width'], height=info['height'], sha256=hashlib.sha256(target.read_bytes()).hexdigest(), cached_at='2026-10-05')
        done.append(relative)
(OUT / 'profile-enrichment.json').write_text(json.dumps(profiles, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps({'cached': len(done), 'files': done}))
