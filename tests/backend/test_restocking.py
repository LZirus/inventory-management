"""
Tests for restocking API endpoints.
"""
import pytest

import restocking


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    """Point the restocking module at a throwaway SQLite file for every test."""
    monkeypatch.setattr(restocking, "DB_PATH", str(tmp_path / "restocking.db"))
    restocking.init_db()


class TestRestockingRecommendations:
    """Test suite for budget-based recommendations."""

    def test_zero_budget_recommends_nothing(self, client):
        response = client.get("/api/restocking/recommendations?budget=0")
        assert response.status_code == 200
        data = response.json()
        assert data["total_cost"] == 0
        assert all(item["recommended_quantity"] == 0 for item in data["items"])

    def test_total_never_exceeds_budget(self, client):
        for budget in [100, 1000, 5000, 12345.67]:
            data = client.get(f"/api/restocking/recommendations?budget={budget}").json()
            assert data["total_cost"] <= budget
            assert data["remaining_budget"] == pytest.approx(budget - data["total_cost"], abs=0.01)

    def test_full_budget_covers_every_gap(self, client):
        full = client.get("/api/restocking/recommendations?budget=0").json()["full_restock_cost"]
        data = client.get(f"/api/restocking/recommendations?budget={full}").json()
        assert all(item["recommended_quantity"] == item["gap"] for item in data["items"])

    def test_decreasing_items_are_excluded(self, client):
        data = client.get("/api/restocking/recommendations?budget=100000").json()
        assert all(item["trend"] != "decreasing" for item in data["items"])

    def test_increasing_items_come_first(self, client):
        items = client.get("/api/restocking/recommendations?budget=1000").json()["items"]
        trends = [item["trend"] for item in items]
        assert trends == sorted(trends, key=lambda t: {"increasing": 0, "stable": 1}[t])

    def test_negative_budget_is_rejected(self, client):
        assert client.get("/api/restocking/recommendations?budget=-5").status_code == 422


class TestRestockingOrders:
    """Test suite for submitting and listing restocking orders."""

    def test_list_starts_empty(self, client):
        response = client.get("/api/restocking/orders")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_order_uses_server_prices(self, client):
        response = client.post("/api/restocking/orders", json={
            "budget": 1000,
            "items": [{"sku": "WDG-001", "quantity": 10}, {"sku": "FLT-405", "quantity": 20}],
        })
        assert response.status_code == 201
        order = response.json()
        assert order["order_number"].startswith("RST-")
        assert order["status"] == "Submitted"
        assert order["total_cost"] == pytest.approx(10 * 42.5 + 20 * 12.4)
        # Slowest line (WDG-001, 14 days) determines the order lead time
        assert order["lead_time_days"] == 14
        assert order["expected_delivery"] > order["created_at"]

    def test_created_order_is_listed_newest_first(self, client):
        for qty in (1, 2):
            client.post("/api/restocking/orders", json={
                "budget": 500, "items": [{"sku": "GSK-203", "quantity": qty}]})
        orders = client.get("/api/restocking/orders").json()
        assert [o["items"][0]["quantity"] for o in orders] == [2, 1]

    def test_order_over_budget_is_rejected(self, client):
        response = client.post("/api/restocking/orders", json={
            "budget": 100, "items": [{"sku": "MTR-304", "quantity": 1}]})
        assert response.status_code == 400
        assert "exceeds budget" in response.json()["detail"]

    def test_unknown_sku_is_rejected(self, client):
        response = client.post("/api/restocking/orders", json={
            "budget": 100, "items": [{"sku": "NOPE-000", "quantity": 1}]})
        assert response.status_code == 400

    def test_empty_or_invalid_lines_are_rejected(self, client):
        assert client.post("/api/restocking/orders", json={"budget": 100, "items": []}).status_code == 422
        assert client.post("/api/restocking/orders", json={
            "budget": 100, "items": [{"sku": "GSK-203", "quantity": 0}]}).status_code == 422


class TestRestockingInputLimits:
    """Absurd inputs are rejected with 422 instead of crashing or being stored (audit P0-4)."""

    @pytest.mark.parametrize("budget", ["inf", "-inf", "nan", "1e30"])
    def test_recommendation_rejects_non_finite_or_huge_budget(self, client, budget):
        response = client.get(f"/api/restocking/recommendations?budget={budget}")
        assert response.status_code == 422

    def test_order_rejects_huge_quantity(self, client):
        response = client.post("/api/restocking/orders", json={
            "budget": 1000, "items": [{"sku": "GSK-203", "quantity": 10**29}]})
        assert response.status_code == 422
        assert client.get("/api/restocking/orders").json() == []

    def test_order_rejects_huge_budget(self, client):
        response = client.post("/api/restocking/orders", json={
            "budget": 1e300, "items": [{"sku": "GSK-203", "quantity": 1}]})
        assert response.status_code == 422

    def test_order_rejects_too_many_lines(self, client):
        items = [{"sku": f"X-{i}", "quantity": 1} for i in range(101)]
        response = client.post("/api/restocking/orders", json={"budget": 1000, "items": items})
        assert response.status_code == 422


class TestRestockingCurrency:
    """Order amounts are USD only (audit P0-1, server side)."""

    def test_usd_is_accepted_and_default(self, client):
        for payload in [{}, {"currency": "USD"}]:
            response = client.post("/api/restocking/orders", json={
                "budget": 100, "items": [{"sku": "GSK-203", "quantity": 1}], **payload})
            assert response.status_code == 201

    def test_other_currency_is_rejected(self, client):
        response = client.post("/api/restocking/orders", json={
            "budget": 100, "currency": "JPY", "items": [{"sku": "GSK-203", "quantity": 1}]})
        assert response.status_code == 422
