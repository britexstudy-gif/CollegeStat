"""Official requirements review Oct10 — validator and parser tests.

No network, no hosted writes, no credential reads. Pure-function checks plus
bounded assertions over the generated local review artefacts.
"""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "review_oct10", ROOT / "scripts/ingestion/review-official-requirements-oct10.py")
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


def directory_ids():
    try:
        rows = json.loads((ROOT / "data/published/global-directory.json").read_text())
        return {r["id"] for r in rows}
    except FileNotFoundError:
        return set(MOD.UNIVERSITIES.keys())


def valid_waterloo_receipt():
    sha = "a" * 64
    return {
        "source_key": "waterloo-english",
        "university_id": "808b96a5-0e59-5215-a2f5-e7c3c5d2785a",
        "final_url": "https://uwaterloo.ca/future-students/admissions/english-language-requirements",
        "initial_url": "https://uwaterloo.ca/future-students/admissions/english-language-requirements",
        "retrieved_at": "2026-10-10T00:00:00Z",
        "sha256": sha,
    }


def valid_candidate():
    r = valid_waterloo_receipt()
    return MOD.build_candidate(
        university_id=r["university_id"], fact_type="requirement", target_table="requirements",
        kind="IELTS", label="IELTS Academic · overall",
        minimum=6.5, maximum=None, value_text="6.5", unit="IELTS 0–9",
        year=None, population="Undergraduate applicants requiring English evidence",
        program=None, cycle=None, campus=None, provider="University of Waterloo",
        source_url=r["final_url"], initial_url=r["initial_url"],
        retrieved_at=r["retrieved_at"], receipt_key=r["source_key"], sha256=r["sha256"],
        excerpt="IELTS 6.5 overall with component floors confirmed",
        scope="Undergraduate applicants requiring English evidence",
        publication_year=None, reporting_period=None, scale="IELTS 0–9",
        components={"Writing": 6.5, "Speaking": 6.5, "Reading": 6.0, "Listening": 6.0},
        notes="Authored summary for test.")


class DuplicateTests(unittest.TestCase):
    def test_duplicate_current_fact_is_held_not_added(self):
        ids = directory_ids()
        installed = MOD.installed_semantic_keys()
        # Use a real installed Oxford IELTS fact shape: same value/scope/cycle must be duplicate.
        req = json.loads((ROOT / "data/published/requirements-current.json").read_text())
        ox = next(r for r in req if r["university_id"] == "33333333-3333-4333-8333-333333333333" and r["kind"] == "IELTS")
        cand = MOD.build_candidate(
            university_id=ox["university_id"], fact_type="requirement", target_table="requirements",
            kind=ox["kind"], label=ox["label"], minimum=ox["minimum"], maximum=ox["maximum"],
            value_text=str(ox["minimum"]), unit="IELTS 0–9",
            year=ox["year"], population=ox["student_category"] if "student_category" in ox else "Undergraduate applicants",
            program=None, cycle=None, campus=None, provider="University of Oxford",
            source_url=ox["source_url"], initial_url=ox["source_url"],
            retrieved_at="2026-10-10T00:00:00Z", receipt_key="oxford-test",
            sha256="b" * 64,
            excerpt="Short official excerpt for duplicate check",
            scope=ox.get("student_category", "Undergraduate applicants"),
            publication_year=None, reporting_period=None, scale="IELTS 0–9",
            components={"Writing": 7.0},
            notes="Duplicate fixture.")
        # Align population/scope exactly to installed student_category for strict duplicate.
        cand["population"] = ox.get("student_category", cand["population"])
        cand["evidence"]["scope"] = ox.get("student_category", cand["evidence"]["scope"])
        ok, reason = MOD.validate_candidate(cand, ids, installed)
        self.assertFalse(ok)
        self.assertEqual(reason, "duplicate_installed")

    def test_changed_value_keeps_history_and_stays_candidate(self):
        ids = directory_ids()
        installed = MOD.installed_semantic_keys()
        cand = valid_candidate()
        cand["minimum"] = 7.0  # changed value, same scope -> not a duplicate
        cand["value_text"] = "7.0"
        # recompute fingerprint/id for the changed value
        fp_parts = {"university_id": cand["university_id"], "fact_type": cand["fact_type"],
                    "kind": cand["kind"], "label": cand["label"], "minimum": 7.0,
                    "maximum": None, "value_text": "7.0", "amount": None, "currency": None,
                    "population": cand["population"], "program": None, "cycle": None,
                    "source_url": cand["source_url"], "year": None}
        cand["fingerprint"] = MOD.fingerprint_for(fp_parts)
        cand["candidate_id"] = MOD.candidate_id_for(cand["fingerprint"])
        ok, reason = MOD.validate_candidate(cand, ids, installed)
        self.assertTrue(ok, reason)


class IdentityTests(unittest.TestCase):
    def test_ambiguous_identity_is_rejected(self):
        cand = valid_candidate()
        cand["university_id"] = "00000000-0000-4000-8000-000000000000"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertFalse(ok)
        self.assertEqual(reason, "ambiguous_identity")

    def test_off_domain_redirect_is_rejected(self):
        cand = valid_candidate()
        cand["source_url"] = "https://example.com/fake-requirements"
        cand["evidence"]["receipt_key"] = "waterloo-english"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertFalse(ok)
        self.assertEqual(reason, "off_domain_redirect")

    def test_non_https_is_rejected(self):
        cand = valid_candidate()
        cand["source_url"] = "http://uwaterloo.ca/future-students/admissions/deadlines"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertFalse(ok)
        self.assertEqual(reason, "off_domain_redirect")


class YearTests(unittest.TestCase):
    def test_absent_year_must_stay_null(self):
        cand = valid_candidate()
        cand["year"] = 2027  # no reporting_period/cycle contains 2027
        cand["evidence"]["reporting_period"] = None
        cand["cycle"] = None
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertFalse(ok)
        self.assertEqual(reason, "absent_year_must_stay_null")

    def test_explicit_year_passes_when_in_cycle(self):
        cand = valid_candidate()
        cand["fact_type"] = "deadline"
        cand["target_table"] = "deadlines"
        cand["kind"] = "deadline"
        cand["label"] = "Application deadline · test"
        cand["year"] = 2027
        cand["cycle"] = "2027 entry · September intake"
        cand["evidence"]["reporting_period"] = "2027 entry"
        cand["evidence"]["due_at"] = "2027-02-01"
        cand["evidence"]["timezone"] = "America/Toronto"
        cand["value_text"] = "2027-02-01"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertTrue(ok, reason)

    def test_publication_year_without_year_is_rejected(self):
        cand = valid_candidate()
        cand["year"] = None
        cand["evidence"]["publication_year"] = 2026
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertFalse(ok)
        self.assertEqual(reason, "absent_year_must_stay_null")


class DateTests(unittest.TestCase):
    def test_expired_date_is_held(self):
        cand = valid_candidate()
        cand["fact_type"] = "deadline"
        cand["target_table"] = "deadlines"
        cand["kind"] = "deadline"
        cand["label"] = "Application deadline · test"
        cand["population"] = "Undergraduate applicants"
        cand["cycle"] = "2025 entry"
        cand["year"] = 2025
        cand["value_text"] = "2025-01-15"
        cand["evidence"]["due_at"] = "2025-01-15"
        cand["evidence"]["timezone"] = "America/Toronto"
        cand["evidence"]["reporting_period"] = "2025 entry"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertFalse(ok)
        self.assertEqual(reason, "expired_date")

    def test_rolling_dates_are_not_deadlines(self):
        # A vague "rolling" note without a strict YYYY-MM-DD must not validate as deadline.
        cand = valid_candidate()
        cand["fact_type"] = "deadline"
        cand["target_table"] = "deadlines"
        cand["kind"] = "deadline"
        cand["label"] = "Rolling review · test"
        cand["value_text"] = "rolling"
        cand["evidence"]["due_at"] = "rolling"
        cand["evidence"]["timezone"] = "America/Toronto"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertFalse(ok)
        self.assertIn(reason, ("invalid_due_date", "missing_due_date"))


class ScoreBandTests(unittest.TestCase):
    def test_score_band_ambiguity_is_held(self):
        cand = valid_candidate()
        cand["evidence"]["components"] = None
        cand["evidence"]["excerpt"] = "IELTS 6.5 overall 6.5 writing needed for entry"
        cand["evidence"]["excerpt_words"] = MOD.word_count(cand["evidence"]["excerpt"])
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertFalse(ok)
        self.assertEqual(reason, "score_band_ambiguity")

    def test_complete_band_with_components_passes(self):
        cand = valid_candidate()
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertTrue(ok, reason)


class HygieneTests(unittest.TestCase):
    def test_no_synthetic_verified_timestamp(self):
        cand = valid_candidate()
        cand["verification_status"] = "verified"
        cand["verified_at"] = "2026-10-10T00:00:00Z"
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertFalse(ok)
        self.assertIn(reason, ("must_be_needs_review", "synthetic_verified_timestamp"))
        cand2 = valid_candidate()
        cand2["verified_at"] = "2026-10-10T00:00:00Z"
        ok2, reason2 = MOD.validate_candidate(cand2, directory_ids(), set())
        self.assertFalse(ok2)
        self.assertEqual(reason2, "synthetic_verified_timestamp")

    def test_excerpt_capped_at_25_words(self):
        cand = valid_candidate()
        cand["evidence"]["excerpt"] = " ".join(["word"] * 40)
        ok, reason = MOD.validate_candidate(cand, directory_ids(), set())
        self.assertFalse(ok)
        self.assertEqual(reason, "excerpt_too_long")

    def test_deterministic_ids_and_fingerprints(self):
        a = valid_candidate()
        b = copy.deepcopy(a)
        # rebuild via same helper must give same fingerprint/id
        r = valid_waterloo_receipt()
        a2 = MOD.build_candidate(
            university_id=r["university_id"], fact_type="requirement", target_table="requirements",
            kind="IELTS", label="IELTS Academic · overall",
            minimum=6.5, maximum=None, value_text="6.5", unit="IELTS 0–9",
            year=None, population="Undergraduate applicants requiring English evidence",
            program=None, cycle=None, campus=None, provider="University of Waterloo",
            source_url=r["final_url"], initial_url=r["initial_url"],
            retrieved_at=r["retrieved_at"], receipt_key=r["source_key"], sha256=r["sha256"],
            excerpt="IELTS 6.5 overall with component floors confirmed",
            scope="Undergraduate applicants requiring English evidence",
            publication_year=None, reporting_period=None, scale="IELTS 0–9",
            components={"Writing": 6.5, "Speaking": 6.5, "Reading": 6.0, "Listening": 6.0},
            notes="Authored summary for test.")
        self.assertEqual(a["fingerprint"], a2["fingerprint"])
        self.assertEqual(a["candidate_id"], a2["candidate_id"])
        b["minimum"] = 7.0
        fp = MOD.fingerprint_for({"university_id": b["university_id"], "fact_type": b["fact_type"],
                                  "kind": b["kind"], "label": b["label"], "minimum": 7.0,
                                  "maximum": None, "value_text": "7.0", "amount": None, "currency": None,
                                  "population": b["population"], "program": None, "cycle": None,
                                  "source_url": b["source_url"], "year": None})
        self.assertNotEqual(a["fingerprint"], fp)

    def test_parser_finds_waterloo_english_without_guessing(self):
        receipt = valid_waterloo_receipt()
        text = "IELTS Academic 6.5 overall 6.5 writing 6.5 speaking 6.0 reading 6.0 listening. TOEFL 90 overall 25 in writing."
        found = MOD.parse_waterloo_english(text, receipt)
        kinds = {(c["kind"], c["minimum"]) for c in found}
        self.assertIn(("IELTS", 6.5), kinds)
        # No text -> no facts, never guessed
        self.assertEqual(MOD.parse_waterloo_english("Generic welcome page with no scores.", receipt), [])

    def test_generated_artefacts_respect_cap_and_counts(self):
        base = ROOT / "outputs" / "official-requirements-oct10"
        if not (base / "candidates.json").exists():
            self.skipTest("Live review artefacts not generated yet.")
        cand = json.loads((base / "candidates.json").read_text())
        held = json.loads((base / "held.json").read_text())
        counts = json.loads((base / "counts.json").read_text())
        self.assertLessEqual(len(cand["candidates"]), 24)
        self.assertEqual(counts["candidates_new"], len(cand["candidates"]))
        self.assertEqual(counts["held_total"], len(held["held"]))
        self.assertEqual(cand["candidate_count"], len(cand["candidates"]))
        for c in cand["candidates"]:
            self.assertEqual(c["verification_status"], "needs_review")
            self.assertIsNone(c["verified_at"])


if __name__ == "__main__":
    unittest.main()
