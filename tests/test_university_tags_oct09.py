"""Tests for scripts/ingestion/review-university-tags-oct09.py.

Covers ambiguous UNITIDs, CONTROL code mapping, and provenance.
Includes a bounded live-data pass over already-cached files only
(no network, no hosted writes, no credential reads).

The live review is built once per test class (14k catalogue + HD).
"""

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "university_tags_oct09", ROOT / "scripts/ingestion/review-university-tags-oct09.py")
TAGS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TAGS)

_CACHED = {}


def live_review():
    if "review" not in _CACHED:
        _CACHED["candidates"], _CACHED["counts"] = TAGS.build_review()
    return _CACHED["candidates"], _CACHED["counts"]


def catalogue_rows():
    if "catalogue" not in _CACHED:
        _CACHED["catalogue"] = json.loads((ROOT / "data/published/global-directory.json").read_text())
    return _CACHED["catalogue"]


def control_mapping():
    if "mapping" not in _CACHED:
        mapping, _ = TAGS.load_control_dictionary(ROOT / "data/raw/ipeds/HD2025_Dict.zip")
        _CACHED["mapping"] = mapping
    return _CACHED["mapping"]


class ControlMappingTests(unittest.TestCase):
    def test_dictionary_labels_are_official_verbatim(self):
        mapping = control_mapping()
        self.assertEqual(mapping["1"]["label"], "Public")
        self.assertEqual(mapping["2"]["label"], "Private not-for-profit")
        self.assertEqual(mapping["3"]["label"], "Private for-profit")
        self.assertIn("-3", mapping)

    def test_coarse_mapping_preserves_installed_vocabulary(self):
        mapping = control_mapping()
        self.assertEqual(TAGS.map_control("1", mapping), ("Public", "Public"))
        coarse, detail = TAGS.map_control("2", mapping)
        self.assertEqual(coarse, "Private")
        self.assertEqual(detail, "Private not-for-profit")
        coarse, detail = TAGS.map_control("3", mapping)
        self.assertEqual(coarse, "Private")
        self.assertEqual(detail, "Private for-profit")

    def test_unsupported_missing_values_are_never_guessed(self):
        mapping = control_mapping()
        for bad in ("-3", "", "  ", None, "9", "0", "unknown"):
            self.assertEqual(TAGS.map_control(bad, mapping), (None, None),
                             f"CONTROL {bad!r} must map to no type")

    def test_hostname_rejects_userinfo_and_non_http(self):
        self.assertEqual(TAGS.hostname("https://user@evil.example/"), "")
        self.assertEqual(TAGS.hostname("ftp://files.example/logo.png"), "")
        self.assertEqual(TAGS.hostname("https://WWW.Harvard.EDU/x"), "harvard.edu")
        self.assertEqual(TAGS.hostname(None), "")

    def test_official_exact_never_borrows_suffix(self):
        self.assertTrue(TAGS.official_exact("harvard.edu", "harvard.edu"))
        self.assertFalse(TAGS.official_exact("trinity.utoronto.ca", "utoronto.ca"))
        self.assertFalse(TAGS.official_exact("notharvard.edu", "harvard.edu"))


class AmbiguousIdTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidates_doc, cls.counts = live_review()

    def test_duplicate_unitid_groups_are_held_not_proposed(self):
        self.assertEqual(self.counts["duplicate_unitid_groups"], 14)
        self.assertEqual(self.counts["duplicate_unitid_rows"], 28)
        hallmark = [u for u in self.counts["duplicate_unitids"] if u == "225201"]
        self.assertEqual(hallmark, ["225201"])
        proposed_units = [c["unitid"] for c in self.candidates_doc["candidates"]]
        for dup in self.counts["duplicate_unitids"]:
            self.assertNotIn(dup, proposed_units, f"duplicate UNITID {dup} must stay held")

    def test_us_without_unitid_and_non_us_are_out_of_scope(self):
        self.assertEqual(self.counts["us_without_unitid_rows"], 742)
        self.assertEqual(self.counts["non_us_rows"], 10421)
        for cand in self.candidates_doc["candidates"]:
            row = next(r for r in catalogue_rows() if r["id"] == cand["university_id"])
            self.assertEqual(row.get("country_code"), "US")
            self.assertTrue(row.get("unitid"))

    def test_missing_hd_and_unsupported_control_are_held(self):
        # 3 closed US schools have UNITIDs absent from HD2025; -3 rows never proposed.
        self.assertEqual(self.counts["held_missing_hd_rows"], 3)
        self.assertEqual(self.counts["held_unsupported_control_rows"], 0)
        for cand in self.candidates_doc["candidates"]:
            self.assertIn(cand["additional_information"]["control_code"], ("1", "2", "3"))

    def test_evaluated_set_is_exact_unique_and_already_correct(self):
        self.assertEqual(self.counts["catalogue_total"], 14003)
        self.assertEqual(self.counts["evaluated_unique_matches"], 2809)
        self.assertEqual(self.counts["already_correct"], 2809)
        self.assertEqual(self.counts["candidates_total"], 0)
        self.assertEqual(self.candidates_doc["candidates"], [])
        self.assertEqual(self.counts["control_breakdown_evaluated"], {"1": 907, "2": 1585, "3": 317})

    def test_no_ror_implied_type(self):
        # A non-US ROR row with an installed type must not gain HD evidence.
        rows = {r["id"]: r for r in catalogue_rows()}
        uca = rows.get("b99019e6-e35f-57b0-8522-f934f7ee60e5")
        self.assertIsNotNone(uca)
        self.assertEqual(uca.get("country_code"), "KG")
        proposed_ids = {c["university_id"] for c in self.candidates_doc["candidates"]}
        self.assertNotIn(uca["id"], proposed_ids)


class ProvenanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidates_doc, cls.counts = live_review()

    def test_provenance_retains_source_url_date_checksum_dictionary(self):
        prov = self.counts["provenance"]
        self.assertEqual(prov["hd_source_url"], "https://nces.ed.gov/ipeds/complete-data-files/HD2025.zip")
        self.assertEqual(prov["dictionary_source_url"], "https://nces.ed.gov/ipeds/complete-data-files/HD2025_Dict.zip")
        self.assertTrue(prov["hd_retrieved_at"].startswith("2026-09-26"))
        self.assertTrue(prov["dictionary_retrieved_at"].startswith("2026-09-26"))
        self.assertEqual(len(prov["hd_archive_sha256"]), 64)
        self.assertEqual(len(prov["dictionary_archive_sha256"]), 64)
        self.assertIn("control_mapping", prov)
        self.assertTrue(prov["control_description_excerpt"])
        self.assertIn("Public institution", prov["control_description_excerpt"])
        for rel in ("data/raw/ipeds/HD2025.zip", "data/raw/ipeds/HD2025_Dict.zip",
                    "data/published/global-directory.json"):
            self.assertIn(rel, self.counts["inputs_sha256"])
            self.assertEqual(len(self.counts["inputs_sha256"][rel]), 64)

    def test_no_candidate_gets_invented_verified_date(self):
        for cand in self.candidates_doc["candidates"]:
            self.assertIsNone(cand["verification"]["verified_at"],
                              "no invented verified date allowed")
            self.assertEqual(cand["verification"]["verification_status"], "needs_review")
            self.assertEqual(cand["status"], "needs_review")
            self.assertEqual(cand["writes"], "none_until_reviewed")
            self.assertIsNotNone(cand["evidence"]["hd_retrieved_at"])
            self.assertIsNotNone(cand["evidence"]["dictionary_retrieved_at"])
            self.assertEqual(len(cand["evidence"]["hd_archive_sha256"]), 64)

    def test_media_uses_only_verified_attributed_evidence(self):
        for cand in self.candidates_doc["candidates"]:
            media = cand["media"]
            if media["official_logo"] is not None:
                self.assertTrue(media["official_logo"]["domain"])
                self.assertTrue(media["official_logo"]["source"].startswith("https://"))
            for item in media["wikimedia_attributed"]:
                self.assertTrue(item["creator"] and item["license"] and item["source_url"])
                self.assertTrue(item["source_url"].startswith("https://commons.wikimedia.org/wiki/File:"))
            # Favicons and unattributed thumbnails never appear here.
            self.assertNotIn("icon_url", json.dumps(media))
            self.assertNotIn("favicon", json.dumps(media).lower())

    def test_fail_closed_when_dictionary_lacks_control(self):
        with self.assertRaises(TAGS.DictionaryMissingError):
            TAGS.load_control_dictionary(ROOT / "data/raw/ipeds/DOES-NOT-EXIST.zip")
        # Unsupported codes never map, so the builder holds rather than guesses.
        mapping = control_mapping()
        self.assertEqual(TAGS.map_control("-3", mapping), (None, None))


if __name__ == "__main__":
    unittest.main()
