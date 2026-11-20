"""Meaningful publication boundary tests; fixtures never contact hosted DB."""
import copy
import csv
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock
from xml.sax.saxutils import escape
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("national_publication_oct10", ROOT / "scripts/database/review-national-publication-oct10.py")
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def write_snapshot(folder, name, raw, url):
    """Create a synthetic physical source plus checksum receipt for parsers."""
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(raw)
    path = folder / "fetch-manifest.json"
    manifest = json.loads(path.read_text()) if path.exists() else {}
    manifest[name] = {"url": url, "sha256": review.sha256(raw), "bytes": len(raw), "retrieved_at": "2025-01-01T00:00:00Z"}
    path.write_text(json.dumps(manifest))


def xlsx_fixture(rows, *, dictionary=False):
    """Minimal OOXML structures exercise the real spreadsheet reader."""
    strings, xml_rows = [], []
    for index, values in enumerate(rows, 1):
        cells = []
        for column, value in values.items():
            if value is None:
                cells.append('<c r="' + column + str(index) + '"></c>')
            elif isinstance(value, str):
                string_id = len(strings)
                strings.append(value)
                cells.append('<c r="' + column + str(index) + '" t="s"><v>' + str(string_id) + '</v></c>')
            else:
                cells.append('<c r="' + column + str(index) + '"><v>' + str(value) + '</v></c>')
        xml_rows.append('<row r="' + str(index) + '">' + ''.join(cells) + '</row>')
    namespace = review.NS["m"]
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as book:
        book.writestr("xl/sharedStrings.xml", '<sst xmlns="' + namespace + '">' + ''.join('<si><t>' + escape(value) + '</t></si>' for value in strings) + '</sst>')
        book.writestr("xl/worksheets/" + ("sheet4.xml" if dictionary else "sheet1.xml"), '<worksheet xmlns="' + namespace + '"><sheetData>' + ''.join(xml_rows) + '</sheetData></worksheet>')
        if not dictionary:
            book.writestr("xl/drawings/drawing1.xml", "<notes>Synthetic fixture: positions include ties and imputed totals.</notes>")
    return output.getvalue()


def csv_fixture(rows, fields):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode()


def archive_fixture(name, raw):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(name, raw)
    return output.getvalue()


def offline_fixture(root):
    """Fully synthetic agency-shaped files; no real-source rights are claimed.

    HERD's parser intentionally insists on 925 source rows. Only six of these
    synthetic units have clear identity matches, five have lifecycle/system
    problems, and nine are joint units. NIRF has its 17 required categories,
    with only three selected rows mapped to two existing fixture profiles.
    """
    known = [
        ("Fixture Alpha University", "US"), ("Fixture Beta University", "US"), ("Fixture Gamma University", "US"),
        ("Fixture Puerto Rico University", "PR"), ("Fixture Guam University", "GU"), ("Fixture Virgin Islands University", "VI"),
        ("Eastern Virginia Medical School", "US"), ("Northland C.", "US"),
        ("U. Hawaii, system office", "US"), ("California State U., system office", "US"), ("Antioch U.", "US"),
    ]
    names = known + [("Combined Unit " + str(i) + ".a", "US") for i in range(9)]
    names += [("Unlinked Fixture University " + str(i), "US") for i in range(925 - len(names))]
    directory, hd, microdata = [], [], []
    table_rows = [{"A": "Synthetic HERD Table 6"}, {}, {"A": "(Dollars in thousands)"}, {"B": "Rank"}, {"I": 2024.0, "Q": 2024.0}]
    for index, (name, country) in enumerate(names):
        unitid = str(100000 + index)
        total, federal = 1000000 - index * 100, 100000 - index * 10
        table_rows.append({"A": name, "B": 2.0 if index in (1, 2) else float(index + 1), "I": float(total), "Q": float(federal), "J": "i" if index == 2 else ""})
        for questionnaire, row_label, value in (("01.g", "Total", total), ("01.a", "Federal government", federal)):
            microdata.append({"year": "2024", "ncses_inst_id": "ncses-" + str(index), "inst_id": "public-" + str(index),
                              "inst_name_long": name, "ipeds_unitid": unitid, "inst_state_code": country,
                              "questionnaire_no": questionnaire, "row": row_label, "data": str(value)})
        if index < len(known):
            directory.append({"id": "00000000-0000-4000-8000-" + str(index + 1).zfill(12), "name": name,
                              "country_code": "US", "state": country, "unitid": unitid, "aliases": []})
            if index != 7:  # Northland is deliberately absent from current HD.
                hd.append({"UNITID": unitid, "INSTNM": name, "CYACTIVE": "0" if index == 6 else "1",
                           "SECTOR": "0" if index in (8, 9, 10) else "1", "NEWID": "123456" if index == 6 else "0", "STABBR": country})
    directory += [
        {"id": "10000000-0000-4000-8000-000000000001", "name": "Fixture Indian Alpha", "country_code": "IN", "aliases": []},
        {"id": "10000000-0000-4000-8000-000000000002", "name": "Fixture Indian Beta", "country_code": "IN", "aliases": []},
    ]
    published = root / "data/published"
    published.mkdir(parents=True, exist_ok=True)
    (published / "global-directory.json").write_text(json.dumps(directory))
    herd = root / "data/raw/ncses-herd"
    write_snapshot(herd, "table6.xlsx", xlsx_fixture(table_rows), "https://example.test/synthetic-herd-table6.xlsx")
    write_snapshot(herd, "licence.html", b"Synthetic parser fixture. You may freely copy that material; specifically identified exceptions.", "https://example.test/synthetic-nsf-policy")
    micro_fields = ["year", "ncses_inst_id", "inst_id", "inst_name_long", "ipeds_unitid", "inst_state_code", "questionnaire_no", "row", "data"]
    write_snapshot(herd, "public-use-2024.zip", archive_fixture("synthetic-full.csv", csv_fixture(microdata, micro_fields)), "https://example.test/synthetic-full.zip")
    write_snapshot(herd, "public-use-2024-short.zip", archive_fixture("synthetic-short.csv", csv_fixture([], micro_fields)), "https://example.test/synthetic-short.zip")
    ipeds = root / "data/raw/ipeds"
    ipeds.mkdir(parents=True, exist_ok=True)
    hd_raw = archive_fixture("hd2025.csv", csv_fixture(hd, ["UNITID", "INSTNM", "CYACTIVE", "SECTOR", "NEWID", "STABBR"]))
    (ipeds / "HD2025.zip").write_bytes(hd_raw)
    (ipeds / "HD2025.zip.meta.json").write_text(json.dumps({"sha256": review.sha256(hd_raw), "bytes": len(hd_raw), "retrieved_at": "2025-01-01T00:00:00Z"}))
    dictionary_raw = archive_fixture("hd2025.xlsx", xlsx_fixture([
        {"A": "CYACTIVE", "B": None, "C": None, "D": "1", "E": "Yes"},
        {"A": "SECTOR", "B": None, "C": None, "D": "0", "E": "Administrative Unit"},
    ], dictionary=True))
    (ipeds / "HD2025_Dict.zip").write_bytes(dictionary_raw)
    (ipeds / "HD2025_Dict.zip.meta.json").write_text(json.dumps({"sha256": review.sha256(dictionary_raw), "bytes": len(dictionary_raw), "retrieved_at": "2025-01-01T00:00:00Z"}))
    nirf_rows = []
    for category in sorted(review.adapter.NIRF_CATEGORIES):
        nirf_rows.append("<tr><td>" + escape(category) + "</td></tr>")
        for rank in range(1, 11 if category in ("Overall", "Universities") else 2):
            name = "Fixture Indian Alpha" if category in ("Overall", "Universities") and rank == 1 else "Fixture Indian Beta" if category == "Management" else "Unlinked Fixture " + category + " " + str(rank)
            nirf_rows.append("<tr><td>" + escape(name + ", Fixture City") + "</td><td>" + str(rank) + "</td></tr>")
    nirf = root / "data/raw/nirf-pib"
    write_snapshot(nirf, "release.html", ("<table>" + "".join(nirf_rows) + "</table>").encode(), "https://example.test/synthetic-pib-release")
    write_snapshot(nirf, "licence.html", b"Synthetic parser fixture: reproduced free of charge; third-party material excluded; prominently acknowledged.", "https://example.test/synthetic-pib-policy")
    return directory


class NationalPublicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tempdir = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tempdir.cleanup)
        cls.fixture_root = Path(cls.tempdir.name)
        cls.directory = offline_fixture(cls.fixture_root)
        for target in (review, review.adapter):
            patcher = mock.patch.object(target, "ROOT", cls.fixture_root)
            patcher.start()
            cls.addClassCleanup(patcher.stop)
        cls.receipt = review.adapter.build_receipt("2026-10-10")
        cls.safe, cls.held, cls.identity_evidence = review.audit(cls.receipt, cls.directory)

    def test_source_reproduction_rejects_changed_rank_and_evidence(self):
        altered = copy.deepcopy(self.receipt)
        altered["providers"][0]["records"][1]["rank"] = 1
        with self.assertRaisesRegex(ValueError, "reproduce exactly"):
            review.validate_receipt(altered)
        altered = copy.deepcopy(self.receipt)
        altered["providers"][1]["records"][0]["evidence"]["source_sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "reproduce exactly"):
            review.validate_receipt(altered)

    def test_only_exact_single_institution_existing_entries_are_recommended(self):
        self.assertEqual(len(self.safe), 9)
        self.assertEqual(len({r["university_id"] for r in self.safe}), 8)
        self.assertEqual(sum(r["provider"] == "herd" for r in self.safe), 6)
        self.assertEqual(sum(r["provider"] == "nirf" for r in self.safe), 3)
        self.assertEqual(sum(r["university_id"] is None for r in self.held), 946)
        self.assertTrue(all(r["university_id"] for r in self.safe))

    def test_system_units_and_lifecycle_changes_are_held(self):
        held = [r for r in self.held if r["university_id"]]
        self.assertEqual(len(held), 5)
        self.assertEqual({r["name"] for r in held}, {"Eastern Virginia Medical School", "Northland C.", "U. Hawaii, system office", "California State U., system office", "Antioch U."})
        self.assertEqual(sum(r["reason"] == "combined_reporting_unit_not_a_single_university" for r in self.held), 9)
        self.assertFalse(any(r["identity_status"] == "aggregate_reporting_unit" for r in self.safe))

    def test_source_territories_require_exact_official_state_evidence(self):
        territories = [r for r in self.safe if r["country_code"] in {"PR", "GU", "VI"}]
        self.assertEqual(len(territories), 3)
        self.assertTrue(all(r["publication_target_country"] == "US" for r in territories))
        altered = copy.deepcopy(self.directory)
        next(u for u in altered if u["id"] == territories[0]["university_id"])["state"] = "NY"
        with self.assertRaisesRegex(ValueError, "country conflict"):
            review.audit(self.receipt, altered)

    def test_duplicate_unitid_cannot_be_published(self):
        target = next(r for r in self.safe if r["provider"] == "herd")
        duplicate = copy.deepcopy(next(u for u in self.directory if u["id"] == target["university_id"]))
        duplicate["id"] = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        with self.assertRaisesRegex(ValueError, "Nonunique"):
            review.audit(self.receipt, self.directory + [duplicate])

    def test_ambiguous_nirf_identity_cannot_be_published(self):
        target = next(r for r in self.safe if r["provider"] == "nirf")
        duplicate = copy.deepcopy(next(u for u in self.directory if u["id"] == target["university_id"]))
        duplicate["id"] = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        with self.assertRaisesRegex(ValueError, "NIRF selected institution"):
            review.audit(self.receipt, self.directory + [duplicate])

    def test_exact_publisher_ties_and_imputation_remain_unchanged(self):
        original = {r["id"]: r for p in self.receipt["providers"] for r in p["records"]}
        for row in self.safe:
            old = original[row["id"]]
            for key in ("rank", "rank_label", "evidence", "source_url", "retrieved_at", "scope", "population"):
                self.assertEqual(row[key], old[key])
        self.assertTrue(any(r.get("tied") and r["rank_label"].startswith("=") for r in self.safe))
        self.assertTrue(any(r.get("imputed") and r["evidence"]["imputed_total"] for r in self.safe))

    def test_current_official_permissions_and_facts_are_evidenced(self):
        """Optional real-source coverage audit, separate from synthetic CI."""
        paths = [review.RECEIPT, review.DIRECTORY, review.OUT / "evidence/fetch-manifest.json",
                 ROOT / "data/raw/ncses-herd/fetch-manifest.json", ROOT / "data/raw/nirf-pib/fetch-manifest.json",
                 ROOT / "data/raw/ipeds/HD2025.zip", ROOT / "data/raw/ipeds/HD2025_Dict.zip"]
        if not all(path.exists() for path in paths):
            self.skipTest("Optional real-source audit needs ignored raw snapshots and fresh policy receipts")
        with mock.patch.object(review, "ROOT", ROOT), mock.patch.object(review.adapter, "ROOT", ROOT):
            receipt = json.loads(review.RECEIPT.read_text())
            directory = json.loads(review.DIRECTORY.read_text())
            safe, held, _ = review.audit(receipt, directory)
            evidence = review.current_permissions(review.OUT / "evidence", receipt)
        self.assertEqual(len(safe), 855)
        self.assertEqual(len({r["university_id"] for r in safe}), 829)
        self.assertEqual(sum(r["university_id"] is None for r in held), 179)
        self.assertEqual(evidence["herd-table6.xlsx"]["sha256"], receipt["providers"][0]["source"]["sha256"])
        self.assertEqual(set(evidence), {"herd-table6.xlsx", "herd-methodology.html", "nirf-release.html", "nsf-policy.html", "pib-policy.html"})

    def test_integral_units_are_preserved_without_truncation_or_conversion(self):
        for row in self.safe:
            if row["provider"] == "herd":
                self.assertGreaterEqual(row["total_rd_thousand_usd"], 150)
                self.assertEqual(row["total_rd_thousand_usd"], int(float(row["source_row"]["total_2024"])))
        for value in ("1.5", "-1", "NaN", "Infinity"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                review.adapter.safe_herd_int(value)
        self.assertIsNone(review.adapter.safe_herd_int("N/A"))
        self.assertEqual(review.adapter.safe_herd_int("1,000.0"), 1000)

    def test_physical_snapshot_receipt_rejects_changed_source_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "fixture"
            shutil.copytree(self.fixture_root, root)
            raw = root / "data/raw/ncses-herd/table6.xlsx"
            raw.write_bytes(raw.read_bytes() + b"tampered")
            with mock.patch.object(review.adapter, "ROOT", root), self.assertRaisesRegex(ValueError, "receipt failed"):
                review.validate_receipt(self.receipt)

    def test_primary_table_year_unit_headers_are_parser_guards(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "synthetic.xlsx"
            for values in (
                [{"A": "Synthetic"}, {}, {"A": "(Dollars)"}, {"B": "Rank"}, {"I": 2024.0, "Q": 2024.0}],
                [{"A": "Synthetic"}, {}, {"A": "(Dollars in thousands)"}, {"B": "Rank"}, {"I": 2023.0, "Q": 2024.0}],
            ):
                path.write_bytes(xlsx_fixture(values))
                with self.assertRaisesRegex(ValueError, "rank/year/unit headers changed"):
                    review.adapter.xlsx_rows(path)

    def test_selected_nirf_category_boundaries_are_not_full_table_guesses(self):
        raw = (self.fixture_root / "data/raw/nirf-pib/release.html").read_text()
        altered = raw.replace("<td>10</td>", "<td>11</td>", 1)
        with self.assertRaisesRegex(ValueError, "top ten"):
            review.adapter.parse_nirf(altered)
        altered = raw.replace("<td>Universities</td>", "<td>Unrecognized category</td>")
        with self.assertRaisesRegex(ValueError, "category boundaries or coverage changed"):
            review.adapter.parse_nirf(altered)


if __name__ == "__main__":
    unittest.main()
