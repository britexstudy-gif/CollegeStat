#!/usr/bin/env python3
"""Validate explicit resource reviews and preview an idempotent local merge.

This does not discover sources, promote agent facts, or write to a database.
Use --write only after reviewing the approved manifest and its exact evidence.
"""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "data/review/university-enrichment-oct16/approved-official-resources.json"
PUBLICATION = ROOT / "data/published/reviewed-university-enrichment-oct15.json"
SECTIONS = ["resources", "programmes", "admissions", "costs", "people", "student_stories", "videos", "gallery"]


def read(path):
    return json.loads(path.read_text())


def host(url):
    return (urlsplit(url).hostname or "").lower().removeprefix("www.")


def belongs(url, domain):
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port:
        return False
    name = host(url)
    return name == domain or name.endswith("." + domain) or domain == "mit.edu" and name == "mitadmissions.org" or domain == "dur.ac.uk" and (name == "durham.ac.uk" or name.endswith(".durham.ac.uk"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Merge reviewed links into the local published supplement, after validation")
    args = parser.parse_args()
    manifest = read(MANIFEST)
    identities = {row["id"]: row for row in read(ROOT / "data/published/global-directory.json")}
    browser_reviews = {row["url"]: row for row in read(ROOT / "data/review/university-enrichment-oct15/browser-source-reviews.json")}
    receipt_files = {}
    data = read(PUBLICATION)
    records = {row["university_id"]: row for row in data["records"]}
    additions = 0
    for selected in manifest["records"]:
        if selected.get("verification_status") != "verified" or not selected.get("review_method"):
            raise ValueError("Resource has not been explicitly reviewed")
        identity = identities[selected["university_id"]]
        domain = host(identity["website"])
        domain = "mit.edu" if domain == "web.mit.edu" else domain
        if not belongs(selected["url"], domain):
            raise ValueError("Resource outside the exact institution's source domain: " + selected["url"])
        if selected.get("receipt_file"):
            file = selected["receipt_file"]
            if not file.startswith("data/review/") or ".." in Path(file).parts:
                raise ValueError("Receipt pointer must stay in the review directory")
            receipts = receipt_files.setdefault(file, read(ROOT / file)["receipts"])
            proof = next((row for row in receipts if row["university_id"] == identity["id"] and row["url"] == selected["receipt_url"] and row.get("status") == 200), None)
            if not proof or not proof.get("title") or proof.get("sha256") != selected.get("sha256"):
                raise ValueError("Missing exact successful source receipt: " + selected["url"])
            if proof.get("final_url", proof["url"]) != selected["url"]:
                raise ValueError("Reviewed URL differs from receipt's final URL")
        elif selected.get("browser_review"):
            proof = browser_reviews.get(selected["url"])
            if not proof or proof["university_id"] != identity["id"]:
                raise ValueError("Missing exact primary-source browser review")
        else:
            raise ValueError("Resource has no source-review evidence")
        row = records.setdefault(identity["id"], {"university_id": identity["id"], "university_name": identity["name"], "country_code": identity["country_code"], "official_domain": domain, "checked_at": manifest["reviewed_at"], **{key: [] for key in SECTIONS}})
        if row["university_name"] != identity["name"] or row["country_code"] != identity["country_code"]:
            raise ValueError("Published record differs from exact catalogue identity")
        if any(resource["url"] == selected["url"] and resource["kind"] == selected["kind"] for resource in row["resources"]):
            continue
        label = re.split(r"Toggle Submenu|Icon/Social|navSearch|Facebook|searchSearch|TU Delft homepage|University of AmsterdamUniversity", selected["source_title"])[0].strip()[:140]
        if not label:
            raise ValueError("A reviewed resource needs a useful label")
        row["resources"].append({"kind": selected["kind"], "label": label, "url": selected["url"], "scope": selected["scope"], "checked_at": selected["checked_at"], "verification_status": "verified"})
        row["checked_at"] = manifest["reviewed_at"]
        additions += 1
    data["records"] = list(records.values())
    data["summary"] = {key: sum(len(row.get(key, [])) for row in data["records"]) for key in SECTIONS}
    data["summary"]["institutions"] = len(records)
    data["summary"]["reviewed_founding_years"] = sum(bool(row.get("identity")) for row in data["records"])
    cohort = read(ROOT / "data/review/university-agent-batch-oct15.json")["universities"]
    data["summary"]["research_cohort_institutions"] = sum(row["id"] in records for row in cohort)
    if args.write:
        PUBLICATION.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"valid": True, "mode": "write_local_supplement" if args.write else "preview", "new_links": additions, "approved_source_links": len(manifest["records"]), "summary": data["summary"]}, indent=2))


if __name__ == "__main__":
    main()
