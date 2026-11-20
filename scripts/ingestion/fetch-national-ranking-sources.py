#!/usr/bin/env python3
"""Retrieve pinned official national sources, keeping immutable fetch receipts.

Valid cached sources are verified and reused. Never silently refresh an
existing source snapshot. A changed edition needs a new URL/receipt and review.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {
    "ncses-herd": {
        "licence.html": ("https://www.nsf.gov/policies/digital", 2_000_000),
        "table6.xlsx": ("https://ncses.nsf.gov/pubs/nsf26304/assets/data-tables/tables/nsf26304-tab006.xlsx", 1_000_000),
        "public-use-2024-short.zip": ("https://ncses.nsf.gov/821/assets/0/files/higher_education_r_and_d_2024_short.zip", 2_000_000),
        "public-use-2024.zip": ("https://ncses.nsf.gov/821/assets/0/files/higher_education_r_and_d_2024.zip", 12_000_000),
    },
    "nirf-pib": {
        "release.html": ("https://www.pib.gov.in/PressReleasePage.aspx?PRID=2163711&lang=1&reg=3", 2_000_000),
        "licence.html": ("https://www.pib.gov.in/ContentPage.aspx?lang=2&menuid=102&reg=48", 2_000_000),
    },
}


def run(verify_only=False):
    results = []
    for folder, files in SOURCES.items():
        raw = ROOT / "data/raw" / folder
        manifest_path = raw / "fetch-manifest.json"
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        for name, (url, limit) in files.items():
            path = raw / name
            if path.exists():
                meta = manifest.get(name, {})
                body = path.read_bytes()
                if meta.get("url") != url or not meta.get("retrieved_at") or meta.get("bytes") != len(body) or meta.get("sha256") != hashlib.sha256(body).hexdigest():
                    raise ValueError("Cached provenance failed; never infer a receipt: " + str(path))
                results.append({"file": str(path.relative_to(ROOT)), "status": "verified_cached_snapshot", "bytes": len(body)})
                continue
            if verify_only:
                raise FileNotFoundError("Missing source: " + str(path))
            raw.mkdir(parents=True, exist_ok=True)
            request = Request(url, headers={"User-Agent": "CollegeStat/0.1 official source review; no redistribution of restricted material"})
            with urlopen(request, timeout=30) as response:
                if urlparse(response.url).hostname not in ("www.nsf.gov", "ncses.nsf.gov", "www.pib.gov.in", "pib.gov.in"):
                    raise ValueError("Source redirected outside the official provider")
                body = response.read(limit + 1)
            if not body or len(body) > limit:
                raise ValueError("Official source exceeded bounded download size")
            if name.endswith((".zip", ".xlsx")) and not body.startswith(b"PK"):
                raise ValueError("The source returned a non-archive page")
            path.write_bytes(body)
            manifest[name] = {"url": url, "retrieved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)}
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
            results.append({"file": str(path.relative_to(ROOT)), "status": "downloaded_for_review", "bytes": len(body)})
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-cache", action="store_true")
    args = parser.parse_args()
    print(json.dumps(run(args.verify_cache), indent=2))
