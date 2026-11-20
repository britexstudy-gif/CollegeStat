"""Tests for scripts/ingestion/audit-identity-media-oct09.py.

Covers conflicting identities, missing attribution, and the distinction
between official verified assets and explicitly labelled fallback visuals.
Includes a bounded live-data sanity pass over already-cached files only
(no network, no writes outside outputs/identity-media-oct09/).

The live audit is built once per test class (it loads the 14,000-row
catalogue and other cached evidence), keeping the suite fast.
"""

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "identity_media_audit", ROOT / "scripts/ingestion/audit-identity-media-oct09.py")
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)

_CACHED = {}


def live_audit():
    if "audit" not in _CACHED:
        _CACHED["audit"], _CACHED["manifest"] = AUDIT.build_audit()
    return _CACHED["audit"], _CACHED["manifest"]


def catalogue_rows():
    if "catalogue" not in _CACHED:
        _CACHED["catalogue"] = json.loads((ROOT / "data/published/global-directory.json").read_text())
    return _CACHED["catalogue"]


class IdentityConflictTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit, cls.manifest = live_audit()

    def test_hostname_never_fuzzy_matches(self):
        self.assertEqual(AUDIT.official_match("harvard.edu", "harvard.edu"), "exact")
        self.assertEqual(AUDIT.official_match("trinity.utoronto.ca", "utoronto.ca"), "subdomain_suffix")
        self.assertIsNone(AUDIT.official_match("harvardXedu.com", "harvard.edu"))
        self.assertIsNone(AUDIT.official_match("notharvard.edu", "harvard.edu"))
        self.assertIsNone(AUDIT.official_match("", "harvard.edu"))

    def test_hostname_rejects_userinfo_and_non_http(self):
        self.assertEqual(AUDIT.hostname("https://user@evil.example/"), "")
        self.assertEqual(AUDIT.hostname("ftp://files.example/logo.png"), "")
        self.assertEqual(AUDIT.hostname("https://WWW.Harvard.EDU/x"), "harvard.edu")
        self.assertEqual(AUDIT.hostname(None), "")

    def test_subdomain_suffix_is_a_collision_not_an_assignment(self):
        # A parent mark must never be borrowed for a federated college row.
        kind = AUDIT.official_match("trinity.utoronto.ca", "utoronto.ca")
        self.assertEqual(kind, "subdomain_suffix")
        held_ids = {r["id"] for r in self.audit["media"]["official_suffix_collision_rows"]}
        exact_ids = set(self.audit["media"]["tier_ids"]["official_verified"])
        self.assertTrue(held_ids, "expected at least one suffix collision")
        self.assertTrue(held_ids.isdisjoint(exact_ids),
                        "suffix collisions must not be classified as official_verified")

    def test_shared_host_and_duplicate_unitid_detected_in_live_catalogue(self):
        self.assertEqual(self.audit["identity"]["catalogue_total"], len(catalogue_rows()))
        self.assertEqual(self.audit["identity"]["duplicate_ror_group_count"], 0)
        self.assertEqual(self.audit["identity"]["duplicate_unitid_group_count"], 14)
        self.assertEqual(self.audit["identity"]["shared_host_group_count"], 114)
        devry = next(g for g in self.audit["identity"]["shared_hosts_full"] if g["host"] == "devry.edu")
        self.assertEqual(devry["row_count"], 13)


class AttributionGapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit, cls.manifest = live_audit()

    def test_unattributed_thumbnails_are_never_verified(self):
        media = self.audit["media"]
        self.assertEqual(media["institution_image_cache_entries"], 288)
        self.assertEqual(media["institution_image_cache_unattributed_count"], 288)
        verified = set(media["tier_ids"]["official_verified"])
        thumb_only = set(media["tier_ids"]["unattributed_thumbnail_only"])
        self.assertTrue(thumb_only.isdisjoint(verified))
        # Image-cache rows without per-file licence stay out of the attributed tier.
        attributed = set(media["tier_ids"]["attributed_wikimedia_review"])
        for uid in thumb_only:
            self.assertNotIn(uid, attributed)

    def test_favicon_is_not_a_logo(self):
        media = self.audit["media"]
        self.assertGreaterEqual(media["web_profiles_with_icon_url"], 5000)
        self.assertIn("favicon", media["favicon_is_not_logo_note"].lower())
        self.assertIn("never", media["favicon_is_not_logo_note"].lower())
        # Icon-only/fallback rows dominate the catalogue; verified logos are 11.
        self.assertGreater(media["tiers"]["icon_only_or_fallback_initials"], 10000)
        self.assertEqual(media["official_exact_catalogue_rows"], 11)

    def test_enrichment_attribution_gaps_are_explicit(self):
        media = self.audit["media"]
        self.assertEqual(media["profile_enrichment_attribution_gap_keys"], [])
        self.assertEqual(media["campus_media_check_count"], 3)
        self.assertGreaterEqual(
            media["profile_enrichment_with_logo_attributed"]
            + media["profile_enrichment_with_campus_attributed"], 545)


class VerifiedVsFallbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit, cls.manifest = live_audit()

    def test_tiers_partition_the_catalogue(self):
        tiers = self.audit["media"]["tiers"]
        self.assertEqual(sum(tiers.values()), len(catalogue_rows()))
        self.assertEqual(tiers["official_verified"], 11)
        self.assertTrue(self.audit["media"]["ui_fallback_is_initials_monogram"],
                        "UI fallback must remain an explicitly labelled initials monogram")
        tier_ids = self.audit["media"]["tier_ids"]
        all_ids = set().union(*[set(v) for v in tier_ids.values()])
        self.assertEqual(len(all_ids), len(catalogue_rows()))

    def test_ranked_coverage_is_mostly_fallback(self):
        ranked = self.audit["media"]["ranked_tiers"]
        # The reviewed Oct10 THE link separates Lahore from Okara; it adds
        # one distinct ranked profile without adding a publisher observation.
        self.assertEqual(sum(ranked.values()), 2448)
        self.assertLessEqual(ranked["official_verified"], 11)
        # The large majority of ranked rows have no verified official logo:
        # fallback + unattributed thumbnails outweigh attributed review rows.
        self.assertGreater(
            ranked["icon_only_or_fallback_initials"] + ranked["unattributed_thumbnail_only"],
            ranked["attributed_wikimedia_review"])

    def test_known_verified_logos_are_exact_and_existing(self):
        catalogue_ids = {c["id"] for c in catalogue_rows()}
        attach = next(a for a in self.manifest["actions"]
                      if a["action_id"] == "attach-exact-official-logos")
        self.assertEqual(len(attach["catalogue_uuids"]), 11)
        for row in attach["per_domain"]:
            self.assertIn(row["university_id"], catalogue_ids)
            self.assertIn(row["university_id"], self.audit["media"]["tier_ids"]["official_verified"])
            self.assertTrue(row["local"].startswith("/logos/"))


class ManifestBoundTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.audit, cls.manifest = live_audit()

    def test_manifest_is_bounded_deterministic_and_review_only(self):
        _, second = AUDIT.build_audit()
        self.assertEqual(self.manifest, second, "manifest must be deterministic")
        self.assertLessEqual(self.manifest["action_count"], 20)
        priorities = [(a["priority"], a["action_id"]) for a in self.manifest["actions"]]
        self.assertEqual(priorities, sorted(priorities))
        for action in self.manifest["actions"]:
            self.assertEqual(action["status"], "needs_review")
            self.assertEqual(action["writes"], "none_until_reviewed")
            self.assertIn("non_goals", action)

    def test_manifest_links_only_existing_uuids_and_evidence(self):
        catalogue_ids = {c["id"] for c in catalogue_rows()}
        proposal_ids = {p["id"] for p in json.loads(
            (ROOT / "data/published/reviewed-national-ranking-identities.json").read_text())["identity_proposals"]}
        for action in self.manifest["actions"]:
            for uid in action.get("catalogue_uuids", []):
                self.assertIn(uid, catalogue_ids, f"unknown catalogue UUID {uid}")
            for pid in action.get("proposal_ids", []):
                self.assertIn(pid, proposal_ids, f"unknown proposal id {pid}")
        primary_total = sum(len(a.get("primary_urls", [])) for a in self.manifest["actions"])
        self.assertLessEqual(primary_total, 5)

    def test_aggregates_are_never_proposed_as_profiles(self):
        hold = next(a for a in self.manifest["actions"]
                    if a["action_id"] == "hold-aggregate-reporting-units")
        self.assertEqual(len(hold["held"]), 9)
        self.assertEqual(hold["catalogue_uuids"], [])
        self.assertEqual(self.audit["ranked_awaiting_review"]["world_unmatched_total"], 377)
        self.assertEqual(self.audit["ranked_awaiting_review"]["national_held_total"], 159)
        self.assertEqual(self.audit["ranked_awaiting_review"]["national_proposals_new"], 10)

    def test_no_manifest_url_is_manufactured(self):
        allowed_prefixes = (
            "https://ror.org/", "https://doi.org/", "https://www.geonames.org/",
            "https://commons.wikimedia.org/", "https://ncses.nsf.gov/",
            "https://nces.ed.gov/", "https://www.econ.muni.cz/",
            "https://www.pib.gov.in/",
        )
        catalogue_sites = {c.get("website") for c in catalogue_rows() if c.get("website")}
        proposals = json.loads(
            (ROOT / "data/published/reviewed-national-ranking-identities.json").read_text())["identity_proposals"]
        proposal_sites = {p.get("website") for p in proposals if p.get("website")}
        proposal_rors = {p.get("ror") for p in proposals if p.get("ror")}
        official_sources = {e.get("source") for e in json.loads(
            (ROOT / "data/published/official-logos.json").read_text())}
        official_downloads = {e.get("download_url") for e in json.loads(
            (ROOT / "data/published/official-logos.json").read_text()) if e.get("download_url")}
        ranking_sources = {r.get("url") for r in json.loads(
            (ROOT / "data/published/ranking-unmatched.json").read_text()) if r.get("url")}
        ranking_sources |= {r.get("url") for r in json.loads(
            (ROOT / "data/published/ranking-records.json").read_text()) if r.get("url")}
        for action in self.manifest["actions"]:
            urls = [item.get("url") for item in action.get("evidence", [])
                    if isinstance(item, dict) and item.get("url")]
            urls += [p.get("official_website") for p in action.get("primary_urls", []) if p.get("official_website")]
            for url in urls:
                self.assertTrue(
                    url.startswith(allowed_prefixes) or url in catalogue_sites
                    or url in official_sources or url in official_downloads
                    or url in proposal_sites or url in proposal_rors
                    or url in ranking_sources,
                    f"manufactured URL not allowed in manifest: {url}")


if __name__ == "__main__":
    unittest.main()
