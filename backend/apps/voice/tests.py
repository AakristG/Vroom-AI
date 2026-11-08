from unittest import mock

from django.test import TestCase
from django.utils import timezone

from . import actions, live
from .models import CallLog, PendingAction
from .verified_calls import register_verified_web_call, resolve_verified_customer


class ConfirmationMachineTests(TestCase):
    def test_first_yes_does_not_execute(self):
        row = actions.propose(
            customer_id="C001",
            action_type="request_callback",
            payload={"category": "Specialist callback", "when": "Tuesday 2pm", "phone": "2145550100"},
            summary="Record a specialist callback.",
        )
        row = actions.confirm_intent(row.action_id, "C001", "yes")
        self.assertEqual(row.status, PendingAction.AWAIT_FINAL)
        self.assertIsNone(row.result or None if not row.result else row.result.get("appointment_id"))

    def test_second_yes_records_request_not_confirmed_booking(self):
        row = actions.propose(
            customer_id="C001",
            action_type="request_callback",
            payload={"category": "Trade-in consultation", "when": "Tuesday 2pm", "phone": "2145550100"},
            summary="Record a trade-in consultation request.",
        )
        actions.confirm_intent(row.action_id, "C001", "yes that's right")
        done = actions.confirm_execution(row.action_id, "C001", "go ahead")
        self.assertEqual(done.status, PendingAction.COMPLETED)
        self.assertEqual(done.result.get("status"), "requested")
        self.assertNotEqual(done.result.get("status"), "confirmed")

    def test_other_customer_cannot_confirm(self):
        row = actions.propose(
            customer_id="C001",
            action_type="request_callback",
            payload={"category": "Specialist callback", "phone": "2145550100"},
            summary="Record a specialist callback.",
        )
        with self.assertRaises(PermissionError):
            actions.confirm_intent(row.action_id, "C002", "yes")

    def test_expired_confirmation_rejected(self):
        row = actions.propose(
            customer_id="C001",
            action_type="request_callback",
            payload={"category": "Specialist callback", "phone": "2145550100"},
            summary="Record a specialist callback.",
        )
        row.expires_at = timezone.now() - timezone.timedelta(minutes=1)
        row.save()
        with self.assertRaises(PermissionError):
            actions.confirm_intent(row.action_id, "C001", "yes")

    def test_ambiguous_utterance_does_not_advance(self):
        row = actions.propose(
            customer_id="C001",
            action_type="request_callback",
            payload={"category": "Specialist callback", "phone": "2145550100"},
            summary="Record a specialist callback.",
        )
        stayed = actions.maybe_advance_from_utterance("C001", "tell me more about the payment")
        self.assertEqual(stayed.status, PendingAction.AWAIT_INTENT)
        self.assertEqual(stayed.action_id, row.action_id)

    def test_no_invented_representatives(self):
        from .representatives import find_local

        hit = find_local(zip_code="75080")
        self.assertFalse(hit["configured"])
        self.assertEqual(hit["results"], [])


class VerifiedWebCallTests(TestCase):
    def test_register_and_resolve(self):
        register_verified_web_call(call_id="call_test_abc", customer_id="C001")
        self.assertEqual(resolve_verified_customer("call_test_abc"), "C001")

    def test_unknown_call_is_unverified(self):
        self.assertIsNone(resolve_verified_customer("call_missing"))

    def test_expired_binding_is_rejected(self):
        row = register_verified_web_call(call_id="call_expired", customer_id="C001")
        row.expires_at = timezone.now() - timezone.timedelta(minutes=1)
        row.save(update_fields=["expires_at"])
        self.assertIsNone(resolve_verified_customer("call_expired"))

    def test_retell_metadata_alone_does_not_create_binding(self):
        # Spoofed Retell metadata must not unlock account tools without a server mint row.
        self.assertIsNone(resolve_verified_customer("call_spoofed_meta"))


class LiveTranscriptTests(TestCase):
    def setUp(self):
        self.calls = []
        patcher = mock.patch.object(live, "try_reducer", side_effect=lambda name, args: self.calls.append((name, args)) or True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _messages(self):
        return [(a["role"], a["content"]) for n, a in self.calls if n == "append_call_message"]

    def test_turns_are_published_once_in_order_and_saved(self):
        t = [{"role": "agent", "content": "Hi Maya"}, {"role": "user", "content": "What is my payoff?"},
             {"role": "agent", "content": "About $23,000."}]
        live.set_owner("c1", "C001", channel="web")
        live.sync_transcript("C001", "c1", t[:2])  # caller still talking: last turn not final
        self.assertEqual(self._messages(), [("agent", "Hi Maya")])
        live.sync_transcript("C001", "c1", t[:2], settled=True)
        live.append_agent("C001", "c1", t[2]["content"], 1)
        live.sync_transcript("C001", "c1", t)
        live.finish("C001", "c1", t)
        self.assertEqual(self._messages(), [(x["role"], x["content"]) for x in t])
        log = CallLog.objects.get(call_id="c1")
        self.assertEqual((log.customer_id, log.channel, log.status, len(log.transcript)), ("C001", "web", "ended", 3))

    def test_owner_is_published(self):
        live.set_owner("c2", "C002", channel="phone", from_number="+15551234567")
        owner = next(a for n, a in self.calls if n == "set_call_owner")
        self.assertEqual((owner["callId"], owner["customerId"], owner["channel"]), ("c2", "C002", "phone"))
