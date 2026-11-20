#!/usr/bin/env python3
"""Inventory every catalogue identity; optionally collect bounded, curated sources.

This never infers a degree offer from IPEDS completions or a ranking subject.
Fetched pages produce receipts and candidates, never automatic publication.
"""
import argparse
import concurrent.futures
import hashlib
import html
import json
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
import re
import tempfile
from urllib.parse import urljoin, urlsplit, unquote
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PUBLISHED = ROOT / "data/published"
REVIEW = ROOT / "data/review/university-enrichment-oct15"
OVERLAY = PUBLISHED / "reviewed-university-enrichment-oct15.json"


def read(name):
    return json.loads((PUBLISHED / (name + ".json")).read_text())


def host(url):
    return (urlsplit(url or "").hostname or "").lower().removeprefix("www.")


def belongs(url, domain):
    hostname = host(url)
    return hostname == domain or hostname.endswith("." + domain)


class Page(HTMLParser):
    def __init__(self, base):
        super().__init__()
        self.base, self.links, self.parts = base, [], []
        self.title, self.in_title = "", False
        self.current_link = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":
            self.in_title = True
        if tag in ("a", "iframe"):
            url = urljoin(self.base, attrs.get("href") or attrs.get("src") or "")
            if url.startswith("https://"):
                self.current_link = {"url": url, "label": "", "tag": tag}
                self.links.append(self.current_link)

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag in ("a", "iframe"):
            self.current_link = None

    def handle_data(self, text):
        if self.in_title:
            self.title += text
        if self.current_link:
            self.current_link["label"] += text


def inventory():
    rows = read("global-directory")
    completions = read("program-catalogue")
    publisher = read("publisher-students")
    web = read("official-web-profiles")
    images = read("institution-image-cache")
    legacy = read("profile-enrichment")
    current_programmes = read("official-programs")
    reviewed_programmes = read("reviewed-programmes-oct10")["records"]
    requirements = read("requirements-current")
    people = read("notable-people")
    admissions = read("admissions-current")
    logo_domains = {r["domain"] for r in read("official-logos")}
    overlay = json.loads(OVERLAY.read_text())
    overlay_ids = {r["university_id"] for r in overlay["records"]}
    supplemental = {r["university_id"]: r for r in overlay["records"]}
    reviewed_media = read("reviewed-campus-media-oct10")["records"] + read("reviewed-scholarship-campus-media")["records"]
    offers = Counter(r["university_id"] for r in reviewed_programmes)
    requirements_by_id = Counter(r["university_id"] for r in requirements)
    media_by_id = Counter(r["university_id"] for r in reviewed_media)
    inventory_rows = []
    for row in rows:
        uid, domain = row["id"], host(row.get("website"))
        domain = domain.removeprefix("web.") if domain == "web.mit.edu" else domain
        official_links = web.get(uid, {}).get("links", {})
        source_categories = sorted(k for k, v in official_links.items() if belongs(v.get("url"), domain)) if domain else []
        existing_photos = [m for m in legacy.get(uid, {}).get("media", []) if m.get("kind") == "campus" and m.get("license") and m.get("source_url")]
        flags = {
            "historical_completion_fields": len(completions.get(uid, [])),
            "publisher_subject_labels": len(publisher.get(uid, {}).get("subjects", [])),
            "official_catalogue_programme_rows": len(current_programmes.get(domain, [])),
            "reviewed_current_offers": offers[uid],
            "reviewed_requirement_rows": requirements_by_id[uid],
            "admission_cohort_snapshot": domain in admissions,
            "official_web_receipt": uid in web,
            "first_party_resource_categories": source_categories,
            "institution_image_cached": uid in images,
            "reviewed_brand_asset": domain in logo_domains,
            "licensed_campus_photos": len(existing_photos) + media_by_id[uid],
            "biographical_records": sum(1 for p in people if p["domain"] == domain),
            "oct15_review_overlay": uid in overlay_ids,
        }
        supplement = supplemental.get(uid, {})
        for key in ["programmes", "admissions", "costs", "people", "student_stories", "videos", "gallery"]:
            flags["reviewed_oct15_" + key] = len(supplement.get(key, []))
        gaps = []
        if not flags["official_catalogue_programme_rows"] and not flags["reviewed_current_offers"] and not flags["reviewed_oct15_programmes"]:
            gaps.append("current_degree_offers")
        if not flags["reviewed_requirement_rows"]:
            gaps.append("scoped_entry_requirements")
        reviewed_resources = {item["kind"] for item in supplement.get("resources", []) if item.get("verification_status") == "verified"}
        if "admissions" not in source_categories and "admissions" not in reviewed_resources:
            gaps.append("first_party_admissions_link")
        if not flags["licensed_campus_photos"] and not flags["reviewed_oct15_gallery"]:
            gaps.append("licensed_campus_gallery")
        if not flags["reviewed_brand_asset"]:
            gaps.append("reviewed_brand_asset")
        if not flags["biographical_records"] and not flags["reviewed_oct15_people"]:
            gaps.append("sourced_people")
        if not any(p.get("category") == "University founders" or p.get("category") == "University founder" for p in supplement.get("people", [])):
            gaps.append("reviewed_institution_founder")
        if not flags["reviewed_oct15_videos"]:
            gaps.append("official_campus_video")
        if not flags["reviewed_oct15_student_stories"]:
            gaps.append("reviewed_public_student_stories")
        if "costs" not in source_categories and "costs" not in reviewed_resources:
            gaps.append("reviewed_official_cost_resource")
        if not flags["reviewed_oct15_costs"]:
            gaps.append("scoped_reviewed_oct15_cost_note")
        inventory_rows.append({"university_id": uid, "name": row["name"], "country_code": row["country_code"], "website": row.get("website"), "coverage": flags, "gaps": gaps})
    summary = {"institutions": len(rows), "country_uz_institutions": sum(r["country_code"] == "UZ" for r in rows)}
    for key in ["historical_completion_fields", "publisher_subject_labels", "official_catalogue_programme_rows", "reviewed_current_offers", "reviewed_requirement_rows", "admission_cohort_snapshot", "official_web_receipt", "institution_image_cached", "reviewed_brand_asset", "licensed_campus_photos", "biographical_records", "oct15_review_overlay"]:
        summary[key + "_institutions"] = sum(bool(r["coverage"][key]) for r in inventory_rows)
    for key in ["programmes", "admissions", "costs", "people", "student_stories", "videos", "gallery"]:
        summary["reviewed_oct15_" + key + "_institutions"] = sum(bool(r["coverage"]["reviewed_oct15_" + key]) for r in inventory_rows)
        summary["reviewed_oct15_" + key + "_records"] = sum(r["coverage"]["reviewed_oct15_" + key] for r in inventory_rows)
    output = {"generated_at": datetime.now(timezone.utc).isoformat(), "semantics": {"historical_completion_fields": "IPEDS 2024–25 completions. Historical reported subject/award combinations; not proof of a current programme or open intake.", "publisher_subject_labels": "Publisher classifications. Not a degree catalogue.", "official_catalogue_programme_rows": "Names and links previously collected from official catalogues; recheck current intake.", "reviewed_current_offers": "Separately reviewed programme evidence with level, scope and source.", "institution_image_cached": "An image-cache entry does not by itself establish brand accuracy or a reusable licence.", "oct15_review_overlay": "A bounded supplemental collection, not complete profile coverage."}, "summary": summary, "institutions": inventory_rows}
    REVIEW.mkdir(parents=True, exist_ok=True)
    (REVIEW / "coverage-inventory.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


def fetch_one(item):
    url = item["url"]
    request = urllib.request.Request(url, headers={"User-Agent": "CollegeStat public university source review/1.0"})
    now = datetime.now(timezone.utc).isoformat()
    try:
        with urllib.request.urlopen(request, timeout=18) as response:
            body = response.read(2_500_001)
            if len(body) > 2_500_000:
                raise ValueError("Source exceeds the 2.5 MB collection limit")
            final = response.url
            content_type = response.headers.get_content_type()
            if content_type not in {"text/html", "application/xhtml+xml"}:
                return {**item, "retrieved_at": now, "status": "not_html", "http_status": response.status, "final_url": final, "content_type": content_type, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
            page = Page(final)
            decoded = body.decode("utf-8", "replace")
            page.feed(decoded)
            ids = sorted(set(re.findall(r"(?:youtube(?:-nocookie)?\.com/(?:embed/|watch\?v=)|youtu\.be/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])", unquote(html.unescape(decoded)))))
            fingerprint = hashlib.sha256(url.encode()).hexdigest()[:18]
            cache = Path(tempfile.gettempdir()) / "collegestat-university-enrichment-oct15"
            cache.mkdir(exist_ok=True)
            (cache / (fingerprint + ".html")).write_bytes(body)
            interesting = [link for link in page.links if re.search(r"program|course|admi|tuition|fee|tour|youtube|student|computer|economics|software", link["url"] + " " + link["label"], re.I)]
            return {**item, "retrieved_at": now, "status": response.status, "final_url": final, "content_type": content_type, "title": " ".join(page.title.split()), "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "cache_file": str(cache / (fingerprint + ".html")), "youtube_ids_in_official_page": ids, "candidate_links": interesting[:120]}
    except Exception as error:
        return {**item, "retrieved_at": now, "status": "error", "error": str(error)}


def collect(manifest=None):
    data = json.loads(OVERLAY.read_text())
    candidates = {}
    by_id = {row["university_id"]: row for row in data["records"]}
    if manifest:
        sources = json.loads(Path(manifest).read_text())["sources"]
    else:
        sources = [{**resource, "university_id": row["university_id"]} for row in data["records"] for resource in row["resources"]]
    for resource in sources:
        row = by_id[resource["university_id"]]
        parsed_url = urlsplit(resource["url"])
        if parsed_url.scheme != "https" or parsed_url.username or parsed_url.password or parsed_url.port:
            raise ValueError("Only explicit public HTTPS sources may be fetched")
        if not belongs(resource["url"], row["official_domain"]) and not (row["official_domain"] == "mit.edu" and host(resource["url"]) == "mitadmissions.org"):
            raise ValueError("Source outside the university allowlist: " + resource["url"])
        candidates[resource["url"]] = {"url": resource["url"], "university_id": row["university_id"], "kind": resource["kind"]}
    REVIEW.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        receipts = list(pool.map(fetch_one, candidates.values()))
    (REVIEW / "source-receipts.json").write_text(json.dumps(receipts, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sources": len(receipts), "successful": sum(r["status"] == 200 for r in receipts), "errors": [{"url": r["url"], "error": r.get("error")} for r in receipts if r["status"] != 200]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="Fetch only the explicitly curated official sources. Does not publish candidates.")
    parser.add_argument("--manifest", help="Repeat all attempts from an explicit source manifest, including failed and rejected URLs.")
    args = parser.parse_args()
    inventory()
    if args.fetch:
        collect(args.manifest)
