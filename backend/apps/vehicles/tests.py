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


class AuthRedirectTests(SimpleTestCase):
    """URL safety is a frontend concern; year validation stays here."""

    @override_settings(NHTSA_VPIC_BASE_URL="https://vpic.nhtsa.dot.gov/api")
    def test_settings_default_is_official_host(self):
        from django.conf import settings

        self.assertIn("vpic.nhtsa.dot.gov", settings.NHTSA_VPIC_BASE_URL)
        self.assertIn("api.nhtsa.gov", settings.NHTSA_DATA_BASE_URL)
