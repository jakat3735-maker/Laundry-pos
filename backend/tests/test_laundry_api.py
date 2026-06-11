"""Backend tests for Laundry POS API"""
import os
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://wash-app-3.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def owner_token(s):
    r = s.post(f"{API}/auth/login", json={"email": "owner@laundry.com", "password": "owner123"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "owner"
    return data["access_token"]


@pytest.fixture(scope="session")
def cashier_token(s):
    r = s.post(f"{API}/auth/login", json={"email": "kasir@laundry.com", "password": "kasir123"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["role"] == "cashier"
    return data["access_token"]


def H(token):
    return {"Authorization": f"Bearer {token}"}


# --- Auth ---
class TestAuth:
    def test_login_owner(self, owner_token):
        assert isinstance(owner_token, str) and len(owner_token) > 10

    def test_login_cashier(self, cashier_token):
        assert isinstance(cashier_token, str)

    def test_login_wrong_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "owner@laundry.com", "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, s, owner_token):
        r = s.get(f"{API}/auth/me", headers=H(owner_token))
        assert r.status_code == 200
        assert r.json()["email"] == "owner@laundry.com"


# --- Dashboard ---
class TestDashboard:
    def test_stats(self, s, owner_token):
        r = s.get(f"{API}/dashboard/stats", headers=H(owner_token))
        assert r.status_code == 200
        data = r.json()
        for k in ("revenue_today", "revenue_total", "orders_today", "orders_total", "by_status", "active_orders"):
            assert k in data

    def test_stats_no_auth(self, s):
        r = s.get(f"{API}/dashboard/stats")
        assert r.status_code == 401


# --- Customers CRUD ---
class TestCustomers:
    cid = None

    def test_list(self, s, cashier_token):
        r = s.get(f"{API}/customers", headers=H(cashier_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create(self, s, cashier_token):
        r = s.post(f"{API}/customers", headers=H(cashier_token),
                   json={"name": "TEST_Pelanggan", "phone": "081200001111", "address": "Jl Test"})
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "TEST_Pelanggan"
        TestCustomers.cid = body["id"]

    def test_update(self, s, cashier_token):
        assert TestCustomers.cid
        r = s.put(f"{API}/customers/{TestCustomers.cid}", headers=H(cashier_token),
                  json={"name": "TEST_Pelanggan2", "phone": "081200001111", "address": "Jl Test 2"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Pelanggan2"

    def test_delete(self, s, cashier_token):
        assert TestCustomers.cid
        r = s.delete(f"{API}/customers/{TestCustomers.cid}", headers=H(cashier_token))
        assert r.status_code == 200


# --- Services ---
class TestServices:
    sid = None

    def test_list_services(self, s, cashier_token):
        r = s.get(f"{API}/services", headers=H(cashier_token))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_create_owner(self, s, owner_token):
        r = s.post(f"{API}/services", headers=H(owner_token),
                   json={"name": "TEST_Service", "price": 12345, "unit": "kg", "category": "reguler"})
        assert r.status_code == 200
        TestServices.sid = r.json()["id"]

    def test_create_cashier_forbidden(self, s, cashier_token):
        r = s.post(f"{API}/services", headers=H(cashier_token),
                   json={"name": "TEST_Forbidden", "price": 100, "unit": "kg", "category": "reguler"})
        assert r.status_code == 403

    def test_cleanup(self, s, owner_token):
        if TestServices.sid:
            r = s.delete(f"{API}/services/{TestServices.sid}", headers=H(owner_token))
            assert r.status_code == 200


# --- Orders ---
class TestOrders:
    order_id = None
    order_no = None
    customer_id = None

    def test_create_customer_for_order(self, s, cashier_token):
        r = s.post(f"{API}/customers", headers=H(cashier_token),
                   json={"name": "TEST_OrderCust", "phone": "0811", "address": ""})
        assert r.status_code == 200
        TestOrders.customer_id = r.json()["id"]

    def test_create_order(self, s, cashier_token):
        services = s.get(f"{API}/services", headers=H(cashier_token)).json()
        svc = services[0]
        r = s.post(f"{API}/orders", headers=H(cashier_token), json={
            "customer_id": TestOrders.customer_id,
            "customer_name": "TEST_OrderCust",
            "items": [{
                "service_id": svc["id"], "service_name": svc["name"],
                "price": svc["price"], "unit": svc["unit"], "quantity": 3,
            }],
            "notes": "test",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "diterima"
        assert body["payment_status"] == "unpaid"
        assert body["order_no"].startswith("LDR-")
        assert body["total"] == svc["price"] * 3
        TestOrders.order_id = body["id"]
        TestOrders.order_no = body["order_no"]

    def test_get_order(self, s, cashier_token):
        r = s.get(f"{API}/orders/{TestOrders.order_id}", headers=H(cashier_token))
        assert r.status_code == 200
        assert r.json()["id"] == TestOrders.order_id

    def test_update_status(self, s, cashier_token):
        r = s.put(f"{API}/orders/{TestOrders.order_id}/status", headers=H(cashier_token),
                  json={"status": "dicuci"})
        assert r.status_code == 200
        assert r.json()["status"] == "dicuci"

    def test_update_payment(self, s, cashier_token):
        r = s.put(f"{API}/orders/{TestOrders.order_id}/payment", headers=H(cashier_token),
                  json={"payment_status": "paid", "payment_method": "cash"})
        assert r.status_code == 200
        body = r.json()
        assert body["payment_status"] == "paid"
        assert body["payment_method"] == "cash"

    def test_list_orders_filter(self, s, cashier_token):
        r = s.get(f"{API}/orders?status_filter=dicuci", headers=H(cashier_token))
        assert r.status_code == 200
        ids = [o["id"] for o in r.json()]
        assert TestOrders.order_id in ids

    def test_midtrans_paid_400(self, s, cashier_token):
        # Already paid, must return 400
        r = s.post(f"{API}/payments/midtrans/create/{TestOrders.order_id}", headers=H(cashier_token))
        assert r.status_code == 400

    def test_midtrans_unpaid_502(self, s, cashier_token):
        # Create new unpaid order to trigger Midtrans call
        services = s.get(f"{API}/services", headers=H(cashier_token)).json()
        svc = services[0]
        cr = s.post(f"{API}/orders", headers=H(cashier_token), json={
            "customer_id": TestOrders.customer_id,
            "customer_name": "TEST_OrderCust",
            "items": [{
                "service_id": svc["id"], "service_name": svc["name"],
                "price": svc["price"], "unit": svc["unit"], "quantity": 1,
            }],
        })
        new_id = cr.json()["id"]
        r = s.post(f"{API}/payments/midtrans/create/{new_id}", headers=H(cashier_token))
        # Placeholder key => Midtrans returns 401 => server raises 502
        assert r.status_code == 502, f"Expected 502, got {r.status_code}: {r.text}"
        # cleanup order
        s.delete(f"{API}/orders/{new_id}", headers=H(s.post(
            f"{API}/auth/login", json={"email": "owner@laundry.com", "password": "owner123"}
        ).json()["access_token"]))

    def test_cleanup_order(self, s, owner_token):
        if TestOrders.order_id:
            s.delete(f"{API}/orders/{TestOrders.order_id}", headers=H(owner_token))
        if TestOrders.customer_id:
            s.delete(f"{API}/customers/{TestOrders.customer_id}", headers=H(owner_token))


# --- Users management ---
class TestUserMgmt:
    new_user_id = None

    def test_register_as_owner(self, s, owner_token):
        r = s.post(f"{API}/auth/register", headers=H(owner_token), json={
            "email": "test_newuser@laundry.com", "password": "pw12345",
            "full_name": "TEST_New", "role": "cashier",
        })
        # If already exists from prior run, allow 400 then fetch existing
        if r.status_code == 400:
            users = s.get(f"{API}/users", headers=H(owner_token)).json()
            uid = next((u["id"] for u in users if u["email"] == "test_newuser@laundry.com"), None)
            assert uid
            TestUserMgmt.new_user_id = uid
        else:
            assert r.status_code == 200, r.text
            TestUserMgmt.new_user_id = r.json()["id"]

    def test_register_as_cashier_forbidden(self, s, cashier_token):
        r = s.post(f"{API}/auth/register", headers=H(cashier_token), json={
            "email": "test_other@laundry.com", "password": "pw12345",
            "full_name": "TEST_Other", "role": "cashier",
        })
        assert r.status_code == 403

    def test_delete_user_as_owner(self, s, owner_token):
        assert TestUserMgmt.new_user_id
        r = s.delete(f"{API}/users/{TestUserMgmt.new_user_id}", headers=H(owner_token))
        assert r.status_code == 200
