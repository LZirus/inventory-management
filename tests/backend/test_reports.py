"""
Tests for reports API endpoints (/api/reports/*).
"""
import pytest


QUARTERLY = "/api/reports/quarterly"
MONTHLY = "/api/reports/monthly-trends"


class TestReportsEndpoints:
    """Test suite for the Reports page endpoints."""

    def test_quarterly_structure(self, client):
        """Quarterly rows carry all fields the Reports page renders, sorted by quarter."""
        response = client.get(QUARTERLY)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) and len(data) > 0
        for row in data:
            for field in ["quarter", "total_orders", "total_revenue", "avg_order_value", "fulfillment_rate"]:
                assert field in row, f"Missing field: {field}"
        quarters = [row["quarter"] for row in data]
        assert quarters == sorted(quarters)

    def test_monthly_structure(self, client):
        """Monthly rows are YYYY-MM keyed and sorted chronologically."""
        response = client.get(MONTHLY)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list) and len(data) > 0
        months = [row["month"] for row in data]
        assert months == sorted(months)
        for row in data:
            assert len(row["month"]) == 7
            assert row["order_count"] > 0

    @pytest.mark.parametrize("endpoint,revenue_field", [(QUARTERLY, "total_revenue"), (MONTHLY, "revenue")])
    def test_revenue_rounded_to_cents(self, client, endpoint, revenue_field):
        """Summed float revenue must be rounded, not leak values like 1234.5600000001."""
        for row in client.get(endpoint).json():
            assert row[revenue_field] == round(row[revenue_field], 2)

    @pytest.mark.parametrize("endpoint,count_field", [(QUARTERLY, "total_orders"), (MONTHLY, "order_count")])
    @pytest.mark.parametrize("params", [
        {"warehouse": "Tokyo"},
        {"category": "Sensors"},
        {"status": "Delivered"},
        {"month": "2025-03"},
        {"month": "Q2-2025"},
    ])
    def test_filters_match_orders_endpoint(self, client, endpoint, count_field, params):
        """Reports honour the global filter bar: order counts equal /api/orders with the same filters."""
        expected = len(client.get("/api/orders", params=params).json())
        data = client.get(endpoint, params=params).json()
        assert sum(row[count_field] for row in data) == expected

    @pytest.mark.parametrize("endpoint,count_field", [(QUARTERLY, "total_orders"), (MONTHLY, "order_count")])
    def test_unfiltered_counts_match_all_orders(self, client, endpoint, count_field):
        """'all' behaves like no filter."""
        expected = len(client.get("/api/orders").json())
        params = {"warehouse": "all", "category": "all", "status": "all", "month": "all"}
        assert sum(r[count_field] for r in client.get(endpoint, params=params).json()) == expected

    @pytest.mark.parametrize("endpoint,revenue_field", [(QUARTERLY, "total_revenue"), (MONTHLY, "revenue")])
    def test_filtered_revenue_matches_orders(self, client, endpoint, revenue_field):
        """Filters apply to revenue sums too, not only to order counts."""
        params = {"warehouse": "Tokyo", "category": "Sensors"}
        expected = sum(o["total_value"] for o in client.get("/api/orders", params=params).json())
        data = client.get(endpoint, params=params).json()
        # Per-row revenue is rounded to cents, so allow one cent of drift per row
        assert sum(row[revenue_field] for row in data) == pytest.approx(expected, abs=0.01 * len(data))

    def test_month_filter_limits_monthly_rows(self, client):
        """A single-month filter yields at most one monthly row, for that month."""
        data = client.get(MONTHLY, params={"month": "2025-03"}).json()
        assert [row["month"] for row in data] in (["2025-03"], [])

    def test_unknown_warehouse_returns_empty(self, client):
        """Filters that match nothing return empty lists, not errors."""
        assert client.get(QUARTERLY, params={"warehouse": "Nowhere"}).json() == []
        assert client.get(MONTHLY, params={"warehouse": "Nowhere"}).json() == []
