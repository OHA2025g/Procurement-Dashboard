"""Action tracker + history backed by MongoDB collections `action_tracker` and `action_history`."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from models import FilterParams
from kpi_engine import build_match

ALLOWED_STATUS = {
    "Open", "In Progress", "Waiting for Department", "Waiting for Finance",
    "Escalated", "Closed", "Dropped", "Reopened",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def seed_from_procurement_if_empty(db: AsyncIOMotorDatabase, limit: int = 2000) -> int:
    if await db.action_tracker.count_documents({}):
        return 0
    cur = db.procurement.find({"action_required": {"$nin": [None, ""]}}, {"_id": 0}).limit(limit)
    n = 0
    async for doc in cur:
        rid = doc.get("id") or doc.get("record_id")
        if not rid:
            continue
        aid = uuid.uuid4().hex
        ins = {
            "action_id": aid,
            "record_id": rid,
            "batch_id": doc.get("batch_id"),
            "action_type": _infer_action_type(doc.get("action_required") or ""),
            "action_required": (doc.get("action_required") or "")[:2000],
            "next_best_action": (doc.get("action_required") or "")[:500],
            "suggested_owner": doc.get("assigned_to") or "",
            "assigned_to": doc.get("assigned_to") or "",
            "escalation_level": str(doc.get("escalation_level_label") or f"L{doc.get('escalation_level') or 0}"),
            "priority_score": float(doc.get("priority_score") or 0),
            "risk_level": doc.get("risk_level") or "Low",
            "action_status": "Open",
            "target_date": doc.get("due_date"),
            "remarks": doc.get("remarks") or "",
            "created_by": "system-seed",
            "updated_by": "system-seed",
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "closed_at": None,
        }
        await db.action_tracker.update_one(
            {"record_id": rid},
            {"$setOnInsert": ins},
            upsert=True,
        )
        n += 1
    return n


def _infer_action_type(text: str) -> str:
    t = (text or "").lower()
    if "payment" in t or "pay" in t:
        return "Payment"
    if "tender" in t:
        return "Tender"
    if "publish" in t:
        return "Publish"
    if "retender" in t:
        return "Retender"
    return "General"


async def _append_history(
    db: AsyncIOMotorDatabase,
    *,
    action_id: str,
    record_id: str,
    event_type: str,
    old_value: Any,
    new_value: Any,
    remarks: str,
    changed_by: str,
):
    await db.action_history.insert_one({
        "history_id": uuid.uuid4().hex,
        "action_id": action_id,
        "record_id": record_id,
        "event_type": event_type,
        "old_value": old_value,
        "new_value": new_value,
        "remarks": remarks or "",
        "changed_by": changed_by,
        "changed_at": _now_iso(),
    })


async def _by_action_breakdown(db: AsyncIOMotorDatabase, q: Dict[str, Any]) -> List[Dict[str, Any]]:
    pl = [
        {"$match": q},
        {"$lookup": {"from": "procurement", "localField": "record_id", "foreignField": "id", "as": "rec"}},
        {"$unwind": "$rec"},
        {"$group": {
            "_id": {"$ifNull": ["$action_type", "General"]},
            "count": {"$sum": 1},
            "value": {"$sum": "$rec.procurement_value"},
        }},
        {"$sort": {"value": -1}},
    ]
    docs = await db.action_tracker.aggregate(pl).to_list(30)
    return [
        {"label": str(d["_id"] or "General"), "value": round(float(d["value"] or 0), 4), "count": int(d["count"] or 0)}
        for d in docs
    ]


async def list_tracker(
    db: AsyncIOMotorDatabase,
    filters: FilterParams,
    *,
    page: int = 1,
    limit: int = 50,
    risk_only: bool = False,
) -> Dict[str, Any]:
    match = build_match(filters)
    if risk_only:
        match = {**match, "risk_level": {"$in": ["Critical", "High"]}}
    rids = await db.procurement.distinct("id", match)
    if not rids:
        return {"rows": [], "total_count": 0, "page": page, "limit": limit, "by_action": []}
    q = {"record_id": {"$in": rids}}
    by_action = await _by_action_breakdown(db, q)
    total = await db.action_tracker.count_documents(q)
    skip = (max(1, page) - 1) * max(1, min(200, limit))
    lim = max(1, min(200, limit))
    rows = await db.action_tracker.find(q, {"_id": 0}).sort("updated_at", -1).skip(skip).limit(lim).to_list(lim)
    # enrich with procurement snapshot
    out = []
    for tr in rows:
        rec = await db.procurement.find_one({"id": tr["record_id"]}, {"_id": 0})
        if not rec:
            continue
        out.append({**tr, **{
            "department": rec.get("department"),
            "category": rec.get("category"),
            "item_description": rec.get("item_description"),
            "procurement_value": rec.get("procurement_value"),
            "po_value": rec.get("po_value"),
            "paid_amount": rec.get("paid_amount"),
            "outstanding_amount": rec.get("outstanding_amount"),
            "current_status": rec.get("current_status"),
            "payment_status_cached": rec.get("payment_status_cached"),
            "statement": rec.get("statement"),
            "days_pending": rec.get("days_pending"),
        }})
    return {"rows": out, "total_count": total, "page": page, "limit": limit, "by_action": by_action}


async def summary(db: AsyncIOMotorDatabase, filters: FilterParams, risk_only: bool = False) -> Dict[str, Any]:
    match = build_match(filters)
    if risk_only:
        match = {**match, "risk_level": {"$in": ["Critical", "High"]}}
    rids = await db.procurement.distinct("id", match)
    if not rids:
        return {
            "total_actions": 0, "open_actions": 0, "in_progress_actions": 0, "escalated_actions": 0,
            "closed_actions": 0, "overdue_actions": 0, "action_pending_value": 0.0,
            "payment_followup_value": 0.0, "tender_closure_value": 0.0, "publish_pending_value": 0.0,
            "retender_approval_value": 0.0, "official_decision_pending_value": 0.0,
            "recovery_potential_value": 0.0,
            "critical_high_action_count": 0,
        }
    q = {"record_id": {"$in": rids}}
    total_actions = await db.action_tracker.count_documents(q)
    open_actions = await db.action_tracker.count_documents({**q, "action_status": "Open"})
    in_progress_actions = await db.action_tracker.count_documents({**q, "action_status": "In Progress"})
    escalated_actions = await db.action_tracker.count_documents({**q, "action_status": "Escalated"})
    closed_actions = await db.action_tracker.count_documents({**q, "action_status": "Closed"})
    critical_high_action_count = await db.action_tracker.count_documents(
        {**q, "risk_level": {"$in": ["Critical", "High"]}}
    )
    overdue_actions = 0  # without parsed dates, keep 0
    val_pipeline = [
        {"$match": q},
        {"$lookup": {"from": "procurement", "localField": "record_id", "foreignField": "id", "as": "rec"}},
        {"$unwind": "$rec"},
        {"$group": {"_id": None, "v": {"$sum": "$rec.procurement_value"}}},
    ]
    vdoc = await db.action_tracker.aggregate(val_pipeline).to_list(1)
    action_pending_value = float(vdoc[0]["v"]) if vdoc else 0.0

    async def sum_type(label: str) -> float:
        pl = [
            {"$match": {**q, "action_type": label}},
            {"$lookup": {"from": "procurement", "localField": "record_id", "foreignField": "id", "as": "rec"}},
            {"$unwind": "$rec"},
            {"$group": {"_id": None, "v": {"$sum": "$rec.procurement_value"}}},
        ]
        d = await db.action_tracker.aggregate(pl).to_list(1)
        return float(d[0]["v"]) if d else 0.0

    off_pl = [
        {"$match": q},
        {"$lookup": {"from": "procurement", "localField": "record_id", "foreignField": "id", "as": "rec"}},
        {"$unwind": "$rec"},
        {"$match": {"rec.official_decision_required": True}},
        {"$group": {"_id": None, "v": {"$sum": "$rec.procurement_value"}}},
    ]
    offd = await db.action_tracker.aggregate(off_pl).to_list(1)
    official = float(offd[0]["v"]) if offd else 0.0

    recov_pl = [
        {"$match": q},
        {"$lookup": {"from": "procurement", "localField": "record_id", "foreignField": "id", "as": "rec"}},
        {"$unwind": "$rec"},
        {"$match": {"rec.recovery_status": "Recoverable"}},
        {"$group": {"_id": None, "v": {"$sum": "$rec.procurement_value"}}},
    ]
    recovd = await db.action_tracker.aggregate(recov_pl).to_list(1)
    recovery_potential_value = float(recovd[0]["v"]) if recovd else 0.0

    return {
        "total_actions": total_actions,
        "open_actions": open_actions,
        "in_progress_actions": in_progress_actions,
        "escalated_actions": escalated_actions,
        "closed_actions": closed_actions,
        "overdue_actions": overdue_actions,
        "action_pending_value": round(action_pending_value, 4),
        "payment_followup_value": round(await sum_type("Payment"), 4),
        "tender_closure_value": round(await sum_type("Tender"), 4),
        "publish_pending_value": round(await sum_type("Publish"), 4),
        "retender_approval_value": round(await sum_type("Retender"), 4),
        "official_decision_pending_value": round(official, 4),
        "recovery_potential_value": round(recovery_potential_value, 4),
        "critical_high_action_count": critical_high_action_count,
    }


async def create_action(db: AsyncIOMotorDatabase, payload: Dict[str, Any], user_email: str) -> Dict[str, Any]:
    rid = payload.get("record_id")
    if not rid:
        raise ValueError("record_id required")
    aid = payload.get("action_id") or uuid.uuid4().hex
    doc = {
        "action_id": aid,
        "record_id": rid,
        "batch_id": payload.get("batch_id"),
        "action_type": payload.get("action_type") or "General",
        "action_required": (payload.get("action_required") or "")[:2000],
        "next_best_action": (payload.get("next_best_action") or payload.get("action_required") or "")[:500],
        "suggested_owner": payload.get("suggested_owner") or "",
        "assigned_to": payload.get("assigned_to") or "",
        "escalation_level": str(payload.get("escalation_level") or "L0"),
        "priority_score": float(payload.get("priority_score") or 0),
        "risk_level": payload.get("risk_level") or "Low",
        "action_status": payload.get("action_status") or "Open",
        "target_date": payload.get("target_date"),
        "remarks": payload.get("remarks") or "",
        "created_by": user_email,
        "updated_by": user_email,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "closed_at": None,
    }
    await db.action_tracker.insert_one(doc)
    await _append_history(db, action_id=aid, record_id=rid, event_type="create", old_value=None, new_value=doc, remarks="Created", changed_by=user_email)
    return doc


async def get_one(db: AsyncIOMotorDatabase, action_id: str) -> Optional[Dict[str, Any]]:
    return await db.action_tracker.find_one({"action_id": action_id}, {"_id": 0})


async def patch_action(db: AsyncIOMotorDatabase, action_id: str, patch: Dict[str, Any], user_email: str) -> Optional[Dict[str, Any]]:
    cur = await get_one(db, action_id)
    if not cur:
        return None
    allowed = {k: v for k, v in patch.items() if k in {
        "action_required", "next_best_action", "suggested_owner", "assigned_to", "escalation_level",
        "priority_score", "risk_level", "action_status", "target_date", "remarks",
    } and v is not None}
    if "action_status" in allowed and allowed["action_status"] not in ALLOWED_STATUS:
        del allowed["action_status"]
    allowed["updated_at"] = _now_iso()
    allowed["updated_by"] = user_email
    if allowed.get("action_status") == "Closed":
        allowed["closed_at"] = _now_iso()
    upd: Dict[str, Any] = {"$set": allowed}
    if allowed.get("action_status") == "Reopened":
        upd["$unset"] = {"closed_at": ""}
    await db.action_tracker.update_one({"action_id": action_id}, upd)
    new_doc = await get_one(db, action_id)
    await _append_history(db, action_id=action_id, record_id=cur["record_id"], event_type="patch", old_value=cur, new_value=new_doc, remarks=patch.get("remarks") or "", changed_by=user_email)
    return new_doc


async def history_for_record(db: AsyncIOMotorDatabase, record_id: str) -> List[Dict[str, Any]]:
    return await db.action_history.find({"record_id": record_id}, {"_id": 0}).sort("changed_at", -1).to_list(500)


async def export_rows(db: AsyncIOMotorDatabase, filters: FilterParams) -> List[Dict[str, Any]]:
    data = await list_tracker(db, filters, page=1, limit=5000)
    return data.get("rows") or []
