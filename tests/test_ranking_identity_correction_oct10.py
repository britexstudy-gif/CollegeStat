import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('identity_review', ROOT / 'scripts/ingestion/apply-reviewed-ranking-identities-oct10.py')
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)

class RankingIdentityCorrection(unittest.TestCase):
    def setUp(self):
        self.receipt = json.loads((ROOT / 'data/published/reviewed-ranking-identities-oct10.json').read_text())
        self.directory = json.loads((ROOT / 'data/published/global-directory.json').read_text())
        self.rows = json.loads((ROOT / 'data/published/ranking-all.json').read_text())
        self.correction = self.receipt['corrections'][0]

    def test_exact_source_identity_corrected_and_idempotent(self):
        row = next(r for r in self.rows if r['url'] == self.correction['source_url'])
        row['university_id'] = self.correction['original_university_id']
        fixed, report = review.reconcile(self.rows, self.directory, self.receipt)
        self.assertEqual(len(report['changes']), 1)
        self.assertEqual(review.source_fingerprint(self.rows), review.source_fingerprint(fixed))
        repeated, report = review.reconcile(fixed, self.directory, self.receipt)
        self.assertEqual(repeated, fixed)
        self.assertEqual(report['changes'], [])

    def test_okara_source_and_all_publisher_values_are_unchanged(self):
        fixed, _ = review.reconcile(self.rows, self.directory, self.receipt)
        self.assertEqual([r for r in fixed if r['name'] == 'University of Okara'], [r for r in self.rows if r['name'] == 'University of Okara'])
        self.assertEqual(len(fixed), len(self.rows))
        self.assertEqual(review.source_fingerprint(fixed), review.source_fingerprint(self.rows))

    def test_changed_identity_or_missing_source_is_rejected(self):
        for issue in ['identity', 'duplicate', 'missing']:
            rows = copy.deepcopy(self.rows)
            row = next(r for r in rows if r['url'] == self.correction['source_url'])
            if issue == 'identity': row['university_id'] = 'unreviewed-other-profile'
            elif issue == 'duplicate': rows.append(copy.deepcopy(row))
            else: rows.remove(row)
            with self.assertRaises(AssertionError): review.reconcile(rows, self.directory, self.receipt)

    def test_country_ror_city_domain_changes_require_new_review(self):
        for field, value in [('country_code', 'US'), ('ror', 'unreviewed'), ('city', 'Okara'), ('website', 'https://uo.edu.pk')]:
            directory = copy.deepcopy(self.directory)
            next(u for u in directory if u['id'] == self.correction['university_id'])[field] = value
            with self.assertRaises(AssertionError): review.reconcile(self.rows, directory, self.receipt)

    def snapshot_inputs(self):
        snapshots = json.loads((ROOT / 'data/published/publisher-students.json').read_text())
        raw = json.loads((ROOT / 'data/raw/rankings/the-2026.json').read_text())['data']
        return snapshots, raw

    def test_snapshot_restore_is_exact_and_preserves_okara_and_all_other_records(self):
        snapshots, raw = self.snapshot_inputs()
        snapshots.pop(self.correction['university_id'], None)
        corrected, _ = review.reconcile(self.rows, self.directory, self.receipt)
        restored, report = review.reconcile_snapshots(snapshots, raw, corrected, self.receipt, '2026-09-28', 'fixture-hash')
        new = restored.pop(self.correction['university_id'])
        self.assertEqual(restored, snapshots)
        source = next(row for row in raw if row['name'] == self.correction['source_name'])
        self.assertEqual(new['students'], float(source['stats_number_students'].replace(',', '')))
        self.assertEqual(new['source_url'], self.correction['source_url'])
        self.assertEqual(new['edition'], 2026)
        self.assertNotIn('census_year', new)
        self.assertEqual(new['evidence']['retrieved_at'], '2026-09-28')
        self.assertTrue(report['unrelated_snapshots_preserved'])

    def test_snapshot_rejects_duplicate_raw_source_and_conflicting_snapshot(self):
        snapshots, raw = self.snapshot_inputs()
        corrected, _ = review.reconcile(self.rows, self.directory, self.receipt)
        source = next(row for row in raw if row['name'] == self.correction['source_name'])
        with self.assertRaises(AssertionError):
            review.reconcile_snapshots(snapshots, [*raw, copy.deepcopy(source)], corrected, self.receipt, '2026-09-28', 'fixture')
        snapshots[self.correction['university_id']] = {'source_url': 'https://unreviewed.example.test'}
        with self.assertRaises(AssertionError):
            review.reconcile_snapshots(snapshots, raw, corrected, self.receipt, '2026-09-28', 'fixture')

    def test_snapshot_restore_does_not_accept_changed_rank_or_unreviewed_identity(self):
        snapshots, raw = self.snapshot_inputs()
        for field, value in [('rank_label', '1'), ('university_id', self.correction['original_university_id'])]:
            rows = copy.deepcopy(self.rows)
            next(row for row in rows if row['url'] == self.correction['source_url'])[field] = value
            with self.assertRaises(AssertionError):
                review.reconcile_snapshots(snapshots, raw, rows, self.receipt, '2026-09-28', 'fixture')
