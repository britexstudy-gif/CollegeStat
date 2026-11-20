"""Current-offering, identity, language and private-publication boundaries."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("current_programmes_staging_oct10", ROOT / "scripts/database/prepare-current-programmes-staging-oct10.py")
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def offline_fixture(folder):
    """Small HTML receipts model source structure; never assert live coverage.

    Generated ingestion outputs intentionally aren't tracked. CI must still
    exercise independent evidence, identity and deduplication boundaries.
    """
    candidates, receipts = [], {}
    timestamp = "2026-10-10T00:00:00Z"
    for cid, (uid, name, subject, qualification, url) in review.EXPECTED.items():
        wiut = uid == review.WIUT
        html = (
            "<html><body><h1>" + name + "</h1>"
            + (
                "<h2>WHAT YOU NEED TO KNOW</h2><p>Award Title " + qualification
                + " Start Date September (each academic year) Duration 3 years (full time)</p>"
                + "<h2>HOW YOU WILL STUDY</h2>"
                if wiut else "<p>Degree: " + qualification + "</p>"
            ) + "</body></html>"
        ).encode()
        filename = cid + ".html"
        (folder / filename).write_bytes(html)
        receipts[cid] = {
            "source_url": url, "sha256": review.digest(html), "status": 200,
            "bytes": len(html), "file": filename, "retrieved_at": timestamp,
        }
        candidates.append({
            "candidate_id": cid, "university_id": uid,
            "university_name": review.IDENTITIES[uid]["name"],
            "provider": review.IDENTITIES[uid]["name"],
            "degree_name": name, "subject": subject, "qualification": qualification,
            "source_url": url, "degree_url": url, "qualification_url": url,
            "level": "Bachelor", "language": None, "reporting_year": None,
            "reporting_period": None, "campus": None, "tuition_amount": None,
            "verified_at": None, "verification_status": "needs_review",
            "population": "Prospective undergraduate students",
            "duration": "3 years (full time)" if wiut else None,
            "intake": "September (each academic year)" if wiut else None,
            "retrieved_at": timestamp,
            "tuition_url": "https://www.wiut.uz/tuition-fees" if wiut else "https://uwaterloo.ca/future-students/financing/tuition",
            "evidence": {"scope": name + " · prospective undergraduates", "publication_year": None,
                         "university_wide": False, "sha256": "0" * 64},
        })
    (folder / "fetch-manifest.json").write_text(json.dumps(receipts))
    english_cs = {
        "id": "5e8dfa02-1694-5edf-a286-7c792cfae056", "name": "Computer Science",
        "subject": "Computer Science", "degree_level": "Bachelor", "language": "English",
    }
    preflight = {
        "identity_count": 2,
        "identities": [
            {"id": uid, "name": info["name"], "country_code": info["country_code"],
             "website": "https://" + info["domain"], "identifiers": {"ror": info["ror"]}, "published": True}
            for uid, info in review.IDENTITIES.items()
        ],
        "programs": [
            english_cs,
            {"id": "bf680e40-6c51-5d4f-a5c7-0ce97d314073", "name": "Software Engineering",
             "subject": "Software Engineering", "degree_level": "Master", "language": None},
            {"id": "bb000000-0000-4000-8000-000000000009", "name": "Computer Science and Engineering (Course 6-3)",
             "subject": "Computer Science", "degree_level": "Bachelor", "language": None},
        ],
        "offers": [{"id": review.EXCLUDED_OFFER, "university_id": review.WIUT,
                    "program_id": english_cs["id"], "source_url": review.EXCLUDED_SOURCE,
                    "program": copy.deepcopy(english_cs), "verification_status": "verified"}],
        "sources": [],
    }
    return candidates, preflight


class CurrentProgrammeStagingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tempdir.cleanup)
        cls.evidence_folder = Path(cls.tempdir.name)
        cls.candidates, cls.preflight = offline_fixture(cls.evidence_folder)
        cls.receipts = review.validate_sources(cls.evidence_folder)
        cls.rows = review.audit(cls.candidates, cls.preflight, cls.receipts)

    def test_local_audited_artifacts_when_available(self):
        """Optional local audit; the eight core tests never need these files."""
        paths = [review.INPUT, review.OUT / "hosted-preflight.json", review.OUT / "evidence/fetch-manifest.json"]
        if not all(path.exists() for path in paths):
            self.skipTest("Private generated audit outputs aren't part of the repository")
        candidates = json.loads(review.INPUT.read_text())["candidates"]
        preflight = json.loads(paths[1].read_text())
        receipts = review.validate_sources(review.OUT / "evidence")
        audited = review.audit(candidates, preflight, receipts)
        self.assertEqual(len(audited), 6)
        self.assertEqual({r["id"] for r in audited}, {r["id"] for r in self.rows})

    def test_six_current_private_offers_and_installed_cs_excluded(self):
        self.assertEqual(len(self.rows), 6)
        self.assertEqual(sum(r["university_id"] == review.WIUT for r in self.rows), 3)
        self.assertEqual(sum(r["university_id"] == review.WATERLOO for r in self.rows), 3)
        self.assertTrue(all(r["source_url"] != review.EXCLUDED_SOURCE for r in self.rows))
        self.assertTrue(all(r["evidence"]["verification_status"] == "needs_review" for r in self.rows))
        self.assertTrue(all(r["evidence"]["verified_at"] is None for r in self.rows))

    def test_no_implied_english_or_guessed_reporting_year(self):
        self.assertTrue(all(r["language"] is None and r["reporting_year"] is None for r in self.rows))
        waterloo_cs = next(r for r in self.rows if r["name"] == "Computer Science")
        existing_english = next(p for p in self.preflight["programs"] if p["name"] == "Computer Science" and p["language"] == "English")
        self.assertNotEqual(waterloo_cs["program_id"], existing_english["id"])
        for field, value in (("language", "English"), ("reporting_year", 2026), ("campus", "Main Campus")):
            changed = copy.deepcopy(self.candidates)
            changed[0][field] = value
            with self.assertRaisesRegex(ValueError, "must stay null"):
                review.audit(changed, self.preflight, self.receipts)

    def test_duration_intake_normalize_only_explicit_official_blocks(self):
        for row in self.rows:
            if row["university_id"] == review.WIUT:
                self.assertEqual(row["duration_months"], 36)
                self.assertEqual(row["intakes"], ["September"])
                self.assertEqual(row["evidence"]["mode"], "full time")
            else:
                self.assertIsNone(row["duration_months"])
                self.assertEqual(row["intakes"], [])
                self.assertIsNone(row["evidence"]["intake"])
            self.assertIsNone(row["campus_id"])
            self.assertIsNone(row["evidence"]["tuition_amount"])

    def test_qualifications_scopes_and_original_evidence_preserved(self):
        originals = {c["candidate_id"]: c for c in self.candidates}
        for row in self.rows:
            evidence = row["evidence"]
            original = originals[evidence["candidate_id"]]
            self.assertEqual(evidence["original_candidate"], original)
            self.assertEqual(evidence["qualification"], original["qualification"])
            self.assertEqual(evidence["scope"], original["evidence"]["scope"])
            self.assertLess(len(review.canonical(evidence).encode()), 16000)

    def test_null_language_definition_reused_without_duplicate(self):
        changed = copy.deepcopy(self.preflight)
        c = self.candidates[0]
        existing = {"id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "name": c["degree_name"], "subject": c["subject"], "degree_level": "Bachelor", "language": None}
        changed["programs"].append(existing)
        row = review.audit(self.candidates, changed, self.receipts)[0]
        self.assertEqual(row["program_id"], existing["id"])
        self.assertTrue(row["reuse_program"])
        duplicate = copy.deepcopy(existing)
        duplicate["id"] = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        changed["programs"].append(duplicate)
        with self.assertRaisesRegex(ValueError, "Ambiguous NULL-language"):
            review.audit(self.candidates, changed, self.receipts)

    def test_wrong_identity_and_existing_offer_conflicts_stop_staging(self):
        changed = copy.deepcopy(self.preflight)
        changed["identities"][0]["country_code"] = "US"
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            review.audit(self.candidates, changed, self.receipts)
        changed = copy.deepcopy(self.preflight)
        row = self.rows[0]
        changed["offers"].append({"university_id": row["university_id"], "program_id": row["program_id"], "source_url": row["source_url"], "program": {"name": row["name"], "degree_level": row["degree_level"], "language": None}})
        with self.assertRaisesRegex(ValueError, "already installed"):
            review.audit(self.candidates, changed, self.receipts)

    def test_independent_fresh_source_checksum_and_qualification_guard(self):
        with tempfile.TemporaryDirectory() as folder:
            dest = Path(folder)
            receipts = copy.deepcopy(self.receipts)
            for cid, receipt in receipts.items():
                (dest / receipt["file"]).write_bytes((self.evidence_folder / receipt["file"]).read_bytes())
            cid = self.candidates[0]["candidate_id"]
            path = dest / receipts[cid]["file"]
            path.write_bytes(path.read_bytes() + b"changed")
            (dest / "fetch-manifest.json").write_text(json.dumps(receipts))
            with self.assertRaisesRegex(ValueError, "receipt changed"):
                review.validate_sources(dest)
            # Even an updated receipt hash cannot hide changed award evidence.
            path.write_bytes(path.read_bytes().replace(b"Bachelor of Arts (Hons)", b"Bachelor of Science (Hons)"))
            receipts[cid]["sha256"] = review.digest(path.read_bytes())
            (dest / "fetch-manifest.json").write_text(json.dumps(receipts))
            with self.assertRaisesRegex(ValueError, "award/duration/intake unsupported"):
                review.validate_sources(dest)

    def test_sql_uses_existing_nullable_offers_and_no_publication_or_ddl(self):
        sql = review.staging_sql(self.rows, "0" * 64).lower()
        for forbidden in ("alter table", "create table", "update public.", "delete from", "insert into public.source_records", "insert into public.universities", "'verified',now()"):
            self.assertNotIn(forbidden, sql)
        self.assertIn("'needs_review',null", sql)
        self.assertIn("g.language is null", sql)
        self.assertIn("duplicate null-language programme", sql)
        self.assertIn("existing.evidence is distinct from r->'evidence'", sql)


if __name__ == "__main__":
    unittest.main()
