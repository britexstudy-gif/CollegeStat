"""Collect bounded official directory-link review candidates for tasks 018–050."""
import concurrent.futures
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlsplit, urlunsplit
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/review/official-directory-links-018-050-oct15.json"
CACHE = Path("/tmp/collegestat-official-directories-018-050-oct15")
CACHE.mkdir(exist_ok=True)
AGENT = "Mozilla/5.0 (compatible; CollegeStat primary-source directory review)"

class Page(HTMLParser):
    def __init__(self, url):
        super().__init__()
        self.url, self.links, self.title, self.text = url, [], "", []
        self.in_title, self.anchor, self.skip = False, None, 0
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ["script", "style"]: self.skip += 1
        if tag == "title": self.in_title = True
        if tag == "a" and attrs.get("href"):
            self.anchor = {"url": urljoin(self.url, attrs["href"]), "label": ""}
            self.links.append(self.anchor)
    def handle_endtag(self, tag):
        if tag in ["script", "style"]: self.skip = max(0, self.skip - 1)
        if tag == "title": self.in_title = False
        if tag == "a": self.anchor = None
    def handle_data(self, data):
        if self.in_title: self.title += data
        if self.anchor is not None: self.anchor["label"] += data
        if not self.skip and data.strip(): self.text.append(data.strip())

def domain(url): return (urlsplit(url).hostname or "").lower().removeprefix("www.")
def https(url):
    parts = urlsplit(url)
    return urlunsplit(("https", parts.netloc, parts.path or "/", parts.query, ""))
def belongs(url, official):
    h = domain(url)
    return h == official or h.endswith("." + official)

def fetch(item):
    university, url = item
    receipt = {"university_id": university["id"], "url": url, "retrieved_at": datetime.now(timezone.utc).isoformat()}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": AGENT}), timeout=12) as response:
            body = response.read(2_500_001)
            if len(body) > 2_500_000: raise ValueError("Over collection size limit")
            receipt.update(status=response.status, final_url=response.url, content_type=response.headers.get_content_type(), sha256=hashlib.sha256(body).hexdigest())
            if response.status != 200 or "html" not in receipt["content_type"]: return receipt, None
            if not belongs(response.url, university["official_domain"]):
                receipt["rejection_reason"] = "Redirect left exact official domain family"
                return receipt, None
            page = Page(response.url)
            page.feed(body.decode(response.headers.get_content_charset() or "utf-8", "replace"))
            receipt["title"] = " ".join(page.title.split())
            receipt["body_characters"] = len(" ".join(page.text))
            cache = CACHE / (hashlib.sha256(url.encode()).hexdigest()[:20] + ".html")
            cache.write_bytes(body)
            receipt["evidence_pointer"] = str(cache)
            receipt["text_preview"] = " ".join(page.text)[:650]
            return receipt, page
    except Exception as error:
        receipt.update(status="error", error=str(error))
        return receipt, None

def classify(link):
    text = link["label"] + " " + urlsplit(link["url"]).path
    if re.search(r"(?:tuition|fees?|costs?|funding-your|finance-and|学费|費用)", text, re.I): return "costs"
    if re.search(r"(?:admission|apply|applying|招生|入学|申請|candidatur)", text, re.I): return "admissions"
    if re.search(r"(?:program(?:me)?s?|courses?|degrees?|majors?|bachelor|catalog(?:ue)?|学位|課程|课程|formations)", text, re.I): return "programmes"
    return None

def main():
    manifest = json.loads((ROOT / "data/review/university-agent-batch-oct15.json").read_text())
    universities = [{**row, "official_domain": domain(row["website"])} for row in manifest["universities"][17:50]]
    by_id = {row["id"]: row for row in universities}
    existing = json.loads((ROOT / "data/published/official-web-profiles.json").read_text())
    all_receipts, pages, candidates = [], {}, {}
    roots = [(row, https(row["website"])) for row in universities]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for receipt, page in pool.map(fetch, roots):
            all_receipts.append(receipt)
            if page: pages[receipt["university_id"]] = page
    for row in universities:
        links = list(existing.get(row["id"], {}).get("links", {}).values())
        if row["id"] in pages: links += pages[row["id"]].links
        # Only observed official links become candidates. No invented paths.
        ranked = []
        for link in links:
            if not link.get("url", "").startswith(("https://", "http://")): continue
            url = https(link["url"])
            if not belongs(url, row["official_domain"]): continue
            kind = classify(link)
            if not kind or urlsplit(url).path in ["", "/"]: continue
            if re.search(r"news|event|research|summer|widening|offer-holder", url, re.I): continue
            ranked.append((kind, url, " ".join(link.get("label", "").split())))
        seen, chosen = set(), []
        for kind in ["programmes", "admissions", "costs"]:
            for k, url, label in ranked:
                if k != kind or (kind, url) in seen: continue
                seen.add((kind, url)); chosen.append({"kind": kind, "url": url, "label": label})
                if sum(item["kind"] == kind for item in chosen) >= 2: break
        candidates[row["id"]] = chosen
    jobs = [(by_id[uid], link["url"]) for uid, links in candidates.items() for link in links]
    fetched = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for receipt, page in pool.map(fetch, jobs):
            all_receipts.append(receipt)
            if page: fetched[(receipt["university_id"], receipt["url"])] = (receipt, page)
    result = {"schema_version": 1, "checked_at": "2026-10-15", "status": "fetched_candidates_require_manual_review", "records": [], "receipts": all_receipts, "rejected": []}
    for row in universities:
        record = {"university_id": row["id"], "university_name": row["name"], "official_domain": row["official_domain"], "country_code": row["countryCode"], "checked_at": "2026-10-15", **{key: [] for key in ["resources", "programmes", "admissions", "costs", "people", "student_stories", "videos", "gallery"]}}
        for link in candidates[row["id"]]:
            pair = fetched.get((row["id"], link["url"]))
            if not pair: continue
            receipt, page = pair
            record["resources"].append({**link, "url": receipt["final_url"], "scope": "Official source directory; consult its stated programme, applicant category and intake.", "checked_at": "2026-10-15", "verification_status": "needs_review", "source_title": receipt["title"]})
        result["records"].append(record)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"universities": len(universities), "fetched_sources": len(all_receipts), "successful": sum(r["status"] == 200 for r in all_receipts), "with_candidates": sum(bool(r["resources"]) for r in result["records"]), "output": str(OUT)}))

if __name__ == "__main__": main()
