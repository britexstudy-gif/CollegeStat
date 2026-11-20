"""Meaningful boundaries for the review-only IPEDS graduation-outcomes parser.

Uses only the local checksum-verified ZIPs and the review-only receipt.
No network, database, catalogue mutation or publication.
Full data read happens at most once (single reproducibility test);
all other tests reuse one cached receipt load.
"""
import csv
import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "ipeds_graduation", ROOT / "scripts/ingestion/ipeds-graduation-outcomes.py"
)
gr = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gr)

RECEIPT_PATH = ROOT / "data/published/reviewed-ipeds-graduation-outcomes.json"

_CACHED_RECEIPT = None


def cached_receipt():
    global _CACHED_RECEIPT
    if _CACHED_RECEIPT is None:
        _CACHED_RECEIPT = json.loads(RECEIPT_PATH.read_text())
    return _CACHED_RECEIPT


def make_institution(uid, unitid, country="US"):
    return {
        "id": uid,
        "name": uid,
        "country_code": country,
        "unitid": unitid,
        "website": "https://example.edu/",
    }


def write_source_zip(directory, rows, fieldnames=None):
    """Create a minimal gr2024.csv ZIP for read_source_rows tests."""
    if fieldnames is None:
        fieldnames = [
            "UNITID",
            "GRTYPE",
            "CHRTSTAT",
            "SECTION",
            "COHORT",
            "LINE",
            "GRTOTLT",
            "XGRTOTLT",
            "GRNRALT",
            "XGRNRALT",
        ]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in fieldnames})
    path = Path(directory) / "gr2024-test.zip"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("gr2024.csv", buffer.getvalue().encode("utf-8"))
    return path


def valid_row(unitid="100654", grtype="8"):
    contract = cached_receipt()["dictionary_contract"]
    if grtype in contract["types"]:
        selectors = dict(contract["types"][grtype]["selectors"])
    else:
        selectors = {"GRTYPE": grtype, "CHRTSTAT": "99", "SECTION": "9", "COHORT": "9", "LINE": "99"}
    selectors["GRTYPE"] = grtype
    # selectors already contain exact expected values; force UNITID separately
    return {
        "UNITID": unitid,
        "GRTYPE": selectors["GRTYPE"],
        "CHRTSTAT": selectors["CHRTSTAT"],
        "SECTION": selectors["SECTION"],
        "COHORT": selectors["COHORT"],
        "LINE": selectors["LINE"],
        "GRTOTLT": "10",
        "XGRTOTLT": "R",
        "GRNRALT": "1",
        "XGRNRALT": "R",
    }


class IdentityReconciliationTests(unittest.TestCase):
    def test_exact_unique_us_unitid_excludes_duplicates_foreign_invalid(self):
        catalogue = [
            make_institution("old-domain", "111188"),
            make_institution("new-domain", "111188"),
            make_institution("canonical", "100654"),
            make_institution("foreign-twin", "100654", "DE"),
            make_institution("bad-leading-zero", "012345"),
            make_institution("bad-short", "12345"),
            make_institution("bad-none", None),
        ]
        unique, ambiguous, by_unitid, missing = gr.map_existing_unitids(catalogue)
        # Only the single US exact UNITID survives.
        self.assertEqual(set(unique), {"100654"})
        self.assertEqual(unique["100654"]["id"], "canonical")
        # Foreign twin never enters the US join.
        self.assertNotIn("foreign-twin", [u["id"] for group in by_unitid.values() for u in group])
        self.assertEqual(set(by_unitid), {"111188", "100654"})
        # Duplicate UNITID is held, never assigned to either profile.
        self.assertEqual(len(ambiguous), 1)
        self.assertEqual(ambiguous[0]["unitid"], "111188")
        self.assertEqual(ambiguous[0]["reason"], "multiple_existing_us_canonical_candidates")
        self.assertEqual(
            [c["id"] for c in ambiguous[0]["candidates"]], ["new-domain", "old-domain"]
        )
        # Invalid identities are held with an explicit reason, sorted by id.
        self.assertEqual(
            [m["university_id"] for m in missing],
            ["bad-leading-zero", "bad-none", "bad-short"],
        )
        for entry in missing:
            self.assertEqual(entry["reason"], "missing_or_invalid_exact_us_unitid")

    def test_deliberately_bad_identities_never_borrow_or_strip(self):
        bad_values = [
            "",
            " 100654 ",
            "100654 ",
            " 100654",
            "ABC123",
            "000000",
            "012345",
            "12345",
            "1234567",
            "100654.0",
            "1,00654",
            0,
            -100654,
            100654.0,
            100654.5,
            True,
            False,
            None,
            [],
            {},
        ]
        catalogue = [make_institution(f"bad-{i}", value) for i, value in enumerate(bad_values)]
        catalogue.append(make_institution("good", "100654"))
        unique, ambiguous, by_unitid, missing = gr.map_existing_unitids(catalogue)
        self.assertEqual(set(unique), {"100654"})
        self.assertEqual(ambiguous, [])
        self.assertEqual(set(by_unitid), {"100654"})
        self.assertEqual(len(missing), len(bad_values))
        self.assertEqual(
            [m["university_id"] for m in missing],
            sorted(m["university_id"] for m in missing),
        )

    def test_int_six_digit_accepted_float_bool_rejected(self):
        unique, _, by_unitid, missing = gr.map_existing_unitids(
            [
                make_institution("int-good", 100654),
                make_institution("float-bad", 100654.0),
                make_institution("bool-bad", True),
            ]
        )
        self.assertEqual(set(unique), {"100654"})
        self.assertEqual(unique["100654"]["id"], "int-good")
        self.assertEqual(set(by_unitid), {"100654"})
        self.assertEqual({m["university_id"] for m in missing}, {"float-bad", "bool-bad"})


class NumericFlagTests(unittest.TestCase):
    def test_r_accepted_z_is_real_zero(self):
        value, reason = gr.normalize_count("1398", "R")
        self.assertEqual((value, reason), (1398, None))
        value, reason = gr.normalize_count("  42 ", "R")
        self.assertEqual((value, reason), (42, None))
        value, reason = gr.normalize_count("0", "R")
        self.assertEqual((value, reason), (0, None))
        value, reason = gr.normalize_count("0", "Z")
        self.assertEqual((value, reason), (0, None))
        value, reason = gr.normalize_count(" 0 ", "Z")
        self.assertEqual((value, reason), (0, None))
        # Receipt itself retains a real Z zero example.
        receipt = cached_receipt()
        found = [
            v
            for row in receipt["records"]
            for v in row["values"].values()
            if v["flag"] == "Z"
        ]
        self.assertGreater(len(found), 0)
        self.assertTrue(all(v["value"] == 0 for v in found))
        self.assertIn("Implied zero", {v["flag_label"] for v in found})

    def test_imputed_corrected_generated_values_are_held_not_zero(self):
        for flag in ("C", "G", "J", "K", "L", "N", "P"):
            with self.subTest(flag=flag):
                value, reason = gr.normalize_count("25", flag)
                self.assertIsNone(value)
                self.assertEqual(reason, "imputation_generation_or_correction")
        # Deliberately bad: imputed zero must not become a real zero.
        value, reason = gr.normalize_count("0", "P")
        self.assertEqual(reason, "imputation_generation_or_correction")
        receipt = cached_receipt()
        self.assertEqual(
            receipt["counts"]["held_numeric_values"],
            {"imputation_generation_or_correction": 10},
        )
        self.assertEqual(len(receipt["numeric_review"]), 10)
        self.assertTrue(
            all(v["reason"] == "imputation_generation_or_correction" for v in receipt["numeric_review"])
        )

    def test_not_applicable_blank_unknown_flags_are_held(self):
        value, reason = gr.normalize_count("25", "A")
        self.assertEqual(reason, "not_applicable")
        for flag in ("B", "D", "H"):
            with self.subTest(flag=flag):
                _, reason = gr.normalize_count("25", flag)
                self.assertEqual(reason, "blank_or_unusable_reporting_flag")
        for flag in ("", "X", "r", "R ", "ZZ"):
            with self.subTest(flag=flag):
                _, reason = gr.normalize_count("25", flag)
                self.assertEqual(reason, "unknown_or_empty_reporting_flag")

    def test_missing_suppressed_negative_invalid_are_absent_never_zero(self):
        cases = {
            "": "missing_numeric",
            "   ": "missing_numeric",
            "NA": "missing_numeric",
            "N/A": "missing_numeric",
            "NULL": "missing_numeric",
            "PrivacySuppressed": "suppressed_or_negative_numeric",
            "-5": "suppressed_or_negative_numeric",
            "-3.5": "suppressed_or_negative_numeric",
            "-0": "suppressed_or_negative_numeric",
            "42.5": "invalid_noninteger_numeric",
            "1,000": "invalid_noninteger_numeric",
            "abc": "invalid_noninteger_numeric",
            "12a": "invalid_noninteger_numeric",
            "0x10": "invalid_noninteger_numeric",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                value, reason = gr.normalize_count(raw, "R")
                self.assertIsNone(value)
                self.assertEqual(reason, expected)
        # Non-string raw values are missing, never coerced.
        for raw in (None, 42, 42.0, ["42"], {}):
            with self.subTest(raw=raw):
                _, reason = gr.normalize_count(raw, "R")
                self.assertEqual(reason, "missing_numeric")

    def test_implied_zero_conflict_is_held(self):
        for raw in ("1", " 1 ", "001", "10"):
            with self.subTest(raw=raw):
                value, reason = gr.normalize_count(raw, "Z")
                self.assertIsNone(value)
                self.assertEqual(reason, "implied_zero_conflict")


class DictionaryContractTests(unittest.TestCase):
    def test_codes_field_definitions_contradictory_year_preserved(self):
        contract = cached_receipt()["dictionary_contract"]
        # Fields keep dictionary titles, units and imputation variables.
        self.assertEqual(set(contract["fields"]), {"GRTOTLT", "GRNRALT"})
        self.assertEqual(contract["fields"]["GRTOTLT"]["unit"], "students")
        self.assertEqual(contract["fields"]["GRTOTLT"]["imputation_variable"], "XGRTOTLT")
        self.assertEqual(contract["fields"]["GRTOTLT"]["dictionary_title"], "Grand total")
        self.assertTrue(
            contract["fields"]["GRTOTLT"]["dictionary_description"].startswith(
                "Grand total (men and women) in cohort"
            )
        )
        self.assertEqual(contract["fields"]["GRNRALT"]["dictionary_title"], "U.S. Nonresident total")
        self.assertTrue(
            contract["fields"]["GRNRALT"]["dictionary_description"].startswith("U.S. Nonresident total")
        )
        # Selector codes are preserved verbatim.
        self.assertEqual(
            contract["reporting_flags"],
            gr.EXPECTED_FLAGS,
        )
        self.assertEqual(contract["reporting_flags"]["R"], "Reported")
        self.assertEqual(contract["reporting_flags"]["Z"], "Implied zero")
        for selector in ("GRTYPE", "CHRTSTAT", "SECTION", "COHORT", "LINE"):
            self.assertIn(selector, contract["codes"])
        self.assertEqual(
            contract["types"]["2"]["selectors"],
            {"GRTYPE": "2", "CHRTSTAT": "12", "SECTION": "1", "COHORT": "1", "LINE": "999"},
        )
        self.assertEqual(
            contract["types"]["8"]["selectors"],
            {"GRTYPE": "8", "CHRTSTAT": "12", "SECTION": "2", "COHORT": "2", "LINE": "50"},
        )
        # Contradictory cohort year is preserved; normalized year stays null.
        self.assertIsNone(contract["entry_cohort_year"])
        for grtype, entry in contract["types"].items():
            with self.subTest(grtype=grtype):
                self.assertIsNone(entry["entry_cohort_year"])
        issue = contract["cohort_year_issue"]
        self.assertIn("2017", issue)
        self.assertIn("2020", issue)
        self.assertIn("2018", issue)
        self.assertIn("2021", issue)
        self.assertIn("unresolved", issue)
        self.assertTrue(contract["introduction_title"].endswith(":  2024"))
        self.assertIn("2017 (4-year)", contract["introduction_title"])
        self.assertIn("2020 (2-year)", contract["introduction_title"])
        self.assertIn("August 31, 2024", contract["introduction_overview"])
        self.assertIn(
            "full-time, first-time degree/certificate-seeking undergraduates",
            contract["introduction_overview"],
        )

    def test_dictionary_reproduces_from_cached_zip_without_full_data_read(self):
        if not (gr.RAW / "GR2024_Dict.zip").exists():
            self.skipTest("cached dictionary ZIP unavailable")
        path, _ = gr.verified_archive(gr.DICTIONARY_URL.split("/")[-1], gr.DICTIONARY_URL, gr.DICTIONARY_SHA)
        contract = gr.read_dictionary(path)
        expected = cached_receipt()["dictionary_contract"]

        def canonical(obj):
            return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

        self.assertEqual(canonical(contract), canonical(expected))

    def test_grnralt_is_subgroup_not_enrollment(self):
        receipt = cached_receipt()
        contract = receipt["dictionary_contract"]
        self.assertIn("visa or temporary basis", contract["fields"]["GRNRALT"]["dictionary_description"])
        self.assertIn("U.S. Nonresident", contract["fields"]["GRNRALT"]["dictionary_description"])
        # Metric carries the subgroup suffix; grand total never does.
        for row in receipt["records"]:
            with self.subTest(record=row["source_record_id"]):
                self.assertIn("GRTOTLT", row["values"])
                self.assertIn("GRNRALT", row["values"])
                total_metric = row["values"]["GRTOTLT"]["metric"]
                sub_metric = row["values"]["GRNRALT"]["metric"]
                self.assertEqual(sub_metric, total_metric + "_us_nonresident")
                self.assertNotIn("enroll", sub_metric)
                self.assertNotIn("enroll", total_metric)
        self.assertIn("not all international", receipt["publication_rules"]["nonresident"])
        self.assertIn("current enrollment", receipt["publication_rules"]["nonresident"])

    def test_historical_completion_not_current_programs(self):
        receipt = cached_receipt()
        contract = receipt["dictionary_contract"]
        self.assertEqual(
            contract["types"]["9"]["metric"], "graduation_bachelor_seeking_any_completion_150pct_count"
        )
        self.assertEqual(
            contract["types"]["12"]["metric"],
            "graduation_bachelor_seeking_bachelor_completion_150pct_count",
        )
        self.assertNotEqual(contract["types"]["9"]["metric"], contract["types"]["12"]["metric"])
        self.assertIn("not current program", receipt["publication_rules"]["completion"])
        self.assertIn("type 9", receipt["publication_rules"]["completion"])
        self.assertIn("type 12", receipt["publication_rules"]["completion"])
        # LINE=999 generated rows are retained as evidence, only for types 2/3.
        self.assertTrue(contract["types"]["2"]["source_generated_row"])
        self.assertTrue(contract["types"]["3"]["source_generated_row"])
        self.assertFalse(contract["types"]["8"]["source_generated_row"])
        self.assertFalse(contract["types"]["9"]["source_generated_row"])
        self.assertFalse(contract["types"]["12"]["source_generated_row"])
        self.assertEqual(receipt["counts"]["candidate_generated_source_rows"], 4465)
        self.assertEqual(
            receipt["counts"]["candidate_generated_source_rows"],
            receipt["counts"]["field_counts_by_grtype"]["2"]["GRTOTLT"]
            + receipt["counts"]["field_counts_by_grtype"]["3"]["GRTOTLT"],
        )
        # Expanded notes never claim current availability.
        expanded = list(gr.iter_source_records(receipt))
        self.assertTrue(
            all("No rate, enrollment, or current program claim" in r["notes"] for r in expanded[:50])
        )


class DeterminismTests(unittest.TestCase):
    def test_source_row_and_observation_ids_deterministic(self):
        first = gr.observation_id("100654", "8", "GRTOTLT")
        self.assertEqual(first, gr.observation_id("100654", "8", "GRTOTLT"))
        self.assertEqual(first, "8986c7cb-e1a9-5ee8-a2e0-9837895108d2")
        self.assertNotEqual(first, gr.observation_id("100654", "8", "GRNRALT"))
        self.assertNotEqual(first, gr.observation_id("100655", "8", "GRTOTLT"))
        self.assertNotEqual(first, gr.observation_id("100654", "9", "GRTOTLT"))
        self.assertNotEqual(first, gr.observation_id("100654", "8", "GRTOTLT", period="other"))
        # UUIDv5 shape.
        parsed = uuid.UUID(first)
        self.assertEqual(parsed.version, 5)
        # Compact row trims identity for the join but keeps raw evidence.
        raw = gr.compact_raw_row(
            {
                "UNITID": " 100654 ",
                "GRTYPE": " 8 ",
                "CHRTSTAT": "12",
                "SECTION": "2",
                "COHORT": "2",
                "LINE": "50",
                "GRTOTLT": "10",
                "XGRTOTLT": "R",
                "GRNRALT": "1",
                "XGRNRALT": "R",
            }
        )
        self.assertEqual(raw["source_record_id"], "100654:8")
        self.assertEqual(raw["unitid"], "100654")
        self.assertEqual(raw["grtype"], "8")

    def test_receipt_ids_match_deterministic_key_and_stay_unique(self):
        receipt = cached_receipt()
        seen_obs, seen_rows = set(), set()
        for row in receipt["records"]:
            self.assertEqual(row["source_record_id"], f"{row['unitid']}:{row['grtype']}")
            self.assertNotIn(row["source_record_id"], seen_rows)
            seen_rows.add(row["source_record_id"])
            for field, datum in row["values"].items():
                expected = gr.observation_id(row["unitid"], row["grtype"], field)
                self.assertEqual(datum["id"], expected)
                self.assertNotIn(datum["id"], seen_obs)
                seen_obs.add(datum["id"])
        self.assertEqual(len(seen_obs), receipt["counts"]["candidate_observations"])
        self.assertEqual(len(seen_rows), receipt["counts"]["candidate_source_rows"])
        # Records are sorted for stable review.
        keys = [(int(r["unitid"]), int(r["grtype"])) for r in receipt["records"]]
        self.assertEqual(keys, sorted(keys))

    def test_no_derived_rates(self):
        receipt = cached_receipt()
        self.assertEqual(receipt["counts"]["derived_rates"], 0)
        self.assertEqual(receipt["counts"]["publications"], 0)
        self.assertEqual(receipt["counts"]["database_writes"], 0)
        self.assertIn("No rates derived", receipt["publication_rules"]["rates"])
        metrics = {
            datum["metric"] for row in receipt["records"] for datum in row["values"].values()
        }
        self.assertFalse(any("rate" in m for m in metrics))
        self.assertFalse(any("percent" in m for m in metrics))
        for row in receipt["records"]:
            for datum in row["values"].values():
                self.assertIsInstance(datum["value"], int)
                self.assertGreaterEqual(datum["value"], 0)
        # Missing completion pairs stay unknown, never zero-filled.
        for gap in receipt["cohort_pair_review"]["source_missing_completion_rows"]:
            self.assertEqual(gap["reason"], "missing_source_completion_row_unknown_not_zero")
        for gap in receipt["cohort_pair_review"]["candidate_missing_completion_rows"]:
            self.assertEqual(gap["reason"], "missing_source_completion_row_unknown_not_zero")


class ReceiptConsistencyTests(unittest.TestCase):
    def test_actual_receipt_counts_and_source_counters_consistent(self):
        receipt = cached_receipt()
        counts = receipt["counts"]
        self.assertEqual(counts["candidate_observations"], 20596)
        self.assertEqual(counts["universities_with_candidates"], 2273)
        self.assertEqual(counts["candidate_source_rows"], 10298)
        self.assertEqual(counts["source_rows"], 51011)
        self.assertEqual(counts["source_institutions"], 3684)
        self.assertEqual(counts["selected_source_rows"], 13176)
        self.assertEqual(counts["us_catalogue_rows"], 3582)
        self.assertEqual(counts["unique_existing_us_unitids"], 2812)
        self.assertEqual(counts["ambiguous_existing_us_unitids"], 14)
        self.assertEqual(counts["us_catalogue_missing_or_invalid_unitid"], 742)
        self.assertEqual(counts["matched_selected_source_rows"], 10303)
        self.assertEqual(counts["source_missing_completion_pairs"], 175)
        self.assertEqual(counts["candidate_missing_completion_pairs"], 161)
        self.assertEqual(counts["candidate_generated_source_rows"], 4465)
        # Held rows reconcile: selected - matched == held identity.
        held_identity = sum(counts["held_identity_source_rows"].values())
        self.assertEqual(held_identity, counts["selected_source_rows"] - counts["matched_selected_source_rows"])
        self.assertEqual(
            counts["held_identity_source_rows"],
            {"ambiguous_existing_us_unitid": 58, "no_existing_exact_us_unitid_identity": 2815},
        )
        # Held numerics reconcile: matched*2 - observations == held numeric.
        self.assertEqual(
            sum(counts["held_numeric_values"].values()),
            counts["matched_selected_source_rows"] * 2 - counts["candidate_observations"],
        )
        self.assertEqual(len(receipt["records"]), counts["candidate_source_rows"])
        self.assertEqual(
            len({r["university_id"] for r in receipt["records"]}),
            counts["universities_with_candidates"],
        )
        self.assertEqual(
            sum(len(r["values"]) for r in receipt["records"]), counts["candidate_observations"]
        )
        self.assertEqual(len(receipt["identity_review"]["held_source_rows"]), held_identity)
        self.assertEqual(len(receipt["numeric_review"]), 10)
        self.assertEqual(
            len(receipt["cohort_pair_review"]["source_missing_completion_rows"]),
            counts["source_missing_completion_pairs"],
        )
        self.assertEqual(
            len(receipt["cohort_pair_review"]["candidate_missing_completion_rows"]),
            counts["candidate_missing_completion_pairs"],
        )
        # Each candidate row retains both fields, so observations == 2 * rows.
        self.assertEqual(counts["candidate_observations"], counts["candidate_source_rows"] * 2)
        for grtype, fields in counts["field_counts_by_grtype"].items():
            with self.subTest(grtype=grtype):
                rows_of_type = sum(1 for r in receipt["records"] if r["grtype"] == grtype)
                self.assertEqual(fields["GRTOTLT"], rows_of_type)
                self.assertEqual(fields["GRNRALT"], rows_of_type)

    def test_all_observations_stay_needs_review_null_verified_zero_publication(self):
        receipt = cached_receipt()
        self.assertEqual(receipt["status"], "review_only_receipt")
        self.assertEqual(receipt["verification_status"], "needs_review")
        self.assertIsNone(receipt["last_verified_at"])
        for row in receipt["records"]:
            for datum in row["values"].values():
                self.assertEqual(datum["verification_status"], "needs_review")
        expanded = list(gr.iter_source_records(receipt))
        self.assertEqual(len(expanded), 20596)
        for item in expanded:
            self.assertEqual(item["verification_status"], "needs_review")
            self.assertIsNone(item["last_verified_at"])
            self.assertEqual(item["publication_status"], "review")
            self.assertEqual(item["status"], "pending")

    def test_iter_source_records_expands_raw_url_sha_reporting_retrieval(self):
        receipt = cached_receipt()
        expanded = list(gr.iter_source_records(receipt))
        self.assertEqual(len(expanded), receipt["counts"]["candidate_observations"])
        first = expanded[0]
        row = receipt["records"][0]
        field = first["raw_field"]
        datum = row["values"][field]
        self.assertEqual(first["id"], datum["id"])
        self.assertEqual(first["university_id"], row["university_id"])
        self.assertEqual(first["source"], "ipeds")
        self.assertEqual(first["source_url"], "https://nces.ed.gov/ipeds/complete-data-files/GR2024.zip")
        self.assertEqual(first["source_url"], receipt["source"]["url"])
        self.assertEqual(first["raw_file"], "data/raw/ipeds/GR2024.zip")
        self.assertEqual(first["metric"], datum["metric"])
        self.assertEqual(first["value"], datum["value"])
        self.assertEqual(first["unit"], "students")
        self.assertEqual(first["retrieved_at"], receipt["source"]["retrieved_at"])
        evidence = first["evidence"]
        self.assertEqual(evidence["unitid"], row["unitid"])
        self.assertEqual(evidence["source_record_id"], row["source_record_id"])
        self.assertEqual(evidence["raw_value"], datum["raw_value"])
        self.assertEqual(evidence["reporting_flag"], datum["flag"])
        self.assertEqual(evidence["raw_reporting_flag"], datum["raw_flag"])
        self.assertEqual(evidence["reporting_flag_label"], datum["flag_label"])
        self.assertEqual(evidence["raw_selectors"], row["raw_selectors"])
        self.assertIn("GRTYPE", evidence["selector_labels"])
        self.assertEqual(evidence["cohort_label"], row["cohort"])
        self.assertIsNone(evidence["entry_cohort_year"])
        self.assertEqual(evidence["cohort_year_issue"], receipt["dictionary_contract"]["cohort_year_issue"])
        self.assertEqual(evidence["dataset_sha256"], receipt["source"]["sha256"])
        self.assertEqual(evidence["dataset_sha256"], "7cd2cc6bf10920c4f2eded5e7f8887602f11e84abddba3aa5267334d6c69c205")
        self.assertEqual(evidence["dictionary_url"], receipt["dictionary"]["url"])
        self.assertEqual(evidence["dictionary_sha256"], receipt["dictionary"]["sha256"])
        self.assertEqual(evidence["dictionary_retrieved_at"], receipt["dictionary"]["retrieved_at"])
        self.assertEqual(evidence["source_retrieved_at"], receipt["source"]["retrieved_at"])
        self.assertEqual(evidence["survey_year"], 2024)
        self.assertEqual(evidence["reporting_year"], 2024)
        # Every expanded id is the deterministic observation id.
        self.assertEqual(first["id"], gr.observation_id(row["unitid"], row["grtype"], field))

    def test_cohort_pair_gaps_unknown_not_zero_and_excess_raises(self):
        gaps = gr.cohort_pair_gaps(
            [
                {"unitid": "100654", "grtype": "2"},
                {"unitid": "100654", "grtype": "8"},
            ]
        )
        # 2->3 missing, 8->9 and 8->12 missing.
        self.assertEqual(len(gaps), 3)
        self.assertTrue(
            all(g["reason"] == "missing_source_completion_row_unknown_not_zero" for g in gaps)
        )
        # Completion exceeding its adjusted cohort is rejected, never clamped.
        with self.assertRaisesRegex(ValueError, "exceeds matching adjusted cohort"):
            gr.cohort_pair_gaps(
                [
                    {"unitid": "1", "grtype": "2", "values": {"GRTOTLT": {"value": 10}}},
                    {"unitid": "1", "grtype": "3", "values": {"GRTOTLT": {"value": 11}}},
                ]
            )


class TransactionalReceiptTests(unittest.TestCase):
    def test_exclusive_creation_prevents_overwrite(self):
        receipt = cached_receipt()
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "nested" / "receipt.json"
            gr.write_receipt(receipt, target)
            before = target.read_bytes()
            with self.assertRaises(FileExistsError):
                gr.write_receipt(receipt, target)
            # Failed exclusive write is transactional: original bytes untouched.
            self.assertEqual(target.read_bytes(), before)
            # Different path succeeds.
            other = Path(tmp) / "receipt-2.json"
            gr.write_receipt(receipt, other)
            self.assertEqual(other.read_bytes(), before)

    def test_tampered_archive_rejected_against_original_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "GR2024.zip"
            path.write_bytes(b"verified-original")
            meta = {
                "url": gr.SOURCE_URL,
                "retrieved_at": "2026-10-09T11:13:31.835713+00:00",
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "bytes": path.stat().st_size,
            }
            path.with_name(path.name + ".meta.json").write_text(json.dumps(meta))
            with patch.object(gr, "RAW", Path(tmp)):
                _, evidence = gr.verified_archive("GR2024.zip", gr.SOURCE_URL, meta["sha256"])
                self.assertEqual(evidence["retrieved_at"], meta["retrieved_at"])
                path.write_bytes(b"tampered")
                with self.assertRaisesRegex(ValueError, "original receipt"):
                    gr.verified_archive("GR2024.zip", gr.SOURCE_URL, meta["sha256"])
                # Wrong expected URL/SHA also rejected without touching the file.
                path.write_bytes(b"verified-original")
                with self.assertRaisesRegex(ValueError, "receipt"):
                    gr.verified_archive("GR2024.zip", "https://example.invalid/GR2024.zip", meta["sha256"])
                with self.assertRaisesRegex(ValueError, "receipt"):
                    gr.verified_archive("GR2024.zip", gr.SOURCE_URL, "0" * 64)

    def test_read_source_rows_rejects_duplicates_invalid_and_selector_conflict(self):
        contract = cached_receipt()["dictionary_contract"]
        with tempfile.TemporaryDirectory() as tmp:
            # Duplicate UNITID/GRTYPE.
            dup = [valid_row("100654", "8"), valid_row("100654", "8")]
            path = write_source_zip(tmp, dup)
            with self.assertRaisesRegex(ValueError, "Duplicate source"):
                list(gr.read_source_rows(path, contract))
            # Invalid source UNITID (leading zero / foreign-shaped).
            for bad in ("012345", "12345", "ABC123"):
                path = write_source_zip(tmp, [valid_row(bad, "8")])
                with self.subTest(bad=bad), self.assertRaisesRegex(ValueError, "Invalid source UNITID"):
                    list(gr.read_source_rows(path, contract))
            # Selector conflict for a known GRTYPE.
            conflict = valid_row("100654", "8")
            conflict["SECTION"] = "4"
            path = write_source_zip(tmp, [conflict])
            with self.assertRaisesRegex(ValueError, "selector conflict"):
                list(gr.read_source_rows(path, contract))
            # Missing dictionary columns.
            path = write_source_zip(tmp, [valid_row()], fieldnames=["UNITID", "GRTYPE"])
            with self.assertRaisesRegex(ValueError, "dictionary columns"):
                list(gr.read_source_rows(path, contract))
            # Unknown GRTYPE passes through unselected (no error, no selector check).
            unknown = valid_row("100654", "99")
            unknown.update({"CHRTSTAT": "99", "SECTION": "9", "COHORT": "9", "LINE": "99"})
            path = write_source_zip(tmp, [unknown])
            rows = list(gr.read_source_rows(path, contract))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["GRTYPE"], "99")

    def test_reproducibility_against_cached_checksummed_zips_single_full_read(self):
        if not (gr.RAW / "GR2024.zip").exists() or not (gr.RAW / "GR2024_Dict.zip").exists():
            self.skipTest("cached IPEDS ZIPs unavailable")
        catalogue_path = ROOT / "data/published/global-directory.json"
        before = catalogue_path.read_bytes()
        # Pinned checksums match the cached files (evidence for the single rebuild below).
        for filename, url, sha in (
            ("GR2024.zip", gr.SOURCE_URL, gr.SOURCE_SHA),
            ("GR2024_Dict.zip", gr.DICTIONARY_URL, gr.DICTIONARY_SHA),
        ):
            with self.subTest(filename=filename):
                _, evidence = gr.verified_archive(filename, url, sha)
                self.assertEqual(evidence["sha256"], sha)
        rebuilt = gr.build_receipt("2026-10-09")
        expected = cached_receipt()

        def canonical(obj):
            return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

        self.assertEqual(canonical(rebuilt), canonical(expected))
        self.assertEqual(rebuilt["counts"]["candidate_observations"], 20596)
        self.assertEqual(rebuilt["counts"]["universities_with_candidates"], 2273)
        # Rebuild never touches the catalogue or the published receipt.
        self.assertEqual(catalogue_path.read_bytes(), before)
        self.assertEqual(
            hashlib.sha256(catalogue_path.read_bytes()).hexdigest(),
            expected["identity_basis"]["sha256"],
        )


if __name__ == "__main__":
    unittest.main()
