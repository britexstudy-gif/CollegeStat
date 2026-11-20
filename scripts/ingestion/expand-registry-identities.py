#!/usr/bin/env python3
"""Append bounded ROR university identities; preserve existing IDs and profiles.

Dry-run creates a reproducible receipt and INSERT-only SQL batches. --apply also
appends the receipt to the installed directory. No ownership, accreditation,
rankings or admissions facts are inferred from registry membership.
"""
import argparse
import collections
import datetime
import hashlib
import json
import pathlib
import re
import unicodedata
import urllib.parse
import uuid
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "data/published"
ARCHIVE = ROOT / "data/raw/ror/v2.13-2026-09-22-ror-data.zip"
RECEIPT = OUT / "registry-identity-expansion-oct06.json"
RELEASE = "ROR 2.13 · 2026-09-22"
DOI = "https://doi.org/10.5281/zenodo.22902037"
UNIVERSITY = re.compile(r"\b(?:university|universities|universitas|universitat|universität|université|università|universita|universiteit|universitet|universiteti|universitatea|universite|universidad|universidade|universytet|uniwersytet|univerzita|univerza|univerzitet|университет\w*|університет\w*|универзитет\w*)\b|大学|大學|대학교", re.I)
UNIT = re.compile(r"\b(?:research|faculty|faculties|facultad|faculdade|department|institute|institut|instituto|center|centre|hospital|foundation|association|network|system|press|third age|primary|secondary|high school)\b", re.I)


def normalized_name(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value).casefold() if c.isalnum() and not unicodedata.combining(c))


def hostname(value):
    try:
        parsed = urllib.parse.urlparse(value)
        if parsed.scheme not in ("http", "https") or parsed.username or parsed.password:
            return ""
        host = (parsed.hostname or "").lower().removeprefix("www.")
        return host if "." in host and not host.endswith(("web.archive.org", "facebook.com", "linkedin.com", "youtube.com")) else ""
    except ValueError:
        return ""


def display_name(record):
    return next((n["value"] for n in record["names"] if "ror_display" in n["types"]), record["names"][0]["value"])


def build_plan(directory, registry, target):
    """Country/host/name identifiers hold ambiguity rather than fuzzy-merge."""
    present_ror = {r.get("ror") for r in directory}
    present_hosts = {(r["country_code"], hostname(r["website"])) for r in directory}
    present_names = {(r["country_code"], normalized_name(n)) for r in directory for n in [r["name"]] + r.get("aliases", []) if len(normalized_name(n)) >= 10}
    present_ids = {r["id"] for r in directory}
    country_counts = collections.Counter(r["country_code"] for r in directory)
    registry_by_id = {r["id"]: r for r in registry}
    registry_hosts = collections.defaultdict(set)
    for r in registry:
        if r["status"] == "active" and "education" in r["types"]:
            for loc in r["locations"]:
                for link in r["links"]:
                    if link["type"] == "website" and hostname(link["value"]):
                        registry_hosts[(loc["geonames_details"]["country_code"], hostname(link["value"]))].add(r["id"])
    held = collections.Counter()
    examples = collections.defaultdict(list)
    candidates = []
    def hold(r, reason):
        held[reason] += 1
        if len(examples[reason]) < 8:
            examples[reason].append({"ror": r["id"], "name": display_name(r)})
    for r in registry:
        if r["id"] in present_ror or r["status"] != "active" or "education" not in r["types"]:
            continue
        name = display_name(r)
        labels = [n["value"] for n in r["names"] if {"label", "ror_display"}.intersection(n["types"])]
        if not any(UNIVERSITY.search(n) for n in labels) or UNIT.search(name):
            hold(r, "non_university_or_research_unit"); continue
        countries = {l["geonames_details"]["country_code"] for l in r["locations"]}
        if len(countries) != 1:
            hold(r, "multiple_or_missing_countries"); continue
        country = next(iter(countries))
        if not re.fullmatch("[A-Z]{2}", country):
            hold(r, "invalid_country_code"); continue
        # Current active US four-year identities are already covered by HD2025.
        if country == "US":
            hold(r, "us_requires_current_ipeds_corroboration"); continue
        if any(rel["type"].casefold() == "parent" and "education" in registry_by_id.get(rel["id"], {}).get("types", []) for rel in r["relationships"]):
            hold(r, "education_parent_or_constituent_campus"); continue
        links = [l["value"] for l in r["links"] if l["type"] == "website" and hostname(l["value"])]
        if not links:
            hold(r, "no_registered_website"); continue
        hosts = {hostname(s) for s in links}
        names = {normalized_name(n["value"]) for n in r["names"] if len(normalized_name(n["value"])) >= 10}
        if any(len(registry_hosts[(country, h)]) != 1 for h in hosts):
            hold(r, "ambiguous_registry_website"); continue
        if any((country, h) in present_hosts for h in hosts):
            hold(r, "existing_website_identity"); continue
        if any((country, n) in present_names for n in names):
            hold(r, "existing_registered_name_or_alias"); continue
        candidates.append((country, name, r, links[0], hosts, names))
    # Bound the payload and expand countries with less existing coverage first.
    candidates.sort(key=lambda c: (country_counts[c[0]], c[0], normalized_name(c[1]), c[2]["id"]))
    added = []
    for country, name, r, website, hosts, names in candidates:
        if any((country, h) in present_hosts for h in hosts) or any((country, n) in present_names for n in names):
            hold(r, "duplicate_within_candidate_batch"); continue
        uid = str(uuid.uuid5(uuid.NAMESPACE_URL, r["id"]))
        if uid in present_ids:
            hold(r, "existing_canonical_id"); continue
        if len(directory) + len(added) >= target:
            hold(r, "bounded_target_capacity"); continue
        loc = next(l["geonames_details"] for l in r["locations"] if l["geonames_details"]["country_code"] == country)
        stem = re.sub("[^a-z0-9]+", "-", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()).strip("-")[:130] or "university"
        item = {"id": uid, "slug": stem + "-" + uid[:8], "name": name, "country_code": country, "country": loc["country_name"], "website": website, "domains": sorted(hosts), "ror": r["id"], "city": loc["name"], "latitude": loc["lat"], "longitude": loc["lng"], "aliases": list(dict.fromkeys(n["value"] for n in r["names"])), "identity_source": r["id"], "identity_release": RELEASE, "identity_retrieved_at": "2026-09-26", "external_ids": {x["type"]: x["preferred"] or x["all"][0] for x in r["external_ids"] if x["all"]}}
        if isinstance(r["established"], int) and 1 <= r["established"] <= 2100:
            item["founded_year"] = r["established"]
        added.append(item)
        present_ids.add(uid); present_ror.add(r["id"])
        present_hosts.update((country, h) for h in hosts)
        present_names.update((country, n) for n in names)
    assert len({r["id"] for r in directory + added}) == len(directory) + len(added)
    assert len({r["slug"] for r in directory + added}) == len(directory) + len(added)
    return added, dict(held), dict(examples), len(candidates)


def merge_receipt(directory, records):
    by_id = {r["id"]: r for r in directory}
    additions = []
    for row in records:
        if row["id"] in by_id:
            # A later staff correction is preserved; the stored route stays stable.
            assert by_id[row["id"]]["slug"] == row["slug"], "Conflicting canonical route"
            assert by_id[row["id"]].get("ror") == row["ror"], "Conflicting ROR identity"
        else:
            assert not any(r.get("ror") == row["ror"] or r["slug"] == row["slug"] for r in by_id.values()), "Duplicate identity or route"
            by_id[row["id"]] = row
            additions.append(row)
    return directory + additions


def write_sql(records, output=None):
    region_lookup = {}
    for quoted, plain, codes in re.findall(r'(?:"([^"]+)"|([A-Za-z]+)):\s*"([A-Z ]+)"', (ROOT / "lib/regions.ts").read_text()):
        region_lookup.update({country: quoted or plain for country in codes.split()})
    output = pathlib.Path(output) if output else ROOT / "outputs/registry-identities"
    output.mkdir(parents=True, exist_ok=True)
    batches = []
    for start in range(0, len(records), 250):
        rows = [{"id": r["id"], "slug": r["slug"], "name": r["name"], "country_code": r["country_code"], "city": r["city"], "region": region_lookup.get(r["country_code"]), "website": r["website"], "founded_year": r.get("founded_year"), "latitude": r["latitude"], "longitude": r["longitude"], "published": True, "reference_url": r["ror"], "reference_retrieved_at": r["identity_retrieved_at"], "identity_release": r["identity_release"], "identifiers": {"ror": r["ror"], **r["external_ids"]}, "aliases": r["aliases"]} for r in records[start:start+250]]
        payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).replace("'", "''")
        columns = "id uuid,slug text,name text,country_code text,city text,region text,website text,founded_year integer,latitude double precision,longitude double precision,published boolean,reference_url text,reference_retrieved_at timestamptz,identity_release text,identifiers jsonb,aliases jsonb"
        names = ",".join(c.split()[0] for c in columns.split(","))
        sql = f"begin;\ninsert into public.universities({names})\nselect {names} from jsonb_to_recordset('{payload}'::jsonb) as x({columns})\non conflict do nothing;\ncommit;\n"
        path = output / f"{1+start//250:02d}-identities.sql"
        path.write_text(sql)
        batches.append({"file": str(path), "records": len(rows), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    (output / "manifest.json").write_text(json.dumps({"mode": "additive_identity_only", "source": DOI, "count": len(records), "batch_size": 250, "batches": batches}, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--target", type=int, default=14000)
    parser.add_argument("--sql-from-receipt", action="store_true", help="Generate review SQL from the installed receipt, without requiring a raw cache or writing the catalogue")
    parser.add_argument("--output-dir", type=pathlib.Path)
    args = parser.parse_args()
    if args.sql_from_receipt:
        receipt = json.loads(RECEIPT.read_text())
        write_sql(receipt["records"], args.output_dir)
        print(json.dumps({"mode": "receipt_sql_only", "records": len(receipt["records"]), "remote_writes": False}))
        return
    directory_path = OUT / "global-directory.json"
    directory = json.loads(directory_path.read_text())
    assert args.target >= len(directory), "Target cannot remove installed identities"
    assert hashlib.md5(ARCHIVE.read_bytes()).hexdigest() == "a935217de21e7983b977f5419f1a6b20", "Official ROR archive checksum mismatch"
    if RECEIPT.exists():
        receipt = json.loads(RECEIPT.read_text())
        assert receipt["target"] == args.target
        merged = merge_receipt(directory, receipt["records"])
    else:
        with zipfile.ZipFile(ARCHIVE) as z:
            registry = json.loads(z.read(next(n for n in z.namelist() if n.endswith(".json"))))
        added, held, examples, eligible = build_plan(directory, registry, args.target)
        receipt = {"schema_version": 1, "reviewed_at": datetime.datetime.now(datetime.timezone.utc).date().isoformat(), "method": "Deterministic conservative registry identity selection; not a human site audit", "registry_release": RELEASE, "source_url": DOI, "license": "CC0", "source_sha256": hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(), "source_cached_at": "2026-09-26", "base_count": len(directory), "base_sha256": hashlib.sha256(directory_path.read_bytes()).hexdigest(), "target": args.target, "eligible_before_within_batch_dedup": eligible, "held_counts": held, "held_examples": examples, "limitations": ["ROR membership is identity evidence, not accreditation or a live website availability check.", "No public/private classification, admissions minima, rankings, tuition, scholarships, images or publication year is invented.", "Non-university units, shared websites, constituent campuses and ambiguous aliases are held.", "US additions require current IPEDS corroboration; no new US identities inferred from ROR alone.", "All previously installed profiles, IDs, slugs and observations remain unchanged."], "records": added}
        RECEIPT.write_text(json.dumps(receipt, ensure_ascii=False, separators=(",", ":")) + "\n")
        merged = directory + added
    assert len(merged) == args.target, f"Supported count {len(merged)} does not reach target {args.target}"
    assert merged[:len(directory)] == directory, "Existing profiles modified"
    write_sql(receipt["records"])
    if args.apply and len(merged) != len(directory):
        directory_path.write_text(json.dumps(merged, ensure_ascii=False, separators=(",", ":")) + "\n")
        (OUT / "directory-countries.json").write_text(json.dumps(dict(sorted({r["country_code"]: r["country"] for r in merged}.items())), indent=2) + "\n")
        manifest_path = OUT / "directory-manifest.json"
        manifest = json.loads(manifest_path.read_text())
        manifest.update(institutions=len(merged), catalogue_total=len(merged), countries=len({r["country_code"] for r in merged}), ror_linked=len({r["ror"] for r in merged if r.get("ror")}), sha256=hashlib.sha256(directory_path.read_bytes()).hexdigest(), latest_identity_review=receipt["reviewed_at"], registry_identity_additions=len(receipt["records"]), registry_identity_receipt=RECEIPT.name, identity_note="Active ROR Education university identities with unique country/registered website/name guards, existing corroborated publisher identities and active IPEDS institutions. Registry inclusion is not accreditation; registered links are not live availability guarantees.")
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"mode": "apply" if args.apply else "dry_run", "base_count": receipt["base_count"], "additions": len(receipt["records"]), "total": len(merged), "countries": len({r["country_code"] for r in merged}), "held_counts": receipt["held_counts"], "sql_manifest": "outputs/registry-identities/manifest.json"}, indent=2))


if __name__ == "__main__":
    main()
