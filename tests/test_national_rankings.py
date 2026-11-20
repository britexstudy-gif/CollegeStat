import collections
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts/ingestion" / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


adapter = module("national_rankings", "review-national-rankings.py")
staging = module("national_staging", "stage-national-rankings.py")


class NationalParserTests(unittest.TestCase):
    def test_source_integers_are_not_truncated_or_suppression_guessed(self):
        for value in (None, "", "—", "N/A"):
            self.assertIsNone(adapter.safe_herd_int(value))
        self.assertEqual(adapter.safe_herd_int("1,234.0"), 1234)
        for value in ("1.5", "-1", "NaN", "Infinity"):
            with self.assertRaises(ValueError):
                adapter.safe_herd_int(value)

    def test_short_names_preserve_campus_qualifiers(self):
        self.assertEqual(adapter.exact_name("U. Texas, Austin"), adapter.exact_name("University of Texas at Austin, The"))
        self.assertNotEqual(adapter.exact_name("U. Texas, Austin"), adapter.exact_name("University of Texas at Dallas"))
        self.assertNotEqual(adapter.exact_name("University of Maryland"), adapter.exact_name("University of Maryland, Baltimore"))

    def test_combined_units_are_never_single_profiles(self):
        self.assertTrue(adapter.aggregate_reporting_unit("Pennsylvania State U., University Park and Hershey Medical Center", None))
        self.assertTrue(adapter.aggregate_reporting_unit("U. Marylandb", "b"))
        self.assertFalse(adapter.aggregate_reporting_unit("Washington and Lee U.", None))


class NationalReceiptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = ROOT / "data/published/reviewed-national-rankings.json"
        cls.receipt = json.loads(cls.path.read_text())

    def test_every_selected_position_has_source_scope_and_permission(self):
        counts = {provider["provider"]: len(provider["records"]) for provider in self.receipt["providers"]}
        self.assertEqual(counts, {"herd": 925, "nirf": 114})
        ids = []
        for provider in self.receipt["providers"]:
            for row in provider["records"]:
                ids.append(row["id"])
                self.assertEqual(row["rank"], row["evidence"]["raw_rank"])
                self.assertTrue(row["source_url"].startswith("https://"))
                self.assertEqual(len(row["evidence"]["source_sha256"]), 64)
                self.assertTrue(row["retrieved_at"] and row["scope"] and row["population"] and row["reporting_period"])
                self.assertTrue(row["evidence"]["permission_url"].startswith("https://"))
                self.assertEqual(row["publication_status"], "review")
        self.assertEqual(len(ids), len(set(ids)))

    def test_aggregate_and_imputation_are_preserved(self):
        herd = self.receipt["providers"][0]
        aggregates = [row for row in herd["records"] if row["identity_status"] == "aggregate_reporting_unit"]
        self.assertEqual(len(aggregates), 9)
        self.assertTrue(all(row["university_id"] is None for row in aggregates))
        self.assertEqual(sum(row["imputed"] for row in herd["records"]), 44)
        for row in herd["records"]:
            if row["imputed"]:
                self.assertTrue(row["evidence"]["imputed_total"])

    def test_territories_and_ties_remain_explicit(self):
        herd = self.receipt["providers"][0]["records"]
        self.assertTrue(any(row["country_code"] == "PR" for row in herd))
        self.assertTrue(any(row["country_code"] == "GU" for row in herd))
        for row in herd:
            if row["tied"]:
                self.assertTrue(row["rank_label"].startswith("="))

    def test_nirf_is_selected_categories_not_a_full_global_table(self):
        nirf = self.receipt["providers"][1]
        self.assertFalse(nirf["complete"])
        categories = collections.Counter(row["category"] for row in nirf["records"])
        self.assertEqual(len(categories), 17)
        self.assertEqual(categories["Universities"], 10)
        self.assertTrue(all(row["rank"] <= 10 for row in nirf["records"]))

    def test_private_staging_is_idempotent_and_does_not_publish_or_modify_schema(self):
        with tempfile.TemporaryDirectory() as folder:
            report = staging.generate(self.receipt, Path(folder))
            self.assertEqual(report, staging.generate(self.receipt, Path(folder)))
            self.assertEqual(report["private_source_positions"], 1039)
            self.assertEqual(report["public_rows"], 0)
            sql = "\n".join(Path(file["file"]).read_text() for file in report["files"])
            self.assertIn("'pending'", sql)
            self.assertIn("'needs_review'", sql)
            self.assertIn("permitted)\nselect", sql)
            self.assertIn(",false from public.ranking_providers", sql)
            self.assertNotIn("update public.", sql.lower())
            self.assertNotIn("delete from", sql.lower())
            self.assertNotIn("alter table", sql.lower())

    @unittest.skipUnless((ROOT / "data/raw/ncses-herd/public-use-2024.zip").exists(), "Official raw sources are downloaded separately")
    def test_cached_snapshot_reproduces_exact_installed_receipt(self):
        reproduced = adapter.build_receipt("2026-10-09")
        # Later reviewed identity additions may improve linkage. They must not
        # rewrite the immutable publisher facts or the original receipt.
        self.assertEqual(reproduced["identity_basis"]["sha256"], hashlib.sha256(
            (ROOT / "data/published/global-directory.json").read_bytes()).hexdigest())
        for current, original in zip(reproduced["providers"], self.receipt["providers"]):
            self.assertEqual(len(current["records"]), len(original["records"]))
            for row, old in zip(current["records"], original["records"]):
                if old["university_id"]:
                    self.assertEqual(row["university_id"], old["university_id"])
                elif row["university_id"]:
                    reviewed = [u["id"] for u in json.loads((ROOT / "data/published/global-directory.json").read_text())
                                if row["id"] in u.get("identity_evidence", {}).get("ranking_record_ids", [])]
                    self.assertEqual(reviewed, [row["university_id"]])
        def source_facts(receipt):
            value = copy.deepcopy(receipt)
            value.pop("identity_basis")
            value.pop("counts")
            for provider in value["providers"]:
                for field in ("profile_matches", "unlinked_positions", "unique_profile_matches"):
                    provider["counts"].pop(field, None)
                for row in provider["records"]:
                    row.pop("university_id")
                    row.pop("identity_status")
                    row["evidence"].pop("profile_identity_status")
            return value
        self.assertEqual(source_facts(reproduced), source_facts(self.receipt))

    def test_identity_proposals_do_not_fabricate_published_routes(self):
        plan = json.loads((ROOT / "data/published/reviewed-national-ranking-identities.json").read_text())
        self.assertEqual(plan["counts"]["hosted_writes"], 0)
        self.assertEqual(plan["counts"]["new_universities_published"], 0)
        self.assertTrue(all(row["publication_status"] == "review" and row["ror"].startswith("https://ror.org/") and row["website"] for row in plan["identity_proposals"]))
        self.assertTrue(all("proposed_university_id" in row and "university_id" not in row for row in plan["mappings"] if row["status"] == "private_new_identity_proposal"))


if __name__ == "__main__":
    unittest.main()
