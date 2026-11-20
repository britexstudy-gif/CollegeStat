"""Private review boundary regression tests; never access hosted Supabase."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("requirements_staging_oct10", ROOT / "scripts/database/prepare-official-requirements-staging-oct10.py")
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def offline_fixture(folder):
    """Synthetic source structures, not receipts claiming official evidence."""
    timestamp = "2026-10-10T00:00:00Z"
    bodies = {
        "waterloo-deadlines": (
            "<h1>Application deadlines</h1><table>"
            "<tr><td>Programs other than Engineering</td><td>February 1, 2027</td><td>February 15, 2027</td></tr>"
            "<tr><td>Engineering programs (other than Architecture)</td><td>January 15, 2027</td><td>February 1, 2027</td></tr></table>"
        ),
        "wiut-tuition": "<h2>2026/27 fees</h2><table><tr><td>Undergraduate Courses</td><td>38,820,000 UZS per academic year</td></tr></table>",
        "wiut-international": "<h2>2026/27 fees</h2><table><tr><td>Undergraduate Courses</td><td>54,600,000 UZS per academic year</td></tr></table>",
        "wiut-cs": "<h1>Computer Science</h1><p>Domestic - 38,820,000 UZS /per year</p><p>International - 54,600,000 UZS /per year</p>",
    }
    receipts = {}
    for key, body in bodies.items():
        raw = ("<html><body>" + body + "</body></html>").encode()
        filename = key + ".html"
        (folder / filename).write_bytes(raw)
        receipts[key] = {"source_url": review.URLS[key], "sha256": review.digest(raw), "status": 200,
                         "file": filename, "bytes": len(raw), "retrieved_at": timestamp}
    (folder / "fetch-manifest.json").write_text(json.dumps(receipts))
    candidates = []
    for cid, (uid, year, value, metric) in review.EXPECTED.items():
        fee = metric == "tuition"
        population, scope = review.SCOPES[cid]
        source_key = "wiut-cs" if value == "54600000" else "wiut-tuition" if fee else "waterloo-deadlines"
        candidates.append({
            "candidate_id": cid, "university_id": uid, "year": year, "value_text": value,
            "label": scope + " · " + metric, "kind": metric,
            "verification_status": "needs_review", "verified_at": None,
            "population": population, "cycle": "2026/27 academic year" if fee else "2027 entry · September intake",
            "program": "Undergraduate programmes" if fee else None,
            "currency": "UZS" if fee else None, "period": "year" if fee else None,
            "amount": int(value) if fee else None, "source_url": review.URLS[source_key],
            "retrieved_at": timestamp, "target_table": "costs" if fee else "deadlines",
            "evidence": {"scope": scope, "university_wide": False, "reporting_period": "2026/27" if fee else "September 2027",
                         "scale": "nominal UZS" if fee else "date", "sha256": "0" * 64, "timezone": "America/Toronto"},
        })
    for index, kind in enumerate(("IELTS", "Duolingo", "TOEFL", "TOEFL", "Application platform", "Intake", "Qualification")):
        candidates.append({"candidate_id": "synthetic-undated-" + str(index), "university_id": review.WATERLOO,
                           "year": None, "label": "Undated " + kind, "kind": kind,
                           "evidence": {"scale": "TOEFL iBT 0–120" if index == 2 else "TOEFL iBT 1–6" if index == 3 else None}})
    preflight = {"identity_count": 2, "identities": [
        {"id": uid, "name": info["name"], "country_code": info["country_code"], "published": True,
         "identifiers": {"ror": info["ror"]}, "website": "https://" + info["domain"]}
        for uid, info in review.IDENTITIES.items()
    ], "source_records": [], "costs": [], "deadlines": [], "data_points": [], "imported_costs_or_deadlines": []}
    return candidates, preflight


class OfficialRequirementsStagingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tempdir.cleanup)
        cls.evidence_folder = Path(cls.tempdir.name)
        cls.candidates, cls.preflight = offline_fixture(cls.evidence_folder)
        cls.receipts = review.validate_sources(cls.evidence_folder)
        cls.rows, cls.held = review.audit(cls.candidates, cls.preflight, cls.receipts)

    def test_local_real_receipts_when_available(self):
        paths = [review.INPUT, review.OUT / "hosted-preflight.json", review.OUT / "evidence/fetch-manifest.json"]
        if not all(path.exists() for path in paths):
            self.skipTest("Private generated candidate/preflight/evidence files are not tracked")
        candidates = json.loads(review.INPUT.read_text())["candidates"]
        preflight = json.loads(paths[1].read_text())
        receipts = review.validate_sources(review.OUT / "evidence")
        rows, held = review.audit(candidates, preflight, receipts)
        self.assertEqual(len(rows), 5)
        self.assertEqual(len(held), 7)

    def test_five_dated_facts_and_seven_undated_holds(self):
        self.assertEqual(len(self.rows), 5)
        self.assertEqual(len(self.held), 7)
        self.assertEqual(sum(r["metric"] == "tuition" for r in self.rows), 2)
        self.assertTrue(all(h["original"]["year"] is None for h in self.held))
        self.assertEqual({r["year"] for r in self.rows}, {2026, 2027})

    def test_year_cannot_be_retrieval_year_fallback(self):
        changed = copy.deepcopy(self.candidates)
        next(c for c in changed if c["year"] is None)["year"] = 2026
        with self.assertRaisesRegex(ValueError, "manufactured"):
            review.audit(changed, self.preflight, self.receipts)

    def test_dates_remain_day_precision_without_fake_numeric_scores(self):
        rows = [r for r in self.rows if r["metric"] != "tuition"]
        self.assertEqual({r["raw_value"]["value_text"] for r in rows}, {"2027-01-15", "2027-02-01", "2027-02-15"})
        for row in rows:
            self.assertIsNone(row["normalized_value"])
            evidence = row["raw_value"]["evidence"]
            self.assertEqual(evidence["date_precision"], "date")
            self.assertIsNone(evidence["due_at"])
            self.assertIsNone(evidence["cutoff_time"])
            self.assertFalse(evidence["timezone_source_confirmed"])

    def test_tuition_preserves_nominal_currency_and_broader_scope(self):
        rows = [r for r in self.rows if r["metric"] == "tuition"]
        self.assertEqual({r["normalized_value"] for r in rows}, {38820000, 54600000})
        for row in rows:
            evidence = row["raw_value"]["evidence"]
            self.assertEqual(evidence["currency"], "UZS")
            self.assertEqual(evidence["period"], "academic year")
            self.assertEqual(evidence["source_programme_scope"], "Undergraduate Courses")
            self.assertFalse(evidence["programme_specific"])
        international = next(r for r in rows if r["normalized_value"] == 54600000)
        self.assertEqual(international["source_url"], review.URLS["wiut-international"])
        self.assertTrue(international["raw_value"]["evidence"]["year_provenance"]["cross_source_corroboration"])
        self.assertEqual(international["raw_value"]["original_candidate"]["source_url"], review.URLS["wiut-cs"])

    def test_original_receipts_and_all_scales_remain_unchanged(self):
        original = {c["candidate_id"]: c for c in self.candidates}
        for row in self.rows:
            self.assertEqual(row["raw_value"]["original_candidate"], original[row["raw_value"]["candidate_id"]])
            self.assertEqual(row["raw_value"]["verification_status"], "needs_review")
            self.assertIsNone(row["raw_value"]["verified_at"])
        held_toefl = [h["original"]["evidence"]["scale"] for h in self.held if h["original"]["kind"] == "TOEFL"]
        self.assertEqual(set(held_toefl), {"TOEFL iBT 0–120", "TOEFL iBT 1–6"})

    def test_identity_and_population_tampering_rejected(self):
        changed = copy.deepcopy(self.preflight)
        changed["identities"][0]["identifiers"]["ror"] = "https://ror.org/wrong"
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            review.audit(self.candidates, changed, self.receipts)
        changed = copy.deepcopy(self.candidates)
        next(c for c in changed if c["candidate_id"] in review.EXPECTED)["year"] = 2025
        with self.assertRaisesRegex(ValueError, "value/year/identity changed"):
            review.audit(changed, self.preflight, self.receipts)
        changed = copy.deepcopy(self.candidates)
        next(c for c in changed if c["candidate_id"] in review.EXPECTED)["population"] = "All applicants"
        with self.assertRaisesRegex(ValueError, "population/scope changed"):
            review.audit(changed, self.preflight, self.receipts)

    def test_hosted_duplicates_prevent_new_review_row(self):
        changed = copy.deepcopy(self.preflight)
        changed["source_records"] = [copy.deepcopy(self.rows[0])]
        with self.assertRaisesRegex(ValueError, "already installed"):
            review.audit(self.candidates, changed, self.receipts)
        changed = copy.deepcopy(self.preflight)
        row = next(r for r in self.rows if r["metric"] == "tuition")
        changed["costs"] = [{"university_id": row["university_id"], "year": row["year"], "category": "tuition", "amount": row["normalized_value"], "student_category": row["raw_value"]["population"]}]
        with self.assertRaisesRegex(ValueError, "already installed"):
            review.audit(self.candidates, changed, self.receipts)

    def test_tuition_conversion_or_publication_state_cannot_be_inferred(self):
        for field, value in (("currency", "USD"), ("amount", 38820), ("period", "month"), ("verified_at", "2026-10-10T00:00:00Z"), ("verification_status", "verified")):
            changed = copy.deepcopy(self.candidates)
            fee = next(c for c in changed if c["value_text"] == "38820000")
            fee[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                review.audit(changed, self.preflight, self.receipts)

    def test_physical_receipt_and_table_date_scope_are_independent_guards(self):
        for key, old, new, failure in (
            ("waterloo-deadlines", b"February 1, 2027</td><td>February 15, 2027", b"February 15, 2027</td><td>February 1, 2027", "dates unsupported"),
            ("wiut-international", b"2026/27", b"2025/26", "fee/year/period unsupported"),
            ("wiut-tuition", b"Undergraduate Courses", b"Postgraduate Courses", "fee/year/period unsupported"),
            ("wiut-cs", b"International -", b"Domestic -", "fee population unsupported"),
        ):
            with self.subTest(source=key), tempfile.TemporaryDirectory() as folder:
                dest = Path(folder)
                receipts = copy.deepcopy(self.receipts)
                for receipt in receipts.values():
                    (dest / receipt["file"]).write_bytes((self.evidence_folder / receipt["file"]).read_bytes())
                path = dest / receipts[key]["file"]
                path.write_bytes(path.read_bytes().replace(old, new))
                (dest / "fetch-manifest.json").write_text(json.dumps(receipts))
                with self.assertRaisesRegex(ValueError, "receipt changed"):
                    review.validate_sources(dest)
                # A valid checksum does not grant support to a different scope.
                receipts[key]["sha256"] = review.digest(path.read_bytes())
                (dest / "fetch-manifest.json").write_text(json.dumps(receipts))
                with self.assertRaisesRegex(ValueError, failure):
                    review.validate_sources(dest)


if __name__ == "__main__":
    unittest.main()
