from django.test import SimpleTestCase, override_settings

from .http import ProviderError
from .matching import Match, base_nameplate, canonical, match_model, normalize
from .nhtsa import VIN_RE, _rating, _validate_year


class MatchingTests(SimpleTestCase):
    def setUp(self):
        self.catalog = [
            {"slug": "camry", "name": "Camry"},
            {"slug": "corolla", "name": "Corolla"},
            {"slug": "rav4", "name": "RAV4"},
            {"slug": "86", "name": "86"},
            {"slug": "supra", "name": "Supra"},
            {"slug": "tundra", "name": "Tundra"},
            {"slug": "prius-prime", "name": "Prius Prime"},
        ]

    def test_exact_camry(self):
        hit = match_model("Camry", self.catalog)
        self.assertEqual(hit.confidence, "exact")
        self.assertEqual(hit.slug, "camry")

    def test_does_not_attach_camry_to_corolla(self):
        hit = match_model("Camry", [{"slug": "corolla", "name": "Corolla"}])
        self.assertEqual(hit.confidence, "unavailable")
        self.assertIsNone(hit.slug)

    def test_gr86_alias(self):
        hit = match_model("GR86", self.catalog)
        self.assertEqual(hit.confidence, "exact")
        self.assertEqual(hit.slug, "86")

    def test_hybrid_is_generation_not_exact(self):
        hit = match_model("RAV4 Hybrid", self.catalog)
        self.assertEqual(hit.confidence, "generation")
        self.assertEqual(hit.slug, "rav4")

    def test_unknown_model_unavailable(self):
        hit = match_model("NotAToyota", self.catalog)
        self.assertEqual(hit, Match(None, None, "unavailable"))

    def test_canonical_spacing(self):
        self.assertEqual(canonical("RAV-4"), canonical("rav 4"))
        self.assertEqual(normalize("Toyota Camry"), "camry")
        self.assertEqual(base_nameplate("RAV4 Hybrid"), "rav4")

    def test_crown_awd_shares_crown_nameplate(self):
        self.assertEqual(base_nameplate("Crown"), base_nameplate("Crown AWD"))
        self.assertEqual(base_nameplate("Crown Hybrid AWD"), "crown")

    def test_crown_signia_is_not_crown(self):
        self.assertNotEqual(base_nameplate("Crown Signia"), base_nameplate("Crown"))
        self.assertNotEqual(base_nameplate("Crown Signia AWD"), base_nameplate("Crown AWD"))


class NhtsaHelpersTests(SimpleTestCase):
    def test_vin_pattern(self):
        self.assertTrue(VIN_RE.match("JTMBFREV0JJ123456"))
        self.assertFalse(VIN_RE.match("SHORT"))
        self.assertFalse(VIN_RE.match("JTMBFREV0IJ123456"))  # I is invalid

    def test_year_bounds(self):
        with self.assertRaises(ProviderError):
            _validate_year(1980)
        _validate_year(2026)

    def test_rating_parse(self):
        self.assertEqual(_rating("5"), 5)
        self.assertEqual(_rating("Not Rated"), None)
        self.assertEqual(_rating(None), None)


class EpaHelperTests(SimpleTestCase):
    def test_menu_items_accept_object_or_list(self):
        from .epa import _menu_items

        self.assertEqual(_menu_items({"menuItem": {"text": "A", "value": "1"}}), [{"text": "A", "value": "1"}])
        self.assertEqual(len(_menu_items({"menuItem": [{"value": "1"}, {"value": "2"}]})), 2)
        self.assertEqual(_menu_items({}), [])

    def test_crown_configs_become_a_range(self):
        from .epa import _aggregate

        payload = _aggregate(
            2026,
            "Crown",
            ["Crown AWD", "Crown Hybrid AWD"],
            [
                {"epa_model": "Crown AWD", "label": "2.4L", "city": 29, "highway": 32, "combined": 30, "engine": "2.4 L, 4-cyl", "drivetrain": "AWD", "transmission": "Auto", "fuel": "Hybrid"},
                {"epa_model": "Crown Hybrid AWD", "label": "2.5L", "city": 42, "highway": 41, "combined": 41, "engine": "2.5 L, 4-cyl", "drivetrain": "AWD", "transmission": "Auto", "fuel": "Hybrid"},
            ],
        )
        self.assertEqual(payload["combined"], 30)
        self.assertEqual(payload["combined_high"], 41)
        self.assertEqual(payload["city"], 29)
        self.assertEqual(payload["city_high"], 42)
        self.assertTrue(payload["varies"])
        self.assertEqual(payload["source"], "EPA")

    def test_fuel_from_epa(self):
        from .catalog import _fuel_from_epa

        self.assertEqual(_fuel_from_epa("Hybrid"), "Hybrid")
        self.assertEqual(_fuel_from_epa("Plug-in Hybrid"), "Plug-in hybrid")
        self.assertEqual(_fuel_from_epa("Electricity"), "Electric")


class CatalogRecordTests(SimpleTestCase):
    def test_tundra_gets_local_footage_without_carimages(self):
        from .catalog import _local_image, _record

        row = {"year": 2026, "make": "Toyota", "model": "Tundra", "make_id": 448, "model_id": 1}
        record = _record(row, {"tundra": "Truck"}, _local_image("Tundra"))
        self.assertEqual(record["category"], "Truck")
        self.assertEqual(record["image"]["provider"], "local")
        self.assertTrue(record["image"]["url"].endswith("tundra-trd-pro-poster.jpg"))
        self.assertIsNone(record["msrp"]["value"])

    def test_camry_is_not_given_tundra_footage(self):
        from .catalog import _local_image

        self.assertIsNone(_local_image("Camry"))


class AuthRedirectTests(SimpleTestCase):
    """URL safety is a frontend concern; year validation stays here."""

    @override_settings(NHTSA_VPIC_BASE_URL="https://vpic.nhtsa.dot.gov/api")
    def test_settings_default_is_official_host(self):
        from django.conf import settings

        self.assertIn("vpic.nhtsa.dot.gov", settings.NHTSA_VPIC_BASE_URL)
        self.assertIn("api.nhtsa.gov", settings.NHTSA_DATA_BASE_URL)
        self.assertIn("fueleconomy.gov", settings.EPA_FUELECONOMY_BASE_URL)
