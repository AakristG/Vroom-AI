from django.test import SimpleTestCase

from . import policy, shopping
from .account_context import _profiles, account_context
from .assistant import _plain


class PlainReplyTests(SimpleTestCase):
    def test_sentence_dashes_become_commas(self):
        self.assertEqual(_plain("You owe more \u2014 about $221."), "You owe more, about $221.")
        self.assertEqual(_plain("Refinance - or extend."), "Refinance, or extend.")
        self.assertEqual(_plain("Lower\u2014but longer."), "Lower, but longer.")

    def test_semicolons_become_sentences(self):
        self.assertEqual(_plain("It is lower; you pay longer."), "It is lower. You pay longer.")

    def test_word_hyphens_ranges_and_negatives_kept(self):
        text = "Trade-in equity is -$221 for 2020\u20132024 models."
        self.assertEqual(_plain(text), text)


def _ids(decision):
    return {o["option_id"] for o in decision.options}


class PolicyTests(SimpleTestCase):
    def test_eligible_offer_for_maya(self):
        d = policy.decide(_profiles()["C001"])
        self.assertFalse(d.protected)
        self.assertEqual(d.label, "Eligible offer")
        self.assertEqual(d.best_move, "Refinance at a lower rate")
        self.assertIn("TRADE", _ids(d))

    def test_vulnerable_customer_goes_to_specialist_without_upsell(self):
        d = policy.decide(_profiles()["C002"])
        self.assertTrue(d.protected)
        self.assertEqual(d.label, "Follow-up")
        self.assertNotIn("TRADE", _ids(d))
        self.assertIn("specialist", d.best_move)

    def test_two_missed_payments_is_protected(self):
        self.assertTrue(policy.decide(_profiles()["C014"]).protected)

    def test_no_marketing_consent_hides_new_vehicle_options(self):
        d = policy.decide(_profiles()["C011"])
        self.assertTrue(d.no_marketing)
        self.assertFalse(_ids(d) & policy.NEW_VEHICLE_OPTIONS)
        context = account_context("C011")
        self.assertNotIn("TRADE (", context)
        self.assertIn("NO MARKETING CONSENT", context)

    def test_distress_in_conversation_overrides_offer(self):
        d = policy.decide(_profiles()["C004"], "My hours were cut and I can't make my payment.")
        self.assertTrue(d.distressed)
        self.assertEqual(d.label, "Follow-up")
        self.assertNotIn("TRADE", _ids(d))

    def test_trade_offer_hidden_when_consent_withdrawn(self):
        profile = _profiles()["C004"]
        profile = {**profile, "customer": {**profile["customer"], "marketing_consent": "N"}}
        d = policy.decide(profile)
        self.assertNotEqual(d.label, "Eligible offer")
        self.assertNotIn("Tundra", d.best_move)

    def test_no_eligible_offer_is_reported(self):
        profile = _profiles()["C001"]
        options = [{**o, "eligibility": "N (new rate not meaningfully lower)"} if o["option_id"] != "KEEP" else o
                   for o in profile["options"]]
        d = policy.decide({**profile, "options": options, "customer": {**profile["customer"], "customer_id": "X"}})
        self.assertTrue(d.no_offer_eligible)
        self.assertIn("NO OFFER IS ELIGIBLE", "\n".join(policy.rule_lines(d)))

    def test_finalize_ends_with_exactly_one_labeled_step(self):
        d = policy.decide(_profiles()["C001"])
        reply = "Refinancing looks best.\nFollow-up: call us.\n\nNext step (Self-service): do it."
        out = policy.finalize(reply, d)
        self.assertEqual(out, "Refinancing looks best.\n\nBest next step (Eligible offer): Refinance at a lower rate.")


_PICKS = [
    {"id": "2025|Corolla|", "vehicle": "2025 Toyota Corolla", "category": "Sedan", "starting_msrp_approx": 22000,
     "est_monthly_payment": 434.59, "mpg_combined": 34, "mpg_combined_high": 35, "safety_rating_5_star": 5},
    {"id": "2025|Prius|", "vehicle": "2025 Toyota Prius", "category": "Hatchback", "starting_msrp_approx": 28500,
     "est_monthly_payment": 563.0, "mpg_combined": 57, "safety_rating_5_star": None},
]


def _result(**request):
    req = {"budget": None, "monthly_budget": None, "price_cap_used": None, "count": 2, "uses": [], "categories": []}
    return {"request": {**req, **request}, "suggestions": _PICKS, "pricing_note": "2025 model year. Approximate."}


class ShoppingTests(SimpleTestCase):
    def test_shopping_intent(self):
        self.assertTrue(shopping.is_shopping("I want to buy my son a car under $20000. Give me 3 suggestions"))
        self.assertTrue(shopping.is_shopping("Recommend an SUV for my family"))
        self.assertFalse(shopping.is_shopping("What is my payoff amount?"))
        self.assertFalse(shopping.is_shopping("Should I refinance my loan to buy a new car?"))

    def test_parse_budget_count_and_use(self):
        r = shopping.parse_request("I want to buy my son a car under $20,000. Give me 3 suggestions")
        self.assertEqual((r["budget"], r["count"], r["uses"]), (20000, 3, ["new driver"]))
        self.assertEqual(shopping.parse_request("an SUV under 45k")["budget"], 45000)
        r = shopping.parse_request("What can I get for $400 a month?")
        self.assertEqual((r["budget"], r["monthly_budget"]), (None, 400))
        self.assertEqual(shopping.parse_request("two options please, a truck")["categories"], ["Truck"])

    def test_compose_says_when_nothing_new_fits(self):
        result = {**_result(budget=20000, price_cap_used=20000), "no_new_vehicle_fits": "x"}
        text = shopping.compose(result, {1: "Great first car."})
        self.assertTrue(text.startswith("No new Toyota starts under $20,000"))
        self.assertIn("1. 2025 Toyota Corolla: about $22,000, around $435/month. Great first car.", text)
        self.assertIn("2. 2025 Toyota Prius: about $28,500, around $563/month. It has 57 mpg combined.", text)

    def test_reasons_drop_money_claims_and_repeated_names(self):
        raw = "1. 2025 Toyota Corolla: Fits your $20k budget.\n2. 2025 Toyota Prius: Saves fuel in town."
        reasons = shopping.parse_reasons(raw, 2, ["2025 Toyota Corolla", "2025 Toyota Prius"])
        self.assertEqual(reasons, {2: "Saves fuel in town."})

    def test_careful_customer_gets_specialist_line(self):
        text = shopping.compose(_result(), {}, careful=True)
        self.assertIn("specialist", text)
        self.assertNotIn("test drive", text)


class NextMovesTests(SimpleTestCase):
    def test_plan_automates_checks_and_leaves_decisions(self):
        from unittest import mock

        from . import next_moves

        published = []
        with mock.patch.object(next_moves, "try_reducer", side_effect=lambda n, a: published.append((n, a)) or True), \
             mock.patch.object(next_moves.nim_client, "generate_reply", return_value="You can save with a lower rate. It needs a credit check."):
            plan = next_moves.run("C001", pace=0)
        keys = [s["key"] for s in plan["steps"]]
        self.assertEqual(keys[:3], ["review", "options", "numbers"])
        self.assertEqual(plan["steps"][-1]["status"], "needs_you")
        self.assertEqual(plan["steps"][-1]["action"]["topic"], "Refinance")
        self.assertTrue(all(s["status"] == "done" for s in plan["steps"][:3]))
        self.assertEqual(published[0], ("clear_next_moves", {"customerId": "C001"}))
        self.assertIn("lower rate", plan["summary"])

    def test_protected_customer_gets_specialist_not_offer(self):
        from unittest import mock

        from . import next_moves

        with mock.patch.object(next_moves, "try_reducer", return_value=True), \
             mock.patch.object(next_moves.nim_client, "generate_reply", side_effect=RuntimeError("offline")):
            plan = next_moves.run("C002", pace=0)
        last = plan["steps"][-1]
        self.assertEqual(last["action"]["topic"], "Payment help")
        self.assertIn("specialist", plan["summary"].lower() + last["title"].lower())

    def test_invented_dollar_amounts_are_rejected(self):
        from unittest import mock

        from . import next_moves

        with mock.patch.object(next_moves, "try_reducer", return_value=True), \
             mock.patch.object(next_moves.nim_client, "generate_reply", return_value="You will save $9,999 today."):
            plan = next_moves.run("C001", pace=0)
        self.assertNotIn("$9,999", plan["summary"])
