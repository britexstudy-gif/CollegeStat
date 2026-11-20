#!/usr/bin/env python3
"""Wikidata P154 / P8972 -> Wikimedia Commons logo ingest (15 Nov).

Stages (all resumable, state in data/review/logos-wd-nov15-state.json):
  claims   wbgetentities for catalogue QIDs lacking a logo -> logo file names
  info     Commons imageinfo (licence, author, 256px thumb url, original size)
  fetch    download + validate + optimise -> data/review/logos-wd-staging/
  publish  append staged files to public/logos/auto + manifest + provenance
Run: python logos-wikidata-nov15.py claims|info|fetch|publish
Polite: <=4 concurrent, delays, descriptive User-Agent, 429/5xx backoff.
"""
import sys, os, io, json, time, hashlib, re, threading, urllib.parse, urllib.request, urllib.error, concurrent.futures as cf
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CAT = ROOT / "data/generated/catalogue/list.json"
LOGOS = ROOT / "data/published/auto-logos.json"
PROV = ROOT / "data/published/auto-logos-provenance.json"
STATE = ROOT / "data/review/logos-wd-nov15-state.json"
STAGE = ROOT / "data/review/logos-wd-staging"
OUT = ROOT / "public/logos/auto"
UA = "CollegeStatLogoBot/1.0 (university research app; logo lookup via Wikidata/Commons APIs)"
LOCK = threading.Lock()
TODAY = "2026-11-15"

def rj(p, d=None):
    try: return json.loads(Path(p).read_text())
    except FileNotFoundError: return d
def wj(p, v):
    p = Path(p); t = p.with_suffix(p.suffix + ".tmp")
    t.write_text(json.dumps(v, ensure_ascii=False, separators=(",", ":"))); os.replace(t, p)

def get(url, binary=False, tries=5):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                d = r.read(8_000_000)
                return d if binary else json.loads(d)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(3 * (i + 1) + (int(e.headers.get("Retry-After", 0) or 0)))
                continue
            raise
        except Exception:
            time.sleep(2 * (i + 1))
    raise RuntimeError("failed " + url)

def best_claim(claims, prop):
    cl = claims.get(prop) or []
    cl = [c for c in cl if c.get("rank") != "deprecated" and c.get("mainsnak", {}).get("datavalue")]
    cur = [c for c in cl if "P582" not in c.get("qualifiers", {})] or cl
    pref = [c for c in cur if c.get("rank") == "preferred"]
    pick = (pref or cur)
    return pick[-1]["mainsnak"]["datavalue"]["value"] if pick else None

def stage_claims():
    cat = rj(CAT); logos = rj(LOGOS)
    st = rj(STATE, {"claims": {}, "info": {}, "fetch": {}})
    todo = [(c["id"], c["identifiers"]["wikidata"]) for c in cat if c["id"] not in logos and (c.get("identifiers") or {}).get("wikidata")]
    todo = [t for t in todo if t[0] not in st["claims"]]
    print("claims todo", len(todo))
    for i in range(0, len(todo), 50):
        chunk = todo[i:i+50]
        q = "|".join(x[1] for x in chunk)
        d = get("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=" + q)
        for uid, qid in chunk:
            ent = (d.get("entities") or {}).get(qid, {})
            cl = ent.get("claims", {})
            st["claims"][uid] = {"qid": qid, "P154": best_claim(cl, "P154"), "P8972": best_claim(cl, "P8972")}
        time.sleep(0.4)
        if (i // 50) % 4 == 0: wj(STATE, st)
    wj(STATE, st)
    print("with P154", sum(1 for v in st["claims"].values() if v["P154"]), "P8972", sum(1 for v in st["claims"].values() if v["P8972"]))

def strip(h): return re.sub(r"<[^>]+>", "", h or "").strip()

def stage_info():
    st = rj(STATE)
    files = sorted({f for v in st["claims"].values() for f in (v["P154"], v["P8972"]) if f} - set(st["info"]))
    print("info todo", len(files))
    for i in range(0, len(files), 40):
        chunk = files[i:i+40]
        t = "|".join("File:" + f for f in chunk)
        d = get("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=256&redirects=1&titles=" + urllib.parse.quote(t))
        norm = {}
        for n in d.get("query", {}).get("normalized", []) + d.get("query", {}).get("redirects", []):
            norm[n["from"]] = n["to"]
        pages = {p["title"]: p for p in d.get("query", {}).get("pages", {}).values()}
        for f in chunk:
            title = "File:" + f
            title = norm.get(title, title); title = norm.get(title, title)
            title2 = norm.get(title.replace("_", " "), title.replace("_", " "))
            p = pages.get(title) or pages.get(title2) or pages.get(title.replace("_", " "))
            if not p or not p.get("imageinfo"): st["info"][f] = None; continue
            ii = p["imageinfo"][0]; em = ii.get("extmetadata", {})
            g = lambda k: strip((em.get(k) or {}).get("value"))
            st["info"][f] = {"mime": ii.get("mime"), "w": ii.get("width"), "h": ii.get("height"), "size": ii.get("size"),
                "url": ii.get("url"), "thumb": ii.get("thumburl"), "page": ii.get("descriptionurl"),
                "licence": g("LicenseShortName"), "artist": g("Artist")[:120], "restr": g("Restrictions"), "attr": g("AttributionRequired")}
        time.sleep(0.4)
        if (i // 40) % 5 == 0: wj(STATE, st)
    wj(STATE, st)

KNOWN_BAD = set()
def validate_raster(im):
    """return (ok, reason). im is RGBA."""
    w, h = im.size
    if min(w, h) < 64 or max(w, h) < 96: return False, "tiny"
    a = np.asarray(im).astype(int)
    alpha = a[..., 3]
    vis = alpha > 40
    if vis.mean() < 0.04: return False, "empty"
    rgb = a[..., :3]
    # composite on white to measure content
    comp = (rgb * (alpha[..., None] / 255.0) + 255 * (1 - alpha[..., None] / 255.0))
    nonwhite = (comp.min(axis=2) < 235).mean()
    if nonwhite < 0.03: return False, "blank"
    asp = max(w, h) / min(w, h)
    if asp > 4.5: return False, "too_wide"
    return True, "ok"

def optimise(im):
    """crop transparent/white margins, fit 256, save PNG <=20KB if possible."""
    a = np.asarray(im).astype(int)
    alpha = a[..., 3]
    comp = (a[..., :3] * (alpha[..., None] / 255.0) + 255 * (1 - alpha[..., None] / 255.0))
    mask = (alpha > 40) & (comp.min(axis=2) < 245)
    if mask.any():
        ys, xs = np.where(mask); pad = 4
        im = im.crop((max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad + 1, im.width), min(ys.max() + pad + 1, im.height)))
    if max(im.size) > 256: im.thumbnail((256, 256), Image.LANCZOS)
    best = None
    for colors in (None, 128, 64, 32):
        b = io.BytesIO()
        (im if colors is None else im.quantize(colors, method=Image.Quantize.FASTOCTREE) if False else im).save(b, "PNG", optimize=True) if colors is None else im.convert("RGBA").quantize(colors, method=Image.Quantize.FASTOCTREE).save(b, "PNG", optimize=True)
        best = b.getvalue()
        if len(best) <= 20_000: break
    return best

def svg_safe(b):
    s = b.decode("utf-8", "replace").lower()
    return not any(x in s for x in ("<script", "onload=", "<foreignobject", "xlink:href=\"http", "href=\"http", "<image", "<!entity"))

def phash(im):
    g = np.asarray(im.convert("RGBA").resize((16, 16), Image.LANCZOS).convert("L")).astype(float)
    return "".join("1" if v > g.mean() else "0" for v in g.flatten())

def fetch_one(uid, c, info_by):
    tried = []
    cands = []
    for prop in ("P8972", "P154"):  # decide by aspect afterwards
        f = c.get(prop)
        if f and info_by.get(f): cands.append((prop, f, info_by[f]))
    results = []
    for prop, f, inf in cands:
        if inf["restr"] and "trademark" not in inf["restr"].lower() and inf["restr"]:  # keep simple: non-trademark restrictions skipped
            pass
        mime = inf["mime"] or ""
        try:
            data = None; kind = None
            if mime == "image/svg+xml" and (inf["size"] or 1e9) <= 25_000:
                data = get(inf["url"], binary=True)
                if svg_safe(data) and b"<svg" in data.lower(): kind = "svg"
                else: data = None
            if data is None:
                if not inf["thumb"]: tried.append((prop, "nothumb")); continue
                raw = get(inf["thumb"], binary=True)
                im = Image.open(io.BytesIO(raw)); im.load(); im = im.convert("RGBA")
                ok, why = validate_raster(im)
                if not ok: tried.append((prop, why)); continue
                png = optimise(im)
                im2 = Image.open(io.BytesIO(png)).convert("RGBA")
                results.append({"prop": prop, "file": f, "kind": "png", "data": png, "w": im2.width, "h": im2.height, "ph": phash(im2), "inf": inf})
            else:
                # rasterise check not available; accept svg with declared dims
                results.append({"prop": prop, "file": f, "kind": "svg", "data": data, "w": inf["w"], "h": inf["h"], "ph": None, "inf": inf})
        except Exception as e:
            tried.append((prop, "err:" + type(e).__name__))
        time.sleep(0.3)
    if not results: return {"status": "rejected", "tried": tried}
    # prefer squarish; ties -> svg, P8972 first
    results.sort(key=lambda r: (abs(((r["w"] or 1) / (r["h"] or 1)) - 1) > 1.2, r["kind"] != "svg", r["prop"] != "P154"))
    r = results[0]
    ext = "svg" if r["kind"] == "svg" else "png"
    fn = f"{uid}.{ext}"
    (STAGE / fn).write_bytes(r["data"])
    i = r["inf"]
    return {"status": "staged", "ext": ext, "prop": r["prop"], "file": r["file"], "w": r["w"], "h": r["h"], "ph": r["ph"],
            "sha256": hashlib.sha256(r["data"]).hexdigest(), "bytes": len(r["data"]), "page": i["page"], "licence": i["licence"], "artist": i["artist"], "restr": i["restr"]}

def stage_fetch():
    st = rj(STATE); STAGE.mkdir(parents=True, exist_ok=True)
    cat = {c["id"]: c for c in rj(CAT)}
    targets = [t["id"] for t in rj(ROOT / "data/segment/targets.json")["universities"]]
    order = targets + [u for u in st["claims"] if u not in set(targets)]
    todo = [u for u in order if u in st["claims"] and u not in st["fetch"] and (st["claims"][u]["P154"] or st["claims"][u]["P8972"])]
    print("fetch todo", len(todo))
    n = 0
    with cf.ThreadPoolExecutor(4) as ex:
        futs = {ex.submit(fetch_one, u, st["claims"][u], st["info"]): u for u in todo}
        for f in cf.as_completed(futs):
            u = futs[f]
            try: st["fetch"][u] = f.result()
            except Exception as e: st["fetch"][u] = {"status": "rejected", "tried": [("x", "err:" + type(e).__name__)]}
            n += 1
            if n % 200 == 0:
                with LOCK: wj(STATE, st)
                print(n, flush=True)
    wj(STATE, st)
    from collections import Counter
    print(Counter(v["status"] for v in st["fetch"].values()))

def stage_publish():
    st = rj(STATE); logos = rj(LOGOS); prov = rj(PROV)
    cat = {c["id"]: c for c in rj(CAT)}
    staged = {u: v for u, v in st["fetch"].items() if v["status"] == "staged" and u not in logos and not v.get("dropped")}
    from collections import Counter
    # shared-hash / placeholder check
    cnt = Counter(v["sha256"] for v in staged.values())
    pcnt = Counter(v["ph"] for v in staged.values() if v["ph"])
    add = 0
    for u, v in staged.items():
        if cnt[v["sha256"]] > 2 or (v["ph"] and pcnt[v["ph"]] > 3):
            v["dropped"] = "shared_hash"; continue
        shutil_src = STAGE / f"{u}.{v['ext']}"
        if not shutil_src.exists(): continue
        (OUT / shutil_src.name).write_bytes(shutil_src.read_bytes())
        logos[u] = "s" if v["ext"] == "svg" else "p"
        prov["records"].append({"university_id": u, "domain": re.sub(r"^https?://(www\.)?", "", cat[u].get("website") or "").split("/")[0],
            "local": f"/logos/auto/{u}.{v['ext']}", "source": v["page"], "download_url": v["page"], "surface": "light", "checked_at": TODAY,
            "sha256": v["sha256"], "kind": "wikimedia commons logo (" + v["prop"] + ")", "note": None,
            "licence": v["licence"], "attribution": v["artist"], "restrictions": v["restr"] or None, "commons_file": v["file"]})
        add += 1
    prov["checked_at"] = TODAY
    wj(LOGOS, logos); wj(PROV, prov); wj(STATE, st)
    print("published", add, "total", len(logos))

if __name__ == "__main__":
    {"claims": stage_claims, "info": stage_info, "fetch": stage_fetch, "publish": stage_publish}[sys.argv[1]]()
