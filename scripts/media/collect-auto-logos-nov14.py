#!/usr/bin/env python3
"""Collect declared SVG/large PNG icons from universities' own homepages.

The progress JSON is deliberately self-contained: successful icon bytes are
base64 encoded so interrupted runs can resume without refetching them.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures
import datetime as dt
import hashlib
import html.parser
import json
import os
import re
import struct
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOGUE = ROOT / "data/generated/catalogue/list.json"
TARGETS = ROOT / "data/segment/targets.json"
RANKINGS = ROOT / "data/published/ranking-all.json"
LOGOS = ROOT / "data/published/auto-logos.json"
PROVENANCE = ROOT / "data/published/auto-logos-provenance.json"
PROGRESS = ROOT / "data/review/auto-logos-nov14-progress.json"
OUTDIR = ROOT / "public/logos/auto"
UA = "CollegeStatBot/1.0 (+https://collegestat.app/bot)"
MAX_BYTES = 300 * 1024
TIMEOUT = 10
TODAY = "2026-11-14"
LOCK = threading.Lock()


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


def registrable_host(host):
    # www is a presentation alias for the same official host.
    host = (host or "").lower().rstrip(".")
    return host[4:] if host.startswith("www.") else host


def same_official_domain(url, official_host):
    try:
        host = registrable_host(urllib.parse.urlsplit(url).hostname)
        official_host = registrable_host(official_host)
        return bool(host and official_host and (host == official_host or host.endswith("." + official_host)))
    except ValueError:
        return False


def fetch(url, limit=MAX_BYTES):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,image/svg+xml,image/png,*/*;q=0.5"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
        final = response.geturl()
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("over_300kb")
        return final, data, response.headers.get_content_type()


class IconParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.icons = []
        self.manifests = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        rel = (attrs.get("rel") or "").lower().split()
        href = attrs.get("href")
        if not href:
            return
        if tag.lower() == "link" and ("icon" in rel or "apple-touch-icon" in rel or "apple-touch-icon-precomposed" in rel):
            sizes = attrs.get("sizes", "")
            dim = 0
            for token in sizes.lower().split():
                m = re.fullmatch(r"(\d+)x(\d+)", token)
                if m:
                    dim = max(dim, int(m.group(1)) * int(m.group(2)))
            self.icons.append(("apple" if any(x.startswith("apple-touch-icon") for x in rel) else "icon", href, sizes, dim))
        elif tag.lower() == "link" and "manifest" in rel:
            self.manifests.append(href)


def png_dimensions(data):
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


def svg_ok(data):
    sample = data[:4096].lstrip(b"\xef\xbb\xbf \r\n\t").lower()
    return b"<svg" in sample and b"</svg" in data.lower()


def candidate_ext(url, content_type, data):
    path = urllib.parse.urlsplit(url).path.lower()
    if "svg" in content_type or path.endswith(".svg") or svg_ok(data):
        return "s" if svg_ok(data) else None
    if "png" in content_type or path.endswith(".png") or data.startswith(b"\x89PNG"):
        dims = png_dimensions(data)
        if not dims:
            return None
        return "p" if min(dims) >= 96 else "small_png"
    return None


def icon_candidates(page_url, html_bytes):
    parser = IconParser()
    parser.feed(html_bytes.decode("utf-8", "replace"))
    candidates = []
    for kind, href, sizes, area in parser.icons:
        url = urllib.parse.urljoin(page_url, href.strip())
        ext = urllib.parse.urlsplit(url).path.lower().rsplit(".", 1)[-1] if "." in urllib.parse.urlsplit(url).path else ""
        if ext not in ("svg", "png"):
            continue
        # apple touch first, then SVG, then PNG; among each class use declared size.
        priority = 0 if kind == "apple" else 1 if ext == "svg" else 2
        candidates.append((priority, -area, url))
    for href in parser.manifests:
        candidates.append((3, 0, urllib.parse.urljoin(page_url, href.strip())))
    return sorted(set(candidates))


def manifest_candidates(url, data):
    try:
        doc = json.loads(data.decode("utf-8-sig"))
    except Exception:
        return []
    out = []
    for icon in doc.get("icons", []) if isinstance(doc, dict) else []:
        src = icon.get("src") if isinstance(icon, dict) else None
        if not src:
            continue
        typ = (icon.get("type") or "").lower()
        purpose = (icon.get("purpose") or "").lower()
        path = urllib.parse.urlsplit(src).path.lower()
        if "maskable" in purpose:
            continue
        if "svg" not in typ and not path.endswith((".svg", ".png")):
            continue
        area = 0
        for size in str(icon.get("sizes", "")).split():
            m = re.fullmatch(r"(\d+)x(\d+)", size.lower())
            if m:
                area = max(area, int(m.group(1)) * int(m.group(2)))
        out.append((4, -area, urllib.parse.urljoin(url, src)))
    return sorted(out)


def collect_one(row):
    uid, homepage = row["id"], row.get("website")
    if not homepage:
        return {"status": "rejected", "reason": "no_official_website"}
    try:
        parsed = urllib.parse.urlsplit(homepage if "://" in homepage else "https://" + homepage)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return {"status": "rejected", "reason": "invalid_official_website"}
        official_host = parsed.hostname
        page = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))
        # The 300 KB acceptance limit applies to the icon asset. Homepage HTML
        # and a web app manifest are metadata documents, so allow them a small
        # bounded buffer larger than that.
        page_final, page_data, _ = fetch(page, limit=2 * 1024 * 1024)
        if not same_official_domain(page_final, official_host):
            return {"status": "rejected", "reason": "homepage_redirect_off_domain"}
        candidates = icon_candidates(page_final, page_data)
        seen = set()
        rejected = Counter()
        # First inspect declared direct icons. Fetch manifest files and add their
        # entries after the direct apple/SVG/PNG choices.
        expanded = []
        for item in candidates:
            if item[0] != 3:
                expanded.append(item)
                continue
            murl = item[2]
            if not same_official_domain(murl, official_host):
                rejected["off_domain_icon"] += 1
                continue
            try:
                mf, md, _ = fetch(murl, limit=1024 * 1024)
                if same_official_domain(mf, official_host):
                    expanded.extend(manifest_candidates(mf, md))
                else:
                    rejected["off_domain_icon"] += 1
            except Exception as exc:
                rejected[type_reason(exc)] += 1
        expanded.sort()
        for _, _, url in expanded:
            if url in seen:
                continue
            seen.add(url)
            if not same_official_domain(url, official_host):
                rejected["off_domain_icon"] += 1
                continue
            try:
                final, data, ctype = fetch(url)
                if not same_official_domain(final, official_host):
                    rejected["off_domain_icon"] += 1
                    continue
                ext = candidate_ext(final, ctype, data)
                if ext == "small_png":
                    rejected["png_under_96px"] += 1
                    continue
                if ext is None:
                    rejected["unsupported_or_invalid_icon"] += 1
                    continue
                digest = hashlib.sha256(data).hexdigest()
                return {"status": "candidate", "ext": ext, "download_url": final, "source": page_final,
                        "domain": official_host, "sha256": digest, "bytes": base64.b64encode(data).decode("ascii"),
                        "note": None}
            except Exception as exc:
                rejected[type_reason(exc)] += 1
        reason = rejected.most_common(1)[0][0] if rejected else "no_declared_supported_icon"
        return {"status": "rejected", "reason": reason, "details": dict(rejected)}
    except urllib.error.HTTPError as exc:
        return {"status": "rejected", "reason": "http_error_" + str(exc.code)}
    except Exception as exc:
        return {"status": "rejected", "reason": type_reason(exc)}


def type_reason(exc):
    if isinstance(exc, ValueError) and str(exc) == "over_300kb":
        return "over_300kb"
    if isinstance(exc, (TimeoutError,)) or isinstance(exc, urllib.error.URLError) and isinstance(getattr(exc, "reason", None), TimeoutError):
        return "timeout"
    if isinstance(exc, urllib.error.URLError):
        return "network_error"
    if isinstance(exc, json.JSONDecodeError):
        return "invalid_manifest"
    return "fetch_or_parse_error"


def ordered_rows(all_rows, targets, ranked):
    byid = {r["id"]: r for r in all_rows}
    tier1 = [byid[x["id"]] for x in targets if x.get("id") in byid and byid[x["id"]].get("website")]
    used = {x["id"] for x in tier1}
    tier2 = [r for r in all_rows if r.get("country_code") in {"UZ", "KZ", "KG", "TJ", "TM"} and r.get("website") and r["id"] not in used]
    used.update(x["id"] for x in tier2)
    tier3 = [r for r in all_rows if r.get("website") and r["id"] not in used and r["id"] in ranked]
    used.update(x["id"] for x in tier3)
    tier4 = [r for r in all_rows if r.get("website") and r["id"] not in used]
    return [tier1, tier2, tier3, tier4]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiers", nargs="+", type=int, choices=(1, 2, 3, 4), default=[1, 2, 3, 4])
    ap.add_argument("--max-items", type=int, default=0, help="optional cap for this invocation")
    args = ap.parse_args()
    all_rows = read_json(CATALOGUE, [])
    targets = read_json(TARGETS, {}).get("universities", [])
    ranked = {r.get("university_id") for r in read_json(RANKINGS, []) if r.get("university_id")}
    tiers = ordered_rows(all_rows, targets, ranked)
    logos = read_json(LOGOS, {})
    provenance = read_json(PROVENANCE, {"checked_at": TODAY, "method": "Each university's own declared site icon (apple-touch-icon / SVG / PNG icon link) fetched from its official homepage; PNGs under 96px rejected.", "records": []})
    before = len(logos)
    records = provenance.setdefault("records", [])
    existing_ids = set(logos)
    known = {r.get("university_id") for r in records}
    progress = read_json(PROGRESS, {"checked_at": TODAY, "items": {}, "tiers": {}})
    items = progress.setdefault("items", {})
    initial_counts = [sum(r["id"] in existing_ids for r in tier) for tier in tiers]
    print(f"Coverage before: {before}/{len(all_rows)} ({before / len(all_rows):.1%})", flush=True)
    print("Tier sizes: " + ", ".join(f"{i+1}={len(t)} (already covered {initial_counts[i]})" for i, t in enumerate(tiers)), flush=True)
    done_this_run = 0
    rejects = Counter()
    for tier_no in args.tiers:
        tier = tiers[tier_no - 1]
        todo = [r for r in tier if r["id"] not in existing_ids and r["id"] not in items]
        for r in tier:
            cached = items.get(r["id"])
            if cached and cached.get("status") == "rejected":
                rejects[cached.get("reason", "unknown")] += 1
        if args.max_items and done_this_run >= args.max_items:
            break
        if args.max_items:
            todo = todo[:max(0, args.max_items - done_this_run)]
        if not todo:
            progress.setdefault("tiers", {})[str(tier_no)] = {"completed": True, "eligible": len(tier)}
            write_json_atomic(PROGRESS, progress)
            continue
        print(f"Tier {tier_no}: processing {len(todo)} remaining", flush=True)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            futures = {pool.submit(collect_one, row): row for row in todo}
            for fut in concurrent.futures.as_completed(futures):
                row = futures[fut]
                try:
                    result = fut.result()
                except Exception:
                    result = {"status": "rejected", "reason": "worker_error"}
                items[row["id"]] = result
                done_this_run += 1
                if result.get("status") == "rejected":
                    rejects[result.get("reason", "unknown")] += 1
                # Checkpoint frequently so an interrupted network run resumes cleanly.
                if done_this_run % 5 == 0:
                    write_json_atomic(PROGRESS, progress)
                if done_this_run % 25 == 0:
                    print(f"  tier {tier_no}: {done_this_run}/{sum(len(tiers[n-1]) for n in args.tiers)} this run", flush=True)
        # Tier completion is marked after all its requests have settled.
        left = any(r["id"] not in existing_ids and r["id"] not in items for r in tier)
        progress.setdefault("tiers", {})[str(tier_no)] = {"completed": not left, "eligible": len(tier)}
        write_json_atomic(PROGRESS, progress)

    # Evaluate shared-hash default assets over this run and the prior catalogue.
    counts = Counter(r.get("sha256") for r in records if r.get("sha256"))
    candidate_ids = [uid for uid, item in items.items() if item.get("status") == "candidate"]
    for uid in candidate_ids:
        if uid in existing_ids:
            continue
        item = items[uid]
        counts[item["sha256"]] += 1
    shared = {h for h, n in counts.items() if n > 3}
    additions = []
    id_to_row = {r["id"]: r for r in all_rows}
    for uid in candidate_ids:
        item = items[uid]
        if uid in existing_ids:
            continue
        if item["sha256"] in shared:
            items[uid] = {"status": "rejected", "reason": "shared_hash_over_3"}
            rejects["shared_hash_over_3"] += 1
            continue
        data = base64.b64decode(item.pop("bytes"))
        ext = item["ext"]
        path = OUTDIR / f"{uid}.{ {'s': 'svg', 'p': 'png'}[ext] }"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(data)
        logos[uid] = ext
        if uid not in known:
            records.append({"university_id": uid, "domain": item["domain"], "local": f"/logos/auto/{uid}.{ {'s': 'svg', 'p': 'png'}[ext] }",
                            "source": item["source"], "download_url": item["download_url"], "surface": "light",
                            "checked_at": TODAY, "sha256": item["sha256"], "kind": "declared site icon", "note": item.get("note")})
            known.add(uid)
        items[uid] = {k: v for k, v in item.items() if k != "bytes"}
        items[uid]["status"] = "accepted"
        additions.append(uid)
    if additions:
        write_json_atomic(LOGOS, logos)
        provenance["checked_at"] = TODAY
        write_json_atomic(PROVENANCE, provenance)
    write_json_atomic(PROGRESS, progress)
    after = len(logos)
    tier_after = [sum(r["id"] in logos for r in tier) for tier in tiers]
    tier_labels = ["targets", "Central Asia", "ranked", "other website"]
    print(f"Coverage after: {after}/{len(all_rows)} ({after / len(all_rows):.1%}); added {after-before}")
    print("Per-tier coverage: " + ", ".join(f"{tier_labels[i]} {tier_after[i]}/{len(tiers[i])}" for i in range(4)))
    all_rejects = Counter(item.get("reason", "unknown") for item in items.values() if item.get("status") == "rejected")
    print("Rejects by reason: " + json.dumps(dict(all_rejects), sort_keys=True))


if __name__ == "__main__":
    main()
