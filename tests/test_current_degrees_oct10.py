"""Current-degree pilot tests — 10 Oct 2026.

No network, no hosted writes, no credential reads. Pure-function checks
plus bounded assertions over the generated local review artefacts.
Covers: wrong university domain, duplicate existing offer, historic
completion, inferred fields, invalid dates; exact receipt hashes and
scope preservation; deterministic fingerprint/dedup.
"""
import copy
import hashlib
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "review_current_degrees_oct10", ROOT / "scripts/ingestion/review-current-degrees-oct10.py"
)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


def directory_ids():
    try:
        rows = json.loads((ROOT / "data/published/global-directory.json").read_text())
        return {r["id"] for r in rows}
    except FileNotFoundError:
        return set(MOD.UNIVERSITIES.keys())


def empty_installed():
    return {"by_name": set(), "by_url": set()}


def valid_wiut_receipt():
    sha = "a" * 64
    return {
        "source_key": "wiut-finance",
        "university_id": "66666666-6666-4666-8666-666666666666",
        "final_url": "https://www.wiut.uz/finance",
        "initial_url": "https://www.wiut.uz/finance",
        "retrieved_at": "2026-10-10T00:00:00Z",
        "sha256": sha,
    }


def valid_candidate():
    r = valid_wiut_receipt()
    excerpt = "Start Date September each academic year Duration 3 years full time Award Title"
    return MOD.build_candidate(
        university_id=r["university_id"],
        degree_name="BSc (Hons) in Finance",
        degree_url=r["final_url"],
        level="Bachelor",
        subject="Finance",
        duration="3 years (full time)",
        language=None,
        campus=None,
        intake="September (each academic year)",
        qualification="Bachelor of Science (Hons)",
        qualification_url=r["final_url"],
        tuition_url="https://www.wiut.uz/tuition-fees",
        reporting_year=None,
        reporting_period=None,
        population="Prospective undergraduate students",
        provider="Westminster International University in Tashkent",
        source_url=r["final_url"],
        initial_url=r["initial_url"],
        retrieved_at=r["retrieved_at"],
        receipt_key=r["source_key"],
        sha256=r["sha256"],
        excerpt=excerpt,
        scope="BSc (Hons) in Finance · prospective undergraduates",
        pointer="WHAT YOU NEED TO KNOW block",
        notes="Authored summary for test.",
    )


class DomainTests(unittest.TestCase):
    def test_wrong_university_domain_is_rejected(self):
        cand = valid_candidate()
        cand["source_url"] = "https://uwaterloo.ca/future-students/programs/computer-science"
        cand["degree_url"] = cand["source_url"]
        # Recompute fingerprint for the changed URL so the test isolates domain.
        fp_parts = {
            "university_id": cand["university_id"], "degree_name": cand["degree_name"].strip().lower(),
            "level": cand["level"], "subject": cand["subject"], "duration": cand["duration"],
            "language": cand["language"], "campus": cand["campus"], "intake": cand["intake"],
            "qualification": cand["qualification"], "source_url": cand["source_url"],
            "reporting_year": cand["reporting_year"], "population": cand["population"],
        }
        cand["fingerprint"] = MOD.fingerprint_for(fp_parts)
        cand["candidate_id"] = MOD.candidate_id_for(cand["fingerprint"])
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "off_domain_redirect")

    def test_suffix_borrowing_is_rejected(self):
        cand = valid_candidate()
        cand["source_url"] = "https://wiut.uz.evil.example.com/finance"
        cand["degree_url"] = cand["source_url"]
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "off_domain_redirect")

    def test_non_https_is_rejected(self):
        cand = valid_candidate()
        cand["source_url"] = "http://www.wiut.uz/finance"
        cand["degree_url"] = cand["source_url"]
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "off_domain_redirect")


class DuplicateTests(unittest.TestCase):
    def test_duplicate_current_course_is_held_not_added(self):
        ids = directory_ids()
        installed = MOD.installed_keys()
        # WIUT Computer Science is already installed in official-programs.json.
        self.assertGreaterEqual(len(installed["by_name"]), 1)
        r = {
            "source_key": "wiut-cs",
            "university_id": "66666666-6666-4666-8666-666666666666",
            "final_url": "https://www.wiut.uz/bsc-hons-in-computer-science",
            "initial_url": "https://www.wiut.uz/bsc-hons-in-computer-science",
            "retrieved_at": "2026-10-10T00:00:00Z",
            "sha256": "b" * 64,
        }
        cand = MOD.build_candidate(
            university_id=r["university_id"], degree_name="BSc (Hons) in Computer Science",
            degree_url=r["final_url"], level="Bachelor", subject="Computer Science",
            duration="3 years (full time)", language=None, campus=None,
            intake="September (each academic year)", qualification="Bachelor of Science (Hons)",
            qualification_url=r["final_url"], tuition_url="https://www.wiut.uz/tuition-fees",
            reporting_year=None, reporting_period=None, population="Prospective undergraduate students",
            provider="Westminster International University in Tashkent", source_url=r["final_url"],
            initial_url=r["initial_url"], retrieved_at=r["retrieved_at"], receipt_key=r["source_key"],
            sha256=r["sha256"], excerpt="Start Date September each academic year Duration 3 years full time Award Title",
            scope="BSc (Hons) in Computer Science · prospective undergraduates",
            pointer="WHAT YOU NEED TO KNOW block", notes="Duplicate fixture.",
        )
        ok, reason = MOD.validate_candidate(cand, ids, installed)
        self.assertFalse(ok)
        self.assertEqual(reason, "duplicate_installed")

    def test_changed_scope_value_stays_separate_needs_review(self):
        cand = valid_candidate()
        # Changed duration value, same offering scope -> distinct fingerprint, still valid.
        cand["duration"] = "3 years (full time with foundation)"
        cand["evidence"]["excerpt"] = "Start Date September each academic year Duration 3 years full time with foundation Award Title"
        cand["evidence"]["excerpt_words"] = MOD.word_count(cand["evidence"]["excerpt"])
        fp_parts = {
            "university_id": cand["university_id"], "degree_name": cand["degree_name"].strip().lower(),
            "level": cand["level"], "subject": cand["subject"], "duration": cand["duration"],
            "language": cand["language"], "campus": cand["campus"], "intake": cand["intake"],
            "qualification": cand["qualification"], "source_url": cand["source_url"],
            "reporting_year": cand["reporting_year"], "population": cand["population"],
        }
        cand["fingerprint"] = MOD.fingerprint_for(fp_parts)
        cand["candidate_id"] = MOD.candidate_id_for(cand["fingerprint"])
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertTrue(ok, reason)
        self.assertEqual(cand["verification_status"], "needs_review")
        self.assertIsNone(cand["verified_at"])


class HistoricCompletionTests(unittest.TestCase):
    def test_ipeds_completion_is_never_offering_evidence(self):
        cand = valid_candidate()
        cand["source_url"] = "https://nces.ed.gov/ipeds/complete-data-files/C2025_A.zip"
        cand["degree_url"] = "https://www.wiut.uz/finance"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "historic_completion")

    def test_pdf_completion_count_is_not_current_offering(self):
        cand = valid_candidate()
        cand["notes"] = "IPEDS completions show 58 awards; treated as offering."
        # source itself is IPEDS-flavoured via notes blob check
        cand["source_url"] = "https://nces.ed.gov/ipeds/use-the-data/survey-components/9/completions"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "historic_completion")


class InferredFieldTests(unittest.TestCase):
    def test_english_from_page_language_is_rejected(self):
        cand = valid_candidate()
        cand["language"] = "English"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "inferred_language")

    def test_september_from_custom_is_rejected(self):
        cand = valid_candidate()
        cand["intake"] = "September"
        cand["evidence"]["excerpt"] = "Finance degree overview with modules and careers"
        cand["evidence"]["excerpt_words"] = MOD.word_count(cand["evidence"]["excerpt"])
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "inferred_intake")

    def test_inferred_duration_is_rejected(self):
        cand = valid_candidate()
        cand["duration"] = "4 years"
        cand["intake"] = None
        cand["evidence"]["excerpt"] = "Finance degree overview with modules and careers"
        cand["evidence"]["excerpt_words"] = MOD.word_count(cand["evidence"]["excerpt"])
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "inferred_duration")

    def test_inferred_campus_is_rejected(self):
        cand = valid_candidate()
        cand["campus"] = "Tashkent"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "inferred_campus")

    def test_inferred_amount_is_rejected_links_only(self):
        cand = valid_candidate()
        cand["tuition_amount"] = 38820000
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "inferred_amount")

    def test_absent_year_must_stay_null(self):
        cand = valid_candidate()
        cand["reporting_year"] = 2026
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "absent_year_must_stay_null")


class DateAndScopeTests(unittest.TestCase):
    def test_invalid_retrieval_date_is_rejected(self):
        cand = valid_candidate()
        cand["retrieved_at"] = "not-a-date"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "missing_retrieval_time")

    def test_verified_timestamp_must_stay_null(self):
        cand = valid_candidate()
        cand["verified_at"] = "2026-10-10T00:00:00Z"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "synthetic_verified_timestamp")

    def test_excerpt_too_long_is_rejected(self):
        cand = valid_candidate()
        cand["evidence"]["excerpt"] = "word " * 30
        cand["evidence"]["excerpt_words"] = MOD.word_count(cand["evidence"]["excerpt"])
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertFalse(ok)
        self.assertEqual(reason, "excerpt_too_long")

    def test_receipt_hash_and_scope_preserved(self):
        cand = valid_candidate()
        ok, reason = MOD.validate_candidate(cand, directory_ids(), empty_installed())
        self.assertTrue(ok, reason)
        self.assertRegex(cand["evidence"]["sha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(cand["evidence"]["sha256"], "a" * 64)
        self.assertLessEqual(cand["evidence"]["excerpt_words"], 25)
        self.assertFalse(cand["evidence"]["university_wide"])
        self.assertTrue(cand["evidence"]["scope"])
        self.assertTrue(cand["evidence"]["pointer"])
        self.assertEqual(cand["verification_status"], "needs_review")
        self.assertIsNone(cand["verified_at"])

    def test_fingerprint_is_deterministic(self):
        a = valid_candidate()
        b = valid_candidate()
        self.assertEqual(a["fingerprint"], b["fingerprint"])
        self.assertEqual(a["candidate_id"], b["candidate_id"])
        # Changed value changes identity.
        b["duration"] = "3 years (full time with foundation)"
        fp_parts = {
            "university_id": b["university_id"], "degree_name": b["degree_name"].strip().lower(),
            "level": b["level"], "subject": b["subject"], "duration": b["duration"],
            "language": b["language"], "campus": b["campus"], "intake": b["intake"],
            "qualification": b["qualification"], "source_url": b["source_url"],
            "reporting_year": b["reporting_year"], "population": b["population"],
        }
        b["fingerprint"] = MOD.fingerprint_for(fp_parts)
        self.assertNotEqual(a["fingerprint"], b["fingerprint"])


class ParserTests(unittest.TestCase):
    def test_wiut_parser_keeps_only_explicit_fields(self):
        text = (
            "Undergraduate Programme | BSc (Hons) in Finance WHAT YOU NEED TO KNOW "
            "Award Title Bachelor of Science (Hons) Validated by the University of Westminster test "
            "Start Date September (each academic year) Duration 3 years (full time) Tuition Fees info"
        )
        receipt = valid_wiut_receipt()
        receipt["final_url"] = "https://www.wiut.uz/finance"
        cands = MOD.parse_wiut_course(text, receipt, '<a href="/tuition-fees">fees</a>', {
            "university_id": receipt["university_id"], "expected_name": "BSc (Hons) in Finance",
            "expected_subject": "Finance", "expected_level": "Bachelor",
        })
        self.assertEqual(len(cands), 1)
        c = cands[0]
        self.assertEqual(c["duration"], "3 years (full time)")
        self.assertEqual(c["intake"], "September (each academic year)")
        self.assertIsNone(c["language"])
        self.assertIsNone(c["campus"])
        self.assertIsNone(c["reporting_year"])
        self.assertIsNone(c["tuition_amount"])
        self.assertTrue(c["tuition_url"].startswith("https://"))
        ok, reason = MOD.validate_candidate(c, directory_ids(), empty_installed())
        self.assertTrue(ok, reason)

    def test_waterloo_parser_leaves_unstated_fields_null(self):
        text = (
            "Computer Science degree | University of Waterloo Faculty: Faculty of Mathematics "
            "Degree: Bachelor of Computer Science in Computer Science Learn more Available as a co-op program"
        )
        receipt = {
            "source_key": "waterloo-cs",
            "university_id": "808b96a5-0e59-5215-a2f5-e7c3c5d2785a",
            "final_url": "https://uwaterloo.ca/future-students/programs/computer-science",
            "initial_url": "https://uwaterloo.ca/future-students/programs/computer-science",
            "retrieved_at": "2026-10-10T00:00:00Z",
            "sha256": "c" * 64,
        }
        cands = MOD.parse_waterloo_program(text, receipt, '<a href="/future-students/financing/tuition">tuition</a>', {
            "university_id": receipt["university_id"], "expected_name": "Computer Science",
            "expected_subject": "Computer Science", "expected_level": "Bachelor",
        })
        self.assertEqual(len(cands), 1)
        c = cands[0]
        self.assertEqual(c["level"], "Bachelor")
        self.assertIsNone(c["duration"])
        self.assertIsNone(c["language"])
        self.assertIsNone(c["campus"])
        self.assertIsNone(c["intake"])
        self.assertIsNone(c["reporting_year"])
        ok, reason = MOD.validate_candidate(c, directory_ids(), empty_installed())
        self.assertTrue(ok, reason)

    def test_source_cap_is_respected(self):
        self.assertLessEqual(len(MOD.SOURCES), MOD.MAX_PAGES)
        self.assertLessEqual(MOD.MAX_CANDIDATES, 6)


class ArtefactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = ROOT / "outputs" / "current-degrees-oct10"
        for name in ("candidates.json", "held.json", "counts.json", "mapping.json"):
            if not (cls.out / name).exists():
                raise unittest.SkipTest(f"run review script first: {name} missing")

    def test_counts_match_artefacts(self):
        counts = json.loads((self.out / "counts.json").read_text())
        cands = json.loads((self.out / "candidates.json").read_text())
        held = json.loads((self.out / "held.json").read_text())
        mapping = json.loads((self.out / "mapping.json").read_text())
        self.assertEqual(counts["candidates_new"], cands["candidate_count"])
        self.assertEqual(counts["candidates_new"], len(cands["candidates"]))
        self.assertEqual(counts["held_total"], held["held_count"])
        self.assertEqual(counts["held_total"], len(held["held"]))
        self.assertLessEqual(counts["candidates_new"], 6)
        self.assertLessEqual(counts["sources_attempted"], 8)
        # Every candidate maps with an explicit year flag; nulls stay null.
        for entry in mapping["candidates"]:
            if entry["absent_reporting_year"]:
                self.assertIsNone(next(c for c in cands["candidates"] if c["candidate_id"] == entry["candidate_id"])["reporting_year"])
                self.assertIsNone(entry["source_records_target"])
        # All candidates need review, exact hashes, bounded excerpts.
        for c in cands["candidates"]:
            self.assertEqual(c["verification_status"], "needs_review")
            self.assertIsNone(c["verified_at"])
            self.assertRegex(c["evidence"]["sha256"], r"^[0-9a-f]{64}$")
            self.assertLessEqual(c["evidence"]["excerpt_words"], 25)
            self.assertTrue(c["evidence"]["scope"])
            self.assertTrue(c["evidence"]["pointer"])
            self.assertIn(c["university_id"], set(MOD.UNIVERSITIES.keys()))
            self.assertTrue(c["source_url"].startswith("https://"))
            self.assertTrue(c["degree_url"].startswith("https://"))


if __name__ == "__main__":
    unittest.main()
