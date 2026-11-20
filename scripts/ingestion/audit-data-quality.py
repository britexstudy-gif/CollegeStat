#!/usr/bin/env python3
"""Deterministic local coverage/evidence audit; never fetches or mutates datasets.

An observation year is not a retrieval date. Sparse coverage and old reporting
periods are reported as gaps, not silently converted to zero or fresh facts.
"""
import argparse
from collections import Counter, defaultdict
import datetime
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
PUBLISHED = ROOT / "data/published"


def load(name, inputs):
    path = PUBLISHED / name
    body = path.read_bytes()
    inputs.append({"path": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(body).hexdigest()})
    return json.loads(body)


def https(value):
    return isinstance(value, str) and urlparse(value).scheme == "https" and bool(urlparse(value).hostname)


def host(value):
    if not isinstance(value, str): return None
    hostname = urlparse(value if "://" in value else "https://" + value).hostname
    return hostname.removeprefix("www.") if hostname else None


def checked_date(value):
    try:
        return datetime.date.fromisoformat(value[:10]) if isinstance(value, str) else None
    except ValueError:
        return None


def freshness(values, as_of, days):
    stamps = [checked_date(v) for v in values]
    valid = [stamp for stamp in stamps if stamp]
    return {"oldest_check": min(valid).isoformat() if valid else None,
            "latest_check": max(valid).isoformat() if valid else None,
            "missing_or_invalid_check": sum(stamp is None for stamp in stamps),
            "checks_after_as_of": sum(stamp > as_of for stamp in valid),
            "checks_older_than_review_window": sum((as_of - stamp).days > days for stamp in valid)}


def evidence_rows(rows, ids, as_of, days):
    """Compare sourced observations without interpreting a missing value as zero."""
    missing = Counter()
    stamps = []
    source_urls = set()
    for row in rows:
        ev = row.get("evidence") or {}
        source = row.get("data_sources") or {}
        url = row.get("source_url") or source.get("url")
        if not https(url): missing["https_source_url"] += 1
        elif url: source_urls.add(url)
        if not row.get("source_id"): missing["source_id"] += 1
        if not row.get("student_category") and not ev.get("population"): missing["applicant_population"] += 1
        if not ev.get("scope"): missing["structured_scope"] += 1
        if not ev.get("reporting_period"): missing["structured_reporting_period"] += 1
        if "publication_year" not in ev: missing["explicit_publication_year_or_null"] += 1
        stamps.append(row.get("verified_at") or row.get("retrieved_at") or source.get("retrieved_at"))
    university_ids = {r.get("university_id") for r in rows}
    return {"rows": len(rows), "covered_universities": len(university_ids & ids),
            "uncovered_catalogue_universities": len(ids - university_ids),
            "orphaned_university_ids": sorted(str(v) for v in university_ids - ids),
            "distinct_https_source_urls": len(source_urls), "missing_evidence_fields": dict(sorted(missing.items())),
            "freshness": freshness(stamps, as_of, days)}


def audit(as_of, review_days):
    inputs = []
    directory = load("global-directory.json", inputs)
    ids = {u["id"] for u in directory}
    rors = defaultdict(list); unitids = defaultdict(list); hosts = defaultdict(set)
    for university in directory:
        if university.get("ror"): rors[university["ror"]].append(university["id"])
        unitid = university.get("unitid")
        if unitid: unitids[str(unitid)].append(university["id"])
        for url in [university.get("website"), *(university.get("domains") or [])]:
            if host(url): hosts[host(url)].add(university["id"])
    id_expansion = load("reviewed-identity-expansion.json", inputs)
    requirements = load("requirements-current.json", inputs)
    new_requirements = load("reviewed-requirements-oct05.json", inputs)
    dates = load("application-dates-current.json", inputs)
    rounds = load("reviewed-application-rounds-oct05.json", inputs)
    fees = load("application-fees-current.json", inputs)
    programs = load("official-programs.json", inputs)
    oa = load("reviewed-openalex-metrics.json", inputs)
    aid = load("reviewed-ipeds-aid.json", inputs)
    leiden = load("reviewed-leiden-expansion.json", inputs)
    enrichment = load("profile-enrichment.json", inputs)
    rankings = load("ranking-all.json", inputs)
    regional = load("regional-rankings.json", inputs)
    imported = load("imported.json", inputs)
    scorecard = load("scorecard-field-definitions.json", inputs)
    duplicate_unitids = {key: sorted(value) for key, value in unitids.items() if len(value) > 1}
    duplicates = lambda rows: sorted(key for key, n in Counter(r.get("id") for r in rows).items() if key and n > 1)
    program_identities = {next(iter(hosts[h])) for h in programs if len(hosts[h]) == 1}
    annual_oa = [r for r in oa["records"] if r.get("reporting_year") is not None]
    aid_values = [(field, value) for row in aid["records"] for field, value in row["values"].items()]
    leiden_values = [value for row in leiden["records"] for value in row["values"].values()]
    new_leiden = sum(not value["already_published"] for value in leiden_values)
    assets = [asset for profile in enrichment.values() for asset in profile.get("media", [])]
    media_gaps = Counter()
    for asset in assets:
        for field in ["source_url", "license", "license_url", "creator"]:
            if not asset.get(field): media_gaps[field] += 1
        if asset.get("creator", "").lower().startswith("unknown"): media_gaps["creator_unknown"] += 1
        if asset.get("reuse_permitted") is False: media_gaps["explicitly_disallowed_reuse"] += 1
    repairs = set(leiden["quality_repairs"]["incorrect_pilot_observation_ids"])
    repaired = [row for row in imported["records"] if row["id"] in repairs]
    regional_matches = [(row, hosts.get(host(row.get("domain")), set())) for row in regional]
    gaps = []
    if duplicate_unitids:
        gaps.append({"area": "identity", "severity": "review", "message": "Ambiguous UNITIDs are excluded from automatic financial-aid identity joins.", "count": len(duplicate_unitids)})
    for name, rows in [("requirements", requirements), ("application_rounds", dates), ("application_fees", fees)]:
        covered = len({r["university_id"] for r in rows} & ids)
        gaps.append({"area": name, "severity": "coverage", "message": "No sourced observation is linked for these catalogue identities; absence does not mean zero or no requirement.", "count": len(ids) - covered})
    gaps.append({"area": "regional_rankings", "severity": "coverage", "message": "Sourced selection only; regional positions are not inferred from a filtered world table.", "count": len(regional)})
    unknown_type = sum(not u.get("university_type") or u.get("university_type") == "Unknown" for u in directory)
    if unknown_type:
        gaps.append({"area": "institution_control", "severity": "coverage", "message": "Public/private status is unknown until supported by a trusted identity or official source.", "count": unknown_type})
    integrity = []
    for name, rows in [("directory", directory), ("requirements", requirements), ("deadlines", dates), ("fees", fees), ("openalex", oa["records"])]:
        repeated = duplicates(rows)
        if repeated: integrity.append({"area": name, "problem": "duplicate_record_ids", "ids": repeated})
    for name, actual, declared in [("requirements", len(new_requirements["records"]), new_requirements["counts"]["requirements"]),
                                   ("application_rounds", len(rounds["records"]), rounds["counts"]["deadlines"]),
                                   ("ipeds_aid", len(aid_values), aid["counts"]["observations"]),
                                   ("leiden", new_leiden, leiden["counts"]["new_observations"])]:
        if actual != declared: integrity.append({"area": name, "problem": "receipt_count_mismatch", "actual": actual, "declared": declared})
    for name, rows in [("openalex", oa["records"]), ("ipeds_aid", aid["records"]), ("leiden", leiden["records"])]:
        orphaned = sorted({r["university_id"] for r in rows} - ids)
        if orphaned: integrity.append({"area": name, "problem": "orphaned_university_ids", "ids": orphaned})
    return {"schema_version": 1, "as_of": as_of.isoformat(),
            "scope": "Local published files and reviewed receipts only; this report does not prove hosted database installation.",
            "review_window_days": review_days,
            "freshness_rule": "Age describes the source check, not the observation period. Older checks need review; they are not automatically false.",
            "catalogue": {"universities": len(directory), "countries": len({u.get("country_code") for u in directory if u.get("country_code")}),
                          "ror_linked": sum(bool(u.get("ror")) for u in directory), "unitid_linked": sum(bool(u.get("unitid")) for u in directory),
                          "institution_control": dict(sorted(Counter(u.get("university_type") or "Unknown" for u in directory).items())),
                          "duplicate_rors": {key: value for key, value in sorted(rors.items()) if len(value) > 1},
                          "ambiguous_unitids": dict(sorted(duplicate_unitids.items())),
                          "reviewed_identity_additions": len(id_expansion["records"]),
                          "reviewed_additions_matching_unique_catalogue_ror": sum(len(rors.get(r["ror"], [])) == 1 for r in id_expansion["records"])},
            "requirements": evidence_rows(requirements, ids, as_of, review_days),
            "new_scoped_requirements": {**evidence_rows(new_requirements["records"], ids, as_of, review_days),
                                        "without_explicit_policy_reporting_period": sum(not r.get("evidence", {}).get("reporting_period") for r in new_requirements["records"]),
                                        "rule": "When the official policy states no cycle or reporting period, do not invent one from the retrieval date."},
            "application_rounds": {**evidence_rows(dates, ids, as_of, review_days),
                                   "date_only_deadlines": sum(isinstance(r.get("due_at"), str) and len(r["due_at"]) == 10 for r in dates),
                                   "deadlines_before_as_of": sum(bool(checked_date(r.get("due_at"))) and checked_date(r["due_at"]) < as_of for r in dates),
                                   "missing_timezone_for_instant": sum("T" in str(r.get("due_at")) and not r.get("timezone") for r in dates)},
            "application_fees": {**evidence_rows(fees, ids, as_of, review_days), "currencies": dict(sorted(Counter(r["currency"] for r in fees).items())), "not_annual_tuition": True},
            "official_programs": {"rows": sum(len(rows) for rows in programs.values()), "covered_domains": len(programs),
                                  "covered_universities_exact_host": len(program_identities),
                                  "unmatched_or_ambiguous_domains": sorted(h for h in programs if len(hosts[h]) != 1),
                                  "new_requirements_programs": len(new_requirements["programs"]), "new_application_round_programs": len(rounds["programs"])},
            "openalex": {"rows": len(oa["records"]), "universities": len({r["university_id"] for r in oa["records"]}),
                         "source_response_versions": len({(r["university_id"], r["evidence"]["dataset_sha256"]) for r in oa["records"]}),
                         "metrics": dict(sorted(Counter(r["metric"] for r in oa["records"]).items())),
                         "annual_periods": sorted({r["period"] for r in annual_oa}),
                         "partial_retrieval_year_rows": sum(r["reporting_year"] == checked_date(r["retrieved_at"]).year for r in annual_oa),
                         "excluded_source_rollups": len(oa["excluded"]), "source_gaps": oa["gaps"], "license": oa["license"],
                         "freshness": freshness([r["retrieved_at"] for r in oa["records"]], as_of, review_days),
                         "interpretation": "Yearly citation counts are provider rollups, not citations received that year. Indexed counts do not establish university quality."},
            "ipeds_financial_aid": {"receipt_status": aid["status"], "universities": len(aid["records"]), "observations": len(aid_values),
                                    "selected_dictionary_fields": len(aid["mappings"]), "reporting_period": aid["source"]["period"],
                                    "reporting_year": aid["source"]["reporting_year"], "source": aid["source"], "dictionary": aid["dictionary"],
                                    "ambiguous_unitids_excluded": len(aid["identity_review"]),
                                    "unsupported_flags": dict(sorted(Counter(v.get("flag") for _, v in aid_values if v.get("flag") not in ("R", "Z")).items())),
                                    "invalid_values": sum(isinstance(v.get("value"), bool) or not isinstance(v.get("value"), (int, float)) or v["value"] < 0 for _, v in aid_values),
                                    "public_application_rule": "Pending source-record review; recipient averages are not promised awards, tuition or international eligibility."},
            "leiden": {"receipt_status": leiden["status"], "universities": len(leiden["records"]), "new_observations": new_leiden,
                       "already_published_correct_observations": len(leiden_values) - new_leiden,
                       "unmatched_source_identities": len(leiden["identity_review"]), "context": leiden["context"], "source": leiden["source"],
                       "pilot_labels_requiring_hold": len(repairs), "pilot_records_retained_locally": len(repaired),
                       "pilot_records_still_verified_and_published": sum(r.get("verification_status") == "verified" and r.get("publication_status") == "published" for r in repaired),
                       "ordinal_rank_created": False},
            "scorecard_adapter": {"dictionary_fields": len(scorecard["definitions"]), "source": scorecard["source"],
                                  "rule": "Dictionary-backed adapter support is not new observation coverage. Use the actual file-specific cohort; refuse an unknown cohort."},
            "rankings": {"publisher_rows": len(rankings), "linked_rows": sum(r.get("university_id") in ids for r in rankings),
                         "unmatched_rows": sum(not r.get("university_id") for r in rankings),
                         "provider_editions": dict(sorted(Counter(f'{r["provider"]}:{r["year"]}' for r in rankings).items())),
                         "regional_selection_rows": len(regional), "regional_rows_with_exact_profile_host": sum(len(found) == 1 for _, found in regional_matches),
                         "regional_unmatched_or_ambiguous": [{"name": row["name"], "domain": row["domain"], "candidate_count": len(found)} for row, found in regional_matches if len(found) != 1]},
            "media": {"enriched_profiles": len(enrichment), "profiles_with_media": sum(bool(p.get("media")) for p in enrichment.values()),
                      "assets": len(assets), "kinds": dict(sorted(Counter(a.get("kind", "unknown") for a in assets).items())),
                      "attribution_gaps": dict(sorted(media_gaps.items())),
                      "rule": "Retain source, creator, license and license URL. A missing reuse flag is not a new licensing permission."},
            "integrity_issues": integrity, "evidence_and_coverage_gaps": gaps, "inputs": sorted(inputs, key=lambda row: row["path"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of", type=datetime.date.fromisoformat, default=datetime.date(2026, 10, 6))
    parser.add_argument("--review-days", type=int, default=180)
    parser.add_argument("--out", type=Path, help="Optional JSON output inside ignored outputs/; otherwise print JSON")
    args = parser.parse_args()
    if args.review_days < 1: parser.error("review-days must be positive")
    if args.out and not args.out.resolve().is_relative_to((ROOT / "outputs").resolve()):
        parser.error("output must be inside outputs/; dataset paths are never writable by this audit")
    report = audit(args.as_of, args.review_days)
    body = json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(body)
        print(json.dumps({"output": str(args.out), "universities": report["catalogue"]["universities"], "integrity_issues": len(report["integrity_issues"])}))
    else:
        print(body, end="")
    return int(bool(report["integrity_issues"]))


if __name__ == "__main__":
    raise SystemExit(main())
