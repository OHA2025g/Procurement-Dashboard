"""Drill-down query builders, summaries, and record enrichment for procurement analytics."""
from __future__ import annotations
import re
from typing import Any, Dict, List, Optional, Tuple

from models import FilterParams
from kpi_engine import (
    build_match,
    D_STATUSES,
    BACKLOG_STATUSES,
    ACTIVE_STATUSES,
    ACTIVE_EXEC_STATUSES,
    HIGH_VALUE_CR,
    _value_band_match,
)
from record_normalization import normalize_record

EPS = 1e-5


def apply_kpi_preset(match: Dict[str, Any], preset: Optional[str]) -> Dict[str, Any]:
    if not preset:
        return match
    p = preset.strip().lower().replace("-", "_")
    extra: Dict[str, Any] = {}
    if p in ("total_portfolio", "kpi_001", "portfolio", "all"):
        return match
    if p in ("total_items", "kpi_002", "item_count"):
        return match
    if p in ("po_issued", "po_issued_value", "kpi_po"):
        extra = {"statement": "A"}
    elif p in ("paid", "paid_value", "kpi_paid"):
        extra = {"paid_amount": {"$gt": EPS}}
    elif p in ("outstanding", "outstanding_value", "kpi_outstanding"):
        extra = {"outstanding_amount": {"$gt": EPS}}
    elif p in ("tender", "tender_under_process", "tender_value"):
        extra = {"$or": [{"statement": "B"}, {"current_status": "Tender_Under_Process"}]}
    elif p in ("backlog", "backlog_value"):
        extra = {"current_status": {"$in": BACKLOG_STATUSES}}
    elif p in ("inactive", "failed", "inactive_value", "d_status"):
        extra = {"current_status": {"$in": D_STATUSES}}
    elif p in ("risk", "risk_exposure", "risk_records"):
        extra = {"risk_level": {"$in": ["Critical", "High"]}}
    elif p in ("high_value", "high_value_items", "kpi_008"):
        extra = {"procurement_value": {"$gt": HIGH_VALUE_CR}}
    elif p in ("payment_completion", "kpi_payment_pct"):
        extra = {"statement": "A", "po_value": {"$gt": EPS}}
    elif p in ("po_conversion", "kpi_po_conversion"):
        return match
    elif p in ("health_score", "kpi_010"):
        return match
    elif p in ("not_yet_po", "pipeline_non_po"):
        extra = {
            "$or": [
                {"statement": {"$in": ["B", "C"]}},
                {"statement": "D"},
                {"$and": [{"statement": "A"}, {"po_value": {"$lte": EPS}}]},
            ]
        }
    elif p in ("unpaid_on_po", "unpaid_po"):
        extra = {"$and": [{"statement": "A"}, {"outstanding_amount": {"$gt": EPS}}]}
    else:
        return match
    return _merge_and(match, extra)


def _merge_and(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    if "$and" in a or "$or" in a or "$and" in b or "$or" in b:
        return {"$and": [a, b]}
    out = {**a}
    for k, v in b.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict) and not k.startswith("$"):
            out[k] = {**out[k], **v}
        else:
            out[k] = v
    return out


def apply_payment_filter(match: Dict[str, Any], payment_status: Optional[str]) -> Dict[str, Any]:
    if not payment_status:
        return match
    ps = payment_status.strip().lower().replace(" ", "_")
    if ps == "fully_paid":
        cond = {
            "po_value": {"$gt": EPS},
            "outstanding_amount": {"$lte": EPS},
            "paid_amount": {"$gt": EPS},
        }
    elif ps == "partially_paid":
        cond = {
            "po_value": {"$gt": EPS},
            "paid_amount": {"$gt": EPS},
            "outstanding_amount": {"$gt": EPS},
        }
    elif ps == "unpaid":
        cond = {
            "po_value": {"$gt": EPS},
            "paid_amount": {"$lte": EPS},
        }
    elif ps == "no_po":
        cond = {"po_value": {"$lte": EPS}}
    else:
        return match
    return _merge_and(match, cond)


def apply_value_band_filter(match: Dict[str, Any], band: Optional[str]) -> Dict[str, Any]:
    if not band:
        return match
    b = band.strip().lower()
    if b in ("0", "zero"):
        cond = {"procurement_value": {"$lte": EPS}}
    elif b in ("0-1", "0-1 cr", "0_1"):
        cond = {"procurement_value": {"$gt": EPS, "$lte": 1.0}}
    elif b in ("1-5", "1-5 cr", "1_5"):
        cond = {"procurement_value": {"$gt": 1.0, "$lte": 5.0}}
    elif b in ("5-10", "5-10 cr", "5_10"):
        cond = {"procurement_value": {"$gt": 5.0, "$lte": 10.0}}
    elif b in ("10+", "10+ cr", "10_plus"):
        cond = {"procurement_value": {"$gt": 10.0}}
    else:
        return match
    return _merge_and(match, cond)


def apply_search(match: Dict[str, Any], search: Optional[str]) -> Dict[str, Any]:
    if not search or not str(search).strip():
        return match
    q = re.escape(str(search).strip())
    rx = {"$regex": q, "$options": "i"}
    cond = {
        "$or": [
            {"item_description": rx},
            {"department": rx},
            {"po_number": rx},
            {"tender_number": rx},
            {"id": rx},
        ]
    }
    return _merge_and(match, cond)


def apply_action_type(match: Dict[str, Any], action_type: Optional[str]) -> Dict[str, Any]:
    if not action_type or not str(action_type).strip():
        return match
    rx = {"$regex": re.escape(str(action_type).strip()), "$options": "i"}
    return _merge_and(match, {"action_required": rx})


def _norm_status(s: str) -> str:
    t = (s or "").strip()
    if not t:
        return t
    if "_" in t:
        return t
    return t.replace(" ", "_")


def apply_drill_dict_to_match(match: Dict[str, Any], d: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Merge structured drill overlay (from KPI registry / UI) onto a Mongo match."""
    if not d:
        return match
    m = match
    if d.get("is_inactive"):
        m = _merge_and(m, {"current_status": {"$in": D_STATUSES}})
    if d.get("is_backlog"):
        m = _merge_and(m, {"current_status": {"$in": BACKLOG_STATUSES}})
    if d.get("is_active_pipeline"):
        m = _merge_and(m, {"current_status": {"$in": ACTIVE_EXEC_STATUSES}})
    if d.get("is_risk"):
        m = _merge_and(
            m,
            {
                "$or": [
                    {"$and": [{"statement": "A"}, {"outstanding_amount": {"$gt": EPS}}]},
                    {"current_status": {"$in": BACKLOG_STATUSES}},
                    {"current_status": {"$in": D_STATUSES}},
                    {"risk_level": {"$in": ["Critical", "High"]}},
                ]
            },
        )
    if d.get("action_pending"):
        m = _merge_and(m, {"action_required": {"$nin": [None, ""]}})
    if d.get("po_value_gt"):
        m = _merge_and(m, {"po_value": {"$gt": EPS}})
    if d.get("po_value_eq"):
        m = _merge_and(m, {"po_value": {"$lte": EPS}})
    if d.get("paid_amount_gt"):
        m = _merge_and(m, {"paid_amount": {"$gt": EPS}})
    if d.get("outstanding_amount_gt"):
        m = _merge_and(m, {"outstanding_amount": {"$gt": EPS}})
    if d.get("official_decision_required") is True:
        m = _merge_and(m, {"official_decision_required": True})
    st = d.get("statement")
    if st:
        m = _merge_and(m, {"statement": str(st).strip().upper()[:1]})
    dept = d.get("department")
    if dept:
        m = _merge_and(m, {"department": str(dept)})
    cat = d.get("category")
    if cat:
        m = _merge_and(m, {"category": str(cat)})
    rl = d.get("risk_level")
    if rl:
        if isinstance(rl, list):
            parts = [str(x).strip() for x in rl if str(x).strip()]
        else:
            parts = [s.strip() for s in str(rl).replace("|", ",").split(",") if s.strip()]
        if parts:
            m = _merge_and(m, {"risk_level": {"$in": parts}})
    cs = d.get("current_status")
    if cs:
        if isinstance(cs, list):
            parts = [_norm_status(str(x)) for x in cs if str(x).strip()]
        else:
            parts = [_norm_status(x) for x in str(cs).split(",") if x.strip()]
        if parts:
            m = _merge_and(m, {"current_status": {"$in": parts}})
    vb = d.get("value_band")
    if vb:
        if isinstance(vb, list):
            vb = ",".join(str(x) for x in vb)
        vm = _value_band_match(str(vb))
        if vm:
            m = _merge_and(m, vm)
    ps = d.get("payment_status")
    if ps:
        m = apply_payment_filter(m, str(ps))
    at = d.get("action_type")
    if at:
        m = apply_action_type(m, str(at))
    rs = d.get("recovery_status")
    if rs:
        m = _merge_and(m, {"recovery_status": str(rs)})
    return m


def build_drill_match(
    filters: FilterParams,
    *,
    current_status: Optional[str] = None,
    payment_status: Optional[str] = None,
    value_band_param: Optional[str] = None,
    action_type: Optional[str] = None,
    search: Optional[str] = None,
    kpi_preset: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    drill_dict: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    m = build_match(filters)
    if min_value is not None or max_value is not None:
        vr: Dict[str, float] = {}
        if min_value is not None:
            vr["$gte"] = min_value
        if max_value is not None:
            vr["$lte"] = max_value
        m = _merge_and(m, {"procurement_value": vr})
    if current_status:
        parts = [_norm_status(s) for s in current_status.split(",") if s.strip()]
        if parts:
            m = _merge_and(m, {"current_status": {"$in": parts}})
    m = apply_kpi_preset(m, kpi_preset)
    m = apply_payment_filter(m, payment_status)
    m = apply_value_band_filter(m, value_band_param)
    m = apply_action_type(m, action_type)
    m = apply_search(m, search)
    m = apply_drill_dict_to_match(m, drill_dict)
    return m


def enrich_record(doc: Dict[str, Any]) -> Dict[str, Any]:
    return normalize_record(doc)


def scope_title_from_filters(applied: Dict[str, Any]) -> str:
    parts: List[str] = ["All Procurement"]
    if applied.get("fy"):
        parts.append(f"FY {applied['fy']}")
    if applied.get("statement"):
        parts.append(f"Statement {applied['statement']}")
    if applied.get("department"):
        parts.append(str(applied["department"]))
    if applied.get("category"):
        parts.append(str(applied["category"]))
    if applied.get("risk_level"):
        parts.append(f"Risk {applied['risk_level']}")
    if applied.get("current_status"):
        parts.append(str(applied["current_status"]).replace("_", " "))
    if applied.get("payment_status"):
        parts.append(str(applied["payment_status"]).replace("_", " "))
    if applied.get("value_band"):
        parts.append(str(applied["value_band"]))
    if applied.get("kpi_preset"):
        parts.append(f"Scope: {applied['kpi_preset']}")
    if applied.get("search"):
        parts.append(f"Search “{applied['search'][:40]}…”")
    return " → ".join(parts)


async def aggregate_summary(col, match: Dict[str, Any]) -> Dict[str, Any]:
    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": None,
                "total_records": {"$sum": 1},
                "total_value": {"$sum": "$procurement_value"},
                "po_value": {"$sum": "$po_value"},
                "paid_amount": {"$sum": "$paid_amount"},
                "outstanding_amount": {"$sum": "$outstanding_amount"},
                "backlog_value": {
                    "$sum": {
                        "$cond": [
                            {"$in": ["$current_status", BACKLOG_STATUSES]},
                            "$procurement_value",
                            0,
                        ]
                    }
                },
                "risk_value": {
                    "$sum": {
                        "$cond": [
                            {"$in": ["$risk_level", ["Critical", "High"]]},
                            "$procurement_value",
                            0,
                        ]
                    }
                },
                "critical_count": {
                    "$sum": {"$cond": [{"$eq": ["$risk_level", "Critical"]}, 1, 0]}
                },
                "high_risk_count": {
                    "$sum": {"$cond": [{"$eq": ["$risk_level", "High"]}, 1, 0]}
                },
            }
        },
    ]
    docs = await col.aggregate(pipeline).to_list(1)
    base = docs[0] if docs else {}
    total_val = float(base.get("total_value") or 0)
    po_val = float(base.get("po_value") or 0)
    paid = float(base.get("paid_amount") or 0)
    outst = float(base.get("outstanding_amount") or 0)
    backlog_v = float(base.get("backlog_value") or 0)
    risk_v = float(base.get("risk_value") or 0)

    payment_completion_pct = round((paid / po_val) * 100, 2) if po_val > EPS else 0.0
    po_conversion_pct = round((po_val / total_val) * 100, 2) if total_val > EPS else 0.0
    risk_exposure_pct = round(((risk_v + backlog_v + outst) / total_val) * 100, 2) if total_val > EPS else 0.0

    return {
        "total_records": int(base.get("total_records") or 0),
        "total_value": round(total_val, 4),
        "po_value": round(po_val, 4),
        "paid_amount": round(paid, 4),
        "outstanding_amount": round(outst, 4),
        "backlog_value": round(backlog_v, 4),
        "risk_value": round(risk_v, 4),
        "critical_count": int(base.get("critical_count") or 0),
        "high_risk_count": int(base.get("high_risk_count") or 0),
        "payment_completion_pct": payment_completion_pct,
        "po_conversion_pct": po_conversion_pct,
        "risk_exposure_pct": risk_exposure_pct,
    }


async def aggregate_facets(col, match: Dict[str, Any]) -> Dict[str, Any]:
    async def distinct(field: str, lim: int = 80) -> List[str]:
        cur = await col.distinct(field, match)
        vals = [v for v in cur if v is not None and str(v).strip()][:lim]
        return sorted(vals, key=lambda x: str(x))[:lim]

    statements = await distinct("statement", 10)
    departments = await distinct("department", 100)
    categories = await distinct("category", 20)
    statuses = await distinct("current_status", 30)
    risk_levels = await distinct("risk_level", 10)

    # Small aggregations for drill-down visuals (counts + value by bucket)
    stmt_rows = await col.aggregate([
        {"$match": match},
        {"$group": {"_id": "$statement", "count": {"$sum": 1}, "value": {"$sum": "$procurement_value"}}},
        {"$sort": {"_id": 1}},
    ]).to_list(12)
    dept_rows = await col.aggregate([
        {"$match": match},
        {"$group": {"_id": "$department", "count": {"$sum": 1}, "value": {"$sum": "$procurement_value"}}},
        {"$sort": {"value": -1}},
        {"$limit": 10},
    ]).to_list(10)
    chart_by_statement = [
        {"name": str(r["_id"] or "?"), "count": int(r.get("count") or 0), "value": round(float(r.get("value") or 0), 4)}
        for r in stmt_rows
    ]
    chart_by_department = [
        {"name": str(r["_id"] or "Unknown")[:40], "count": int(r.get("count") or 0), "value": round(float(r.get("value") or 0), 4)}
        for r in dept_rows
    ]

    return {
        "statements": statements,
        "departments": departments,
        "categories": categories,
        "statuses": statuses,
        "risk_levels": risk_levels,
        "payment_statuses": ["Fully Paid", "Partially Paid", "Unpaid", "No PO"],
        "value_bands": ["0-1 Cr", "1-5 Cr", "5-10 Cr", "10+ Cr"],
        "action_types": [],
        "chart_by_statement": chart_by_statement,
        "chart_by_department": chart_by_department,
    }


def sort_field_key(sort_by: Optional[str]) -> str:
    allowed = {
        "procurement_value": "procurement_value",
        "po_value": "po_value",
        "paid_amount": "paid_amount",
        "outstanding_amount": "outstanding_amount",
        "priority_score": "priority_score",
        "days_pending": "days_pending",
        "department": "department",
        "item_description": "item_description",
        "current_status": "current_status",
        "risk_level": "risk_level",
        "statement": "statement",
    }
    if not sort_by:
        return "procurement_value"
    return allowed.get(sort_by, "procurement_value")


async def fetch_top_items(
    col,
    match: Dict[str, Any],
    *,
    metric: str = "value",
    limit: int = 10,
) -> List[Dict[str, Any]]:
    m = dict(match)
    sk = "procurement_value"
    met = (metric or "value").lower()
    if met == "outstanding":
        sk = "outstanding_amount"
    elif met == "risk":
        sk = "priority_score"
    elif met == "paid" or met == "payment":
        m = _merge_and(m, {"paid_amount": {"$gt": EPS}})
        sk = "paid_amount"
    elif met == "backlog":
        m = _merge_and(m, {"current_status": {"$in": BACKLOG_STATUSES}})
        sk = "procurement_value"
    lim = max(1, min(50, limit))
    docs = await col.find(m, {"_id": 0}).sort(sk, -1).limit(lim).to_list(lim)
    return [enrich_record(d) for d in docs]


async def fetch_records_page(
    col,
    match: Dict[str, Any],
    *,
    page: int = 1,
    page_size: int = 25,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "desc",
) -> Tuple[List[Dict[str, Any]], int]:
    sk = sort_field_key(sort_by)
    direction = -1 if (sort_order or "desc").lower() == "desc" else 1
    skip = max(0, (max(1, page) - 1) * max(1, min(200, page_size)))
    limit = max(1, min(200, page_size))
    total = await col.count_documents(match)
    cursor = (
        col.find(match, {"_id": 0})
        .sort(sk, direction)
        .skip(skip)
        .limit(limit)
    )
    docs = await cursor.to_list(limit)
    enriched = [enrich_record(d) for d in docs]
    return enriched, total
