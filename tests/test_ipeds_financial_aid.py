"""Meaningful boundaries for the reviewed IPEDS aid adapter, using no network."""
import collections
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ipeds_aid", ROOT / "scripts/ingestion/ipeds-financial-aid.py")
aid = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(aid)


class AidNormalizationTests(unittest.TestCase):
    def sample(self, value, flag="R", unit="students"):
        exclusions = collections.Counter()
        result = aid.normalize_number({"UNITID": "166683", "FIGURE": value, "XFIGURE": flag}, "FIGURE", {"imputation_variable": "XFIGURE", "unit": unit}, exclusions)
        return result, exclusions

    def test_imputed_generated_and_corrected_values_are_not_reported(self):
        for flag in ("A", "B", "C", "D", "G", "H", "J", "K", "L", "N", "P", ""):
            with self.subTest(flag=flag):
                result, reasons = self.sample("25", flag)
                self.assertIsNone(result)
                self.assertEqual(sum(reasons.values()), 1)

    def test_missing_suppressed_and_nonfinite_figures_are_absent(self):
        for raw in ("-1", "-2", "-3", "-9", "", "PrivacySuppressed", "NULL", "NA", "nan", "inf", "-inf"):
            with self.subTest(raw=raw):
                result, reasons = self.sample(raw)
                self.assertIsNone(result)
                self.assertEqual(sum(reasons.values()), 1)

    def test_reported_zero_and_implied_zero_remain_distinct(self):
        self.assertEqual(self.sample("0", "R")[0], {"value": 0, "flag": "R"})
        self.assertEqual(self.sample("0", "Z")[0], {"value": 0, "flag": "Z"})
        with self.assertRaisesRegex(ValueError, "Implied-zero"):
            self.sample("1", "Z")

    def test_percent_range_is_enforced_without_clamping(self):
        self.assertEqual(self.sample("100", unit="%")[0]["value"], 100)
        self.assertIsNone(self.sample("101", unit="%")[0])
        self.assertIsNone(self.sample("-1", unit="%")[0])

    def test_noninteger_release_figures_are_never_rounded(self):
        with self.assertRaisesRegex(ValueError, "noninteger"):
            self.sample("42.5", unit="USD")

    def test_ambiguous_unitids_are_not_assigned_to_either_profile(self):
        def institution(uid, unitid, country="US"):
            return {"id": uid, "unitid": unitid, "country_code": country, "name": uid, "website": "https://example.edu/"}
        mapped, review, all_ids = aid.map_existing_unitids([
            institution("old-domain", "179867"), institution("new-domain", "179867"),
            institution("canonical", "166683"), institution("foreign", "166683", "DE"),
            institution("invalid", "not-an-id"),
        ])
        self.assertEqual(set(mapped), {"166683"})
        self.assertEqual(mapped["166683"]["id"], "canonical")
        self.assertEqual(review[0]["unitid"], "179867")
        self.assertEqual({u["id"] for u in review[0]["candidates"]}, {"old-domain", "new-domain"})
        self.assertEqual(set(all_ids), {"179867", "166683"})

    def test_dictionary_preserves_distinct_cohorts_and_flag_meanings(self):
        mapping, flags = aid.read_dictionary(aid.RAW / "SFA2324_Dict.zip")
        self.assertEqual(flags["Z"], "Implied zero")
        self.assertEqual(flags["R"], "Reported")
        self.assertIn("All undergraduate", mapping["UAGRNTP"]["cohort"])
        self.assertIn("first-time", mapping["ANYAIDP"]["cohort"])
        self.assertNotEqual(mapping["UAGRNTP"]["metric"], mapping["ANYAIDP"]["metric"])
        self.assertIn("institutional", mapping["IGRNT_A"]["dictionary_title"])
        self.assertFalse(any("net_price" in value["metric"] for value in mapping.values()))

    def test_changed_archive_is_rejected_against_original_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "SFA2324.zip"
            path.write_bytes(b"verified-original")
            path.with_name(path.name + ".meta.json").write_text(json.dumps({"url": aid.SOURCE_URL, "retrieved_at": "2026-09-26T17:17:08+00:00", "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size}))
            with patch.object(aid, "RAW", Path(tmp)):
                self.assertEqual(aid.verified_archive(path.name, aid.SOURCE_URL)[1]["retrieved_at"], "2026-09-26T17:17:08+00:00")
                path.write_bytes(b"changed")
                with self.assertRaisesRegex(ValueError, "original receipt"):
                    aid.verified_archive(path.name, aid.SOURCE_URL)

    def test_receipt_rebuild_is_byte_identical_and_does_not_touch_catalogue(self):
        source = ROOT / "data/published/global-directory.json"
        before = source.read_bytes()
        rebuilt = aid.build_receipt("2026-10-05")
        expected = json.loads((ROOT / "data/published/reviewed-ipeds-aid.json").read_text())
        # Volatile identity hash must match current catalogue; exclude from drift check.
        recomputed_sha = hashlib.sha256(source.read_bytes()).hexdigest()
        self.assertEqual(rebuilt["identity_basis"]["sha256"], recomputed_sha)
        def canonical(obj):
            clone = json.loads(json.dumps(obj))
            if isinstance(clone, dict) and isinstance(clone.get("identity_basis"), dict):
                clone["identity_basis"].pop("sha256", None)
            return json.dumps(clone, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        self.assertEqual(canonical(rebuilt), canonical(expected))
        self.assertEqual(source.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
