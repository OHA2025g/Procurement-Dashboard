"""Normalize raw procurement documents for API responses and ETL (backward compatible)."""
from __future__ import annotations
import re
from typing import Any, Dict, Optional

EPS = 1e-5

# Keep in sync with kpi_engine / drilldown
D_STATUSES = ["Expired", "Returned", "Cancelled", "Closed"]
BACKLOG_STATUSES = ["Awaited_Publish", "Retender"]

_STATUS_DISPLAY = {
    "PO_Issued": "PO Issued",
    "Tender_Under_Process": "Tender Under Process",
    "Awaited_Publish": "Awaited Publish",
    "Retender": "Retender",
    "Expired": "Expired",
    "Returned": "Returned",
    "Cancelled": "Cancelled",
    "Closed": "Closed",
    "Inactive": "Inactive",
}

_CATEGORY_ALIASES = {
    "consumable": "Consumables",
    "consumables": "Consumables",
    "service": "Services",
    "services": "Services",
    "other": "Others",
    "others": "Others",
}


def display_status(raw: Optional[str]) -> str:
    if not raw:
        return ""
    if raw in _STATUS_DISPLAY:
        return _STATUS_DISPLAY[raw]
    return str(raw).replace("_", " ")


def normalize_category_value(raw: Optional[str]) -> str:
    if not raw:
        return "Others"
    s = str(raw).strip()
    key = s.lower().replace("-", " ")
    if key in _CATEGORY_ALIASES:
        return _CATEGORY_ALIASES[key]
    if s in ("Equipment", "Medicine", "Others", "Consumables", "Services"):
        return s
    return s


def payment_status_label(doc: Dict[str, Any]) -> str:
    po = float(doc.get("po_value") or 0)
    paid = float(doc.get("paid_amount") or 0)
    out = float(doc.get("outstanding_amount") or 0)
    if po <= EPS:
        return "No PO"
    if out <= EPS and paid >= po - EPS:
        return "Fully Paid"
    if paid > EPS and out > EPS:
        return "Partially Paid"
    return "Unpaid"


def value_band(v: float) -> str:
    if v <= 0:
        return "0"
    if v < 1:
        return "0-1 Cr"
    if v < 5:
        return "1-5 Cr"
    if v < 10:
        return "5-10 Cr"
    return "10+ Cr"


def compute_risk_score(doc: Dict[str, Any]) -> float:
    w = {"Critical": 1.0, "High": 0.75, "Medium": 0.5, "Low": 0.25}
    r = doc.get("risk_level") or "Low"
    v = float(doc.get("procurement_value") or 0)
    return round(w.get(str(r), 0.25) * v, 4)


def suggest_decision(doc: Dict[str, Any]) -> str:
    st = doc.get("current_status") or ""
    out = float(doc.get("outstanding_amount") or 0)
    stmt = doc.get("statement") or ""
    if st == "Awaited_Publish":
        return "Publish tender immediately"
    if st == "Retender":
        return "Obtain retender approval — review with Dept Head"
    if st == "Tender_Under_Process":
        return "Expedite tender evaluation toward PO"
    if st == "PO_Issued" and out > 5:
        return "Release / follow up on outstanding payment"
    if st == "PO_Issued":
        return "Monitor PO execution"
    if st == "Expired":
        return "Review expired case — retender or close"
    if st == "Returned":
        return "Address return remarks and resubmit"
    if st in ("Cancelled", "Closed"):
        return "Finalize closure and documentation"
    if stmt == "D":
        return "Review inactive / failed procurement line"
    return doc.get("action_required") or "Monitor and update status"


def infer_action_type(doc: Dict[str, Any]) -> str:
    ar = (doc.get("action_required") or "").strip()
    if ar:
        return ar[:120]
    return suggest_decision(doc)[:120]


def escalation_level_display(doc: Dict[str, Any]) -> str:
    if doc.get("escalation_level_label"):
        return str(doc["escalation_level_label"])
    lvl = doc.get("escalation_level")
    if isinstance(lvl, str) and lvl.strip():
        return lvl.strip()
    n = int(lvl or 0)
    if n <= 0:
        return "L0 — None"
    if n == 1:
        return "L1 — Department"
    if n == 2:
        return "L2 — Secretary"
    return f"L{n} — Escalated"


def suggested_owner(doc: Dict[str, Any]) -> str:
    r = doc.get("risk_level")
    esc = int(doc.get("escalation_level") or 0) if isinstance(doc.get("escalation_level"), (int, float)) else 0
    if esc >= 2 or r == "Critical":
        return "Principal Secretary / Secretary"
    if r == "High" or esc == 1:
        return "Department Head / JDHS"
    if doc.get("current_status") in ("Awaited_Publish", "Retender"):
        return "Procurement Cell"
    return "Nodal Officer"


def normalize_record(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy with derived fields for API consumers (non-destructive)."""
    out = dict(doc)
    rid = out.get("record_id") or out.get("id")
    if rid:
        out["record_id"] = rid
    cat = normalize_category_value(out.get("category"))
    out["category"] = cat
    out["current_status_display"] = display_status(out.get("current_status"))
    out["payment_status"] = payment_status_label(out)
    pv = float(out.get("procurement_value") or 0)
    out["value_band"] = value_band(pv)
    out["risk_score"] = compute_risk_score(out)
    out["next_best_action"] = out.get("next_best_action") or infer_action_type(out)
    out["action_type"] = infer_action_type(out)
    out["suggested_decision"] = suggest_decision(out)
    out["suggested_owner"] = suggested_owner(out)
    out["escalation_level_display"] = escalation_level_display(out)
    st = out.get("current_status")
    out["is_backlog"] = st in BACKLOG_STATUSES
    out["is_inactive"] = st in D_STATUSES
    out["is_risk"] = out.get("risk_level") in ("Critical", "High")
    out.setdefault("recovery_status", out.get("recovery_status") or "Not applicable")
    out.setdefault("official_decision_required", bool(out.get("official_decision_required", False)))
    out.setdefault("tender_stage", out.get("tender_stage") or "")
    return out


def map_legacy_category_for_query(cat: str) -> str:
    """Map stored 'Others' to allow legacy data; queries use exact category strings."""
    return normalize_category_value(cat)
