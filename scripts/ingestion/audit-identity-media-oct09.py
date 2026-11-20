#!/usr/bin/env python3
"""Reproducible local audit of installed university identities and media.

Read-only over existing published datasets and UI libraries. Writes only to
outputs/identity-media-oct09/. No network, no hosted writes, no crawling,
no credential access. Uses already-cached evidence first.

Covers:
  - exact installed identity coverage (14,000 catalogue rows)
  - duplicate ROR / UNITID / domain(host) / name conflicts
  - logo vs campus attribution gaps
  - known verified official logos vs explicitly labelled fallback initials
  - ranked identities awaiting review (world unmatched + national held)
  - a bounded deterministic manifest of highest-confidence next review
    actions linking existing UUIDs and exact official/Wikimedia/ROR evidence

Licence boundaries enforced here, not inferred elsewhere:
  - ROR metadata is CC0; GeoNames location metadata via ROR is CC BY 4.0.
  - Each Wikimedia Commons file carries its own image licence; a Commons
    thumbnail URL without per-file creator/licence is NOT a verified logo.
  - A website favicon (icon_url) is NEVER an official logo.
  - One institution's mark is never borrowed for another institution.
  - ROR membership is not accreditation, ownership, or proof of a logo.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
OUT_DEFAULT = ROOT / "outputs" / "identity-media-oct09"

MAX_ACTIONS_DEFAULT = 20
MAX_PRIMARY_URLS = 5

ROR_DOI = "https://doi.org/10.5281/zenodo.22902037"
GEONAMES_HOME = "https://www.geonames.org/"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path):
    return json.loads(path.read_text())


def hostname(site: str | None) -> str:
    try:
        if not site:
            return ""
        value = urlparse(site)
        if value.scheme not in ("https", "http") or not value.hostname or value.username:
            return ""
        return value.hostname.lower().removeprefix("www.")
    except ValueError:
        return ""


def official_match(host: str, domain: str) -> str | None:
    """Return 'exact' or 'subdomain_suffix', else None. Never fuzzy-matches."""
    if not host or not domain:
        return None
    domain = domain.lower()
    if host == domain:
        return "exact"
    if host.endswith("." + domain):
        return "subdomain_suffix"
    return None


def parse_bundled_marks(path: Path) -> list[dict]:
    """Parse lib/university-assets.ts universityMarks without executing it."""
    text = path.read_text()
    marks = []
    for block in re.findall(r"\{[^{}]*?slug:\s*\"([^\"]+)\"[^{}]*?\}", text, re.S):
        slug = block
        local = re.search(r'local:\s*"([^"]+)"', block)
        remote = re.search(r'remote:\s*"([^"]+)"', block)
        source = re.search(r'source:\s*"([^"]+)"', block)
        marks.append({
            "slug": slug,
            "local": local.group(1) if local else None,
            "remote": remote.group(1) if remote else None,
            "source": source.group(1) if source else None,
        })
    return marks


def ui_uses_initials_fallback(path: Path) -> bool:
    text = path.read_text()
    return "institution-monogram" in text and "initials" in text


def rank_sort_key(record: dict) -> tuple:
    rank = record.get("rank")
    try:
        rank_num = int(rank) if rank is not None else None
    except (TypeError, ValueError):
        rank_num = None
    if rank_num is None:
        # Band labels such as "=70" or "1001-1200" sort by their leading
        # integer so "best-ranked" slices are genuinely the best rows.
        match = re.match(r"\s*=?\s*(\d+)", str(record.get("rank_label") or ""))
        rank_num = int(match.group(1)) if match else 10**9
    return (rank_num, str(record.get("rank_label") or ""), str(record.get("name") or ""))


def build_audit(max_actions: int = MAX_ACTIONS_DEFAULT) -> tuple[dict, dict]:
    # ---- load already-cached evidence (no network) ----
    catalogue = load_json(ROOT / "data/published/global-directory.json")
    manifest = load_json(ROOT / "data/published/directory-manifest.json")
    official_logos = load_json(ROOT / "data/published/official-logos.json")
    image_cache = load_json(ROOT / "data/published/institution-image-cache.json")
    campus_checks = load_json(ROOT / "data/published/campus-media-checks.json")
    web_profiles = load_json(ROOT / "data/published/official-web-profiles.json")
    enrichment = load_json(ROOT / "data/published/profile-enrichment.json")
    openalex = load_json(ROOT / "data/published/openalex-current.json")
    ranking_records = load_json(ROOT / "data/published/ranking-records.json")
    ranking_unmatched = load_json(ROOT / "data/published/ranking-unmatched.json")
    reconciliation = load_json(ROOT / "data/published/ranking-identity-reconciliation.json")
    national = load_json(ROOT / "data/published/reviewed-national-ranking-identities.json")
    redirects = load_json(ROOT / "data/published/identity-redirects.json")
    registry_receipt = load_json(ROOT / "data/published/registry-identity-expansion-oct06.json")
    bundled_marks = parse_bundled_marks(ROOT / "lib/university-assets.ts")
    initials_fallback = ui_uses_initials_fallback(ROOT / "components/college/primitives.tsx")

    by_id = {c["id"]: c for c in catalogue}
    cat_ids = set(by_id)

    inputs = {}
    for rel in [
        "data/published/global-directory.json",
        "data/published/directory-manifest.json",
        "data/published/official-logos.json",
        "data/published/institution-image-cache.json",
        "data/published/campus-media-checks.json",
        "data/published/official-web-profiles.json",
        "data/published/profile-enrichment.json",
        "data/published/openalex-current.json",
        "data/published/ranking-records.json",
        "data/published/ranking-unmatched.json",
        "data/published/ranking-identity-reconciliation.json",
        "data/published/reviewed-national-ranking-identities.json",
        "data/published/identity-redirects.json",
        "data/published/registry-identity-expansion-oct06.json",
        "lib/university-assets.ts",
        "components/college/primitives.tsx",
    ]:
        inputs[rel] = sha256_file(ROOT / rel)

    # ---- identity coverage ----
    ror_linked = sum(1 for c in catalogue if c.get("ror"))
    ror_missing = len(catalogue) - ror_linked
    unitid_rows = [c for c in catalogue if c.get("unitid")]
    unitid_by_value: dict[str, list[dict]] = collections.defaultdict(list)
    for c in unitid_rows:
        unitid_by_value[str(c["unitid"])].append(c)
    duplicate_unitid = sorted(
        ({"unitid": k, "university_ids": sorted(x["id"] for x in v),
          "names": sorted({x["name"] for x in v}),
          "websites": sorted({x.get("website") or "" for x in v})}
         for k, v in unitid_by_value.items() if len(v) > 1),
        key=lambda d: d["unitid"],
    )
    duplicate_ror_list = sorted(
        [{"ror": k, "university_ids": sorted(x["id"] for x in v)}
         for k, v in collections.defaultdict(list, {
             ror: [c for c in catalogue if c.get("ror") == ror]
             for ror in {c.get("ror") for c in catalogue if c.get("ror")}}.items()).items()
         if len(v) > 1],
        key=lambda d: d["ror"],
    )

    host_groups: dict[str, list[dict]] = collections.defaultdict(list)
    host_country_groups: dict[tuple, list[dict]] = collections.defaultdict(list)
    for c in catalogue:
        host = hostname(c.get("website"))
        if not host:
            continue
        host_groups[host].append(c)
        host_country_groups[(c.get("country_code"), host)].append(c)
    shared_hosts = sorted(
        ({"host": h, "row_count": len(v),
          "cross_country": len({x.get("country_code") for x in v}) > 1,
          "university_ids": sorted(x["id"] for x in v),
          "sample": [{"id": x["id"], "name": x["name"],
                      "country_code": x.get("country_code"),
                      "ror": x.get("ror"), "website": x.get("website")} for x in sorted(v, key=lambda x: x["id"])[:4]]}
         for h, v in host_groups.items() if len(v) > 1),
        key=lambda d: (-d["row_count"], d["host"]),
    )
    name_country: dict[tuple, list[dict]] = collections.defaultdict(list)
    for c in catalogue:
        name_country[(c.get("country_code"), (c.get("name") or "").strip().lower())].append(c)
    duplicate_name_country = sorted(
        ({"country_code": k[0], "name_key": k[1], "row_count": len(v),
          "university_ids": sorted(x["id"] for x in v)}
         for k, v in name_country.items() if len(v) > 1),
        key=lambda d: (-d["row_count"], d["name_key"]),
    )

    # ---- media coverage ----
    official_domains = [e["domain"].lower() for e in official_logos]
    exact_official_rows: list[dict] = []
    suffix_official_rows: list[dict] = []
    for c in catalogue:
        host = hostname(c.get("website"))
        for entry in official_logos:
            kind = official_match(host, entry["domain"].lower())
            if kind == "exact":
                exact_official_rows.append({"id": c["id"], "name": c["name"],
                                            "website": c.get("website"),
                                            "domain": entry["domain"],
                                            "local": entry.get("local"),
                                            "ror": c.get("ror")})
            elif kind == "subdomain_suffix":
                suffix_official_rows.append({"id": c["id"], "name": c["name"],
                                             "website": c.get("website"),
                                             "domain": entry["domain"],
                                             "local": entry.get("local"),
                                             "ror": c.get("ror")})
    exact_official_rows.sort(key=lambda r: (r["domain"], r["id"]))
    suffix_official_rows.sort(key=lambda r: (r["domain"], r["id"]))

    enrichment_with_logo = sorted(k for k, v in enrichment.items()
                                  if any(m.get("kind") == "logo" and m.get("creator")
                                         and m.get("license") and m.get("source_url")
                                         for m in v.get("media", [])))
    enrichment_with_campus = sorted(k for k, v in enrichment.items()
                                    if any(m.get("kind") == "campus" and m.get("creator")
                                           and m.get("license") and m.get("source_url")
                                           for m in v.get("media", [])))
    enrichment_attribution_gaps = sorted(
        k for k, v in enrichment.items()
        for m in v.get("media", [])
        if not (m.get("creator") and m.get("license") and m.get("source_url")))
    image_cache_unattributed = sorted(
        k for k, v in image_cache.items()
        if not (v.get("creator") and v.get("license")))
    openalex_logo_count = sum(1 for v in openalex.values() if v.get("logo_url"))
    webprofile_icon_count = sum(1 for v in web_profiles.values() if v.get("icon_url"))

    official_id_set = {r["id"] for r in exact_official_rows}
    campus_check_set = {e["university_id"] for e in campus_checks}
    enrichment_media_set = {k for k, v in enrichment.items() if v.get("media")}
    image_cache_set = {k for k in image_cache if k in cat_ids}
    openalex_logo_set = {k for k, v in openalex.items() if v.get("logo_url") and k in cat_ids}
    icon_set = {k for k in web_profiles if k in cat_ids and web_profiles[k].get("icon_url")}

    tiers: dict[str, list[str]] = {
        "official_verified": sorted(official_id_set),
        "attributed_wikimedia_review": sorted(
            (set(enrichment_with_logo) | set(enrichment_with_campus) | campus_check_set) - official_id_set),
        "unattributed_thumbnail_only": sorted(
            ((image_cache_set | openalex_logo_set) - official_id_set - enrichment_media_set - campus_check_set)),
        "icon_only_or_fallback_initials": [],
    }
    covered = set(tiers["official_verified"]) | set(tiers["attributed_wikimedia_review"]) | set(tiers["unattributed_thumbnail_only"])
    tiers["icon_only_or_fallback_initials"] = sorted(cat_ids - covered)
    icon_only = sorted((icon_set - covered) & cat_ids)
    pure_fallback = sorted(cat_ids - covered - icon_set)

    # ---- ranked identities ----
    linked_ids = sorted({r["university_id"] for r in ranking_records if r.get("university_id")})
    unmatched_by_provider = collections.Counter((r.get("provider"), r.get("year")) for r in ranking_unmatched)
    held_by_reason = collections.Counter(h.get("reason") for h in national.get("held", []))
    proposals = national.get("identity_proposals", [])
    mappings = national.get("mappings", [])

    ranked_tiers = {
        tier: sum(1 for uid in linked_ids if uid in set(ids))
        for tier, ids in tiers.items()
    }

    audit = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).date().isoformat(),
        "method": "local read-only audit of already-cached evidence; no network, no hosted writes, no crawling",
        "inputs_sha256": inputs,
        "licence_boundaries": {
            "ror": "CC0-1.0; registry membership is not accreditation, ownership, or proof of a logo",
            "geonames_via_ror": "CC BY 4.0; location attribution separate from image permissions",
            "wikimedia_commons": "per-file licence; a thumbnail URL without creator/licence/source is not a verified logo",
            "official_marks": "official site marks; trademark retained; favicons are identification icons, never official logos",
        },
        "identity": {
            "catalogue_total": len(catalogue),
            "manifest_institutions": manifest.get("institutions"),
            "manifest_countries": manifest.get("countries"),
            "ror_linked": ror_linked,
            "ror_missing": ror_missing,
            "ipeds_year": manifest.get("ipeds_year"),
            "ipeds_linked_manifest": manifest.get("ipeds_linked"),
            "unitid_rows": len(unitid_rows),
            "unitid_distinct": len(unitid_by_value),
            "duplicate_ror_groups": duplicate_ror_list,
            "duplicate_ror_group_count": len(duplicate_ror_list),
            "duplicate_unitid_groups": duplicate_unitid,
            "duplicate_unitid_group_count": len(duplicate_unitid),
            "distinct_website_hosts": len(host_groups),
            "shared_host_group_count": len(shared_hosts),
            "shared_host_row_count": sum(g["row_count"] for g in shared_hosts),
            "shared_hosts_top10": shared_hosts[:10],
            "shared_hosts_full": shared_hosts,
            "duplicate_name_country_group_count": len(duplicate_name_country),
            "duplicate_name_country_row_count": sum(g["row_count"] for g in duplicate_name_country),
            "duplicate_name_country_groups": duplicate_name_country,
            "suffix_official_collisions": suffix_official_rows,
            "identity_redirect_count": len(redirects),
        },
        "media": {
            "official_logo_domain_records": len(official_logos),
            "official_logo_domains": sorted(official_domains),
            "official_exact_catalogue_rows": len(exact_official_rows),
            "official_exact_rows": exact_official_rows,
            "official_suffix_collision_rows": suffix_official_rows,
            "bundled_verified_marks": bundled_marks,
            "bundled_verified_mark_count": len(bundled_marks),
            "ui_fallback_is_initials_monogram": initials_fallback,
            "institution_image_cache_entries": len(image_cache),
            "institution_image_cache_in_catalogue": sum(1 for k in image_cache if k in cat_ids),
            "institution_image_cache_unattributed_count": len(image_cache_unattributed),
            "institution_image_cache_attribution_gap_note": (
                "All image-cache entries carry remote_url/source_url/sha but no per-file "
                "creator/licence; they must not be presented as verified logos."),
            "profile_enrichment_profiles": len(enrichment),
            "profile_enrichment_in_catalogue": sum(1 for k in enrichment if k in cat_ids),
            "profile_enrichment_with_logo_attributed": len(enrichment_with_logo),
            "profile_enrichment_with_campus_attributed": len(enrichment_with_campus),
            "profile_enrichment_attribution_gap_keys": enrichment_attribution_gaps,
            "campus_media_check_count": len(campus_checks),
            "campus_media_check_ids": sorted(campus_check_set),
            "openalex_identities": len(openalex),
            "openalex_with_logo_url": openalex_logo_count,
            "openalex_logo_licence_gap_note": (
                "OpenAlex logo_url values are Wikimedia redirect URLs without per-file "
                "licence metadata; licence must be confirmed on the Commons file page."),
            "web_profiles_total": len(web_profiles),
            "web_profiles_with_icon_url": webprofile_icon_count,
            "favicon_is_not_logo_note": (
                "icon_url values are website favicons/identification icons and must never "
                "be used as official logos."),
            "tiers": {k: len(v) for k, v in tiers.items()},
            "tier_ids": {k: v for k, v in tiers.items()},
            "icon_only_count": len(icon_only),
            "pure_fallback_initials_count": len(pure_fallback),
            "ranked_tiers": ranked_tiers,
        },
        "ranked_awaiting_review": {
            "world_records_total": len(ranking_records),
            "world_linked_distinct": len(linked_ids),
            "world_unmatched_total": len(ranking_unmatched),
            "world_unmatched_by_provider_year": sorted(
                [{"provider": k[0], "year": k[1], "count": v} for k, v in unmatched_by_provider.items()],
                key=lambda d: (str(d["provider"]), d["year"])),
            "national_proposals_new": national.get("counts", {}).get("new_identity_proposals"),
            "national_additional_existing_matches": national.get("counts", {}).get("additional_existing_position_matches"),
            "national_positions_with_new_proposals": national.get("counts", {}).get("positions_with_new_identity_proposals"),
            "national_held_total": len(national.get("held", [])),
            "national_held_by_reason": dict(sorted(held_by_reason.items())),
            "national_mapping_count": len(mappings),
            "reconciliation_restored": len(reconciliation.get("restored", [])),
            "reconciliation_added_ror": len(reconciliation.get("added_ror_ids", [])),
            "registry_held_for_context": registry_receipt.get("held_counts"),
        },
        "limits": {
            "no_network": True,
            "no_hosted_writes": True,
            "no_new_catalogue_rows_installed": True,
            "no_auto_approve": True,
            "max_manifest_actions": max_actions,
            "max_primary_urls_per_manifest": MAX_PRIMARY_URLS,
        },
    }

    manifest_doc = build_manifest(
        audit=audit,
        catalogue_by_id=by_id,
        official_logos=official_logos,
        enrichment=enrichment,
        national=national,
        ranking_unmatched=ranking_unmatched,
        ranking_records=ranking_records,
        linked_ids=linked_ids,
        shared_hosts=shared_hosts,
        max_actions=max_actions,
    )
    return audit, manifest_doc


def build_manifest(*, audit, catalogue_by_id, official_logos, enrichment,
                   national, ranking_unmatched, ranking_records, linked_ids,
                   shared_hosts, max_actions) -> dict:
    actions: list[dict] = []
    NON_GOALS = ("No ownership/accreditation inferred from ROR; no favicon used as an "
                 "official logo; no borrowed marks; no manufactured URLs/licences; no "
                 "guessed admissions facts; no auto-approval.")

    official_by_domain = {e["domain"].lower(): e for e in official_logos}

    # 1 — attach exact official logos (existing evidence only)
    exact_rows = audit["media"]["official_exact_rows"]
    if exact_rows:
        evidence = []
        seen_urls: list[str] = []
        for row in exact_rows:
            entry = official_by_domain[row["domain"]]
            cat = catalogue_by_id[row["id"]]
            for url, kind in (
                (cat.get("ror"), "ror_identity"),
                (cat.get("website"), "official_website"),
                (entry.get("source"), "official_logo_source_page"),
                (entry.get("download_url"), "official_logo_download_url"),
                (ROR_DOI, "registry_release"),
            ):
                if url and url not in seen_urls:
                    seen_urls.append(url)
                    evidence.append({"url": url, "kind": kind})
        actions.append({
            "action_id": "attach-exact-official-logos",
            "kind": "attach_existing_verified_logo",
            "priority": 1,
            "title": "Bind the 11 installed official-logo files to their exact-domain catalogue rows",
            "catalogue_uuids": sorted(r["id"] for r in exact_rows),
            "per_domain": sorted(
                ({"domain": r["domain"], "university_id": r["id"], "name": r["name"],
                 "local": r["local"]} for r in exact_rows),
                key=lambda d: (d["domain"], d["university_id"])),
            "evidence": evidence,
            "basis": ("Exact hostname match between catalogue website and an installed "
                      "official-logos.json domain record; source/download URLs already cached."),
            "verification_steps": [
                "Confirm each local file exists under public/logos and matches its sha256.",
                "Confirm the source page still serves the same mark before any UI change.",
                "Keep favicon and Wikimedia thumbnails separate; do not merge attributions.",
            ],
            "non_goals": NON_GOALS,
            "status": "needs_review",
            "writes": "none_until_reviewed",
        })

    # 2 — federated suffix borrow-guard (Toronto / Trinity)
    suffix_rows = audit["media"]["official_suffix_collision_rows"]
    if suffix_rows:
        trinity = next((r for r in suffix_rows if "trinity" in (r["website"] or "")), suffix_rows[0])
        actions.append({
            "action_id": "hold-federated-suffix-borrow-guard",
            "kind": "hold_logo_attribution",
            "priority": 2,
            "title": "Do not borrow the University of Toronto mark for the federated college on a shared suffix",
            "catalogue_uuids": sorted(r["id"] for r in suffix_rows),
            "per_row": suffix_rows,
            "evidence": [
                {"url": catalogue_by_id[trinity["id"]].get("ror"), "kind": "ror_identity"},
                {"url": catalogue_by_id[trinity["id"]].get("website"), "kind": "official_website"},
                {"url": official_by_domain["utoronto.ca"].get("source"), "kind": "official_logo_source_page"},
                {"url": ROR_DOI, "kind": "registry_release"},
            ],
            "basis": ("Subdomain-suffix match only (trinity.utoronto.ca vs utoronto.ca); "
                      "distinct RORs and distinct catalogue rows. A parent mark must never "
                      "identify a federated college."),
            "verification_steps": [
                "Keep the Toronto wordmark bound to the University of Toronto row only.",
                "Leave the Trinity row on fallback initials until its own official mark is evidenced.",
            ],
            "non_goals": NON_GOALS,
            "why_evidence_missing": ("No standalone Trinity College official-mark source has been "
                                     "cached; no file is downloaded or guessed here."),
            "status": "needs_review",
            "writes": "none_until_reviewed",
        })

    # 3 — shared-host branch/campus hold (top groups, deterministic)
    top_shared = shared_hosts[:5]
    if top_shared:
        uuids = sorted({uid for g in top_shared for uid in g["university_ids"]})
        sample_evidence = []
        for g in top_shared[:2]:
            first_id = sorted(g["university_ids"])[0]
            cat = catalogue_by_id[first_id]
            if cat.get("ror"):
                sample_evidence.append({"url": cat["ror"], "kind": "ror_identity"})
            sample_evidence.append({"url": cat.get("website"), "kind": "shared_official_website"})
        sample_evidence.append({"url": ROR_DOI, "kind": "registry_release"})
        actions.append({
            "action_id": "hold-shared-host-branch-campuses",
            "kind": "hold_identity_attribution",
            "priority": 3,
            "title": "Hold shared-host rows (branch/campus variants) from independent logo assignment",
            "catalogue_uuids": uuids,
            "groups": [
                {"host": g["host"], "row_count": g["row_count"],
                 "cross_country": g["cross_country"], "university_ids": g["university_ids"],
                 "sample": g["sample"]}
                for g in top_shared
            ],
            "all_shared_host_group_count": audit["identity"]["shared_host_group_count"],
            "evidence": sample_evidence,
            "basis": ("114 website hosts are shared by multiple catalogue rows (e.g. devry.edu x13, "
                      "IPEDS campus immersions sharing asu.edu). Same host does not prove same "
                      "independent university or shared logo ownership."),
            "verification_steps": [
                "Treat each shared-host group as a campus-attribution review, not N new logo owners.",
                "Require per-campus official pages before any per-row mark.",
            ],
            "non_goals": NON_GOALS + " No campus rows merged or split here.",
            "status": "needs_review",
            "writes": "none_until_reviewed",
        })

    # 4 — duplicate UNITID hold (all 14 pairs; bounded and exact)
    dup_units = audit["identity"]["duplicate_unitid_groups"]
    if dup_units:
        uuids = sorted({uid for g in dup_units for uid in g["university_ids"]})
        first = dup_units[0]
        first_cat = catalogue_by_id[first["university_ids"][0]]
        actions.append({
            "action_id": "hold-duplicate-unitid-pairs",
            "kind": "hold_identity_attribution",
            "priority": 4,
            "title": "Hold 14 duplicate-UNITID pairs for HD2025 corroboration; do not merge",
            "catalogue_uuids": uuids,
            "groups": dup_units,
            "evidence": [
                *([{"url": first_cat.get("ror"), "kind": "ror_identity"}] if first_cat.get("ror") else []),
                {"url": first_cat.get("website"), "kind": "official_website"},
                {"url": "https://nces.ed.gov/ipeds/use-the-data", "kind": "ipeds_directory_reference"},
            ],
            "basis": ("Two catalogue rows share one UNITID (e.g. old vs new official host after a "
                      "domain move). UNITID alone cannot decide which row is current."),
            "verification_steps": [
                "Corroborate each pair against the current IPEDS HD2025 directory before any merge.",
                "Keep both rows until then; never invent a surviving website.",
            ],
            "non_goals": NON_GOALS,
            "status": "needs_review",
            "writes": "none_until_reviewed",
        })

    # 5 — duplicate name+country hold (bounded examples; full list stays in audit.json)
    dup_names = audit["identity"]["duplicate_name_country_groups"]
    if dup_names:
        example = dup_names[:5]
        uuids = sorted({uid for g in example for uid in g["university_ids"]})
        first_cat = catalogue_by_id[example[0]["university_ids"][0]]
        actions.append({
            "action_id": "hold-duplicate-name-country",
            "kind": "hold_identity_attribution",
            "priority": 5,
            "title": "Hold same-name/same-country rows for identity review (53 groups)",
            "catalogue_uuids": uuids,
            "example_groups": example,
            "full_group_count": len(dup_names),
            "full_list_in": "outputs/identity-media-oct09/audit.json » identity.duplicate_name_country_groups",
            "evidence": [
                *([{"url": first_cat.get("ror"), "kind": "ror_identity"}] if first_cat.get("ror") else []),
                {"url": first_cat.get("website"), "kind": "official_website"},
                {"url": ROR_DOI, "kind": "registry_release"},
            ],
            "basis": ("Identical display names in one country with distinct UUIDs/websites "
                      "(e.g. hallmark, cal-poly-maritime pairs). Name alone cannot merge them."),
            "verification_steps": [
                "Compare ROR, official hosts and aliases per group in audit.json.",
                "Hold all 53 groups; this action shows the 5 largest deterministically.",
            ],
            "non_goals": NON_GOALS,
            "status": "needs_review",
            "writes": "none_until_reviewed",
        })

    # 6 — ranked fallback rows with full Wikimedia attribution (top 5 deterministic)
    by_rank = sorted(
        (r for r in ranking_records if r.get("university_id") in catalogue_by_id),
        key=rank_sort_key,
    )
    candidates = []
    seen_ranked = set()
    for r in by_rank:
        uid = r["university_id"]
        if uid in seen_ranked:
            continue
        seen_ranked.add(uid)
        if uid in set(audit["media"]["tier_ids"]["official_verified"]):
            continue
        media = enrichment.get(uid, {}).get("media", [])
        logos = [m for m in media if m.get("kind") == "logo" and m.get("creator")
                 and m.get("license") and m.get("source_url")]
        if logos:
            candidates.append({"university_id": uid,
                               "name": catalogue_by_id[uid]["name"],
                               "rank": r.get("rank"), "rank_label": r.get("rank_label"),
                               "provider": r.get("provider"), "year": r.get("year"),
                               "logo_source_url": logos[0]["source_url"],
                               "logo_licence": logos[0]["license"],
                               "logo_creator": logos[0]["creator"],
                               "ranking_source_url": r.get("url")})
        if len(candidates) >= 5:
            break
    if candidates:
        evidence = [{"url": ROR_DOI, "kind": "registry_release"}]
        for c in candidates:
            cat = catalogue_by_id[c["university_id"]]
            if cat.get("ror") and {"url": cat["ror"], "kind": "ror_identity"} not in evidence:
                evidence.append({"url": cat["ror"], "kind": "ror_identity"})
            evidence.append({"url": c["logo_source_url"], "kind": "wikimedia_commons_file_page"})
        actions.append({
            "action_id": "attribute-ranked-wikimedia-review",
            "kind": "attribute_existing_media",
            "priority": 6,
            "title": "Review full-attribution Wikimedia logos for the 5 best-ranked rows still on fallback",
            "catalogue_uuids": sorted(c["university_id"] for c in candidates),
            "candidates": candidates,
            "evidence": evidence,
            "basis": ("Each candidate already has a Commons file page with creator + licence + "
                      "source URL in profile-enrichment.json; ranked order is deterministic by "
                      "(rank, rank_label, name). Nothing is downloaded or installed here."),
            "verification_steps": [
                "Open each Commons file page; confirm the mark actually depicts the named university.",
                "Confirm licence allows the intended reuse and trademark is retained in the label.",
                "Keep the row on fallback initials until a reviewer approves.",
            ],
            "non_goals": NON_GOALS + " Wikimedia attribution is not an official-logo claim.",
            "why_evidence_missing": ("Licence/creator confirmations beyond the cached metadata "
                                     "require per-file reviewer checks; no bulk approval."),
            "status": "needs_review",
            "writes": "none_until_reviewed",
        })

    # 7 — quarantine unattributed thumbnails
    cache_examples = sorted(audit["media"]["tier_ids"]["unattributed_thumbnail_only"])[:3]
    actions.append({
        "action_id": "quarantine-unattributed-thumbnails",
        "kind": "record_attribution_gap",
        "priority": 7,
        "title": "Keep unattributed OpenAlex/Wikimedia thumbnails out of the verified-logo slot",
        "catalogue_uuids": cache_examples,
        "counts": {
            "image_cache_unattributed": audit["media"]["institution_image_cache_unattributed_count"],
            "openalex_with_logo_url": audit["media"]["openalex_with_logo_url"],
            "unattributed_thumbnail_only_rows": audit["media"]["tiers"]["unattributed_thumbnail_only"],
        },
        "evidence": [{"url": ROR_DOI, "kind": "registry_release"}],
        "basis": ("288 image-cache entries and 3,652 OpenAlex logo_url values lack per-file "
                  "creator/licence metadata. A redirect thumbnail URL is not authorship or "
                  "permission evidence."),
        "verification_steps": [
            "Resolve each thumbnail to its Commons file page and record creator/licence before any display as a logo.",
            "Until then these rows stay on fallback initials or campus-photo slots only.",
        ],
        "non_goals": NON_GOALS,
        "status": "needs_review",
        "writes": "none_until_reviewed",
    })

    # 8 — favicon is not a logo
    actions.append({
        "action_id": "favicon-is-not-logo",
        "kind": "record_attribution_gap",
        "priority": 8,
        "title": "Record website favicons as identification icons, never as official logos",
        "catalogue_uuids": [],
        "counts": {
            "web_profiles_with_icon_url": audit["media"]["web_profiles_with_icon_url"],
            "icon_only_rows": audit["media"]["icon_only_count"],
        },
        "evidence": [],
        "basis": ("5,321 official-web-profiles icon_url values are favicons. The UI may show an "
                  "icon as a last-resort identifier, but it must be labelled 'official website "
                  "icon', never 'official logo'."),
        "verification_steps": [
            "Keep the UniversityLogo label chain (official logo > logo > official website icon > initials) intact.",
            "Audit any future 'logo' claim against official-logos.json, not icon_url.",
        ],
        "non_goals": NON_GOALS,
        "status": "needs_review",
        "writes": "none_until_reviewed",
    })

    # 9 — aggregate reporting units stay unlinked
    aggregates = [h for h in national.get("held", []) if h.get("reason") == "aggregate_reporting_unit_not_a_single_profile"]
    aggregates_sorted = sorted(aggregates, key=lambda h: str(h.get("name")))
    if aggregates_sorted:
        actions.append({
            "action_id": "hold-aggregate-reporting-units",
            "kind": "hold_ranked_identity",
            "priority": 9,
            "title": "Keep the 9 HERD combined reporting units unlinked (not independent universities)",
            "catalogue_uuids": [],
            "held": aggregates_sorted,
            "evidence": [{"url": "https://ncses.nsf.gov/surveys/higher-education-research-development/2024",
                          "kind": "herd_methodology_reference"}],
            "basis": ("Provider-flagged aggregates (e.g. multi-campus/medical-centre totals) must "
                      "never inherit a single university profile's expenditure or rank."),
            "verification_steps": [
                "Preserve each source row; do not map it to any catalogue UUID.",
            ],
            "non_goals": NON_GOALS,
            "status": "needs_review",
            "writes": "none_until_reviewed",
        })

    # 10 — missing UNITID crosswalk stays held
    missing_unitid = sorted(
        (h for h in national.get("held", []) if h.get("reason") == "missing_unique_official_UNITID_crosswalk"),
        key=lambda h: str(h.get("name")))
    if missing_unitid:
        actions.append({
            "action_id": "hold-missing-unitid-crosswalk",
            "kind": "hold_ranked_identity",
            "priority": 10,
            "title": "Hold 103 HERD positions lacking a unique official UNITID crosswalk",
            "catalogue_uuids": [],
            "example_held": missing_unitid[:3],
            "held_count": len(missing_unitid),
            "full_list_in": "data/published/reviewed-national-ranking-identities.json » held",
            "evidence": [{"url": "https://ncses.nsf.gov/surveys/higher-education-research-development/2024",
                          "kind": "herd_methodology_reference"}],
            "basis": ("A same-name ROR alone cannot resolve US campus/UNITID identity. "
                      "Current HD2025 corroboration is required per row."),
            "verification_steps": [
                "Crosswalk each public-use inst_id to HD2025 UNITID before any new proposal.",
            ],
            "non_goals": NON_GOALS + " No ROR-only approval.",
            "status": "needs_review",
            "writes": "none_until_reviewed",
        })

    # 11 — NIRF proposal logo check: small explicit primary-URL set
    proposals = sorted(national.get("identity_proposals", []), key=lambda p: str(p.get("ror")))
    if proposals:
        primary = [{"university_id": p["id"], "name": p["name"], "official_website": p["website"],
                    "ror": p["ror"]} for p in proposals[:MAX_PRIMARY_URLS]]
        actions.append({
            "action_id": "review-nirf-proposal-logo-placement",
            "kind": "bounded_primary_source_check",
            "priority": 11,
            "title": f"Check official logo placement on ≤{MAX_PRIMARY_URLS} NIRF-proposal sites; download nothing",
            "catalogue_uuids": [],
            "proposal_ids": sorted(p["id"] for p in proposals),
            "primary_urls": primary,
            "proposals_beyond_primary_set": len(proposals) - len(primary),
            "evidence": (
                [{"url": p["ror"], "kind": "ror_identity"} for p in proposals[:MAX_PRIMARY_URLS]]
                + [{"url": p["website"], "kind": "official_website"} for p in proposals[:MAX_PRIMARY_URLS]]
                + [{"url": ROR_DOI, "kind": "registry_release"}]
            ),
            "basis": ("The 10 NIRF proposals are needs_review identities with registered official "
                      "websites. Logo evidence, if any, must come from those primary sites with "
                      "permission, not from favicons or borrowed marks."),
            "verification_steps": [
                "Visit at most the listed primary official sites; record the exact logo file URL and permission.",
                "If no permission/statement is found, record 'evidence remains missing' and stop.",
            ],
            "non_goals": NON_GOALS + " No crawling beyond the listed primary URLs; no downloads here.",
            "why_evidence_missing": ("No logo permissions have been cached for these proposals; "
                                     "remaining 5 proposals are out of scope for this bounded pass and "
                                     "stay on fallback initials."),
            "status": "needs_review",
            "writes": "none_until_reviewed",
        })

    # 12 — world unmatched top slice (deterministic, evidence-linked)
    unmatched_sorted = sorted(ranking_unmatched, key=rank_sort_key)[:5]
    if unmatched_sorted:
        actions.append({
            "action_id": "review-world-unmatched-top",
            "kind": "hold_ranked_identity",
            "priority": 12,
            "title": "Review the 5 best-ranked world-table rows still unmatched (no invented identities)",
            "catalogue_uuids": [],
            "rows": unmatched_sorted,
            "full_unmatched_count": len(ranking_unmatched),
            "full_list_in": "data/published/ranking-unmatched.json",
            "evidence": [{"url": r["url"], "kind": "ranking_source_table"} for r in unmatched_sorted
                         if r.get("url")],
            "basis": ("Historical/campus-qualified names (e.g. Illinois Urbana-Champaign, Trinity "
                      "College Dublin, Tokyo Tech) need merger/campus/country evidence per row before "
                      "any identity decision."),
            "verification_steps": [
                "Gather exact ROR + official-site evidence per row; hold on ambiguity.",
            ],
            "non_goals": NON_GOALS,
            "why_evidence_missing": ("Campus, merger and historical-name evidence has not been cached "
                                     "for these rows; the full 377 stay held."),
            "status": "needs_review",
            "writes": "none_until_reviewed",
        })

    actions = sorted(actions, key=lambda a: (a["priority"], a["action_id"]))[:max_actions]
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).date().isoformat(),
        "status": "local_review_manifest_no_catalogue_or_hosted_writes",
        "action_count": len(actions),
        "max_actions": max_actions,
        "max_primary_urls": MAX_PRIMARY_URLS,
        "licence_notes": audit["licence_boundaries"],
        "limits": audit["limits"],
        "actions": actions,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=OUT_DEFAULT)
    parser.add_argument("--max-actions", type=int, default=MAX_ACTIONS_DEFAULT)
    args = parser.parse_args()
    if args.max_actions < 1 or args.max_actions > 50:
        raise ValueError("--max-actions must be within 1..50")
    audit, manifest_doc = build_audit(max_actions=args.max_actions)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    (args.out / "manifest.json").write_text(json.dumps(manifest_doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    summary = [
        "# Identity/media audit — summary (local, read-only)",
        "",
        f"- Catalogue rows: {audit['identity']['catalogue_total']}",
        f"- ROR linked: {audit['identity']['ror_linked']} · missing ROR: {audit['identity']['ror_missing']}",
        f"- UNITID rows: {audit['identity']['unitid_rows']} distinct {audit['identity']['unitid_distinct']} · "
        f"duplicate UNITID groups: {audit['identity']['duplicate_unitid_group_count']}",
        f"- Duplicate ROR groups: {audit['identity']['duplicate_ror_group_count']}",
        f"- Shared-host groups: {audit['identity']['shared_host_group_count']} "
        f"({audit['identity']['shared_host_row_count']} rows)",
        f"- Same-name/same-country groups: {audit['identity']['duplicate_name_country_group_count']}",
        f"- Official-logo domain records: {audit['media']['official_logo_domain_records']} → "
        f"{audit['media']['official_exact_catalogue_rows']} exact catalogue rows "
        f"(+{len(audit['media']['official_suffix_collision_rows'])} suffix collision held)",
        f"- Bundled verified marks: {audit['media']['bundled_verified_mark_count']}",
        f"- Image-cache entries: {audit['media']['institution_image_cache_entries']} "
        f"(unattributed: {audit['media']['institution_image_cache_unattributed_count']})",
        f"- Enrichment profiles: {audit['media']['profile_enrichment_profiles']} "
        f"(logo {audit['media']['profile_enrichment_with_logo_attributed']}, "
        f"campus {audit['media']['profile_enrichment_with_campus_attributed']})",
        f"- Campus checks: {audit['media']['campus_media_check_count']}",
        f"- Tiers: {json.dumps(audit['media']['tiers'], sort_keys=True)}",
        f"- Ranked tiers ({sum(audit['media']['ranked_tiers'].values()):,} linked): {json.dumps(audit['media']['ranked_tiers'], sort_keys=True)}",
        f"- World unmatched: {audit['ranked_awaiting_review']['world_unmatched_total']} · "
        f"national held: {audit['ranked_awaiting_review']['national_held_total']} · "
        f"new proposals: {audit['ranked_awaiting_review']['national_proposals_new']}",
        f"- Manifest actions: {manifest_doc['action_count']} (max {manifest_doc['max_actions']}, "
        f"≤{manifest_doc['max_primary_urls']} primary URLs)",
        "- Writes: none. All actions are needs_review.",
        "",
    ]
    (args.out / "SUMMARY.md").write_text("\n".join(summary))
    print(json.dumps({
        "catalogue_total": audit["identity"]["catalogue_total"],
        "tiers": audit["media"]["tiers"],
        "world_unmatched": audit["ranked_awaiting_review"]["world_unmatched_total"],
        "national_held": audit["ranked_awaiting_review"]["national_held_total"],
        "actions": manifest_doc["action_count"],
        "out": str(args.out),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
