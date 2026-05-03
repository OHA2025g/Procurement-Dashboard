"""KPI Engine — computes all 120 KPIs across 10 groups (A-J)."""
from __future__ import annotations
import os
import re
from typing import Dict, Any, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from models import Statement, Category, Status, RiskLevel, FilterParams

HIGH_VALUE_CR = float(os.environ.get("HIGH_VALUE_THRESHOLD_CR", "10"))
EPS = 1e-5

D_STATUSES = ["Expired", "Returned", "Cancelled", "Closed"]
ACTIVE_STATUSES = ["PO_Issued", "Tender_Under_Process", "Awaited_Publish", "Retender"]
# Spec-aligned active portfolio (excludes Retender) — used for canonical KPI-003b
ACTIVE_EXEC_STATUSES = ["PO_Issued", "Tender_Under_Process", "Awaited_Publish"]
BACKLOG_STATUSES = ["Awaited_Publish", "Retender"]


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


def _payment_status_match(payment_status: str) -> Dict[str, Any]:
    ps = payment_status.strip().lower().replace(" ", "_")
    if ps == "fully_paid":
        return {
            "po_value": {"$gt": EPS},
            "outstanding_amount": {"$lte": EPS},
            "paid_amount": {"$gt": EPS},
        }
    if ps == "partially_paid":
        return {
            "po_value": {"$gt": EPS},
            "paid_amount": {"$gt": EPS},
            "outstanding_amount": {"$gt": EPS},
        }
    if ps == "unpaid":
        return {"po_value": {"$gt": EPS}, "paid_amount": {"$lte": EPS}}
    if ps == "no_po":
        return {"po_value": {"$lte": EPS}}
    return {}


def _value_band_match(band: Optional[str]) -> Dict[str, Any]:
    if not band:
        return {}
    raw = str(band).strip().lower()
    if "," in raw:
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        ors = []
        for p in parts:
            m = _value_band_match(p)
            if m:
                ors.append(m)
        if ors:
            return {"$or": ors} if len(ors) > 1 else ors[0]
        return {}
    b = raw
    if b in ("very high", "very_high"):
        return {"procurement_value": {"$gt": HIGH_VALUE_CR}}
    if b in ("high",) and "5-10" not in raw:
        return {"procurement_value": {"$gt": 5.0, "$lte": max(5.0, HIGH_VALUE_CR - EPS)}}
    if b in ("0", "zero"):
        return {"procurement_value": {"$lte": EPS}}
    if b in ("0-1", "0-1 cr", "0_1", "0-1 cr"):
        return {"procurement_value": {"$gt": EPS, "$lte": 1.0}}
    if b in ("1-5", "1-5 cr", "1_5"):
        return {"procurement_value": {"$gt": 1.0, "$lte": 5.0}}
    if b in ("5-10", "5-10 cr", "5_10"):
        return {"procurement_value": {"$gt": 5.0, "$lte": 10.0}}
    if b in ("10+", "10+ cr", "10_plus"):
        return {"procurement_value": {"$gt": 10.0}}
    return {}


def _search_match(search: Optional[str]) -> Dict[str, Any]:
    if not search or not str(search).strip():
        return {}
    q = re.escape(str(search).strip())
    rx = {"$regex": q, "$options": "i"}
    return {"$or": [{"item_description": rx}, {"department": rx}, {"po_number": rx},
                    {"tender_number": rx}, {"id": rx}, {"record_id": rx}]}


def build_match(filters: Optional[FilterParams]) -> Dict[str, Any]:
    if not filters:
        return {}
    q: Dict[str, Any] = {}
    if filters.statements:
        q["statement"] = {"$in": [s.value for s in filters.statements]}
    if filters.departments:
        q["department"] = {"$in": filters.departments}
    if filters.categories:
        q["category"] = {"$in": [c.value for c in filters.categories]}
    if filters.risk_levels:
        q["risk_level"] = {"$in": [r.value for r in filters.risk_levels]}
    if filters.financial_year:
        q["financial_year"] = filters.financial_year
    if filters.value_min is not None or filters.value_max is not None:
        vrange: Dict[str, float] = {}
        if filters.value_min is not None:
            vrange["$gte"] = filters.value_min
        if filters.value_max is not None:
            vrange["$lte"] = filters.value_max
        q["procurement_value"] = vrange
    if filters.current_statuses:
        q["current_status"] = {"$in": filters.current_statuses}
    if filters.batch_id:
        q["batch_id"] = filters.batch_id
    if filters.data_source:
        q["data_source"] = filters.data_source
    if filters.recovery_status:
        q["recovery_status"] = filters.recovery_status
    if filters.tender_stage:
        q["tender_stage"] = filters.tender_stage
    if filters.official_decision_required is not None:
        q["official_decision_required"] = filters.official_decision_required
    pm = _payment_status_match(filters.payment_status) if filters.payment_status else {}
    if pm:
        q = _merge_and(q, pm)
    vb = _value_band_match(filters.value_band)
    if vb:
        q = _merge_and(q, vb)
    sm = _search_match(filters.search)
    if sm:
        q = _merge_and(q, sm)
    if filters.action_type and str(filters.action_type).strip():
        rx = {"$regex": re.escape(str(filters.action_type).strip()), "$options": "i"}
        q = _merge_and(q, {"action_required": rx})
    return q


def _pct(numer: float, denom: float) -> float:
    if not denom:
        return 0.0
    return round((numer / denom) * 100.0, 2)


class KPIEngine:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.col = db.procurement

    # ---- helpers ----

    async def _agg_value_count(self, match: Dict[str, Any], value_field: str = "procurement_value") -> Dict[str, float]:
        pipeline = [
            {"$match": match},
            {"$group": {"_id": None, "total": {"$sum": f"${value_field}"}, "count": {"$sum": 1}}},
        ]
        docs = await self.col.aggregate(pipeline).to_list(1)
        if not docs:
            return {"total": 0.0, "count": 0}
        return {"total": float(docs[0].get("total", 0) or 0), "count": int(docs[0].get("count", 0) or 0)}

    async def _group_sum(self, match: Dict[str, Any], group_field: str,
                         value_field: str = "procurement_value") -> List[Dict[str, Any]]:
        pipeline = [
            {"$match": match},
            {"$group": {"_id": f"${group_field}",
                        "total": {"$sum": f"${value_field}"},
                        "count": {"$sum": 1}}},
            {"$sort": {"total": -1}},
        ]
        docs = await self.col.aggregate(pipeline).to_list(200)
        return [{"label": d["_id"] or "Unknown",
                 "value": round(float(d["total"] or 0), 4),
                 "count": int(d["count"] or 0)} for d in docs]

    # ---- GROUP A - EXECUTIVE ----

    async def executive(self, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        match = build_match(filters)
        total = await self._agg_value_count(match)
        active = await self._agg_value_count({**match, "current_status": {"$in": ACTIVE_STATUSES}})
        active_canon = await self._agg_value_count({**match, "current_status": {"$in": ACTIVE_EXEC_STATUSES}})
        inactive = await self._agg_value_count({**match, "current_status": {"$in": D_STATUSES}})
        po = await self._agg_value_count({**match, "statement": "A"}, "po_value")
        paid = await self._agg_value_count({**match, "statement": "A"}, "paid_amount")
        outstanding = await self._agg_value_count({**match, "statement": "A"}, "outstanding_amount")
        backlog = await self._agg_value_count({**match, "current_status": {"$in": BACKLOG_STATUSES}})

        # Top 10 by value
        top_pipeline = [
            {"$match": match},
            {"$sort": {"procurement_value": -1}},
            {"$limit": 10},
            {"$project": {"_id": 0, "id": 1, "item_description": 1, "department": 1,
                          "category": 1, "procurement_value": 1, "current_status": 1,
                          "risk_level": 1, "action_required": 1, "statement": 1}},
        ]
        top10 = await self.col.aggregate(top_pipeline).to_list(10)
        top10_sum = sum(t.get("procurement_value", 0) for t in top10)

        high_value_count = await self.col.count_documents({**match, "procurement_value": {"$gt": HIGH_VALUE_CR}})

        po_conversion = _pct(po["total"], total["total"])
        payment_completion = _pct(paid["total"], po["total"]) if po["total"] else 0.0
        tender = await self._agg_value_count({**match, "statement": "B"})
        tender_progress = _pct(tender["total"], total["total"])
        backlog_pct = _pct(backlog["total"], total["total"])
        inactive_pct = _pct(inactive["total"], total["total"])
        risk_exposure_pct = _pct(inactive["total"] + backlog["total"] + outstanding["total"], total["total"])

        # Health score composite
        health = (
            (po_conversion / 100) * 25
            + (payment_completion / 100) * 25
            + (min(tender_progress, 100) / 100) * 15
            + (1 - backlog_pct / 100) * 15
            + (1 - inactive_pct / 100) * 20
        ) * 1
        health = max(0, min(100, round(health, 2)))

        return {
            "KPI-001_total_portfolio": round(total["total"], 4),
            "KPI-002_total_items": total["count"],
            "KPI-003_active_value": round(active["total"], 4),
            "KPI-003_active_value_canonical": round(active_canon["total"], 4),
            "KPI-004_inactive_value": round(inactive["total"], 4),
            "KPI-005_active_pct": _pct(active["total"], total["total"]),
            "KPI-006_inactive_pct": inactive_pct,
            "KPI-007_avg_value": round(total["total"] / total["count"], 4) if total["count"] else 0.0,
            "KPI-008_high_value_count": high_value_count,
            "KPI-009_top10_concentration_pct": _pct(top10_sum, total["total"]),
            "KPI-010_health_score": health,
            "po_issued_value": round(po["total"], 4),
            "paid_value": round(paid["total"], 4),
            "outstanding_value": round(outstanding["total"], 4),
            "backlog_value": round(backlog["total"], 4),
            "po_conversion_pct": po_conversion,
            "payment_completion_pct": payment_completion,
            "risk_exposure_pct": risk_exposure_pct,
            "top10": top10,
        }

    # ---- GROUP B - STATEMENT ----

    async def statements(self, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        match = build_match(filters)
        total = await self._agg_value_count(match)
        per_statement = []
        risk_weight = {"Critical": 1.0, "High": 0.75, "Medium": 0.5, "Low": 0.25}

        for s in ["A", "B", "C", "D"]:
            s_match = {**match, "statement": s}
            result = await self._agg_value_count(s_match)
            # risk weight
            pipeline = [
                {"$match": s_match},
                {"$group": {"_id": "$risk_level", "count": {"$sum": 1}, "value": {"$sum": "$procurement_value"}}},
            ]
            risks = await self.col.aggregate(pipeline).to_list(10)
            weighted = sum(risk_weight.get(r["_id"], 0) * (r.get("value") or 0) for r in risks)
            per_statement.append({
                "statement": s,
                "value": round(result["total"], 4),
                "count": result["count"],
                "share_pct": _pct(result["total"], total["total"]),
                "avg_value": round(result["total"] / result["count"], 4) if result["count"] else 0.0,
                "risk_score": round(weighted, 4),
                "risk_breakdown": {r["_id"]: {"count": r["count"], "value": round(r["value"] or 0, 4)} for r in risks},
            })

        statement_a_value = next((s["value"] for s in per_statement if s["statement"] == "A"), 0)
        return {
            "total": round(total["total"], 4),
            "total_count": total["count"],
            "per_statement": per_statement,
            "execution_gap": round(total["total"] - statement_a_value, 4),
        }

    # ---- GROUP C/D - PO & PAYMENT ----

    async def po_payment(self, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        match = build_match(filters)
        a_match = {**match, "statement": "A"}
        po = await self._agg_value_count(a_match, "po_value")
        paid = await self._agg_value_count(a_match, "paid_amount")
        outstanding = await self._agg_value_count(a_match, "outstanding_amount")

        # status splits on Statement A (with po_value > 0)
        fully_paid = await self.col.count_documents(
            {**a_match, "$expr": {"$and": [{"$gt": ["$po_value", 0]},
                                           {"$eq": ["$paid_amount", "$po_value"]}]}})
        unpaid = await self.col.count_documents(
            {**a_match, "$expr": {"$and": [{"$gt": ["$po_value", 0]},
                                           {"$eq": ["$paid_amount", 0]}]}})
        partial = await self.col.count_documents(
            {**a_match, "$expr": {"$and": [{"$gt": ["$po_value", 0]},
                                           {"$gt": ["$paid_amount", 0]},
                                           {"$lt": ["$paid_amount", "$po_value"]}]}})

        by_dept = await self._group_sum(a_match, "department", "outstanding_amount")
        by_category = await self._group_sum(a_match, "category", "outstanding_amount")

        top_pending = await self.col.aggregate([
            {"$match": {**a_match, "outstanding_amount": {"$gt": 0}}},
            {"$sort": {"outstanding_amount": -1}},
            {"$limit": 10},
            {"$project": {"_id": 0, "id": 1, "item_description": 1, "department": 1,
                          "category": 1, "po_value": 1, "paid_amount": 1,
                          "outstanding_amount": 1, "risk_level": 1, "action_required": 1,
                          "current_status": 1}},
        ]).to_list(10)

        return {
            "KPI-021_po_value": round(po["total"], 4),
            "KPI-022_po_count": po["count"],
            "KPI-031_paid_value": round(paid["total"], 4),
            "KPI-032_outstanding_value": round(outstanding["total"], 4),
            "KPI-033_payment_completion_pct": _pct(paid["total"], po["total"]),
            "KPI-034_outstanding_pct": _pct(outstanding["total"], po["total"]),
            "KPI-035_fully_paid_count": fully_paid,
            "KPI-036_partial_paid_count": partial,
            "KPI-037_unpaid_count": unpaid,
            "by_department": by_dept,
            "by_category": by_category,
            "top10_pending": top_pending,
        }

    # ---- GROUP E - TENDER PIPELINE ----

    async def tender(self, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        match = build_match(filters)
        b_match = {**match, "statement": "B"}
        total = await self._agg_value_count(match)
        tender = await self._agg_value_count(b_match)
        high_value = await self.col.count_documents({**b_match, "procurement_value": {"$gt": HIGH_VALUE_CR}})
        by_dept = await self._group_sum(b_match, "department")
        by_category = await self._group_sum(b_match, "category")

        closure_priority = await self.col.aggregate([
            {"$match": b_match},
            {"$sort": {"priority_score": -1, "procurement_value": -1}},
            {"$limit": 15},
            {"$project": {"_id": 0, "id": 1, "item_description": 1, "department": 1,
                          "category": 1, "procurement_value": 1, "current_status": 1,
                          "risk_level": 1, "action_required": 1, "days_pending": 1,
                          "priority_score": 1}},
        ]).to_list(15)

        return {
            "KPI-043_pipeline_value": round(tender["total"], 4),
            "KPI-044_pipeline_count": tender["count"],
            "KPI-045_pipeline_pct": _pct(tender["total"], total["total"]),
            "KPI-048_avg_pipeline": round(tender["total"] / tender["count"], 4) if tender["count"] else 0.0,
            "KPI-049_high_value_count": high_value,
            "by_department": by_dept,
            "by_category": by_category,
            "closure_priority": closure_priority,
        }

    # ---- GROUP F - BACKLOG ----

    async def backlog(self, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        match = build_match(filters)
        total = await self._agg_value_count(match)
        awaited = await self._agg_value_count({**match, "current_status": "Awaited_Publish"})
        retender = await self._agg_value_count({**match, "current_status": "Retender"})
        backlog_match = {**match, "current_status": {"$in": BACKLOG_STATUSES}}
        backlog_total = await self._agg_value_count(backlog_match)
        critical_backlog = await self._agg_value_count(
            {**backlog_match, "procurement_value": {"$gt": HIGH_VALUE_CR}}
        )

        by_dept = await self._group_sum(backlog_match, "department")
        by_category = await self._group_sum(backlog_match, "category")

        # Top 10 backlog
        top10 = await self.col.aggregate([
            {"$match": backlog_match},
            {"$sort": {"procurement_value": -1}},
            {"$limit": 10},
            {"$project": {"_id": 0, "id": 1, "item_description": 1, "department": 1,
                          "category": 1, "procurement_value": 1, "current_status": 1,
                          "risk_level": 1, "action_required": 1, "days_pending": 1}},
        ]).to_list(10)

        clearance = await self.col.aggregate([
            {"$match": backlog_match},
            {"$sort": {"priority_score": -1}},
            {"$limit": 25},
            {"$project": {"_id": 0, "id": 1, "item_description": 1, "department": 1,
                          "category": 1, "procurement_value": 1, "current_status": 1,
                          "risk_level": 1, "action_required": 1, "days_pending": 1,
                          "priority_score": 1, "assigned_to": 1, "due_date": 1}},
        ]).to_list(25)

        return {
            "KPI-053_awaited_publish_value": round(awaited["total"], 4),
            "KPI-054_awaited_count": awaited["count"],
            "KPI-055_retender_value": round(retender["total"], 4),
            "KPI-056_retender_count": retender["count"],
            "KPI-057_total_backlog": round(backlog_total["total"], 4),
            "KPI-058_backlog_pct": _pct(backlog_total["total"], total["total"]),
            "KPI-061_critical_backlog": round(critical_backlog["total"], 4),
            "by_department": by_dept,
            "by_category": by_category,
            "top10": top10,
            "clearance_priority": clearance,
        }

    # ---- GROUP G - RISK / EXPIRED ----

    async def risk(self, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        match = build_match(filters)
        total = await self._agg_value_count(match)
        expired = await self._agg_value_count({**match, "current_status": "Expired"})
        returned = await self._agg_value_count({**match, "current_status": "Returned"})
        cancelled = await self._agg_value_count({**match, "current_status": "Cancelled"})
        failed = await self._agg_value_count({**match, "current_status": {"$in": D_STATUSES}})

        high_risk_count = await self.col.count_documents({**match, "risk_level": {"$in": ["Critical", "High"]}})
        high_risk = await self._agg_value_count({**match, "risk_level": {"$in": ["Critical", "High"]}})

        critical_high_value = await self._agg_value_count({
            **match, "risk_level": "Critical",
            "procurement_value": {"$gt": HIGH_VALUE_CR}
        })

        # failure reasons — by status
        reasons = await self.col.aggregate([
            {"$match": {**match, "current_status": {"$in": D_STATUSES}}},
            {"$group": {"_id": "$current_status", "count": {"$sum": 1},
                        "value": {"$sum": "$procurement_value"}}},
            {"$sort": {"value": -1}},
        ]).to_list(20)

        by_dept = await self._group_sum({**match, "risk_level": {"$in": ["Critical", "High"]}}, "department")
        by_category = await self._group_sum({**match, "current_status": {"$in": D_STATUSES}}, "category")

        # Escalation register: critical + high
        escalation = await self.col.aggregate([
            {"$match": {**match, "risk_level": {"$in": ["Critical", "High"]}}},
            {"$sort": {"priority_score": -1}},
            {"$limit": 40},
            {"$project": {"_id": 0, "id": 1, "item_description": 1, "department": 1,
                          "category": 1, "procurement_value": 1, "current_status": 1,
                          "risk_level": 1, "action_required": 1, "assigned_to": 1,
                          "escalation_level": 1, "due_date": 1, "priority_score": 1,
                          "days_pending": 1, "statement": 1}},
        ]).to_list(40)

        return {
            "KPI-065_expired_value": round(expired["total"], 4),
            "KPI-066_expired_count": expired["count"],
            "KPI-067_returned_value": round(returned["total"], 4),
            "KPI-068_returned_count": returned["count"],
            "KPI-069_cancelled_value": round(cancelled["total"], 4),
            "KPI-070_cancelled_count": cancelled["count"],
            "KPI-071_failed_total": round(failed["total"], 4),
            "KPI-072_failed_pct": _pct(failed["total"], total["total"]),
            "KPI-105_high_risk_count": high_risk_count,
            "KPI-106_high_risk_value": round(high_risk["total"], 4),
            "KPI-116_critical_high_value": round(critical_high_value["total"], 4),
            "reasons": [{"label": r["_id"], "value": round(r["value"] or 0, 4),
                         "count": r["count"]} for r in reasons],
            "by_department": by_dept,
            "by_category": by_category,
            "escalation": escalation,
        }

    # ---- GROUP H - CATEGORY ----

    async def category_summary(self, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        match = build_match(filters)
        total = await self._agg_value_count(match)
        results = []
        for cat in ["Medicine", "Equipment", "Consumables", "Services", "Others"]:
            c_match = {**match, "category": cat}
            r = await self._agg_value_count(c_match)
            po = await self._agg_value_count({**c_match, "statement": "A"}, "po_value")
            paid = await self._agg_value_count({**c_match, "statement": "A"}, "paid_amount")
            backlog = await self._agg_value_count(
                {**c_match, "current_status": {"$in": BACKLOG_STATUSES}}
            )
            failed = await self._agg_value_count(
                {**c_match, "current_status": {"$in": D_STATUSES}}
            )
            results.append({
                "category": cat,
                "value": round(r["total"], 4),
                "count": r["count"],
                "share_pct": _pct(r["total"], total["total"]),
                "po_value": round(po["total"], 4),
                "paid_value": round(paid["total"], 4),
                "backlog_value": round(backlog["total"], 4),
                "failed_value": round(failed["total"], 4),
                "po_conversion_pct": _pct(po["total"], r["total"]),
                "payment_completion_pct": _pct(paid["total"], po["total"]),
                "backlog_pct": _pct(backlog["total"], r["total"]),
            })
        return {"total": round(total["total"], 4), "per_category": results}

    # ---- GROUP I - DEPARTMENT ----

    async def department_summary(self, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        match = build_match(filters)
        total = await self._agg_value_count(match)
        # Aggregate per department
        pipeline = [
            {"$match": match},
            {"$group": {
                "_id": "$department",
                "total_value": {"$sum": "$procurement_value"},
                "total_count": {"$sum": 1},
                "po_value": {"$sum": {"$cond": [{"$eq": ["$statement", "A"]}, "$po_value", 0]}},
                "paid": {"$sum": {"$cond": [{"$eq": ["$statement", "A"]}, "$paid_amount", 0]}},
                "outstanding": {"$sum": {"$cond": [{"$eq": ["$statement", "A"]}, "$outstanding_amount", 0]}},
                "backlog": {"$sum": {"$cond": [{"$in": ["$current_status", BACKLOG_STATUSES]}, "$procurement_value", 0]}},
                "failed": {"$sum": {"$cond": [{"$in": ["$current_status", D_STATUSES]}, "$procurement_value", 0]}},
                "tender": {"$sum": {"$cond": [{"$eq": ["$statement", "B"]}, "$procurement_value", 0]}},
                "critical_count": {"$sum": {"$cond": [{"$eq": ["$risk_level", "Critical"]}, 1, 0]}},
                "high_count": {"$sum": {"$cond": [{"$eq": ["$risk_level", "High"]}, 1, 0]}},
                "action_pending": {"$sum": {"$cond": [{"$ne": ["$action_required", ""]}, 1, 0]}},
            }},
            {"$sort": {"total_value": -1}},
        ]
        docs = await self.col.aggregate(pipeline).to_list(100)

        departments = []
        for d in docs:
            total_val = d["total_value"] or 0
            po_val = d["po_value"] or 0
            departments.append({
                "department": d["_id"] or "Unknown",
                "total_value": round(total_val, 4),
                "total_count": d["total_count"] or 0,
                "po_value": round(po_val, 4),
                "paid": round(d["paid"] or 0, 4),
                "outstanding": round(d["outstanding"] or 0, 4),
                "backlog": round(d["backlog"] or 0, 4),
                "failed": round(d["failed"] or 0, 4),
                "tender": round(d["tender"] or 0, 4),
                "share_pct": _pct(total_val, total["total"]),
                "po_conversion_pct": _pct(po_val, total_val),
                "payment_completion_pct": _pct(d["paid"] or 0, po_val),
                "backlog_pct": _pct(d["backlog"] or 0, total_val),
                "risk_score": round(
                    ((d["critical_count"] or 0) * 100 + (d["high_count"] or 0) * 75) /
                    max(d["total_count"] or 1, 1), 2
                ),
                "critical_count": d["critical_count"] or 0,
                "high_count": d["high_count"] or 0,
                "action_pending_count": d["action_pending"] or 0,
            })
        return {"departments": departments, "total": round(total["total"], 4),
                "total_count": total["count"]}

    # ---- GROUP J - ACTIONS / GOVERNANCE ----

    async def actions(self, filters: Optional[FilterParams] = None,
                      risk_only: bool = False, limit: int = 200,
                      page: int = 1) -> Dict[str, Any]:
        match = build_match(filters)
        if risk_only:
            match["risk_level"] = {"$in": ["Critical", "High"]}

        total_count = await self.col.count_documents(match)
        total_value = await self._agg_value_count(match)

        skip = (page - 1) * limit
        rows = await self.col.aggregate([
            {"$match": match},
            {"$sort": {"priority_score": -1, "procurement_value": -1}},
            {"$skip": skip},
            {"$limit": limit},
            {"$project": {"_id": 0}},
        ]).to_list(limit)

        # By action type (infer from action_required text)
        action_stats = await self.col.aggregate([
            {"$match": match},
            {"$group": {"_id": "$action_required", "count": {"$sum": 1},
                        "value": {"$sum": "$procurement_value"}}},
            {"$sort": {"value": -1}},
        ]).to_list(30)

        return {
            "total_count": total_count,
            "total_value": round(total_value["total"], 4),
            "rows": rows,
            "by_action": [{"label": a["_id"] or "N/A",
                           "value": round(a["value"] or 0, 4),
                           "count": a["count"]} for a in action_stats],
        }

    # ---- GOVERNANCE ROLLUP ----

    async def governance(self, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        match = build_match(filters)
        total = await self._agg_value_count(match)
        outstanding = await self._agg_value_count({**match, "statement": "A"}, "outstanding_amount")
        backlog = await self._agg_value_count({**match, "current_status": {"$in": BACKLOG_STATUSES}})
        failed = await self._agg_value_count({**match, "current_status": {"$in": D_STATUSES}})
        risk_total = (outstanding["total"] or 0) + (backlog["total"] or 0) + (failed["total"] or 0)

        return {
            "KPI-103_total_risk_value": round(risk_total, 4),
            "KPI-104_risk_pct": _pct(risk_total, total["total"]),
            "outstanding": round(outstanding["total"] or 0, 4),
            "backlog": round(backlog["total"] or 0, 4),
            "failed": round(failed["total"] or 0, 4),
            "total": round(total["total"], 4),
        }

    # ---- distinct departments ----

    async def departments_list(self) -> List[str]:
        return sorted([d for d in await self.col.distinct("department") if d])

    async def financial_years_list(self) -> List[str]:
        return sorted([fy for fy in await self.col.distinct("financial_year") if fy], reverse=True)

    # ---- KPI-079 .. KPI-102 (category & department) ----

    _REGISTRY_CATS = ["Medicine", "Equipment", "Consumables", "Services", "Others"]

    async def category_department_kpis(self, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        match = build_match(filters)
        out: Dict[str, Any] = {}
        slot = 79
        for cat in self._REGISTRY_CATS:
            c_match = {**match, "category": cat}
            r = await self._agg_value_count(c_match)
            out[f"KPI-{slot:03d}"] = round(r["total"], 4)
            slot += 1
        for cat in self._REGISTRY_CATS:
            c_match = {**match, "category": cat}
            cnt = await self.col.count_documents(c_match)
            out[f"KPI-{slot:03d}"] = cnt
            slot += 1
        for cat in self._REGISTRY_CATS:
            c_match = {**match, "category": cat, "current_status": {"$in": BACKLOG_STATUSES}}
            r = await self._agg_value_count(c_match)
            out[f"KPI-{slot:03d}"] = round(r["total"], 4)
            slot += 1
        for cat in self._REGISTRY_CATS:
            c_match = {**match, "category": cat, "current_status": {"$in": D_STATUSES}}
            r = await self._agg_value_count(c_match)
            out[f"KPI-{slot:03d}"] = round(r["total"], 4)
            slot += 1
        ds = await self.department_summary(filters)
        depts = ds.get("departments") or []
        total_v = float(ds.get("total") or 0)
        if depts and total_v > EPS:
            top_share = _pct(depts[0].get("total_value", 0), total_v)
        else:
            top_share = 0.0
        out[f"KPI-{slot:03d}"] = top_share
        slot += 1
        backlog_depts = sum(1 for d in depts if float(d.get("backlog") or 0) > EPS)
        out[f"KPI-{slot:03d}"] = backlog_depts
        slot += 1
        avg_risk = 0.0
        if depts:
            avg_risk = sum(float(d.get("risk_score") or 0) for d in depts) / len(depts)
        out[f"KPI-{slot:03d}"] = round(avg_risk, 2)
        slot += 1
        hhi = 0.0
        if total_v > EPS:
            for d in depts:
                s = float(d.get("total_value") or 0)
                hhi += (s / total_v) ** 2
        out[f"KPI-{slot:03d}"] = round(hhi * 10000, 2)
        return out

    async def kpi_value_by_id(self, kpi_id: str, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        """Resolve a single KPI id to numeric value + drill preset (best-effort)."""
        kid = kpi_id.strip().upper()
        if not kid.startswith("KPI-"):
            kid = f"KPI-{kid.zfill(3)}" if kid.isdigit() else kpi_id
        reg = __import__("kpi_registry", fromlist=["get_kpi_entry"]).get_kpi_entry(kid)
        preset = (reg or {}).get("drilldown_filter_preset") or "total_portfolio"
        merged: Dict[str, Any] = {}
        ex = await self.executive(filters)
        stm = await self.statements(filters)
        pay = await self.po_payment(filters)
        ten = await self.tender(filters)
        bac = await self.backlog(filters)
        ris = await self.risk(filters)
        gov = await self.governance(filters)
        catd = await self.category_department_kpis(filters)
        for blob in (ex, pay, ten, bac, ris, gov, catd):
            if kid in blob:
                return {"kpi_id": kid, "value": blob[kid], "drilldown_filter_preset": preset}
        if kid in stm:
            return {"kpi_id": kid, "value": stm[kid], "drilldown_filter_preset": preset}
        n = int(kid.replace("KPI-", "").lstrip("0") or "0")
        if 11 <= n <= 20:
            ps = stm.get("per_statement") or []
            idx = n - 11
            if 0 <= idx < len(ps):
                return {"kpi_id": kid, "value": ps[idx].get("value"), "drilldown_filter_preset": "total_portfolio"}
        return {"kpi_id": kid, "value": None, "drilldown_filter_preset": preset, "note": "computed in composite bundle"}

    async def kpis_all_bundles(self, filters: Optional[FilterParams] = None) -> Dict[str, Any]:
        ex = await self.executive(filters)
        stm = await self.statements(filters)
        pay = await self.po_payment(filters)
        ten = await self.tender(filters)
        bac = await self.backlog(filters)
        ris = await self.risk(filters)
        gov = await self.governance(filters)
        catd = await self.category_department_kpis(filters)
        stm_flat = {}
        for i, row in enumerate(stm.get("per_statement") or [], start=11):
            stm_flat[f"KPI-{i:03d}_stmt_{row.get('statement')}"] = row.get("value")
        return {
            "executive": ex,
            "statements": stm,
            "statements_kpi_flat": stm_flat,
            "payment": pay,
            "tender": ten,
            "backlog": bac,
            "risk": ris,
            "governance": gov,
            "category_department": catd,
        }
