"""
Budget-based restocking: recommendations from the demand forecast and
persistence of submitted restocking orders in a small SQLite database.

The rest of the app keeps its data in memory; restocking orders are the only
data users create, so they are stored in SQLite to survive server restarts.
"""

import json
import math
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Dict, List

# Tests point this at a temporary file before calling init_db().
DB_PATH = os.environ.get(
    "RESTOCKING_DB_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "restocking.db"),
)

# Increasing demand is restocked first, then stable; decreasing items need no restock.
TREND_PRIORITY = {"increasing": 0, "stable": 1, "decreasing": 2}


@contextmanager
def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS restocking_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_number TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                budget REAL NOT NULL,
                total_cost REAL NOT NULL,
                lead_time_days INTEGER NOT NULL,
                expected_delivery TEXT NOT NULL,
                items_json TEXT NOT NULL
            )
            """
        )


def demand_gap(forecast: Dict) -> int:
    """Units needed to cover the forecast: forecasted minus current demand, never negative."""
    return max(0, forecast["forecasted_demand"] - forecast["current_demand"])


def recommend(forecasts: List[Dict], budget: float) -> Dict:
    """
    Greedy allocation of the budget across forecast items.

    Order of priority: trend (increasing before stable), then the largest gap.
    Each item gets as many units as its gap needs or the remaining budget allows,
    so a large item that does not fit completely is partially restocked and the
    rest of the budget still flows to the next items.
    """
    candidates = [f for f in forecasts if demand_gap(f) > 0]
    candidates.sort(key=lambda f: (TREND_PRIORITY.get(f["trend"], 3), -demand_gap(f)))

    remaining = budget
    items = []
    for f in candidates:
        gap = demand_gap(f)
        affordable = math.floor(remaining / f["unit_cost"]) if f["unit_cost"] > 0 else 0
        quantity = min(gap, affordable)
        line_total = round(quantity * f["unit_cost"], 2)
        remaining = round(remaining - line_total, 2)
        items.append({
            "sku": f["item_sku"],
            "name": f["item_name"],
            "trend": f["trend"],
            "current_demand": f["current_demand"],
            "forecasted_demand": f["forecasted_demand"],
            "gap": gap,
            "unit_cost": f["unit_cost"],
            "lead_time_days": f["lead_time_days"],
            "recommended_quantity": quantity,
            "line_total": line_total,
        })

    full_cost = round(sum(demand_gap(f) * f["unit_cost"] for f in candidates), 2)
    total_cost = round(sum(i["line_total"] for i in items), 2)
    return {
        "budget": budget,
        "total_cost": total_cost,
        "remaining_budget": round(budget - total_cost, 2),
        # Cost to cover every gap completely; the UI uses it as the slider maximum.
        "full_restock_cost": full_cost,
        "items": items,
    }


def price_order_items(forecasts: List[Dict], requested: List[Dict]) -> List[Dict]:
    """
    Price the requested lines from server-side data so the client cannot set its own prices.
    Raises ValueError for unknown SKUs, duplicates or non-positive quantities.
    """
    by_sku = {f["item_sku"]: f for f in forecasts}
    seen = set()
    lines = []
    for line in requested:
        sku, quantity = line["sku"], line["quantity"]
        if sku not in by_sku:
            raise ValueError(f"Unknown SKU: {sku}")
        if sku in seen:
            raise ValueError(f"Duplicate SKU: {sku}")
        if quantity <= 0:
            raise ValueError(f"Quantity must be positive for {sku}")
        seen.add(sku)
        f = by_sku[sku]
        lines.append({
            "sku": sku,
            "name": f["item_name"],
            "quantity": quantity,
            "unit_cost": f["unit_cost"],
            "line_total": round(quantity * f["unit_cost"], 2),
            "lead_time_days": f["lead_time_days"],
        })
    return lines


def _row_to_order(row: sqlite3.Row) -> Dict:
    order = dict(row)
    order["items"] = json.loads(order.pop("items_json"))
    return order


def create_order(lines: List[Dict], budget: float) -> Dict:
    """Store a priced order. The whole order arrives when its slowest line arrives."""
    created = datetime.now().replace(microsecond=0)
    lead_time = max(line["lead_time_days"] for line in lines)
    total = round(sum(line["line_total"] for line in lines), 2)
    expected = created + timedelta(days=lead_time)

    with _connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO restocking_orders
                (order_number, created_at, status, budget, total_cost,
                 lead_time_days, expected_delivery, items_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("PENDING", created.isoformat(), "Submitted", budget, total,
             lead_time, expected.isoformat(), json.dumps(lines)),
        )
        # The order number is derived from the row id so it is unique without a counter table.
        order_number = f"RST-{created.year}-{cur.lastrowid:04d}"
        conn.execute("UPDATE restocking_orders SET order_number = ? WHERE id = ?",
                     (order_number, cur.lastrowid))
        row = conn.execute("SELECT * FROM restocking_orders WHERE id = ?",
                           (cur.lastrowid,)).fetchone()
    return _row_to_order(row)


def list_orders() -> List[Dict]:
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM restocking_orders ORDER BY id DESC").fetchall()
    return [_row_to_order(r) for r in rows]
