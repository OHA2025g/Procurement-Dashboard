"""Assemble all 120 KPI value payloads (filter-aware) for /api/kpis/all-values and single-KPI views."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from kpi_registry import get_registry, get_kpi_entry
from kpi_engine import (
    KPIEngine,
    FilterParams,
    build_match,
    HIGH_VALUE_CR,
    EPS,
    D_STATUSES,
    BACKLOG_STATUSES,
)


def _pct(numer: float, denom: float) -> float:
    if not denom:
        return 0.0
    return round((numer / denom) * 100.0, 2)


def _fmt(v: Any, unit: str) -> str:
    if v is None:
        return "Not Available"
    if isinstance(v, (dict, list)):
        if isinstance(v, list) and v and isinstance(v[0], dict) and "statement" in (v[0] or {}):
            return f"{len(v)} rows"
        if isinstance(v, list):
            return f"{len(v)} items"
        return json.dumps(v, default=str)[:240]
    if isinstance(v, str):
        return v
    u = unit or ""
    if "count" in u.lower() and "%" not in u:
        return str(int(v)) if float(v) == int(float(v)) else f"{float(v):.2f}"
    if "%" in u or "Share" in u or "Rate" in u or u.strip() == "%":
        return f"{float(v):.2f}%"
    if "rank" in u.lower():
        return str(v)
    if "score" in u.lower():
        return f"{float(v):.2f}"
    return f"{float(v):.4f}"


def _row_out(meta: Dict[str, Any], value: Any) -> Dict[str, Any]:
    unit = meta.get("unit") or ""
    return {
        "kpi_id": meta["kpi_id"],
        "kpi_name": meta.get("kpi_name") or meta.get("name"),
        "value": value,
        "unit": unit,
        "formatted_value": _fmt(value, unit),
        "formula": meta.get("formula"),
        "group": meta.get("group"),
        "dashboard_page": meta.get("dashboard_page"),
        "visual_type": meta.get("visual_type"),
        "drilldown_filter_preset": meta.get("drilldown_filter_preset") or {},
    }


async def build_all_kpi_value_items(engine: KPIEngine, filters: Optional[FilterParams] = None) -> List[Dict[str, Any]]:
    reg = get_registry()
    ex = await engine.executive(filters)
    stm = await engine.statements(filters)
    pay = await engine.po_payment(filters)
    ten = await engine.tender(filters)
    bac = await engine.backlog(filters)
    ris = await engine.risk(filters)
    cat = await engine.category_summary(filters)
    dept = await engine.department_summary(filters)
    gov = await engine.governance(filters)
    match = build_match(filters)
    a_match = {**match, "statement": "A"}
    total_v = float(ex.get("KPI-001_total_portfolio") or 0)
    total_c = int(ex.get("KPI-002_total_items") or 0)
    po_v = float(pay.get("KPI-021_po_value") or 0)
    paid_v = float(pay.get("KPI-031_paid_value") or 0)
    out_v = float(pay.get("KPI-032_outstanding_value") or 0)
    per_st = {s["statement"]: s for s in (stm.get("per_statement") or [])}

    po_by_dept = await engine._group_sum(a_match, "department", "po_value")
    po_by_cat = await engine._group_sum(a_match, "category", "po_value")
    top_po = await engine.col.aggregate([
        {"$match": a_match},
        {"$sort": {"po_value": -1}},
        {"$limit": 10},
        {"$group": {"_id": None, "s": {"$sum": "$po_value"}}},
    ]).to_list(1)
    top_po_sum = float(top_po[0]["s"]) if top_po else 0.0
    po_cnt = int(pay.get("KPI-022_po_count") or 0)
    po_density = round(po_cnt / po_v, 6) if po_v > EPS else 0.0
    po_health = round(
        _pct(po_v, total_v) * 0.35
        + float(pay.get("KPI-033_payment_completion_pct") or 0) * 0.35
        + (100 - min(100, _pct(out_v, po_v) if po_v else 0)) * 0.30,
        2,
    ) if po_v > EPS else 0.0

    pay_eff = round(
        float(pay.get("KPI-033_payment_completion_pct") or 0) * 0.65
        + (100 - min(100, float(pay.get("KPI-034_outstanding_pct") or 0))) * 0.35,
        2,
    )

    b_match = {**match, "statement": "B"}
    ten_cnt = int(ten.get("KPI-044_pipeline_count") or 0)
    ten_val = float(ten.get("KPI-043_pipeline_value") or 0)
    top_ten = await engine.col.aggregate([
        {"$match": b_match},
        {"$sort": {"procurement_value": -1}},
        {"$limit": 10},
        {"$group": {"_id": None, "s": {"$sum": "$procurement_value"}}},
    ]).to_list(1)
    top_ten_sum = float(top_ten[0]["s"]) if top_ten else 0.0
    hi_ten_cnt = await engine.col.count_documents({
        **b_match,
        "$or": [
            {"procurement_value": {"$gt": HIGH_VALUE_CR}},
            {"$and": [{"procurement_value": {"$gt": 5}}, {"procurement_value": {"$lte": 10}}]},
        ],
    })

    stage_pipe = [
        {"$match": b_match},
        {"$group": {"_id": {"$ifNull": ["$tender_stage", "Unknown Stage"]},
                    "v": {"$sum": "$procurement_value"}, "c": {"$sum": 1}}},
        {"$sort": {"v": -1}},
    ]
    stages = await engine.col.aggregate(stage_pipe).to_list(50)
    maturity = []
    weights = {"Unknown Stage": 20, "Technical": 40, "Financial": 55, "Approval": 70, "Published": 90}
    for s in stages:
        lab = s["_id"] or "Unknown Stage"
        w = weights.get(str(lab), 35)
        maturity.append({
            "tender_stage": lab,
            "value": round(float(s.get("v") or 0), 4),
            "count": int(s.get("c") or 0),
            "weight": w,
            "weighted": round(float(s.get("v") or 0) * w / 100.0, 4),
        })
    maturity_score = round(sum(m["weighted"] for m in maturity) / max(ten_val, EPS) * 100, 2) if maturity else 0.0

    backlog_tot = float(bac.get("KPI-057_total_backlog") or 0)
    top_b = await engine.col.aggregate([
        {"$match": {**match, "current_status": {"$in": BACKLOG_STATUSES}}},
        {"$sort": {"procurement_value": -1}},
        {"$limit": 10},
        {"$group": {"_id": None, "s": {"$sum": "$procurement_value"}}},
    ]).to_list(1)
    top_b_sum = float(top_b[0]["s"]) if top_b else 0.0
    crit_back = await engine._agg_value_count(
        {**match, "current_status": {"$in": BACKLOG_STATUSES}, "risk_level": "Critical"}
    )
    pub_delay = await engine._agg_value_count({**match, "current_status": "Awaited_Publish"})
    delay_score = round(
        pub_delay["total"] * (pub_delay["count"] / max(pub_delay["count"], 1)) / max(total_v, EPS) * 100, 2
    ) if total_v else 0.0

    total_count_all = await engine.col.count_documents(match)
    canc_cnt = await engine.col.count_documents({**match, "current_status": "Cancelled"})
    exp_cnt = await engine.col.count_documents({**match, "current_status": "Expired"})
    ret_cnt = await engine.col.count_documents({**match, "current_status": "Returned"})
    recov = await engine._agg_value_count({**match, "recovery_status": "Recoverable"})
    dead = await engine._agg_value_count({**match, "recovery_status": "Non-Recoverable"})
    blocked = float(ris.get("KPI-071_failed_total") or 0) + backlog_tot

    stmt_weights = {"A": 20, "B": 40, "C": 70, "D": 90}
    stmt_risk_rows = []
    for code in ["A", "B", "C", "D"]:
        row = per_st.get(code) or {"value": 0, "count": 0}
        w = stmt_weights[code]
        stmt_risk_rows.append({
            "statement": code,
            "risk_weight": w,
            "weighted_exposure": round(float(row.get("value", 0)) * w / 100.0, 4),
        })

    action_pending_cnt = await engine.col.count_documents({**match, "action_required": {"$nin": [None, ""]}})
    action_pending_val = await engine._agg_value_count({**match, "action_required": {"$nin": [None, ""]}})

    async def _atype_sum(label: str) -> float:
        pipeline = [
            {"$match": {**match, "action_required": {"$regex": label.strip(), "$options": "i"}}},
            {"$group": {"_id": None, "t": {"$sum": "$procurement_value"}}},
        ]
        docs = await engine.col.aggregate(pipeline).to_list(1)
        return float(docs[0].get("t") or 0) if docs else 0.0

    v_payment_followup = await _atype_sum("Payment")
    v_tender_close = await _atype_sum("Tender")
    v_publish = await _atype_sum("Publish")
    v_retender = await _atype_sum("Retender")
    off_dec = await engine._agg_value_count({**match, "official_decision_required": True})

    act_rows = await engine.col.aggregate([
        {"$match": {**match, "action_required": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$action_required", "c": {"$sum": 1}}},
        {"$sort": {"c": -1}},
        {"$limit": 5},
    ]).to_list(5)
    next_best = act_rows[0]["_id"] if act_rows else "No pending actions in scope"

    dept_rank = sorted(
        (dept.get("departments") or []),
        key=lambda d: float(d.get("priority_score") or 0) + float(d.get("total_value") or 0) / max(total_v, EPS),
        reverse=True,
    )
    dept_esc = [{"department": d.get("department"), "rank": i + 1, "priority_score": d.get("priority_score")}
                for i, d in enumerate(dept_rank[:15])]

    stmt_priority = sorted(
        (stm.get("per_statement") or []),
        key=lambda s: float(s.get("value", 0)) * (1 + float(s.get("risk_score", 0) or 0) / max(total_v, EPS)),
        reverse=True,
    )
    stmt_pri_rows = [{"statement": s["statement"], "rank": i + 1} for i, s in enumerate(stmt_priority)]

    cats = cat.get("per_category") or []
    risk_by_stmt = []
    for code in ["A", "B", "C", "D"]:
        sm = {**match, "statement": code, "risk_level": {"$in": ["Critical", "High"]}}
        agg = await engine._agg_value_count(sm)
        risk_by_stmt.append({"statement": code, "risk_value": round(agg["total"], 4), "count": agg["count"]})

    risk_by_dept = await engine._group_sum(
        {**match, "risk_level": {"$in": ["Critical", "High"]}}, "department", "procurement_value"
    )
    risk_by_cat = await engine._group_sum(
        {**match, "risk_level": {"$in": ["Critical", "High"]}}, "category", "procurement_value"
    )

    crit_cat_pending = await engine._agg_value_count(
        {**match, "risk_level": "Critical", "action_required": {"$nin": [None, ""]}}
    )

    def _risk_cat_val(cat_name: str) -> float:
        for r in risk_by_cat:
            if r.get("label") == cat_name:
                return float(r.get("value") or 0)
        return 0.0

    values: Dict[str, Any] = {
        "KPI-001": total_v,
        "KPI-002": total_c,
        "KPI-003": float(ex.get("KPI-003_active_value_canonical") or 0),
        "KPI-004": float(ex.get("KPI-004_inactive_value") or 0),
        "KPI-005": _pct(float(ex.get("KPI-003_active_value_canonical") or 0), total_v),
        "KPI-006": float(ex.get("KPI-006_inactive_pct") or 0),
        "KPI-007": float(ex.get("KPI-007_avg_value") or 0),
        "KPI-008": int(ex.get("KPI-008_high_value_count") or 0),
        "KPI-009": float(ex.get("KPI-009_top10_concentration_pct") or 0),
        "KPI-010": float(ex.get("KPI-010_health_score") or 0),
        "KPI-011": float((per_st.get("A") or {}).get("value") or 0),
        "KPI-012": float((per_st.get("B") or {}).get("value") or 0),
        "KPI-013": float((per_st.get("C") or {}).get("value") or 0),
        "KPI-014": float((per_st.get("D") or {}).get("value") or 0),
        "KPI-015": [{"statement": s["statement"], "count": s["count"]} for s in (stm.get("per_statement") or [])],
        "KPI-016": [{"statement": s["statement"], "share_pct": s["share_pct"]} for s in (stm.get("per_statement") or [])],
        "KPI-017": [{"statement": s["statement"], "avg_value": s["avg_value"]} for s in (stm.get("per_statement") or [])],
        "KPI-018": stmt_risk_rows,
        "KPI-019": float(stm.get("execution_gap") or 0),
        "KPI-020": stmt_pri_rows,
        "KPI-021": po_v,
        "KPI-022": po_cnt,
        "KPI-023": _pct(po_v, total_v),
        "KPI-024": max(0.0, round(total_v - po_v, 4)),
        "KPI-025": [{"department": r["label"], "value": r["value"], "count": r["count"]} for r in po_by_dept],
        "KPI-026": [{"category": r["label"], "value": r["value"], "count": r["count"]} for r in po_by_cat],
        "KPI-027": await engine.col.count_documents({**a_match, "po_value": {"$gt": HIGH_VALUE_CR}}),
        "KPI-028": _pct(top_po_sum, po_v) if po_v else 0.0,
        "KPI-029": po_density,
        "KPI-030": po_health,
        "KPI-031": paid_v,
        "KPI-032": out_v,
        "KPI-033": float(pay.get("KPI-033_payment_completion_pct") or 0),
        "KPI-034": float(pay.get("KPI-034_outstanding_pct") or 0),
        "KPI-035": int(pay.get("KPI-035_fully_paid_count") or 0),
        "KPI-036": int(pay.get("KPI-036_partial_paid_count") or 0),
        "KPI-037": int(pay.get("KPI-037_unpaid_count") or 0),
        "KPI-038": [{"department": r["label"], "value": r["value"], "count": r["count"]} for r in (pay.get("by_department") or [])],
        "KPI-039": [{"category": r["label"], "value": r["value"], "count": r["count"]} for r in (pay.get("by_category") or [])],
        "KPI-040": float(pay.get("KPI-034_outstanding_pct") or 0),
        "KPI-041": pay.get("top10_pending") or [],
        "KPI-042": pay_eff,
        "KPI-043": ten_val,
        "KPI-044": ten_cnt,
        "KPI-045": float(ten.get("KPI-045_pipeline_pct") or 0),
        "KPI-046": [{"department": r["label"], "value": r["value"], "count": r["count"]} for r in (ten.get("by_department") or [])],
        "KPI-047": [{"category": r["label"], "value": r["value"], "count": r["count"]} for r in (ten.get("by_category") or [])],
        "KPI-048": float(ten.get("KPI-048_avg_pipeline") or 0),
        "KPI-049": hi_ten_cnt,
        "KPI-050": _pct(top_ten_sum, ten_val) if ten_val else 0.0,
        "KPI-051": ten.get("closure_priority") or [],
        "KPI-052": {"score": maturity_score, "by_stage": maturity, "meta": {"method": "Estimated stage weights"}},
        "KPI-053": float(bac.get("KPI-053_awaited_publish_value") or 0),
        "KPI-054": int(bac.get("KPI-054_awaited_count") or 0),
        "KPI-055": float(bac.get("KPI-055_retender_value") or 0),
        "KPI-056": int(bac.get("KPI-056_retender_count") or 0),
        "KPI-057": backlog_tot,
        "KPI-058": float(bac.get("KPI-058_backlog_pct") or 0),
        "KPI-059": [{"department": r["label"], "value": r["value"], "count": r["count"]} for r in (bac.get("by_department") or [])],
        "KPI-060": [{"category": r["label"], "value": r["value"], "count": r["count"]} for r in (bac.get("by_category") or [])],
        "KPI-061": round(float(crit_back.get("total") or 0), 4),
        "KPI-062": _pct(top_b_sum, backlog_tot) if backlog_tot else 0.0,
        "KPI-063": {"score": delay_score, "awaited_publish_value": round(pub_delay["total"], 4),
                    "meta": {"method": "Estimated from awaited publish volume and count"}},
        "KPI-064": bac.get("clearance_priority") or [],
        "KPI-065": float(ris.get("KPI-065_expired_value") or 0),
        "KPI-066": int(ris.get("KPI-066_expired_count") or 0),
        "KPI-067": float(ris.get("KPI-067_returned_value") or 0),
        "KPI-068": int(ris.get("KPI-068_returned_count") or 0),
        "KPI-069": float(ris.get("KPI-069_cancelled_value") or 0),
        "KPI-070": int(ris.get("KPI-070_cancelled_count") or 0),
        "KPI-071": float(ris.get("KPI-071_failed_total") or 0),
        "KPI-072": float(ris.get("KPI-072_failed_pct") or 0),
        "KPI-073": _pct(canc_cnt, total_count_all),
        "KPI-074": _pct(exp_cnt, total_count_all),
        "KPI-075": _pct(ret_cnt, total_count_all),
        "KPI-076": round(recov["total"], 4),
        "KPI-077": round(dead["total"], 4),
        "KPI-078": ris.get("reasons") or [],
        "KPI-079": float(next((c["value"] for c in cats if c["category"] == "Equipment"), 0) or 0),
        "KPI-080": float(next((c["value"] for c in cats if c["category"] == "Medicine"), 0) or 0),
        "KPI-081": [{"category": c["category"], "share_pct": c["share_pct"]} for c in cats],
        "KPI-082": [{"category": c["category"], "count": c["count"]} for c in cats],
        "KPI-083": [{"category": c["category"], "avg": round(c["value"] / c["count"], 4) if c["count"] else 0} for c in cats],
        "KPI-084": [{"category": c["category"], "po_conversion_pct": c["po_conversion_pct"]} for c in cats],
        "KPI-085": [{"category": c["category"], "payment_completion_pct": c["payment_completion_pct"]} for c in cats],
        "KPI-086": [{"category": c["category"], "backlog_pct": c["backlog_pct"]} for c in cats],
        "KPI-087": [{"category": c["category"], "risk_value": round(_risk_cat_val(c["category"]), 4)} for c in cats],
        "KPI-088": [{"category": c["category"], "risk_pct": _pct(_risk_cat_val(c["category"]), c["value"] or 0)} for c in cats],
        "KPI-089": round(crit_cat_pending["total"], 4),
        "KPI-090": [{"department": d["department"], "value": d["total_value"]} for d in (dept.get("departments") or [])],
        "KPI-091": [{"department": d["department"], "count": d["total_count"]} for d in (dept.get("departments") or [])],
        "KPI-092": [{"department": d["department"], "po_value": d["po_value"]} for d in (dept.get("departments") or [])],
        "KPI-093": [{"department": d["department"], "tender_value": d["tender"]} for d in (dept.get("departments") or [])],
        "KPI-094": [{"department": d["department"], "backlog_value": d["backlog"]} for d in (dept.get("departments") or [])],
        "KPI-095": [{"department": d["department"], "failed_value": d["failed"]} for d in (dept.get("departments") or [])],
        "KPI-096": [{"department": d["department"], "share_pct": d["share_pct"]} for d in (dept.get("departments") or [])],
        "KPI-097": [{"department": d["department"], "po_conversion_pct": d["po_conversion_pct"]} for d in (dept.get("departments") or [])],
        "KPI-098": [{"department": d["department"], "payment_completion_pct": d["payment_completion_pct"]} for d in (dept.get("departments") or [])],
        "KPI-099": [{"department": d["department"], "backlog_pct": d["backlog_pct"]} for d in (dept.get("departments") or [])],
        "KPI-100": [{"department": d["department"], "risk_score": d["risk_score"]} for d in (dept.get("departments") or [])],
        "KPI-101": [{"department": d["department"], "action_pending_count": d["action_pending_count"]} for d in (dept.get("departments") or [])],
        "KPI-102": dept_esc,
        "KPI-103": float(gov.get("KPI-103_total_risk_value") or 0),
        "KPI-104": float(gov.get("KPI-104_risk_pct") or 0),
        "KPI-105": int(ris.get("KPI-105_high_risk_count") or 0),
        "KPI-106": float(ris.get("KPI-106_high_risk_value") or 0),
        "KPI-107": risk_by_stmt,
        "KPI-108": [{"department": r["label"], "value": r["value"], "count": r["count"]} for r in risk_by_dept],
        "KPI-109": [{"category": r["label"], "value": r["value"], "count": r["count"]} for r in risk_by_cat],
        "KPI-110": action_pending_cnt,
        "KPI-111": round(action_pending_val["total"], 4),
        "KPI-112": round(v_payment_followup, 4),
        "KPI-113": round(v_tender_close, 4),
        "KPI-114": round(v_publish, 4),
        "KPI-115": round(v_retender, 4),
        "KPI-116": round(off_dec["total"], 4),
        "KPI-117": dept_esc[:10] if dept_esc else [],
        "KPI-118": round(recov["total"], 4),
        "KPI-119": _pct(recov["total"], blocked) if blocked > EPS else 0.0,
        "KPI-120": {
            "headline": next_best,
            "top_actions": act_rows,
            "meta": {"method": "Estimated from action_required frequency in filtered data"},
        },
    }

    out: List[Dict[str, Any]] = []
    for meta in reg:
        kid = meta["kpi_id"]
        out.append(_row_out(meta, values.get(kid)))
    return out


async def build_grouped_kpi_response(engine: KPIEngine, filters: Optional[FilterParams]) -> Dict[str, Any]:
    items = await build_all_kpi_value_items(engine, filters)
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for row in items:
        g = row.get("group") or "Other"
        groups.setdefault(g, []).append(row)
    reg = get_registry()
    ids = [r["kpi_id"] for r in reg]
    id_set = set(ids)
    missing = [f"KPI-{i:03d}" for i in range(1, 121) if f"KPI-{i:03d}" not in id_set]
    dup = [x for x in ids if ids.count(x) > 1]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "items": items,
        "groups": groups,
        "validation": {
            "count": len(items),
            "expected": 120,
            "missing_ids": missing,
            "duplicate_ids": sorted(set([x for x in ids if ids.count(x) > 1])),
            "ok": len(items) == 120 and not missing and not dup,
        },
    }


async def single_kpi_value(engine: KPIEngine, kpi_id: str, filters: Optional[FilterParams]) -> Dict[str, Any]:
    kid = (kpi_id or "").strip().upper()
    if kid and not kid.startswith("KPI-"):
        digits = "".join(ch for ch in kid if ch.isdigit())
        if digits:
            kid = f"KPI-{int(digits):03d}"
    items = await build_all_kpi_value_items(engine, filters)
    hit = next((x for x in items if x["kpi_id"] == kid), None)
    if hit:
        return hit
    meta = get_kpi_entry(kid) or {}
    return {
        "kpi_id": kid,
        "kpi_name": meta.get("kpi_name"),
        "value": None,
        "unit": meta.get("unit"),
        "formatted_value": "Not Available",
        "formula": meta.get("formula"),
        "group": meta.get("group"),
        "dashboard_page": meta.get("dashboard_page"),
        "visual_type": meta.get("visual_type"),
        "drilldown_filter_preset": meta.get("drilldown_filter_preset") or {},
        "meta": {"note": "KPI not found or not computed"},
    }
