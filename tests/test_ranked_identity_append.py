import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ranked_identity_append", ROOT / "scripts/ingestion/append-reviewed-national-identities.py")
APPEND = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(APPEND)


class RankedIdentityAppendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proposals = json.loads((ROOT / "data/published/reviewed-national-ranking-identities.json").read_text())
        cls.snapshot = json.loads((ROOT / "data/published/reviewed-national-rankings.json").read_text())
        cls.registry = APPEND.load_registry()
        directory = json.loads((ROOT / "data/published/global-directory.json").read_text())
        proposed_ids = {row["id"] for row in cls.proposals["identity_proposals"]}
        cls.base = [row for row in directory if row["id"] not in proposed_ids]
        cls.report = APPEND.build_plan(cls.proposals, cls.snapshot, cls.base, cls.registry)
        # Validate the complete immutable archive once above. Mutation cases
        # use the exact proposed records and their parents so they exercise
        # reconciliation guards without copying the entire registry each time.
        proposed_rors = {row["ror"] for row in cls.proposals["identity_proposals"]}
        parent_rors = {rel["id"] for row in cls.registry if row["id"] in proposed_rors
                       for rel in row["relationships"] if rel["type"] == "parent"}
        cls.relevant_registry = [row for row in cls.registry if row["id"] in proposed_rors | parent_rors]

    def test_only_independent_universities_pass_the_existing_scope(self):
        self.assertEqual(self.report["counts"]["proposals"], 10)
        self.assertEqual(self.report["counts"]["added"], 3)
        self.assertEqual(self.report["counts"]["held"], 7)
        self.assertEqual({row["name"] for row in self.report["records"]}, {
            "Symbiosis University of Applied Sciences", "Shri Vishwakarma Skill University", "Nalsar University of Law"})
        self.assertTrue(all(row["reason"].startswith("non_university_or_research_unit") for row in self.report["held"]))
        self.assertEqual(self.report["counts"]["hosted_writes"], 0)
        self.assertEqual(self.report["counts"]["ranking_observations_published"], 0)

    def test_old_ids_routes_facts_order_and_source_observations_are_preserved(self):
        before = copy.deepcopy(self.base)
        source_before = copy.deepcopy(self.snapshot)
        manifest = json.loads((ROOT / "data/published/directory-manifest.json").read_text())
        countries = json.loads((ROOT / "data/published/directory-countries.json").read_text())
        body, after_manifest, after_countries = APPEND.apply_local(self.base, manifest, countries, self.report)
        after = json.loads(body)
        self.assertEqual(after[:len(before)], before)
        self.assertEqual(self.base, before)
        self.assertEqual(self.snapshot, source_before)
        self.assertEqual(after_manifest["catalogue_total"], len(before) + 3)
        self.assertEqual(after_manifest["sha256"], hashlib.sha256(body.encode()).hexdigest())
        self.assertEqual(after_manifest["registry_identity_additions"], manifest["registry_identity_additions"])
        self.assertEqual(after_manifest["retrieved_at"], manifest["retrieved_at"])
        self.assertEqual(countries, after_countries)
        for row in after[len(before):]:
            self.assertTrue(row["identity_evidence"]["ranking_record_ids"])
            self.assertEqual(row["identity_evidence"]["ranking_publication_status"], "review")
            self.assertEqual(row["identity_evidence"]["registry_sha256"], APPEND.REGISTRY_SHA256)
            self.assertEqual(row["identity_retrieved_at"], "2026-09-26")
            for field in ("rankings", "logo_url", "university_type", "requirements", "tuition_in_state", "acceptance_rate", "programmes"):
                self.assertNotIn(field, row)

    def test_repeat_append_is_idempotent_and_preserves_later_corrections(self):
        installed = self.base + copy.deepcopy(self.report["records"])
        installed[-1]["notes"] = "Later staff correction must remain"
        again = APPEND.build_plan(self.proposals, self.snapshot, installed, self.relevant_registry)
        self.assertEqual(again["counts"]["added"], 0)
        self.assertEqual(again["counts"]["already_installed"], 3)
        self.assertEqual(again["counts"]["held"], 7)
        self.assertEqual(APPEND.rules.merge_receipt(installed, again["records"]), installed)

    def test_changed_baseline_or_source_receipt_blocks_all_appends(self):
        changed_base = copy.deepcopy(self.base)
        changed_base[0]["name"] = "Changed since proposal review"
        with self.assertRaisesRegex(ValueError, "base catalogue differs"):
            APPEND.build_plan(self.proposals, self.snapshot, changed_base, self.relevant_registry)
        changed_source = copy.deepcopy(self.snapshot)
        changed_source["providers"][0]["records"][0]["rank"] = 200
        with self.assertRaisesRegex(ValueError, "source receipt checksum"):
            APPEND.build_plan(self.proposals, changed_source, self.base, self.relevant_registry)

    def test_missing_source_id_or_forged_official_site_blocks_appends(self):
        proposal = copy.deepcopy(self.proposals)
        proposal["identity_proposals"][0]["evidence"]["ranking_record_ids"] = ["unknown-source-position"]
        with self.assertRaisesRegex(ValueError, "source position is missing"):
            APPEND.build_plan(proposal, self.snapshot, self.base, self.relevant_registry)
        proposal = copy.deepcopy(self.proposals)
        proposal["identity_proposals"][0]["website"] = "https://unverified.example"
        with self.assertRaisesRegex(ValueError, "exact registered official website"):
            APPEND.build_plan(proposal, self.snapshot, self.base, self.relevant_registry)

    def test_education_parent_and_shared_registry_host_are_held(self):
        registry = copy.deepcopy(self.relevant_registry)
        first = self.report["records"][0]
        record = next(row for row in registry if row["id"] == first["ror"])
        parent = next(row for row in registry if "education" in row["types"] and row["id"] != record["id"])
        record["relationships"].append({"type": "parent", "id": parent["id"], "label": "Parent university"})
        records, held, _ = APPEND.eligible_records(self.proposals, self.base, registry)
        self.assertNotIn(first["id"], {row["id"] for row in records})
        self.assertTrue(any(row["id"] == first["id"] and row["reason"] == "education_parent_or_constituent_campus" for row in held))
        registry = copy.deepcopy(self.relevant_registry)
        duplicate = copy.deepcopy(next(row for row in registry if row["id"] == first["ror"]))
        duplicate["id"] = "https://ror.org/duplicate-test-record"
        registry.append(duplicate)
        records, held, _ = APPEND.eligible_records(self.proposals, self.base, registry)
        self.assertNotIn(first["id"], {row["id"] for row in records})
        self.assertTrue(any(row["id"] == first["id"] and row["reason"] == "missing_or_ambiguous_registry_website" for row in held))

    def test_ambiguous_registered_names_are_not_merged_by_similarity(self):
        registry = copy.deepcopy(self.relevant_registry)
        duplicate = copy.deepcopy(next(row for row in registry if row["id"] == self.report["records"][0]["ror"]))
        duplicate["id"] = "https://ror.org/ambiguous-name-test-record"
        duplicate["links"] = [{"type": "website", "value": "https://different.example"}]
        registry.append(duplicate)
        with self.assertRaisesRegex(ValueError, "ambiguous registered name/alias"):
            APPEND.build_plan(self.proposals, self.snapshot, self.base, registry)

    def test_bad_registry_archive_or_existing_route_conflict_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            bad = Path(folder) / "wrong.zip"
            bad.write_bytes(b"not the installed immutable release")
            with self.assertRaisesRegex(ValueError, "archive checksum"):
                APPEND.load_registry(bad)
        installed = self.base + copy.deepcopy(self.report["records"])
        installed[-1]["slug"] = "wrong-replacement-route"
        with self.assertRaisesRegex(ValueError, "conflicting ROR or canonical route"):
            APPEND.build_plan(self.proposals, self.snapshot, installed, self.relevant_registry)


if __name__ == "__main__":
    unittest.main()
