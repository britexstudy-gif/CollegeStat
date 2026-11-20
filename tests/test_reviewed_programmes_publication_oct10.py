import copy
import importlib.util
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from test_current_programmes_staging_oct10 import offline_fixture, review as staging

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("publication", ROOT / "scripts/database/prepare-reviewed-programmes-publication-oct10.py")
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)


class ReviewedProgrammePublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        folder = Path(self.temp.name)
        candidates, before = offline_fixture(folder)
        self.receipts = staging.validate_sources(folder)
        rows = staging.audit(candidates, before, self.receipts)
        self.manifest = {"rows": rows}
        offers = []
        for row in rows:
            program = {k: row[k] for k in ("name", "subject", "degree_level", "language")}
            program["id"] = row["program_id"]
            source = {"id": "source-" + row["id"], "url": row["source_url"], "source_type": "official", "organization": row["evidence"]["provider"]}
            offer = {k: copy.deepcopy(row[k]) for k in ("id", "university_id", "program_id", "source_url", "evidence", "reporting_year", "duration_months", "campus_id", "intakes", "availability")}
            offer.update(source_id=source["id"], verification_status="needs_review", verified_at=None, program=program, source=source)
            offers.append(offer)
        self.preflight = {"offers": offers}

    def publish(self):
        return publication.prepare(self.manifest, self.preflight, self.receipts, "2026-10-10T18:00:00Z")

    def test_five_exact_factual_offers_hold_unreconciled_pathway(self):
        rows = self.publish()
        self.assertEqual({r["id"] for r in rows}, publication.APPROVED)
        self.assertNotIn(publication.HELD, {r["id"] for r in rows})
        self.assertTrue(all(r["evidence"]["reporting_year"] is None and r["evidence"]["language"] is None for r in rows))
        self.assertTrue(all(r["evidence"]["original_candidate"]["verification_status"] == "needs_review" for r in rows))
        self.assertTrue(all(r["evidence"]["verification_status"] == "verified" for r in rows))
        self.assertTrue(all(r["evidence"]["independent_review"]["no_admission_opening_inferred"] for r in rows))

    def test_program_definition_conflict_rejects_whole_batch(self):
        self.preflight["offers"][0]["program"]["language"] = "English"
        with self.assertRaisesRegex(ValueError, "programme definition"):
            self.publish()

    def test_source_identity_conflict_rejects_whole_batch(self):
        self.preflight["offers"][0]["source"]["organization"] = "Different institution"
        with self.assertRaisesRegex(ValueError, "source identity"):
            self.publish()

    def test_changed_or_already_published_candidate_rejects_preparation(self):
        self.preflight["offers"][0]["verification_status"] = "verified"
        with self.assertRaisesRegex(ValueError, "verification state"):
            self.publish()

    def test_changed_fresh_receipt_rejects_publication(self):
        cid = self.manifest["rows"][0]["evidence"]["candidate_id"]
        self.receipts = copy.deepcopy(self.receipts)
        self.receipts[cid]["sha256"] = "f" * 64
        with self.assertRaisesRegex(ValueError, "receipt changed"):
            self.publish()

    def test_no_missing_offer_or_inferred_year_allowed(self):
        self.preflight["offers"].pop()
        with self.assertRaisesRegex(ValueError, "hosted offers"):
            self.publish()


if __name__ == "__main__":
    unittest.main()
