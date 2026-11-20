"""Institution evidence must survive identity, period and historical-cache review."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("openalex_metrics", ROOT / "scripts/ingestion/openalex-metrics.py")
openalex = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(openalex)


class OpenAlexMetricTests(unittest.TestCase):
    def setUp(self):
        self.university = {"id": "11111111-1111-1111-1111-111111111111", "ror": "https://ror.org/00f54p054"}
        self.raw = {"id": "https://openalex.org/I97018004", "ror": self.university["ror"],
                    "works_count": 200, "cited_by_count": 900, "updated_date": "2026-10-01T12:00:00",
                    "counts_by_year": [{"year": 2025, "works_count": 8, "cited_by_count": 30, "oa_works_count": 0}],
                    "topics": [{"id": "https://openalex.org/T123", "display_name": "Physics", "count": 10}]}
        self.meta = {"url": "https://api.openalex.org/institutions/" + self.university["ror"],
                     "retrieved_at": "2026-10-05T12:00:00+00:00", "sha256": "a" * 64}

    def test_identity_is_exact_not_a_name_or_prefix_match(self):
        for key, value in [("ror", "https://ror.org/03vek6s52"), ("id", "https://openalex.org/IStanford"),
                           ("id", "https://openalex.org/I97018004?name=Stanford"), ("id", "http://openalex.org/I97018004")]:
            raw = {**self.raw, key: value}
            with self.subTest(key=key, value=value), self.assertRaisesRegex(ValueError, "identifier"):
                openalex.normalize(raw, self.meta, self.university)

    def test_only_the_exact_https_provider_lookup_can_be_verified(self):
        for url in ["http://api.openalex.org/institutions/I97018004", "https://example.com/I97018004",
                    "https://api.openalex.org/institutions/I1", "https://api.openalex.org/works", None, []]:
            with self.subTest(url=url), self.assertRaisesRegex(ValueError, "HTTPS"):
                openalex.normalize(self.raw, {**self.meta, "url": url}, self.university)
        for lookup in [self.raw["id"], "I97018004", self.university["ror"]]:
            rows, _ = openalex.normalize(self.raw, {**self.meta, "url": "https://api.openalex.org/institutions/" + lookup}, self.university)
            self.assertEqual(len(rows), 6)

    def test_source_timestamp_and_checksum_are_required(self):
        for stamp in [None, "yesterday", "2026-10-05", "2026-10-05T12:00:00", "2026-13-05T12:00:00Z"]:
            with self.subTest(stamp=stamp), self.assertRaises(ValueError):
                openalex.normalize(self.raw, {**self.meta, "retrieved_at": stamp}, self.university)
        for digest in [None, "a" * 63, "Z" * 64, "A" * 64]:
            with self.subTest(digest=digest), self.assertRaisesRegex(ValueError, "checksum"):
                openalex.normalize(self.raw, {**self.meta, "sha256": digest}, self.university)

    def test_invalid_years_are_excluded_before_sorting_and_zero_is_preserved(self):
        raw = copy.deepcopy(self.raw)
        invalid = [True, "2025", 2025.0, None, 1899, 2027]
        raw["counts_by_year"] = [{"year": year, "works_count": 1} for year in invalid] + raw["counts_by_year"]
        rows, excluded = openalex.normalize(raw, self.meta, self.university)
        self.assertEqual(len(excluded), len(invalid))
        annual = {r["metric"]: r for r in rows if r["reporting_year"]}
        self.assertEqual(annual["yearly_open_access_works"]["value"], 0)
        self.assertEqual(annual["yearly_indexed_works"]["period"], "2025")
        self.assertIsNone(annual["yearly_indexed_works"]["evidence"]["publication_year"])
        self.assertEqual(annual["yearly_citation_rollup"]["evidence"]["raw_field"], "counts_by_year.cited_by_count")
        self.assertIn("do not label it citations received", annual["yearly_citation_rollup"]["notes"])

    def test_invalid_counts_are_absent_instead_of_becoming_zero(self):
        for value in [True, -1, "8", 8.5, None]:
            raw = copy.deepcopy(self.raw)
            raw["counts_by_year"][0]["works_count"] = value
            rows, _ = openalex.normalize(raw, self.meta, self.university)
            self.assertFalse(any(r["metric"] == "yearly_indexed_works" for r in rows))

    def test_duplicate_years_cannot_silently_overwrite_evidence(self):
        raw = copy.deepcopy(self.raw)
        raw["counts_by_year"].append({"year": 2025, "works_count": 900})
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            openalex.normalize(raw, self.meta, self.university)

    def test_source_revision_retains_distinct_stable_ids_and_original_input(self):
        before = copy.deepcopy(self.raw)
        first, _ = openalex.normalize(self.raw, self.meta, self.university)
        repeated, _ = openalex.normalize(self.raw, self.meta, self.university)
        revised, _ = openalex.normalize(self.raw, {**self.meta, "sha256": "b" * 64}, self.university)
        self.assertEqual(first, repeated)
        self.assertTrue({r["id"] for r in first}.isdisjoint(r["id"] for r in revised))
        self.assertEqual(self.raw, before)

    def test_cache_checksum_and_ambiguous_identity_prevent_verified_import(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            cache = root / "data/raw/openalex-metrics/2026-10-05"
            cache.mkdir(parents=True)
            path = cache / "00f54p054.json"
            body = json.dumps(self.raw).encode()
            path.write_bytes(body)
            metadata = {**self.meta, "sha256": hashlib.sha256(body).hexdigest()}
            path.with_name(path.name + ".meta.json").write_text(json.dumps(metadata))
            originals = {p.name: p.read_bytes() for p in cache.iterdir()}
            valid, gaps = openalex.cached_institutions([self.university], root)
            self.assertEqual((len(valid), len(gaps)), (1, 0))
            ambiguous, gaps = openalex.cached_institutions([self.university, {**self.university, "id": "other"}], root)
            self.assertEqual(len(ambiguous), 0)
            self.assertEqual(gaps[0]["reason"], "missing_or_ambiguous_ror_identity")
            path.write_bytes(body + b" ")
            invalid, gaps = openalex.cached_institutions([self.university], root)
            self.assertEqual(len(invalid), 0)
            self.assertEqual(gaps[0]["reason"], "cache_checksum_mismatch")
            path.write_bytes(body)
            self.assertEqual({p.name: p.read_bytes() for p in cache.iterdir()}, originals)

    def test_existing_and_dated_caches_reproduce_the_receipt_without_writes(self):
        if not (ROOT / "data/raw/openalex").exists():
            self.skipTest("Ignored source cache is unavailable; synthetic source checks still run")
        receipt_path = ROOT / "data/published/reviewed-openalex-metrics.json"
        original = receipt_path.read_bytes()
        directory = json.loads((ROOT / "data/published/global-directory.json").read_text())
        cache, gaps = openalex.cached_institutions(directory)
        self.assertEqual(gaps, [])
        self.assertEqual(len(cache), 18)
        records = {}; excluded = []
        for raw, meta, university in cache:
            rows, bad = openalex.normalize(raw, meta, university)
            records.update({r["id"]: r for r in rows})
            excluded.extend({"university_id": university["id"], **entry} for entry in bad)
        rebuilt = sorted(records.values(), key=lambda r: (r["university_id"], r["edition"], r["metric"], r["period"], r["field"] or ""))
        receipt = json.loads(original)
        self.assertEqual(rebuilt, receipt["records"])
        self.assertCountEqual(excluded, receipt["excluded"])
        self.assertEqual((len(rebuilt), len({r["university_id"] for r in rebuilt}), len(excluded)), (1119, 12, 21))
        self.assertEqual(receipt_path.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
