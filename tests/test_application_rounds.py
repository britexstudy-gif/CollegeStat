"""Scoped application observations must never replace historic or staff evidence."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("application_rounds", ROOT / "scripts/ingestion/apply-reviewed-application-rounds.py")
applications = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(applications)


class ApplicationRoundsTests(unittest.TestCase):
    def setUp(self):
        self.receipt = json.loads((ROOT / "data/published/reviewed-application-rounds-oct05.json").read_text())
        self.directory = json.loads((ROOT / "data/published/global-directory.json").read_text())

    def test_appending_preserves_history_and_second_run_is_identical(self):
        new_ids = {r["id"] for r in self.receipt["records"]}
        existing = json.loads((ROOT / "data/published/application-dates-current.json").read_text())
        old = [r for r in existing if r["id"] not in new_ids]
        snapshot = copy.deepcopy(old)
        dates, fees, programmes, counts = applications.integrate(self.receipt, self.directory, old, [], {})
        self.assertEqual(old, snapshot)
        self.assertEqual(dates[:len(old)], snapshot)
        self.assertEqual(counts, {"deadlines_added": 10, "fees_added": 4, "programmes_added": 1})
        again = applications.integrate(self.receipt, self.directory, dates, fees, programmes)
        self.assertEqual(again[:3], (dates, fees, programmes))
        self.assertEqual(again[3], {"deadlines_added": 0, "fees_added": 0, "programmes_added": 0})

    def test_staff_correction_with_same_id_is_rejected_before_mutation(self):
        date = applications.normalized_rows(self.receipt)[0][0]
        date["notes"] = "A later staff correction must survive."
        existing = [date]
        snapshot = copy.deepcopy(existing)
        with self.assertRaisesRegex(AssertionError, "Conflicting deadline ID"):
            applications.integrate(self.receipt, self.directory, existing, [], {})
        self.assertEqual(existing, snapshot)

    def test_duplicate_semantic_identity_cannot_create_a_second_fact(self):
        date = applications.normalized_rows(self.receipt)[0][0]
        date["id"] = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        with self.assertRaisesRegex(AssertionError, "semantic deadline"):
            applications.integrate(self.receipt, self.directory, [date], [], {})

    def test_date_precision_and_noon_cutoffs_are_not_fabricated(self):
        dates, _ = applications.normalized_rows(self.receipt)
        self.assertEqual(sum(len(d["due_at"]) == 10 for d in dates), 6)
        eth = [d for d in dates if d["timezone"] == "Europe/Zurich"]
        self.assertEqual({d["due_at"] for d in eth}, {"2026-11-30T10:59:00Z", "2027-04-30T09:59:00Z"})
        self.assertTrue(all("11:59 AM" in d["notes"] for d in eth))

    def test_application_fees_retain_exemptions_and_do_not_become_annual_tuition(self):
        _, fees = applications.normalized_rows(self.receipt)
        self.assertTrue(all(f["category"] == "application_fee" and f["period"] == "total" for f in fees))
        self.assertTrue(all(f["evidence"]["university_wide"] is False and f["evidence"]["annual_tuition"] is False for f in fees))
        aalto = next(f for f in fees if f["currency"] == "EUR")
        self.assertEqual(aalto["amount"], 100)
        self.assertIn("Swiss citizenship", aalto["evidence"]["exemptions"])
        nu = [f for f in fees if f["currency"] == "KZT"]
        self.assertEqual({f["amount"] for f in nu}, {30000, 45000})
        self.assertTrue(all(f["program_id"] and f["evidence"]["programme"] == "Executive MBA" for f in nu))

    def test_sql_is_insert_only_and_uses_real_cost_columns(self):
        sql = applications.sql_for_receipt(self.receipt)
        self.assertNotIn("update public.", sql.lower())
        self.assertNotIn("delete from", sql.lower())
        for statement in sql.splitlines():
            if statement.startswith("insert into public.costs"):
                columns = statement.split(" values ", 1)[0]
                self.assertNotIn("source_url", columns)
                self.assertNotIn("data_sources", columns)
        self.assertEqual(sql.count("insert into public.deadlines"), 10)


if __name__ == "__main__":
    unittest.main()
