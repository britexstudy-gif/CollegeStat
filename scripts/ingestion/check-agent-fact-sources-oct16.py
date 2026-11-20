#!/usr/bin/env python3
"""Check availability of candidate cost/entry evidence; never publish facts."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from hashlib import sha256
from html import unescape
from html.parser import HTMLParser
import argparse
import json
from pathlib import Path
import re
import threading
from urllib.error import HTTPError, URLError
from urllib.parse import urldefrag, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[2]
FIELDS = {"tuition", "mandatory_fee", "living_cost", "accommodation_cost", "financial_aid", "entry_requirement", "required_subject", "language_requirement", "language_exemption"}
MAX_BYTES = 2_000_000


def now():
    return datetime.now(timezone.utc).isoformat()


def hostname(url):
    return (urlparse(url if "://" in url else "https://" + url).hostname or "").lower().removeprefix("www.")


def primary(url, domains):
    parsed = urlparse(url)
    host = hostname(url)
    return parsed.scheme in ("http", "https") and not parsed.username and not parsed.password and any(host == domain or host.endswith("." + domain) for domain in domains)


class PrimaryRedirect(HTTPRedirectHandler):
    def __init__(self, domains):
        super().__init__()
        self.domains = domains

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not primary(newurl, self.domains):
            raise URLError("Redirect affiliation requires separate review")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class PageText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hidden = 0
        self.in_title = False
        self.title, self.parts = [], []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.hidden += 1
        if tag == "title":
            self.in_title = True
        if tag in ("p", "div", "li", "tr", "h1", "h2", "h3", "h4", "br"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self.hidden = max(0, self.hidden - 1)
        if tag == "title":
            self.in_title = False
        if tag in ("p", "div", "li", "tr", "h1", "h2", "h3", "h4"):
            self.parts.append("\n")

    def handle_data(self, value):
        if self.in_title:
            self.title.append(value)
        if not self.hidden:
            self.parts.append(value)

    def text(self):
        lines = [re.sub(r"\s+", " ", unescape(line)).strip() for line in " ".join(self.parts).splitlines()]
        return "\n".join(line for line in lines if line)[:300_000]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--batch", default="20261016T025811Z-a987f5")
    args = parser.parse_args()
    if not 1 <= args.limit <= 100 or not re.fullmatch(r"[A-Za-z0-9-]+", args.batch):
        parser.error("limit must be 1..100 and batch must be a local receipt ID")
    batch_folder = ROOT / "outputs/university-agent-batch-oct15" / args.batch
    receipt = json.loads((batch_folder / "receipt.json").read_text())
    completed = sorted((job for job in receipt["jobs"] if job.get("status") == "candidate_ready" and job.get("provider") == "opencode"), key=lambda job: job["finishedAt"])[:args.limit]
    catalogue = {row["id"]: row for row in json.loads((ROOT / "data/published/global-directory.json").read_text())}
    sources, excluded = {}, []
    for job in completed:
        record = catalogue[job["universityId"]]
        domains = {hostname(value) for value in [record["website"], *record.get("domains", [])] if value}
        if "mit.edu" in domains:
            domains.add("mitadmissions.org")
        report = json.loads((ROOT / job["report"]).read_text())
        for index, fact in enumerate(report["facts"]):
            if fact["field"] not in FIELDS:
                continue
            url = urldefrag(fact["sourceUrl"])[0]
            reference = {"task": job["task"], "universityId": job["universityId"], "university": job["university"], "report": job["report"], "factIndex": index, "field": fact["field"]}
            if not primary(url, domains):
                excluded.append({**reference, "url": url, "reason": "University affiliation of this source domain requires separate review"})
                continue
            source = sources.setdefault(url, {"url": url, "domains": set(), "references": []})
            source["domains"].update(domains)
            source["references"].append(reference)
    output = ROOT / "data/review/university-enrichment-oct16/agent-fact-source-receipts.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    cache = Path("/tmp/collegestat-agent-source-review-oct16")
    cache.mkdir(exist_ok=True)
    started, results, lock = now(), [], threading.Lock()
    if output.is_file():
        previous = json.loads(output.read_text())
        for row in previous.get("sources", []):
            if row.get("url") not in sources or not row.get("retrievedAt", "").startswith(started[:10]):
                continue
            cache_path = row.get("cacheTextPath")
            if cache_path and (not Path(cache_path).is_relative_to(cache) or not Path(cache_path).is_file()):
                continue
            results.append({**row, "references": sources[row["url"]]["references"], "reusedCachedAvailabilityCheck": True})
    reused_urls = {row["url"] for row in results}
    host_slots = {hostname(url): threading.Semaphore(2) for url in sources}

    def save(finished=False):
        payload = {"schemaVersion": 1, "status": "finished" if finished else "running", "startedAt": started, "updatedAt": now(), "batchId": args.batch, "selectedUniversityCount": len(completed), "sourceCount": len(sources), "checkedSourceCount": len(results), "candidateSourceCheckNoFactVerification": True, "reviewState": "availability_only_pending_native_fact_review", "publishedRecords": 0, "fields": sorted(FIELDS), "taskIds": [job["task"] for job in completed], "excludedSources": excluded, "sources": sorted(results, key=lambda row: row["url"])}
        temporary = output.with_suffix(".tmp")
        temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        temporary.replace(output)

    def fetch(source):
        row = {"url": source["url"], "references": source["references"], "retrievedAt": now(), "httpStatus": None, "title": None, "sha256": None, "cacheTextPath": None, "verificationState": "availability_only"}
        with host_slots[hostname(source["url"])]:
            try:
                request = Request(source["url"], headers={"User-Agent": "CollegeStatEvidenceReview/1.0 (public source availability check)"})
                with build_opener(PrimaryRedirect(source["domains"])).open(request, timeout=15) as response:
                    row["httpStatus"] = response.status
                    row["finalUrl"] = response.url
                    if not primary(response.url, source["domains"]):
                        row["verificationState"] = "redirect_affiliation_requires_review"
                        return row
                    content_type = response.headers.get_content_type()
                    row["contentType"] = content_type
                    body = response.read(MAX_BYTES)
                    row["bytesRead"], row["bodyMayBeTruncated"] = len(body), len(body) == MAX_BYTES
                    row["sha256"] = sha256(body).hexdigest()
                    if content_type in ("text/html", "application/xhtml+xml", "text/plain"):
                        decoded = body.decode(response.headers.get_content_charset() or "utf-8", "replace")
                        page = PageText()
                        page.feed(decoded)
                        row["title"] = re.sub(r"\s+", " ", " ".join(page.title)).strip()[:400] or None
                        text = page.text() if content_type != "text/plain" else decoded[:300_000]
                        if any(marker in (row["title"] or "").lower() for marker in ("just a moment", "access denied", "attention required", "security check")):
                            row["verificationState"] = "access_challenge_requires_review"
                        else:
                            target = cache / (sha256(source["url"].encode()).hexdigest()[:20] + ".txt")
                            target.write_text(text)
                            row["cacheTextPath"], row["textLength"] = str(target), len(text)
                    else:
                        row["verificationState"] = "non_html_requires_separate_review"
            except HTTPError as error:
                row.update({"httpStatus": error.code, "errorType": "HTTPError", "verificationState": "source_unavailable"})
            except (URLError, TimeoutError, OSError, ValueError) as error:
                row.update({"errorType": type(error).__name__, "verificationState": "source_unavailable"})
        return row

    save()
    print(json.dumps({"selectedUniversities": len(completed), "sources": len(sources), "reusedSources": len(reused_urls), "receipt": str(output)}), flush=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        for future in as_completed([pool.submit(fetch, source) for source in sources.values() if source["url"] not in reused_urls]):
            row = future.result()
            with lock:
                results.append(row)
                save()
    save(finished=True)
    print(json.dumps({"checkedSources": len(results), "http200": sum(row["httpStatus"] == 200 for row in results), "plaintextCached": sum(bool(row["cacheTextPath"]) for row in results), "publishedRecords": 0}), flush=True)


if __name__ == "__main__":
    main()
