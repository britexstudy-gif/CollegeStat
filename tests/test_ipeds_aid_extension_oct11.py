"""Offline evidence/identity/privacy boundaries for the 27-field SFA extension."""
import collections
import copy
import csv
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("aid_extension", ROOT / "scripts/ingestion/ipeds-aid-extension-oct11.py")
extension = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(extension)


def identity(uid, unitid, country="US"):
    return {"id": uid, "name": uid, "unitid": unitid, "country_code": country, "website": "https://example.edu/"}


def source_zip(path, rows, fields):
    text = io.StringIO()
    writer = csv.DictWriter(text, fieldnames=["UNITID"] + list(fields) + [m["imputation_variable"] for m in fields.values()])
    writer.writeheader()
    writer.writerows(rows)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("sfa2324.csv", text.getvalue())


class AidExtensionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        catalogue = ROOT / "data/published/global-directory.json"
        cls.before = catalogue.read_bytes()
        cls.receipt = extension.build_receipt("2026-10-11")
        cls.mapping = cls.receipt["mappings"]
        cls.sample = copy.deepcopy(cls.receipt)
        cls.sample["records"] = cls.sample["records"][:2]
        cls.sample["counts"]["candidate_observations"] = sum(len(r["values"]) for r in cls.sample["records"])
        cls.sample["counts"]["universities_with_candidates"] = 2
        cls.sample["counts"]["field_counts"] = dict(sorted(collections.Counter(f for r in cls.sample["records"] for f in r["values"]).items()))
        cls.sample["value_signature_md5"] = extension.value_signature(cls.sample)

    def test_exact_dictionary_extension_does_not_reimport_old_fields(self):
        old, flags = extension.aid.read_dictionary(extension.aid.RAW / "SFA2324_Dict.zip")
        self.assertEqual(len(self.mapping), 27)
        self.assertFalse(set(old) & set(self.mapping))
        self.assertFalse({v["metric"] for v in old.values()} & {v["metric"] for v in self.mapping.values()})
        self.assertEqual(flags["R"], "Reported")
        self.assertEqual(flags["Z"], "Implied zero")
        self.assertFalse(any("net_price" in m["metric"] for m in self.mapping.values()))
        self.assertTrue(all(m["dictionary_description"] and m["dictionary_title"] == m["expected_title"] for m in self.mapping.values()))

    def test_changed_title_flag_column_description_or_overlap_is_rejected(self):
        variables = {f: {"F": m["imputation_variable"], "G": m["dictionary_title"]} for f, m in self.mapping.items()}
        descriptions = {f: m["dictionary_description"] for f, m in self.mapping.items()}
        for column, bad in (("F", "WRONG_IMPUTATION"), ("G", "Graduate aid")):
            altered = copy.deepcopy(variables)
            altered["UFLOANN"][column] = bad
            with self.assertRaisesRegex(ValueError, "does not validate"):
                extension.validate_field_contract(altered, descriptions, {})
        with self.assertRaisesRegex(ValueError, "does not validate"):
            extension.validate_field_contract(variables, {**descriptions, "UFLOANN": ""}, {})
        with self.assertRaisesRegex(ValueError, "duplicates"):
            extension.validate_field_contract(variables, descriptions, {"UFLOANN": self.mapping["UFLOANN"]})

    def test_scope_preserves_degree_non_degree_first_time_and_loan_meaning(self):
        self.assertEqual(self.mapping["UFLOANN"]["cohort"], extension.aid.UNDERGRADUATE)
        self.assertIn("Degree/certificate-seeking", self.mapping["UDGFLOANN"]["cohort"])
        self.assertIn("Non-degree/non-certificate-seeking", self.mapping["UNDFLOANN"]["cohort"])
        self.assertEqual(self.mapping["FGRNT_N"]["cohort"], extension.aid.FIRST_TIME)
        self.assertEqual(self.mapping["OLOAN_A"]["aid_kind"], "loan")
        self.assertTrue(self.mapping["OLOAN_A"]["metric"].endswith("average_amount"))
        self.assertTrue(self.mapping["SGRNT_A"]["metric"].endswith("average_award"))
        self.assertIn("September 1–August 31", self.receipt["publication_rules"]["cohorts"])
        self.assertIn("October 15", self.receipt["publication_rules"]["cohorts"])

    def test_strict_identity_never_borrows_foreign_or_malformed_unitid(self):
        bad = [" 100654", "100654 ", "012345", "12345", "100654.0", True, 100654.0, None]
        items = [identity("bad-" + str(i), unitid) for i, unitid in enumerate(bad)]
        items += [identity("valid", "100654"), identity("foreign", "100654", "GB"), identity("dup-a", "166683"), identity("dup-b", "166683")]
        unique, ambiguous, all_ids, invalid = extension.strict_identities(items)
        self.assertEqual(set(unique), {"100654"})
        self.assertEqual(unique["100654"]["id"], "valid")
        self.assertEqual(set(all_ids), {"100654", "166683"})
        self.assertEqual(ambiguous[0]["unitid"], "166683")
        self.assertEqual(len(invalid), len(bad))

    def test_numeric_flags_absence_and_zero_are_preserved(self):
        definition = self.mapping["UFLOANN"]
        for flag in ("A", "C", "G", "N", "P", ""):
            raw = {"UNITID": "100654", "UFLOANN": "10", "XUFLOANN": flag}
            self.assertIsNone(extension.aid.normalize_number(raw, "UFLOANN", definition, collections.Counter()))
        for raw_value in ("PrivacySuppressed", "-1", "nan", "", "NULL"):
            raw = {"UNITID": "100654", "UFLOANN": raw_value, "XUFLOANN": "R"}
            self.assertIsNone(extension.aid.normalize_number(raw, "UFLOANN", definition, collections.Counter()))
        for flag in ("R", "Z"):
            raw = {"UNITID": "100654", "UFLOANN": "0", "XUFLOANN": flag}
            self.assertEqual(extension.aid.normalize_number(raw, "UFLOANN", definition, collections.Counter()), {"value": 0, "flag": flag})
        with self.assertRaisesRegex(ValueError, "Implied-zero"):
            extension.aid.normalize_number({"UNITID": "100654", "UFLOANN": "1", "XUFLOANN": "Z"}, "UFLOANN", definition, collections.Counter())
        self.assertIsNone(extension.aid.normalize_number({"UNITID": "100654", "UFLOANP": "101", "XUFLOANP": "R"}, "UFLOANP", self.mapping["UFLOANP"], collections.Counter()))

    def test_source_duplicate_unitid_is_fatal_and_missing_average_not_zero(self):
        fields = {f: self.mapping[f] for f in ("UFLOANN", "UFLOANA")}
        raw = {"UNITID": "100654", "UFLOANN": "0", "XUFLOANN": "Z", "UFLOANA": "-1", "XUFLOANA": "A"}
        identities = {"100654": identity(str(uuid.uuid4()), "100654")}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "fixture.zip"
            source_zip(path, [raw], fields)
            rows, _, reasons, _, _ = extension.read_source_rows(path, fields, identities, identities)
            self.assertEqual(rows[0]["values"]["UFLOANN"]["value"], 0)
            self.assertNotIn("UFLOANA", rows[0]["values"])
            self.assertEqual(reasons["reporting_flag_A"], 1)
            source_zip(path, [raw, raw], fields)
            with self.assertRaisesRegex(ValueError, "Duplicate source UNITID"):
                extension.read_source_rows(path, fields, identities, identities)

    def test_review_records_keep_original_evidence_and_never_claim_verification(self):
        normalized = list(extension.iter_source_records(self.sample))
        self.assertEqual(len(normalized), self.sample["counts"]["candidate_observations"])
        for fact in normalized:
            definition = self.mapping[fact["raw_field"]]
            self.assertEqual(fact["status"], "pending")
            self.assertEqual(fact["verification_status"], "needs_review")
            self.assertEqual(fact["publication_status"], "review")
            self.assertIsNone(fact["last_verified_at"])
            self.assertEqual(fact["reporting_year"], 2024)
            self.assertEqual(fact["period"], "2023–2024 academic year")
            self.assertEqual(fact["retrieved_at"], self.receipt["source"]["retrieved_at"])
            self.assertEqual(fact["cohort"], definition["cohort"])
            self.assertEqual(fact["evidence"]["dataset_sha256"], extension.SOURCE_SHA)
            self.assertEqual(fact["evidence"]["dictionary_sha256"], extension.DICTIONARY_SHA)
            self.assertEqual(fact["evidence"]["dictionary_description"], definition["dictionary_description"])
            self.assertEqual(fact["evidence"]["mapping_reviewed_at"], "2026-10-11")
            self.assertIsNone(fact["evidence"]["verified_at"])
            self.assertLess(len(extension.canonical(fact["evidence"]).encode()), 16000)

    def test_ids_do_not_depend_on_review_date_and_do_depend_on_exact_population(self):
        row = self.receipt["records"][0]
        for field, fact in row["values"].items():
            self.assertEqual(fact["id"], extension.observation_id(row["unitid"], field, self.mapping[field]))
            uuid.UUID(fact["id"])
        field = "UFLOANN"
        altered = {**self.mapping[field], "cohort": extension.aid.FIRST_TIME}
        self.assertNotEqual(extension.observation_id(row["unitid"], field, altered), extension.observation_id(row["unitid"], field, self.mapping[field]))

    def test_cached_rebuild_count_and_signature_and_old_catalogue_are_stable(self):
        self.assertEqual(self.receipt["counts"]["candidate_observations"], 59829)
        self.assertEqual(self.receipt["counts"]["universities_with_candidates"], 2469)
        self.assertEqual(self.receipt["counts"]["ambiguous_existing_unitids"], 14)
        self.assertEqual(self.receipt["value_signature_md5"], "265b4a0dbe5512b7fb24637070cad725")
        self.assertEqual(self.receipt["field_contract_sha256"], "5af5c64cf9631c268c0c02863b52771e7e7a5c9b3c22a647bd4901d423aa61f5")
        self.assertEqual(self.receipt["counts"]["exclusions"]["reporting_flag_P"], 26)
        self.assertEqual((ROOT / "data/published/global-directory.json").read_bytes(), self.before)
        self.assertEqual(self.receipt["identity_basis"]["sha256"], hashlib.sha256(self.before).hexdigest())
        rebuilt = extension.build_receipt("2026-10-11")
        self.assertEqual(extension.canonical(rebuilt), extension.canonical(self.receipt))

    def test_changed_raw_value_id_or_coverage_blocks_output(self):
        for mutation in ("raw_value", "id", "count"):
            altered = copy.deepcopy(self.sample)
            datum = next(iter(altered["records"][0]["values"].values()))
            if mutation == "raw_value":
                datum["raw_value"] = "999999"
            elif mutation == "id":
                datum["id"] = str(uuid.uuid4())
            else:
                altered["counts"]["candidate_observations"] += 1
            with tempfile.TemporaryDirectory() as folder:
                dest = Path(folder) / "review"
                with self.assertRaises(ValueError):
                    extension.write_outputs(altered, dest)
                self.assertFalse(dest.exists())

    def test_rehashed_fake_population_or_verified_claim_does_not_bypass_review(self):
        for mutation in ("population", "verified"):
            altered = copy.deepcopy(self.sample)
            if mutation == "population":
                altered["mappings"]["UFLOANN"]["cohort"] = "International applicants eligible for grants"
                altered["field_contract_sha256"] = extension.sha(altered["mappings"])
            else:
                altered["verification_status"] = "verified"
                altered["last_verified_at"] = "2026-10-11"
            with self.assertRaises(ValueError):
                extension.validate_receipt(altered)

    def test_output_is_idempotent_exclusive_and_sql_only_stages_pending(self):
        with tempfile.TemporaryDirectory() as folder:
            dest = Path(folder) / "review"
            manifest = extension.write_outputs(self.sample, dest, 1)
            before = {p.name: p.read_bytes() for p in dest.iterdir()}
            rerun = extension.write_outputs(self.sample, dest, 1)
            self.assertEqual(manifest, rerun)
            self.assertEqual(before, {p.name: p.read_bytes() for p in dest.iterdir()})
            self.assertEqual(manifest["hosted_writes"], 0)
            self.assertEqual(manifest["publications"], 0)
            self.assertEqual(manifest["schema_changes"], 0)
            sql = (dest / "02-pending-001.sql").read_text()
            self.assertIn("x.system='ipeds' and x.external_id=c.unitid", sql)
            self.assertIn("source_records", sql)
            self.assertIn("'high','pending'", sql)
            self.assertIn("Candidate value signature", sql)
            self.assertIn("Existing source fact conflicts", sql)
            self.assertIn("Existing public fact conflicts", sql)
            self.assertIn("where not exists(select 1 from public.source_records old", sql)
            self.assertNotRegex(sql.lower(), r"insert into public\.(data_points|financial_aid|costs|universities)")
            self.assertNotRegex(sql.lower(), r"(?:update|delete from|alter table) public\.")
            self.assertNotIn("disable row level security", sql.lower())
            changed = copy.deepcopy(self.sample)
            changed["reviewed_at"] = "2026-10-12"
            with self.assertRaisesRegex(ValueError, "differs"):
                extension.write_outputs(changed, dest, 1)
            self.assertEqual(before, {p.name: p.read_bytes() for p in dest.iterdir()})

    def test_sql_literals_do_not_execute_or_corrupt_quotes(self):
        self.assertEqual(extension.literal("Student's grant"), "'Student''s grant'")
        self.assertEqual(extension.literal("$(echo secret) `hostname`"), "'$(echo secret) `hostname`'")
        with self.assertRaisesRegex(ValueError, "null byte"):
            extension.literal("invalid\x00text")


if __name__ == "__main__":
    unittest.main()
