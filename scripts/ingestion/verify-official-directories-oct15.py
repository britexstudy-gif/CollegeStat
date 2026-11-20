#!/usr/bin/env python3
"""Collect review candidates, never publication, for explicit catalogue identities.

Known paths are candidates until fetched. A redirect, a 200 response or a menu
label alone is never a current programme/fee/admission fact.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urljoin, urlunsplit
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "data/review"
DAY = "2026-10-15"


def host(url):
    return (urlsplit(url).hostname or "").lower().removeprefix("www.")


class HTML(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base, self.links, self.title, self.parts = base, [], "", []
        self.current, self.in_title, self.skip = None, False, 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"script", "style"}:
            self.skip += 1
        if tag == "title":
            self.in_title = True
        if tag == "a":
            url = urljoin(self.base, attrs.get("href", ""))
            self.current = {"url": url, "label": ""}
            self.links.append(self.current)

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.skip = max(0, self.skip - 1)
        if tag == "title":
            self.in_title = False
        if tag == "a":
            self.current = None

    def handle_data(self, text):
        if not self.skip:
            self.parts.append(text)
        if self.in_title:
            self.title += text
        if self.current:
            self.current["label"] += text


def fetch(item):
    now = datetime.now(timezone.utc).isoformat()
    url = item["url"]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CollegeStat official directory source review/1.0"})
        with urllib.request.urlopen(req, timeout=13) as response:
            content_type = response.headers.get_content_type()
            data = response.read(1_750_001)
            if len(data) > 1_750_000:
                raise ValueError("Page exceeds collection size limit")
            result = {**item, "status": response.status, "final_url": response.url, "content_type": content_type, "retrieved_at": now, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
            if content_type not in {"text/html", "application/xhtml+xml"}:
                return {**result, "review_status": "non_html", "title": "", "links": []}
            page = HTML(response.url)
            page.feed(data.decode("utf-8", "replace"))
            text = " ".join(page.parts).strip()
            text = re.sub(r"\s+", " ", unescape(text))
            # Receipt text is bounded source-review context, not article content.
            terms = r"tuition|fees|admission|apply|degree|programmes|programs|courses|bachelor|undergraduate|study"
            positions = list(re.finditer(terms, text, re.I))
            context = [text[max(0, match.start() - 40):match.start() + 240] for match in positions[-3:]]
            return {**result, "review_status": "candidate", "title": " ".join(page.title.split()), "text_length": len(text), "context": context, "links": [{"url": link["url"], "label": " ".join(link["label"].split())} for link in page.links]}
    except Exception as error:
        return {**item, "status": "error", "retrieved_at": now, "error": str(error), "links": []}


def kind(link):
    text = (link["label"] + " " + link["url"]).lower()
    if re.search(r"/news/|/event|/jobs|/career|/research/|/article|accommod|calendar|staff|faculty-vacanc|/login|/search\?", text):
        return None
    if re.search(r"tuition|fees|cost(?:s|-of)|financial.?aid|funding", text):
        return "costs"
    if re.search(r"admission|how.to.apply|apply.now|entry.requirements|/apply/?$", text):
        return "admissions"
    if re.search(r"degree.?program|programmes|programs|/courses|course.finder|course.search|study.options|/academics/?$|/undergraduate/?$", text):
        return "programmes"
    return None


def canonical(url):
    p = urlsplit(unescape(url.strip()))
    return urlunsplit(("https", p.netloc, p.path or "/", p.query, ""))


def belongs(url, domain):
    name = host(url)
    return name == domain or name.endswith("." + domain)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=int, default=51)
    parser.add_argument("--end", type=int, default=100)
    parser.add_argument("--include-uncovered-first", action="store_true")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    manifest = json.loads((REVIEW / "university-agent-batch-oct15.json").read_text())
    published = json.loads((ROOT / "data/published/reviewed-university-enrichment-oct15.json").read_text())
    existing = {row["university_id"] for row in published["records"]}
    targets = [row for row in manifest["universities"] if args.start <= int(row["task"]) <= args.end or args.include_uncovered_first and int(row["task"]) <= 17 and row["id"] not in existing]
    profiles = json.loads((ROOT / "data/published/official-web-profiles.json").read_text())
    home_items = [{"task": row["task"], "university_id": row["id"], "kind": "home", "url": canonical(row["website"])} for row in targets]
    print(json.dumps({"phase": "homepages", "targets": len(targets)}), flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        homes = list(pool.map(fetch, home_items))
    home_by_id = {row["university_id"]: row for row in homes}
    candidates = []
    for row in targets:
        domain = host(row["website"])
        links = home_by_id[row["id"]].get("links", [])
        for resource in profiles.get(row["id"], {}).get("links", {}).values():
            links.append(resource)
        selected = {"programmes": [], "admissions": [], "costs": []}
        seen = set()
        for link in links:
            k = kind(link)
            if not k or not belongs(link["url"], domain):
                continue
            url = canonical(link["url"])
            if url in seen or url.rstrip("/") == canonical(row["website"]).rstrip("/"):
                continue
            p = urlsplit(url)
            if p.username or p.password or p.port:
                continue
            seen.add(url)
            # Prefer a broad directory over a news article, individual major or event.
            selected[k].append({"task": row["task"], "university_id": row["id"], "kind": k, "url": url, "discovered_on": home_by_id[row["id"]].get("final_url", row["website"]), "label": link["label"]})
        for values in selected.values():
            candidates.extend(sorted(values, key=lambda item: len(urlsplit(item["url"]).path))[:2])
    print(json.dumps({"phase": "directories", "candidates": len(candidates)}), flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        directories = list(pool.map(fetch, candidates))
    for receipt in homes + directories:
        receipt.pop("links", None)
    output = {"schema_version": 1, "checked_at": DAY, "status": "candidates_require_review", "targets": targets, "receipts": homes + directories}
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(destination), "targets": len(targets), "candidate_pages": len(directories), "successful_pages": sum(row["status"] == 200 for row in directories)}), flush=True)


if __name__ == "__main__":
    main()
