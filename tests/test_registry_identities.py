import copy
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("registry_expansion", ROOT / "scripts/ingestion/expand-registry-identities.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def record(number, name, website=None, country="CA"):
    return {"id": f"https://ror.org/test{number:05}", "status": "active", "types": ["education"], "names": [{"value": name, "types": ["ror_display", "label"]}], "links": [{"type": "website", "value": website or f"https://university{number}.example"}], "locations": [{"geonames_details": {"country_code": country, "country_name": "Canada", "name": "Ottawa", "lat": 45, "lng": -75}}], "established": None, "relationships": [], "external_ids": []}


class RegistryIdentities(unittest.TestCase):
    def test_identity_guards_hold_ambiguous_aliases_shared_hosts_units_and_us(self):
        previous = [{"id": "preserved", "slug": "preserved-route", "name": "Arbor University", "aliases": [], "country_code": "CA", "website": "https://arbor.example", "notes": "Staff correction"}]
        registry = [record(1, "Árbor University"), record(2, "New University"), record(3, "University Research Center"), record(4, "Shared University", "https://shared.example"), record(5, "Second University", "https://shared.example"), record(6, "Uncorroborated University", country="US"), record(7, "Southern University")]
        original = copy.deepcopy(previous)
        added, held, _, _ = module.build_plan(previous, registry, 3)
        self.assertEqual(previous, original)
        self.assertEqual({r["name"] for r in added}, {"New University", "Southern University"})
        self.assertEqual(held["existing_registered_name_or_alias"], 1)
        self.assertEqual(held["ambiguous_registry_website"], 2)
        self.assertEqual(held["non_university_or_research_unit"], 1)
        self.assertEqual(held["us_requires_current_ipeds_corroboration"], 1)
        self.assertTrue(all("university_type" not in r and "rankings" not in r and "acceptance_rate" not in r for r in added))
        self.assertEqual(module.build_plan(previous, list(reversed(registry)), 3)[0], added)

    def test_receipt_repeats_preserve_staff_corrections_and_reject_route_conflicts(self):
        added, _, _, _ = module.build_plan([], [record(2, "New University")], 1)
        installed = module.merge_receipt([], added)
        installed[0] = {**installed[0], "notes": "Later staff correction"}
        self.assertEqual(module.merge_receipt(installed, added), installed)
        self.assertEqual(len(installed), 1)
        changed = [{**added[0], "slug": "incorrect-new-route"}]
        with self.assertRaisesRegex(AssertionError, "canonical route"):
            module.merge_receipt(installed, changed)

    def test_installed_receipt_is_bounded_unique_and_never_invents_university_facts(self):
        receipt = json.loads((ROOT / "data/published/registry-identity-expansion-oct06.json").read_text())
        self.assertEqual(receipt["base_count"], 9000)
        self.assertEqual(receipt["target"], 14000)
        self.assertEqual(len(receipt["records"]), 5000)
        self.assertEqual(len({r["id"] for r in receipt["records"]}), 5000)
        self.assertEqual(len({r["slug"] for r in receipt["records"]}), 5000)
        self.assertEqual(len({r["ror"] for r in receipt["records"]}), 5000)
        self.assertTrue(all(r["identity_source"] == r["ror"] and r["identity_release"] == module.RELEASE for r in receipt["records"]))
        self.assertTrue(all("university_type" not in r and "requirements" not in r and "rankings" not in r for r in receipt["records"]))


if __name__ == "__main__":
    unittest.main()
