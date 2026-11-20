#!/usr/bin/env python3
"""Collect header logos from universities' own official homepages (second pass).

Runs after collect-auto-logos-nov14.py, which only took declared site icons.
Only the university's own homepage and assets on its own domain are fetched,
with an honest User-Agent. 401/403/429 and robots.txt refusals are final: no
retries, no disguised headers, no headless browser.

Strategies (recorded per logo in provenance as `method`):
  header-img   <img> with logo/brand/crest/emblem in src/alt/class/id in header/nav/top of body
  header-svg   inline <svg> with that kind of class/id/aria-label, serialised to a file
  og-image     og:image whose name says logo/crest/emblem, or square-ish with alt matching the name
  manifest     largest manifest.json icon
  common-path  /favicon.svg, /logo.svg and similar

Resumable: per-university results live in data/review/logos-homepage-nov14-progress.json,
accepted candidates are staged in data/review/logos-homepage-staging/ and are only
published (append-only) in the finalise step, after the shared-hash check.

Needs Pillow (raster validation and PNG conversion).
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import html.parser
import io
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from collections import Counter
from pathlib import Path

from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parents[2]
CATALOGUE = ROOT / "data/generated/catalogue/list.json"
TARGETS = ROOT / "data/segment/targets.json"
RANKINGS = ROOT / "data/published/ranking-all.json"
LOGOS = ROOT / "data/published/auto-logos.json"
PROVENANCE = ROOT / "data/published/auto-logos-provenance.json"
PROGRESS = ROOT / "data/review/logos-homepage-nov14-progress.json"
STAGING = ROOT / "data/review/logos-homepage-staging"
OUTDIR = ROOT / "public/logos/auto"
UA = "CollegeStatBot/1.0"
MAX_BYTES = 300 * 1024
HTML_LIMIT = 2 * 1024 * 1024
TIMEOUT = 6
SITE_DEADLINE = 25  # seconds of wall time per university, so dead hosts do not stall a worker
TODAY = "2026-11-14"
MIN_SIDE = 120
MAX_SIDE = 256
LOCK = threading.Lock()

KEYWORDS = re.compile(r"logo|brand|crest|emblem", re.I)
BAD_WORDS = re.compile(
    r"facebook|twitter|instagram|linkedin|youtube|tiktok|whatsapp|telegram|pinterest|social|share|sponsor|partner|"
    r"accredit|award|badge|ranking|footer|banner|hero|slide|news|event|campus|photo|advert|\bads?\b|app-?store|google-?play|"
    r"cookie|payment|visa|mastercard|member|affiliat|consortium|funded|erasmus|\bec\b|eu-flag",
    re.I,
)
COMMON_PATHS = ["/favicon.svg", "/logo.svg", "/images/logo.svg", "/assets/logo.svg", "/img/logo.svg",
                "/assets/images/logo.svg", "/images/logo.png", "/img/logo.png", "/logo.png", "/assets/logo.png"]
REFUSAL = {401, 403, 429}


class Refused(Exception):
    pass


def read_json(path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def write_json_atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, path)


def bare_host(host):
    host = (host or "").lower().rstrip(".")
    return host[4:] if host.startswith("www.") else host


def same_domain(url, official_host):
    try:
        host = bare_host(urllib.parse.urlsplit(url).hostname)
        off = bare_host(official_host)
        return bool(host and off and (host == off or host.endswith("." + off) or off.endswith("." + host)))
    except ValueError:
        return False


class Site:
    """One university's fetch session: same-domain only, robots-aware, stops on refusal."""

    def __init__(self, host):
        self.host = host
        self.robots = None
        self.refused = False
        self.started = time.monotonic()

    def _opener(self):
        site = self

        class Guard(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                if not same_domain(newurl, site.host):
                    raise ValueError("redirect_off_domain")
                return super().redirect_request(req, fp, code, msg, headers, newurl)

        return urllib.request.build_opener(Guard)

    def load_robots(self, scheme, netloc):
        rp = urllib.robotparser.RobotFileParser()
        try:
            req = urllib.request.Request(f"{scheme}://{netloc}/robots.txt", headers={"User-Agent": UA})
            with self._opener().open(req, timeout=TIMEOUT) as r:
                rp.parse(r.read(512 * 1024).decode("utf-8", "replace").splitlines())
        except urllib.error.HTTPError as exc:
            if exc.code in REFUSAL:
                raise Refused(f"robots_{exc.code}")
            rp.parse([])  # 404 etc: no robots, everything allowed
        except Exception:
            rp.parse([])
        self.robots = rp

    def allowed(self, url):
        return self.robots is None or self.robots.can_fetch(UA, url)

    def fetch(self, url, limit=MAX_BYTES):
        if self.refused:
            raise Refused("site_refused")
        if time.monotonic() - self.started > SITE_DEADLINE:
            raise ValueError("site_deadline")
        if not same_domain(url, self.host):
            raise ValueError("off_domain")
        if not self.allowed(url):
            raise Refused("robots_disallow")
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,image/svg+xml,image/*,application/json;q=0.8,*/*;q=0.5"})
        try:
            with self._opener().open(req, timeout=TIMEOUT) as r:
                data = r.read(limit + 1)
                if len(data) > limit:
                    raise ValueError("over_limit")
                return r.geturl(), data, r.headers.get_content_type()
        except urllib.error.HTTPError as exc:
            if exc.code in REFUSAL:
                self.refused = True
                raise Refused(f"http_{exc.code}")
            raise


# ---------------------------------------------------------------- HTML parsing

class PageParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.imgs = []       # dicts
        self.svgs = []       # dicts {raw, attrs, in_header, pos}
        self.metas = {}
        self.manifests = []
        self.stack = []
        self.tags_in_body = 0
        self.in_body = False
        self.head_depth = 0   # header/nav depth
        self.foot_depth = 0
        self._svg = None
        self._svg_depth = 0

    def _ctx(self):
        return {"in_header": self.head_depth > 0, "in_footer": self.foot_depth > 0, "pos": self.tags_in_body}

    def handle_startendtag(self, tag, attrs):
        self._start(tag, attrs, self.get_starttag_text(), True)

    def handle_starttag(self, tag, attrs):
        self._start(tag, attrs, self.get_starttag_text(), False)

    def _start(self, tag, attrs, raw, selfclose):
        a = {k: (v or "") for k, v in attrs}
        if self._svg is not None:
            self._svg["raw"].append(raw)
            if tag == "svg":
                self._svg_depth += 1
            return
        if tag == "body":
            self.in_body = True
        elif self.in_body:
            self.tags_in_body += 1
        if tag in ("header", "nav"):
            self.head_depth += 1
        elif tag == "footer":
            self.foot_depth += 1
        if tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            if key and key not in self.metas:
                self.metas[key] = a.get("content", "")
        elif tag == "link" and "manifest" in a.get("rel", "").lower().split() and a.get("href"):
            self.manifests.append(a["href"])
        elif tag == "img":
            self.imgs.append({**a, **self._ctx()})
        elif tag == "svg":
            self._svg = {"raw": [raw], "attrs": a, **self._ctx()}
            self._svg_depth = 1
            if selfclose:
                self._close_svg()

    def handle_endtag(self, tag):
        if self._svg is not None:
            self._svg["raw"].append(f"</{tag}>")
            if tag == "svg":
                self._svg_depth -= 1
                if self._svg_depth == 0:
                    self._close_svg()
            return
        if tag in ("header", "nav") and self.head_depth:
            self.head_depth -= 1
        elif tag == "footer" and self.foot_depth:
            self.foot_depth -= 1

    def _close_svg(self):
        s = self._svg
        self._svg = None
        s["raw"] = "".join(s["raw"])
        if len(self.svgs) < 40:
            self.svgs.append(s)

    def handle_data(self, data):
        if self._svg is not None:
            self._svg["raw"].append(data)

    def handle_entityref(self, name):
        if self._svg is not None:
            self._svg["raw"].append(f"&{name};")

    def handle_charref(self, name):
        if self._svg is not None:
            self._svg["raw"].append(f"&#{name};")


# ----------------------------------------------------------- image validation

def name_tokens(name):
    stop = {"the", "of", "and", "de", "university", "universidad", "universite", "college", "institute", "for", "in", "at", "state"}
    return {t for t in re.findall(r"[a-z0-9]{3,}", name.lower()) if t not in stop}


def clean_svg(text):
    """Return a safe standalone SVG string, or None."""
    low = text.lower()
    if "<svg" not in low or len(text) > MAX_BYTES:
        return None
    if re.search(r"<script|<foreignobject|\bon[a-z]+\s*=|javascript:|<iframe|<image[^>]+(?:href|src)\s*=\s*[\"']https?:", low):
        return None
    if "<use" in low and re.search(r"<use[^>]+href\s*=\s*[\"']#", low):
        # sprite reference: only valid if the symbol is inside this same svg
        for ref in re.findall(r"<use[^>]+href\s*=\s*[\"']#([^\"']+)", text, re.I):
            if not re.search(r"id\s*=\s*[\"']" + re.escape(ref) + r"[\"']", text):
                return None
    elif "<use" in low:
        return None
    # CSS classes defined by the page stylesheet would not survive serialisation.
    if re.search(r"\sclass\s*=", low) and "<style" not in low and not re.search(r"\sfill\s*=\s*[\"']#?[0-9a-z]", low):
        return None
    if not re.search(r"<(path|circle|rect|polygon|polyline|ellipse|line|text|g|image)\b", low):
        return None
    if not re.search(r"viewbox\s*=", low) and not re.search(r"\swidth\s*=", low):
        return None
    text = re.sub(r"currentcolor", "#1a1a1a", text, flags=re.I)
    if "xmlns=" not in text.split(">", 1)[0]:
        text = text.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    return text


def inspect_bytes(data, url, ctype):
    """-> (ext, out_bytes) where ext in {'s','p'}, or (None, reason)."""
    head = data[:4096].lstrip(b"\xef\xbb\xbf \r\n\t").lower()
    if "svg" in ctype or url.lower().split("?")[0].endswith(".svg") or head.startswith((b"<svg", b"<?xml")):
        svg = clean_svg(data.decode("utf-8", "replace"))
        if svg is None:
            return None, "svg_unusable"
        out = svg.encode("utf-8")
        return ("s", out) if len(out) <= MAX_BYTES else (None, "over_300kb")
    if len(data) > MAX_BYTES:
        return None, "over_300kb"
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception:
        return None, "not_an_image"
    w, h = im.size
    if min(w, h) < MIN_SIDE:
        return None, "under_120px"
    if max(w, h) / min(w, h) > 6:
        return None, "banner_aspect"
    im = im.convert("RGBA")
    flat = Image.new("RGB", im.size, (255, 255, 255))
    flat.paste(im, mask=im.split()[3])
    if max(ImageStat.Stat(flat).stddev) < 6:
        return None, "blank_image"
    scale = MAX_SIDE / max(w, h)
    if scale < 1:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    out = buf.getvalue()
    return ("p", out) if len(out) <= MAX_BYTES else (None, "over_300kb")


# ------------------------------------------------------------------ strategies

def img_candidates(parser, page_url):
    scored = []
    for im in parser.imgs:
        src = im.get("src") or im.get("data-src") or im.get("data-lazy-src") or ""
        if not src or src.startswith("data:"):
            continue
        blob = " ".join([src, im.get("alt", ""), " ".join([im.get("class", ""), im.get("id", "")])])
        if not KEYWORDS.search(blob):
            continue
        if BAD_WORDS.search(blob) or im["in_footer"]:
            continue
        if not (im["in_header"] or im["pos"] < 150):
            continue
        score = (3 if im["in_header"] else 0) + (2 if KEYWORDS.search(im.get("class", "") + im.get("id", "")) else 0) + (2 if src.lower().split("?")[0].endswith(".svg") else 0) - im["pos"] / 200
        scored.append((-score, urllib.parse.urljoin(page_url, src.strip())))
    out, seen = [], set()
    for _, u in sorted(scored):
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out[:4]


def svg_candidates(parser):
    scored = []
    for s in parser.svgs:
        a = s["attrs"]
        blob = " ".join([a.get("class", ""), a.get("id", ""), a.get("aria-label", ""), a.get("data-name", "")])
        if not KEYWORDS.search(blob) or BAD_WORDS.search(blob) or s["in_footer"]:
            continue
        if not (s["in_header"] or s["pos"] < 150):
            continue
        scored.append((-((3 if s["in_header"] else 0) - s["pos"] / 200), s["raw"]))
    return [raw for _, raw in sorted(scored)][:3]


def og_candidates(parser, page_url, name):
    out = []
    for key in ("og:image", "og:image:url", "og:image:secure_url"):
        src = parser.metas.get(key)
        if not src:
            continue
        url = urllib.parse.urljoin(page_url, src.strip())
        fname = urllib.parse.urlsplit(url).path.rsplit("/", 1)[-1]
        if re.search(r"logo|crest|emblem", fname, re.I) and not BAD_WORDS.search(fname):
            out.append((url, "name"))
        else:
            alt = parser.metas.get("og:image:alt", "").lower()
            toks = name_tokens(name)
            try:
                w, h = int(parser.metas.get("og:image:width", 0)), int(parser.metas.get("og:image:height", 0))
            except ValueError:
                w = h = 0
            if toks and alt and w and h and 0.8 <= w / h <= 1.25 and sum(t in alt for t in toks) >= max(1, len(toks) // 2):
                out.append((url, "alt"))
        break
    return [u for u, _ in out]


def manifest_icons(site, parser, page_url):
    out = []
    for href in parser.manifests[:1]:
        murl = urllib.parse.urljoin(page_url, href.strip())
        try:
            final, data, _ = site.fetch(murl, limit=1024 * 1024)
            doc = json.loads(data.decode("utf-8-sig"))
        except Refused:
            raise
        except Exception:
            continue
        for icon in doc.get("icons", []) if isinstance(doc, dict) else []:
            if not isinstance(icon, dict) or not icon.get("src") or "maskable" in (icon.get("purpose") or ""):
                continue
            area = 0
            for size in str(icon.get("sizes", "")).split():
                m = re.fullmatch(r"(\d+)x(\d+)", size.lower())
                if m:
                    area = max(area, int(m.group(1)) * int(m.group(2)))
            if str(icon["src"]).lower().split("?")[0].endswith(".svg"):
                area = 10**9
            out.append((-area, urllib.parse.urljoin(final, icon["src"])))
    return [u for _, u in sorted(out)][:2]


def try_url(site, url):
    try:
        final, data, ctype = site.fetch(url)
    except Refused:
        raise
    except Exception:
        return None, "fetch_failed", None
    ext, out = inspect_bytes(data, final, ctype)
    return ext, out, final


def accept(ext, out, method, download_url, source, host):
    return {"status": "candidate", "ext": ext, "method": method, "download_url": download_url, "source": source,
            "domain": host, "sha256": hashlib.sha256(out).hexdigest(), "_bytes": out}


def collect_one(row):
    homepage = row.get("website")
    if not homepage:
        return {"status": "rejected", "reason": "no_official_website"}
    parsed = urllib.parse.urlsplit(homepage if "://" in homepage else "https://" + homepage)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return {"status": "rejected", "reason": "invalid_official_website"}
    host = parsed.hostname
    site = Site(host)
    reasons = Counter()
    try:
        site.load_robots(parsed.scheme, parsed.netloc)
        page = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))
        try:
            final, data, _ = site.fetch(page, limit=HTML_LIMIT)
        except urllib.error.HTTPError as exc:
            return {"status": "rejected", "reason": f"http_error_{exc.code}"}
        parser = PageParser()
        try:
            parser.feed(data.decode("utf-8", "replace"))
        except Exception:
            reasons["html_parse_error"] += 1
        source = final

        def note(out):
            if isinstance(out, str):
                reasons[out] += 1

        # 1a. inline SVG header logo (SVG preferred), 1b. header <img>
        for raw in svg_candidates(parser):
            ext, out = inspect_bytes(raw.encode("utf-8"), "inline.svg", "image/svg+xml")
            if ext:
                return accept(ext, out, "header-svg", source, source, host)
            note(out)
        imgs = img_candidates(parser, final)
        imgs.sort(key=lambda u: not u.lower().split("?")[0].endswith(".svg"))
        for url in imgs:
            ext, out, fin = try_url(site, url)
            if ext:
                return accept(ext, out, "header-img", fin, source, host)
            note(out)
        # 2. og:image
        for url in og_candidates(parser, final, row.get("name", "")):
            ext, out, fin = try_url(site, url)
            if ext:
                return accept(ext, out, "og-image", fin, source, host)
            note(out)
        # 3. manifest then common paths
        for url in manifest_icons(site, parser, final):
            ext, out, fin = try_url(site, url)
            if ext:
                return accept(ext, out, "manifest", fin, source, host)
            note(out)
        base = f"{parsed.scheme}://{parsed.netloc}"
        for path in COMMON_PATHS[:4]:
            ext, out, fin = try_url(site, base + path)
            if ext:
                return accept(ext, out, "common-path", fin, source, host)
            note(out)
        reason = "no_logo_found" if not reasons else "rejected_" + reasons.most_common(1)[0][0]
        return {"status": "rejected", "reason": reason, "details": dict(reasons)}
    except Refused as exc:
        return {"status": "rejected", "reason": f"refused_{exc}"}
    except urllib.error.HTTPError as exc:
        return {"status": "rejected", "reason": f"http_error_{exc.code}"}
    except ValueError as exc:
        return {"status": "rejected", "reason": str(exc)}
    except Exception as exc:
        return {"status": "rejected", "reason": "network_or_parse_error", "details": {"type": type(exc).__name__}}


# --------------------------------------------------------------------- driver

def ordered_tiers(rows, targets, ranked):
    byid = {r["id"]: r for r in rows}
    t1 = [byid[x["id"]] for x in targets if x.get("id") in byid and byid[x["id"]].get("website")]
    used = {r["id"] for r in t1}
    t2 = [r for r in rows if r.get("country_code") in {"UZ", "KZ", "KG", "TJ", "TM"} and r.get("website") and r["id"] not in used]
    used.update(r["id"] for r in t2)
    t3 = [r for r in rows if r.get("website") and r["id"] not in used and r["id"] in ranked]
    used.update(r["id"] for r in t3)
    t4 = [r for r in rows if r.get("website") and r["id"] not in used]
    return [t1, t2, t3, t4]


def finalise(progress, rows):
    """Append staged candidates to the published files after the shared-hash check."""
    logos = read_json(LOGOS, {})
    prov = read_json(PROVENANCE, {"checked_at": TODAY, "records": []})
    records = prov.setdefault("records", [])
    known = {r.get("university_id") for r in records}
    counts = Counter(r.get("sha256") for r in records if r.get("sha256"))
    items = progress["items"]
    staged = [u for u, i in items.items() if i.get("status") == "candidate" and u not in logos]
    for u in staged:
        counts[items[u]["sha256"]] += 1
    added = Counter()
    for u in staged:
        item = items[u]
        src = STAGING / f"{u}.{'svg' if item['ext'] == 's' else 'png'}"
        if counts[item["sha256"]] > 3:
            items[u] = {"status": "rejected", "reason": "shared_hash_over_3"}
            src.unlink(missing_ok=True)
            continue
        dest = OUTDIR / src.name
        if dest.exists() or not src.exists():
            continue  # never overwrite existing files
        OUTDIR.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(src.read_bytes())
        logos[u] = item["ext"]
        if u not in known:
            records.append({"university_id": u, "domain": item["domain"], "local": f"/logos/auto/{dest.name}",
                            "source": item["source"], "download_url": item["download_url"], "surface": "light",
                            "checked_at": TODAY, "sha256": item["sha256"], "kind": "homepage logo",
                            "method": item["method"], "note": "resized to max 256px" if item["ext"] == "p" else None})
        items[u]["status"] = "accepted"
        added[item["method"]] += 1
    if added:
        write_json_atomic(LOGOS, logos)
        prov["checked_at"] = TODAY
        write_json_atomic(PROVENANCE, prov)
    write_json_atomic(PROGRESS, progress)
    return added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiers", nargs="+", type=int, choices=(1, 2, 3, 4), default=[1, 2, 3, 4])
    ap.add_argument("--max-items", type=int, default=0, help="cap on universities fetched in this invocation")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    rows = read_json(CATALOGUE, [])
    targets = read_json(TARGETS, {}).get("universities", [])
    ranked = {r.get("university_id") for r in read_json(RANKINGS, []) if r.get("university_id")}
    tiers = ordered_tiers(rows, targets, ranked)
    labels = ["targets", "Central Asia", "ranked", "other website"]
    logos = read_json(LOGOS, {})
    progress = read_json(PROGRESS, {"checked_at": TODAY, "items": {}})
    items = progress["items"]
    cov = lambda lg: [sum(r["id"] in lg for r in t) for t in tiers]
    print(f"Coverage before: {len(logos)}/{len(rows)}; per tier " + ", ".join(f"{labels[i]} {c}/{len(tiers[i])}" for i, c in enumerate(cov(logos))), flush=True)
    done = 0
    for n in args.tiers:
        todo = [r for r in tiers[n - 1] if r["id"] not in logos and r["id"] not in items]
        if args.max_items:
            todo = todo[:max(0, args.max_items - done)]
        print(f"Tier {n}: {len(todo)} to fetch", flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, args.workers)) as pool:
            futs = {pool.submit(collect_one, r): r for r in todo}
            for fut in concurrent.futures.as_completed(futs):
                r = futs[fut]
                try:
                    res = fut.result()
                except Exception:
                    res = {"status": "rejected", "reason": "worker_error"}
                if res.get("status") == "candidate":
                    out = res.pop("_bytes")
                    STAGING.mkdir(parents=True, exist_ok=True)
                    (STAGING / f"{r['id']}.{'svg' if res['ext'] == 's' else 'png'}").write_bytes(out)
                with LOCK:
                    items[r["id"]] = res
                    done += 1
                    if done % 25 == 0:
                        write_json_atomic(PROGRESS, progress)
                    if done % 100 == 0:
                        print(f"  {done} done; candidates so far {sum(i.get('status') in ('candidate', 'accepted') for i in items.values())}", flush=True)
        write_json_atomic(PROGRESS, progress)
    added = finalise(progress, rows)
    after = read_json(LOGOS, {})
    print(f"Coverage after: {len(after)}/{len(rows)}; per tier " + ", ".join(f"{labels[i]} {c}/{len(tiers[i])}" for i, c in enumerate(cov(after))))
    print("Added by method: " + json.dumps(dict(added)))
    print("Rejects: " + json.dumps(dict(Counter(i.get("reason") for i in items.values() if i.get("status") == "rejected").most_common(12))))


if __name__ == "__main__":
    main()
