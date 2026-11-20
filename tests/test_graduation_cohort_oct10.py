"""Boundaries for the Oct-10 graduation-cohort review (hold-by-default).

Covers: conflicting cached evidence, wrong release/year, missing receipts,
ambiguous selector scope, archive comparison, excerpt/source discipline, and an
offline end-to-end run against the real installed receipts. No network, no
database, no publication, no mutation of inputs.
"""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "review_graduation_cohort_oct10",
    ROOT / "scripts/ingestion/review-graduation-cohort-oct10.py",
)
rev = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev)


def fixture_loaded(title="File documentation for graduation rate data, 150% of normal "
                         "time to complete - cohort year 2017 (4-year) and cohort year "
                         "2020 (2-year) institutions:  2024",
                   overview="This file contains the graduation rate status as of August 31, 2024 "
                            "for the cohort of full-time, first-time degree/certificate-seeking "
                            "undergraduates. Data for four year institutions include bachelor "
                            "degree-seeking students who were enrolled in 2018. Data for two year "
                            "institutions include full-time, first-time students who were enrolled in 2021.",
                   entry=None, survey_year=2024, release="Provisional release"):
    return {"installed": {
        "GR2024.zip": {"sha256": "a" * 64},
        "cached_contradiction": {
            "introduction_title": title,
            "introduction_overview": overview,
            "cohort_year_issue": "Introduction title says 2017/2020; Overview says 2018/2021.",
            "entry_cohort_year": entry,
            "section_labels": {"2": "Bachelor's or equiv 2018 subcohort (4-yr institution)",
                               "4": "Degree/certif-seeking students 2021 subcohort ( 2-yr institution)"},
            "cohort_labels": {"2": "Bachelor's or equiv 2018 subcohort (4-yr institution)",
                              "4": "Degree/certif-seeking students 2021 cohort ( 2-yr institution)"},
            "selected_grtypes": ["2", "3", "8", "9", "12", "29", "30"],
            "population": "Full-time, first-time degree/certificate-seeking undergraduates",
            "release": release,
            "survey_year": survey_year,
        },
        "selector_population": rev.SELECTOR_POPULATION_NOTE,
        "published_receipt": {"counts": {
            "candidate_observations": 20596, "candidate_source_rows": 10298,
            "universities_with_candidates": 2273,
            "held_identity_source_rows": {"a": 58, "b": 2815},
            "held_numeric_values": {"c": 10},
            "source_missing_completion_pairs": 175,
            "candidate_missing_completion_pairs": 161,
            "candidate_generated_source_rows": 4465}},
    }}


def offline_fetched():
    return [{"id": s["id"], "url": s["url"], "kind": s["kind"], "role": s["role"],
             "retrieved_at": None, "sha256": None, "bytes": None, "status": None,
             "content_type": None,
             "note": "not_attempted_offline; no cohort assertion drawn",
             "qualifies": False, "excerpt": ""}
            for s in rev.OFFICIAL_SOURCES]


class ConflictingEvidenceTests(unittest.TestCase):
    def test_title_vs_overview_conflict_forces_hold_null(self):
        decision, new_info = rev.evaluate_evidence(fixture_loaded(), offline_fetched())
        self.assertEqual(decision["resolution"], "hold_retain_null_entry_year")
        self.assertIsNone(decision["entry_cohort_year"])
        self.assertTrue(all(v is None for v in decision["per_grtype_entry_year"].values()))
        self.assertTrue(any("conflicting_cohort_evidence" in r for r in decision["reasons"]))
        self.assertEqual(new_info, 0)

    def test_arithmetic_refused_even_when_years_match_labels(self):
        # Overview/labels agreeing on 2018/2021 is NOT proof: program-reporter
        # scope is unrecorded, so the hold must stand.
        decision, _ = rev.evaluate_evidence(fixture_loaded(), offline_fetched())
        self.assertTrue(any("ambiguous_selector_scope" in r for r in decision["reasons"]))
        self.assertIsNone(decision["entry_cohort_year"])

    def test_general_component_text_does_not_qualify(self):
        general = ("Graduation rates data are collected for full-time, first-time degree "
                   "and certificate-seeking undergraduate students in a particular year cohort.")
        self.assertFalse(rev.qualifies_as_release_specific_instruction(general))


class WrongReleaseTests(unittest.TestCase):
    def test_wrong_title_year_rejected(self):
        loaded = fixture_loaded(title="File documentation - cohort year 2016 (4-year):  2023")
        decision, _ = rev.evaluate_evidence(loaded, offline_fetched())
        self.assertTrue(any("wrong_release" in r for r in decision["reasons"]))
        self.assertIsNone(decision["entry_cohort_year"])

    def test_wrong_status_date_rejected(self):
        loaded = fixture_loaded(overview="graduation rate status as of August 31, 2023 for the cohort")
        decision, _ = rev.evaluate_evidence(loaded, offline_fetched())
        self.assertTrue(any("wrong_release" in r for r in decision["reasons"]))

    def test_wrong_survey_year_rejected(self):
        loaded = fixture_loaded(survey_year=2023)
        decision, _ = rev.evaluate_evidence(loaded, offline_fetched())
        self.assertTrue(any("wrong_release" in r for r in decision["reasons"]))


class MissingReceiptTests(unittest.TestCase):
    def test_none_loaded_holds(self):
        decision, _ = rev.evaluate_evidence(None, offline_fetched())
        self.assertEqual(decision["resolution"], "hold_retain_null_entry_year")
        self.assertIsNone(decision["entry_cohort_year"])
        self.assertTrue(any("missing_receipt" in r for r in decision["reasons"]))

    def test_real_installed_receipts_present_and_consistent(self):
        loaded, errors = rev.load_installed()
        self.assertEqual(errors, [])
        self.assertIsNotNone(loaded)
        self.assertIsNone(loaded["installed"]["cached_contradiction"]["entry_cohort_year"])
        counts = loaded["installed"]["published_receipt"]["counts"]
        self.assertEqual(counts["candidate_observations"], 20596)
        self.assertEqual(counts["candidate_source_rows"], 10298)


class AmbiguousScopeTests(unittest.TestCase):
    def test_mixed_4yr_and_2yr_groups_force_scope_hold(self):
        decision, _ = rev.evaluate_evidence(fixture_loaded(), offline_fetched())
        self.assertTrue(any("ambiguous_selector_scope" in r for r in decision["reasons"]))

    def test_single_group_still_held_without_mapping(self):
        loaded = fixture_loaded()
        loaded["installed"]["cached_contradiction"]["selected_grtypes"] = ["8", "9", "12"]
        decision, new_info = rev.evaluate_evidence(loaded, offline_fetched())
        self.assertIsNone(decision["entry_cohort_year"])
        self.assertEqual(new_info, 0)


class ArchiveComparisonTests(unittest.TestCase):
    def test_match_reported_without_replacement(self):
        result = rev.compare_archive(b"official-bytes", hashlib.sha256(b"official-bytes").hexdigest())
        self.assertTrue(result["compared"] and result["match"])

    def test_mismatch_suggests_nothing_and_flags_review(self):
        result = rev.compare_archive(b"fetched-new", hashlib.sha256(b"installed-old").hexdigest())
        self.assertTrue(result["compared"] and not result["match"])
        self.assertIn("no replacement", result["note"].lower())

    def test_no_fetched_archive_is_vacuous_hold(self):
        result = rev.compare_archive(None, "a" * 64)
        self.assertFalse(result["compared"])


class ValidatorDisciplineTests(unittest.TestCase):
    def run_offline(self, tmp):
        out = Path(tmp) / "graduation-cohort-oct10"
        report = Path(tmp) / "muse-graduation-cohort-oct10-report.md"
        code = rev.main(["--out", str(out), "--report", str(report), "--no-fetch"])
        self.assertEqual(code, 0)
        return out, report

    def test_offline_end_to_end_validates_and_holds(self):
        with tempfile.TemporaryDirectory() as tmp:
            out, report = self.run_offline(tmp)
            self.assertEqual(rev.validate_outputs(out, report), [])
            proposed = json.loads((out / "proposed.json").read_text())
            self.assertIsNone(proposed["entry_cohort_year"])
            self.assertEqual(proposed["new_information_count"], 0)
            self.assertEqual(proposed["derived_rates"], 0)
            self.assertEqual(proposed["publications"], 0)
            self.assertEqual(proposed["database_writes"], 0)
            self.assertEqual(proposed["counts"]["candidate_observations"], 20596)
            self.assertEqual(proposed["counts"]["candidate_source_rows"], 10298)
            text = report.read_text()
            self.assertIn("20596", text)
            self.assertIn("10298", text)
            self.assertIn("nces.ed.gov", text)

    def test_excerpt_over_25_words_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            out, report = self.run_offline(tmp)
            text = report.read_text()
            bad = text.replace("(no excerpt asserted)",
                               "`word " * 1 + " ".join(["word"] * 26) + "`", 1)
            report.write_text(bad)
            (out / "report.md").write_text(bad)
            errors = rev.validate_outputs(out, report)
            self.assertTrue(any("excerpt_length" in e for e in errors))

    def test_non_official_host_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            out, report = self.run_offline(tmp)
            proposed = json.loads((out / "proposed.json").read_text())
            proposed["official_documents"].append({"id": "evil", "url": "https://example.invalid/doc"})
            (out / "proposed.json").write_text(json.dumps(proposed))
            errors = rev.validate_outputs(out, report)
            self.assertTrue(any("source_host" in e for e in errors))

    def test_source_cap_enforced(self):
        self.assertLessEqual(len(rev.OFFICIAL_SOURCES), rev.MAX_DOCS)
        with tempfile.TemporaryDirectory() as tmp:
            out, report = self.run_offline(tmp)
            proposed = json.loads((out / "proposed.json").read_text())
            base = dict(proposed["official_documents"][0])
            for i in range(7):
                entry = dict(base, id="extra-%d" % i)
                proposed["official_documents"].append(entry)
            (out / "proposed.json").write_text(json.dumps(proposed))
            errors = rev.validate_outputs(out, report)
            self.assertTrue(any("source_cap" in e for e in errors))

    def test_owned_paths_only_and_inputs_untouched(self):
        parser_path = ROOT / "scripts/ingestion/ipeds-graduation-outcomes.py"
        before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in (parser_path, rev.PUBLISHED_RECEIPT, rev.SOURCE_META, rev.DICTIONARY_META)}
        with tempfile.TemporaryDirectory() as tmp:
            out, report = self.run_offline(tmp)
            self.assertTrue(out.is_dir() and report.exists())
            for path, digest in before.items():
                self.assertEqual(hashlib.sha256(Path(path).read_bytes()).hexdigest(), digest,
                                 "input mutated: " + path)
        source = (ROOT / "scripts/ingestion/review-graduation-cohort-oct10.py").read_text()
        self.assertNotIn("PUBLISHED_RECEIPT.write_text", source)
        self.assertNotIn("import ipeds-graduation-outcomes", source)
        self.assertNotIn("ipeds_graduation", source)


if __name__ == "__main__":
    unittest.main()
