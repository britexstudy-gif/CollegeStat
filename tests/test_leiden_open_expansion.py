"""The source's scientific-impact labels, units and identifiers are authoritative."""
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("leiden_expansion", ROOT / "scripts/ingestion/leiden-open-expansion.py")
leiden = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(leiden)


class LeidenExpansionTests(unittest.TestCase):
    def headers(self):
        return [
            {"id": None, "definition": None},
            {"id": "university", "definition": None},
            {"id": "p", "definition": "fractional publications"},
            {"id": "p_top_5", "definition": "top 5% publications"},
            {"id": "pp_top_5", "definition": "top 5% proportion"},
            {"id": None, "definition": None},
        ]

    def test_repeated_official_headers_do_not_shift_column_indices(self):
        self.assertEqual(leiden.reviewed_header_columns(self.headers() * 4), {"p": 2, "p_top_5": 3, "pp_top_5": 4})

    def test_collaboration_table_cannot_be_mislabelled_scientific_impact(self):
        headers = self.headers()
        headers[3] = {"id": "p_int_collab", "definition": "international collaboration"}
        with self.assertRaisesRegex(ValueError, "P/top-5%"):
            leiden.reviewed_header_columns(headers)
        changed = self.headers() + headers
        with self.assertRaisesRegex(ValueError, "meaning changes"):
            leiden.reviewed_header_columns(changed)

    def test_percent_is_neither_rescaled_nor_assigned_to_publication_count(self):
        self.assertEqual(leiden.parse_number("11.3%", "pp_top_5"), 11.3)
        self.assertEqual(leiden.parse_number("40,475", "p"), 40475)
        for raw, field in [("11.3", "pp_top_5"), ("11.3%", "p"), ("101%", "pp_top_5"), ("-1", "p"), ("nan", "p")]:
            with self.subTest(raw=raw, field=field), self.assertRaises(ValueError):
                leiden.parse_number(raw, field)

    def test_parser_uses_source_id_and_full_name_not_ordinal_or_short_label(self):
        parser = leiden.IndicatorTableParser()
        parser.feed('<table><tr><td class="rank">999</td><td class="university" id="1187"><span data-tooltip="Harvard University">Harvard Univ</span><img src="/content/images/flags/US.png"></td><td>40475</td><td>4575</td><td>11.3%</td><td></td></tr></table>')
        self.assertEqual(parser.rows[0]["source_record_id"], "1187")
        self.assertEqual(parser.rows[0]["name"], "Harvard University")
        self.assertEqual(parser.rows[0]["country_code"], "US")
        self.assertNotIn("rank", parser.rows[0])

    def test_exact_ror_keeps_ambiguous_identifiers_visible_for_review(self):
        mapping = leiden.map_existing_rors([
            {"id": "one", "ror": "https://ror.org/03vek6s52"},
            {"id": "two", "ror": "03vek6s52"},
            {"id": "wrong", "ror": "Harvard University"},
        ])
        self.assertEqual({row["id"] for row in mapping["03vek6s52"]}, {"one", "two"})
        self.assertNotIn("Harvard University", mapping)

    def test_receipt_has_no_overall_rank_and_deduplicates_published_P(self):
        receipt = json.loads((ROOT / "data/published/reviewed-leiden-expansion.json").read_text())
        self.assertEqual(receipt["source"]["license"], "CC0-1.0")
        self.assertEqual(receipt["context"]["publication_period"], "2020–2023")
        self.assertEqual(receipt["context"]["citation_window_end"], 2024)
        self.assertEqual(receipt["context"]["counting_method"], "fractional")
        self.assertEqual(receipt["mappings"]["p_top_5"]["metric"], "top_5_percent_publications_fractional_core")
        self.assertNotIn("international_collaboration", json.dumps(receipt["mappings"]))
        self.assertTrue(all("rank" not in row for row in receipt["records"]))
        old = json.loads((ROOT / "data/published/imported.json").read_text())
        verified = {r["id"] for r in old["records"] if r.get("source") == "leiden" and r.get("metric") == "publications_fractional_core" and r.get("verification_status") == "verified" and r.get("publication_status") == "published" and r.get("evidence", {}).get("scope") != "Leiden Open Edition 2025 scientific impact"}
        repeated = {value["id"] for row in receipt["records"] for value in row["values"].values() if value["already_published"]}
        self.assertEqual(verified, repeated)

    def test_rebuild_preserves_reviewed_facts_when_identity_catalogue_expands(self):
        receipt = ROOT / "data/published/reviewed-leiden-expansion.json"
        original = json.loads(receipt.read_text())
        rebuilt = leiden.build_receipt("2026-10-05")
        self.assertEqual(rebuilt, leiden.build_receipt("2026-10-05"))
        self.assertEqual(original["source"], rebuilt["source"])
        self.assertEqual(original["context"], rebuilt["context"])
        self.assertEqual(original["mappings"], rebuilt["mappings"])
        by_identity = {row["university_id"]: row for row in rebuilt["records"]}
        for row in original["records"]:
            self.assertEqual(row, by_identity[row["university_id"]])


if __name__ == "__main__":
    unittest.main()
