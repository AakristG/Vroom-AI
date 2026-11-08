from django.contrib.auth.hashers import make_password
from django.test import TestCase
from rest_framework.test import APIClient

from .models import CustomerAccount


class AuthApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.account = CustomerAccount.objects.create(
            username="jordan",
            password=make_password("secret123"),
            first_name="Jordan",
            city="Dallas",
            customer_id="N099",
            life_change="new job",
        )

    def test_unauthenticated_vehicles_rejected(self):
        response = self.client.get("/api/vehicles/catalog/", {"year": 2026})
        self.assertEqual(response.status_code, 401)

    def test_unauthenticated_ai_rejected(self):
        response = self.client.post("/api/ai/assistant/", {"messages": [{"role": "user", "content": "hi"}]}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_login_rejects_bad_password(self):
        response = self.client.post("/api/auth/login/", {"username": "jordan", "password": "wrong"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_login_and_me(self):
        response = self.client.post("/api/auth/login/", {"username": "jordan", "password": "secret123"}, format="json")
        self.assertEqual(response.status_code, 200)
        token = response.json()["token"]
        self.assertTrue(token)
        self.assertTrue(response.cookies.get("tfs_session"))
        me = self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["username"], "jordan")

    def test_logout_invalidates_token(self):
        login = self.client.post("/api/auth/login/", {"username": "jordan", "password": "secret123"}, format="json")
        token = login.json()["token"]
        out = self.client.post("/api/auth/logout/", HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(out.status_code, 200)
        me = self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(me.status_code, 401)

    def test_lowercase_password_is_not_accepted(self):
        CustomerAccount.objects.create(
            username="casey",
            password=make_password("SecretCase"),
            first_name="Casey",
            city="Austin",
            customer_id="N098",
            life_change="moved",
        )
        response = self.client.post("/api/auth/login/", {"username": "casey", "password": "secretcase"}, format="json")
        self.assertEqual(response.status_code, 400)
