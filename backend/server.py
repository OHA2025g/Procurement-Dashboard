"""FastAPI server — Procurement Analytics Dashboard."""
from __future__ import annotations
import os
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any
import json

from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Query, Body
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import io

from models import (
    User, UserCreate, UserLogin, TokenResponse, Role, ProcurementRecord,
    ProcurementUpdate, FilterParams, ApiResponse, Statement, Category, RiskLevel,
    AuditLogEntry,
)
from auth import (
    hash_password, verify_password, create_access_token, get_current_user,
    require_roles, user_can_access_page,
)
from etl import parse_workbook, parse_csv_bytes, data_quality_score
from kpi_registry import get_registry, get_kpi_entry
from kpi_engine import KPIEngine
from kpi_values import build_grouped_kpi_response, single_kpi_value
from action_tracker_service import (
    seed_from_procurement_if_empty,
    list_tracker,
    summary as action_tracker_summary,
    create_action as at_create,
    patch_action as at_patch,
    history_for_record as at_history,
    export_rows as action_tracker_export_rows,
)
from exports import (
    export_procurement_excel,
    export_executive_pdf,
    export_kpi_dictionary_excel,
    export_record_pdf,
    export_kpi_summary_excel,
    export_action_tracker_excel,
    export_drilldown_pdf,
    export_page_pdf,
    export_data_quality_excel,
)
from alerts import check_kpi_thresholds, run_escalation, smtp_configured
from scheduler import start_scheduler, stop_scheduler
from drilldown import (
    build_drill_match,
    aggregate_summary,
    aggregate_facets,
    fetch_records_page,
    fetch_top_items,
    scope_title_from_filters,
    enrich_record,
)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Mongo
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
mongo = AsyncIOMotorClient(MONGO_URL)
db = mongo[DB_NAME]

kpi = KPIEngine(db)

# App
app = FastAPI(title="Procurement Analytics API", version="1.0.0")
api = APIRouter(prefix="/api")

logger = logging.getLogger("procurement")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")


# ============================================================
# STARTUP: Seed users + data
# ============================================================

DEFAULT_USERS = [
    {"email": "viewer@maha.gov.in", "name": "Rajesh Patil", "role": Role.VIEWER, "department": None, "password": "Viewer@2026"},
    {"email": "minister@maha.gov.in", "name": "Shri. Amit Deshmukh (Minister PH)", "role": Role.MINISTER, "department": None, "password": "Minister@2026"},
    {"email": "secretary@maha.gov.in", "name": "Smt. Manisha Mhaiskar (Principal Secretary)", "role": Role.SECRETARY, "department": None, "password": "Secretary@2026"},
    {"email": "depthead@maha.gov.in", "name": "Dr. Sanjay Kulkarni (JDHS Mumbai)", "role": Role.DEPT_HEAD, "department": "Public Health Department", "password": "DeptHead@2026"},
    {"email": "finance@maha.gov.in", "name": "Pradeep Joshi (Finance Officer)", "role": Role.FINANCE_TEAM, "department": None, "password": "Finance@2026"},
    {"email": "audit@maha.gov.in", "name": "Sunita Rao (Audit Officer)", "role": Role.AUDIT_TEAM, "department": None, "password": "Audit@2026"},
    {"email": "admin@maha.gov.in", "name": "System Administrator", "role": Role.SUPER_ADMIN, "department": None, "password": "Admin@2026"},
]


@app.on_event("startup")
async def startup_event():
    # Indexes
    await db.procurement.create_index("statement")
    await db.procurement.create_index("department")
    await db.procurement.create_index("category")
    await db.procurement.create_index("current_status")
    await db.procurement.create_index("risk_level")
    await db.procurement.create_index("financial_year")
    await db.procurement.create_index([("procurement_value", -1)])
    await db.procurement.create_index([("priority_score", -1)])
    await db.procurement.create_index("batch_id")
    await db.procurement.create_index("record_id")
    await db.upload_batches.create_index("id", unique=True)
    await db.actions.create_index("record_id")
    await db.actions.create_index("batch_id")
    await db.audit_log.create_index("event_type")
    await db.users.create_index("email", unique=True)
    await db.action_tracker.create_index("action_id", unique=True)
    await db.action_tracker.create_index("record_id")
    await db.action_history.create_index("record_id")
    await db.action_history.create_index("action_id")

    # Seed users if empty
    existing_count = await db.users.count_documents({})
    if existing_count == 0:
        logger.info("Seeding default users")
        for u in DEFAULT_USERS:
            user_doc = {
                "id": __import__("uuid").uuid4().hex,
                "email": u["email"],
                "name": u["name"],
                "role": u["role"].value,
                "department": u["department"],
                "is_active": True,
                "password_hash": hash_password(u["password"]),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_login": None,
            }
            await db.users.insert_one(user_doc)

    # Seed procurement data if empty
    proc_count = await db.procurement.count_documents({})
    if proc_count == 0 and os.environ.get("SEED_DATA_ON_STARTUP", "true").lower() == "true":
        seed_path = os.environ.get("SEED_EXCEL_PATH", "/app/uploaded_data/abcd.xlsx")
        if Path(seed_path).exists():
            logger.info(f"Seeding procurement data from {seed_path}")
            records, stats = parse_workbook(seed_path)
            if records:
                await db.procurement.insert_many(records)
                logger.info(f"Seeded {len(records)} records | stats={stats}")
        else:
            logger.warning(f"Seed file not found: {seed_path}")

    seeded = await seed_from_procurement_if_empty(db)
    if seeded:
        logger.info(f"Seeded {seeded} action_tracker rows from procurement")

    # Start scheduler
    start_scheduler(db)


@app.on_event("shutdown")
async def shutdown_event():
    stop_scheduler()
    mongo.close()


# ============================================================
# AUTH
# ============================================================

@api.post("/auth/login", response_model=ApiResponse)
async def login(payload: UserLogin):
    user_doc = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user_doc or not verify_password(payload.password, user_doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user_doc.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is inactive")

    await db.users.update_one(
        {"email": payload.email.lower()},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    token = create_access_token(
        user_doc["id"], user_doc["email"], user_doc["role"],
        department=user_doc.get("department"),
    )
    safe_user = {k: v for k, v in user_doc.items() if k != "password_hash"}
    return ApiResponse(success=True, data={
        "access_token": token,
        "token_type": "bearer",
        "user": safe_user,
    })


@api.get("/auth/me", response_model=ApiResponse)
async def me(current=Depends(get_current_user)):
    user_doc = await db.users.find_one({"id": current["sub"]}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    return ApiResponse(success=True, data=user_doc)


# ============================================================
# FILTER HELPERS
# ============================================================

def parse_filters(
    fy: Optional[str] = None,
    department: Optional[str] = None,
    category: Optional[str] = None,
    risk_level: Optional[str] = None,
    statement: Optional[str] = None,
    value_min: Optional[float] = None,
    value_max: Optional[float] = None,
    procurement_status: Optional[str] = None,
    payment_status: Optional[str] = None,
    value_band: Optional[str] = None,
    batch_id: Optional[str] = None,
    data_source: Optional[str] = None,
    search: Optional[str] = None,
    action_type: Optional[str] = None,
    recovery_status: Optional[str] = None,
    official_decision_required: Optional[bool] = None,
    tender_stage: Optional[str] = None,
    current_user: Optional[dict] = None,
) -> FilterParams:
    f = FilterParams()
    if fy:
        f.financial_year = fy
    if department:
        f.departments = [department]
    if category:
        try:
            f.categories = [Category(category)]
        except ValueError:
            pass
    if risk_level:
        try:
            f.risk_levels = [RiskLevel(risk_level)]
        except ValueError:
            pass
    if statement:
        try:
            f.statements = [Statement(statement)]
        except ValueError:
            pass
    if value_min is not None:
        f.value_min = value_min
    if value_max is not None:
        f.value_max = value_max
    if procurement_status:
        f.current_statuses = [s.strip() for s in procurement_status.split(",") if s.strip()]
    if payment_status:
        f.payment_status = payment_status
    if value_band:
        f.value_band = value_band
    if batch_id:
        f.batch_id = batch_id
    if data_source:
        f.data_source = data_source
    if search:
        f.search = search
    if action_type:
        f.action_type = action_type
    if recovery_status:
        f.recovery_status = recovery_status
    if official_decision_required is not None:
        f.official_decision_required = official_decision_required
    if tender_stage:
        f.tender_stage = tender_stage
    # Row-level security: DEPT_HEAD restricted to own dept
    if current_user and current_user.get("role") == Role.DEPT_HEAD.value:
        user_doc_dept = current_user.get("department")
        if user_doc_dept:
            f.departments = [user_doc_dept]
    return f


def flatten_filter_params(f: FilterParams) -> Dict[str, Any]:
    d: Dict[str, Any] = {}
    if f.financial_year:
        d["fy"] = f.financial_year
    if f.departments:
        d["department"] = f.departments[0]
    if f.categories:
        d["category"] = f.categories[0].value
    if f.risk_levels:
        d["risk_level"] = f.risk_levels[0].value
    if f.statements:
        d["statement"] = f.statements[0].value
    if f.value_min is not None:
        d["value_min"] = f.value_min
    if f.value_max is not None:
        d["value_max"] = f.value_max
    if f.current_statuses:
        d["procurement_status"] = ",".join(f.current_statuses)
    if f.payment_status:
        d["payment_status"] = f.payment_status
    if f.value_band:
        d["value_band"] = f.value_band
    if f.batch_id:
        d["batch_id"] = f.batch_id
    if f.data_source:
        d["data_source"] = f.data_source
    if f.search:
        d["search"] = f.search
    if f.action_type:
        d["action_type"] = f.action_type
    if f.recovery_status:
        d["recovery_status"] = f.recovery_status
    if f.tender_stage:
        d["tender_stage"] = f.tender_stage
    if f.official_decision_required is not None:
        d["official_decision_required"] = f.official_decision_required
    return d


def parse_drill_json(raw: Optional[str]) -> Dict[str, Any]:
    if not raw or not str(raw).strip():
        return {}
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else {}
    except json.JSONDecodeError:
        return {}


async def write_audit_event(
    user: Optional[dict],
    event_type: str,
    event_name: str,
    details: Dict[str, Any],
):
    doc = {
        "log_id": __import__("uuid").uuid4().hex,
        "user_id": (user or {}).get("sub"),
        "user_email": (user or {}).get("email"),
        "event_type": event_type,
        "event_name": event_name,
        "details": details,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_log.insert_one(doc)


async def get_filter_params(
    fy: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    statement: Optional[str] = Query(None),
    value_min: Optional[float] = Query(None),
    value_max: Optional[float] = Query(None),
    procurement_status: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    value_band: Optional[str] = Query(None),
    batch_id: Optional[str] = Query(None),
    data_source: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    recovery_status: Optional[str] = Query(None),
    tender_stage: Optional[str] = Query(None),
    official_decision_required: Optional[bool] = Query(None),
    current=Depends(get_current_user),
) -> FilterParams:
    return parse_filters(
        fy, department, category, risk_level, statement, value_min, value_max,
        procurement_status, payment_status, value_band, batch_id, data_source, search,
        action_type, recovery_status, official_decision_required, tender_stage,
        current,
    )


# ============================================================
# KPI ROUTES
# ============================================================

@api.get("/kpi/executive")
async def get_executive(f: FilterParams = Depends(get_filter_params)):
    data = await kpi.executive(f)
    return ApiResponse(data=data)


@api.get("/kpi/statements")
async def get_statements(f: FilterParams = Depends(get_filter_params)):
    data = await kpi.statements(f)
    return ApiResponse(data=data)


@api.get("/kpi/payment")
async def get_payment(f: FilterParams = Depends(get_filter_params)):
    data = await kpi.po_payment(f)
    return ApiResponse(data=data)


@api.get("/kpi/tender")
async def get_tender(f: FilterParams = Depends(get_filter_params)):
    data = await kpi.tender(f)
    return ApiResponse(data=data)


@api.get("/kpi/backlog")
async def get_backlog(f: FilterParams = Depends(get_filter_params)):
    data = await kpi.backlog(f)
    return ApiResponse(data=data)


@api.get("/kpi/risk")
async def get_risk(f: FilterParams = Depends(get_filter_params)):
    data = await kpi.risk(f)
    return ApiResponse(data=data)


@api.get("/kpi/category")
async def get_category(f: FilterParams = Depends(get_filter_params)):
    data = await kpi.category_summary(f)
    return ApiResponse(data=data)


@api.get("/kpi/department")
async def get_department(f: FilterParams = Depends(get_filter_params)):
    data = await kpi.department_summary(f)
    return ApiResponse(data=data)


@api.get("/kpi/governance")
async def get_governance(f: FilterParams = Depends(get_filter_params)):
    data = await kpi.governance(f)
    return ApiResponse(data=data)


# ============================================================
# KPI REGISTRY & V2 AGGREGATES (additive; legacy /kpi/* unchanged)
# ============================================================

@api.get("/kpi-dictionary")
async def kpi_dictionary(current=Depends(get_current_user)):
    return ApiResponse(data=get_registry())


@api.get("/kpis/registry")
async def kpis_registry(current=Depends(get_current_user)):
    return ApiResponse(data={"count": len(get_registry()), "items": get_registry()})


@api.get("/kpis/all")
async def kpis_all(f: FilterParams = Depends(get_filter_params)):
    bundles = await kpi.kpis_all_bundles(f)
    catd = await kpi.category_department_kpis(f)
    bundles["category_department"] = catd
    return ApiResponse(data=bundles)


@api.get("/kpis/category-department")
async def kpis_cat_dept(f: FilterParams = Depends(get_filter_params)):
    data = await kpi.category_department_kpis(f)
    return ApiResponse(data=data)


@api.get("/kpis/all-values")
async def kpis_all_values(f: FilterParams = Depends(get_filter_params)):
    data = await build_grouped_kpi_response(kpi, f)
    return ApiResponse(data=data, meta={"applied_filters": flatten_filter_params(f)})


@api.get("/kpis/{kpi_id}/value")
async def kpi_single_value(kpi_id: str, f: FilterParams = Depends(get_filter_params)):
    data = await single_kpi_value(kpi, kpi_id, f)
    kid = kpi_id.strip().upper()
    if not kid.startswith("KPI-"):
        kid = f"KPI-{kid.zfill(3)}" if kid.replace("-", "").isdigit() else f"KPI-{kid}"
    meta = get_kpi_entry(kid)
    return ApiResponse(data=data, meta={"registry": meta})


@api.get("/kpis/executive")
async def kpis_executive_alias(f: FilterParams = Depends(get_filter_params)):
    return ApiResponse(data=await kpi.executive(f))


@api.get("/kpis/statements")
async def kpis_statements_alias(f: FilterParams = Depends(get_filter_params)):
    return ApiResponse(data=await kpi.statements(f))


@api.get("/kpis/payment")
async def kpis_payment_alias(f: FilterParams = Depends(get_filter_params)):
    return ApiResponse(data=await kpi.po_payment(f))


@api.get("/kpis/tender")
async def kpis_tender_alias(f: FilterParams = Depends(get_filter_params)):
    return ApiResponse(data=await kpi.tender(f))


@api.get("/kpis/backlog")
async def kpis_backlog_alias(f: FilterParams = Depends(get_filter_params)):
    return ApiResponse(data=await kpi.backlog(f))


@api.get("/kpis/risk")
async def kpis_risk_alias(f: FilterParams = Depends(get_filter_params)):
    return ApiResponse(data=await kpi.risk(f))


# ============================================================
# ACTIONS
# ============================================================

@api.get("/procurement/action-queue")
async def procurement_action_queue(
    risk_only: bool = False,
    page: int = 1,
    limit: int = 100,
    f: FilterParams = Depends(get_filter_params),
):
    """Priority-ranked procurement rows with action_required (legacy Statements tab)."""
    data = await kpi.actions(f, risk_only=risk_only, limit=limit, page=page)
    return ApiResponse(data=data, meta={"page": page, "limit": limit})


@api.get("/actions")
async def list_actions(
    page: int = 1,
    limit: int = 100,
    risk_only: bool = False,
    f: FilterParams = Depends(get_filter_params),
):
    summ = await action_tracker_summary(db, f, risk_only=risk_only)
    rows = await list_tracker(db, f, page=page, limit=limit, risk_only=risk_only)
    return ApiResponse(data={**summ, **rows}, meta={"page": page, "limit": limit})


@api.get("/actions/summary")
async def actions_summary_api(
    risk_only: bool = False,
    f: FilterParams = Depends(get_filter_params),
):
    return ApiResponse(data=await action_tracker_summary(db, f, risk_only=risk_only))


@api.post("/actions")
async def actions_create(
    payload: Dict[str, Any] = Body(...),
    current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY, Role.DEPT_HEAD, Role.FINANCE_TEAM)),
):
    try:
        doc = await at_create(db, payload, current.get("email", ""))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await write_audit_event(current, "action_tracker", "create", {"action_id": doc.get("action_id")})
    return ApiResponse(data=doc)


@api.patch("/actions/{action_id}")
async def actions_patch(
    action_id: str,
    payload: Dict[str, Any] = Body(...),
    current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY, Role.DEPT_HEAD, Role.FINANCE_TEAM)),
):
    doc = await at_patch(db, action_id, payload, current.get("email", ""))
    if not doc:
        raise HTTPException(status_code=404, detail="Action not found")
    await write_audit_event(current, "action_tracker", "patch", {"action_id": action_id})
    return ApiResponse(data=doc)


@api.post("/actions/{action_id}/assign")
async def actions_assign(
    action_id: str,
    payload: Dict[str, Any] = Body(...),
    current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY, Role.DEPT_HEAD, Role.FINANCE_TEAM)),
):
    doc = await at_patch(db, action_id, {
        "assigned_to": payload.get("assigned_to"),
        "remarks": payload.get("remarks"),
    }, current.get("email", ""))
    if not doc:
        raise HTTPException(status_code=404, detail="Action not found")
    return ApiResponse(data=doc)


@api.post("/actions/{action_id}/status")
async def actions_status(
    action_id: str,
    payload: Dict[str, Any] = Body(...),
    current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY, Role.DEPT_HEAD, Role.FINANCE_TEAM)),
):
    doc = await at_patch(db, action_id, {
        "action_status": payload.get("action_status"),
        "remarks": payload.get("remarks"),
    }, current.get("email", ""))
    if not doc:
        raise HTTPException(status_code=404, detail="Action not found")
    return ApiResponse(data=doc)


@api.post("/actions/{action_id}/escalate")
async def actions_escalate(
    action_id: str,
    payload: Dict[str, Any] = Body(...),
    current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY, Role.DEPT_HEAD)),
):
    doc = await at_patch(db, action_id, {
        "escalation_level": payload.get("escalation_level"),
        "action_status": "Escalated",
        "remarks": payload.get("remarks"),
    }, current.get("email", ""))
    if not doc:
        raise HTTPException(status_code=404, detail="Action not found")
    return ApiResponse(data=doc)


@api.post("/actions/{action_id}/close")
async def actions_close(
    action_id: str,
    payload: Dict[str, Any] = Body(...),
    current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY, Role.DEPT_HEAD, Role.FINANCE_TEAM)),
):
    doc = await at_patch(db, action_id, {
        "action_status": "Closed",
        "remarks": payload.get("remarks"),
    }, current.get("email", ""))
    if not doc:
        raise HTTPException(status_code=404, detail="Action not found")
    return ApiResponse(data=doc)


@api.post("/actions/{action_id}/reopen")
async def actions_reopen(
    action_id: str,
    payload: Dict[str, Any] = Body(...),
    current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY, Role.DEPT_HEAD, Role.FINANCE_TEAM)),
):
    doc = await at_patch(db, action_id, {
        "action_status": "Reopened",
        "closed_at": None,
        "remarks": payload.get("remarks"),
    }, current.get("email", ""))
    if not doc:
        raise HTTPException(status_code=404, detail="Action not found")
    return ApiResponse(data=doc)


@api.get("/actions/for-record/{record_id}")
async def action_for_record(record_id: str, current=Depends(get_current_user)):
    doc = await db.action_tracker.find_one({"record_id": record_id}, {"_id": 0})
    return ApiResponse(data=doc)


@api.get("/actions/history/{record_id}")
async def actions_history(record_id: str, current=Depends(get_current_user)):
    return ApiResponse(data=await at_history(db, record_id))


@api.get("/workflow/actions")
async def workflow_actions_list(limit: int = 200, current=Depends(get_current_user)):
    docs = await db.actions.find({}, {"_id": 0}).sort("updated_at", -1).to_list(limit)
    return ApiResponse(data=docs)


@api.post("/workflow/actions")
async def workflow_actions_upsert(
    payload: Dict[str, Any] = Body(...),
    current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY, Role.DEPT_HEAD)),
):
    rid = payload.get("record_id")
    if not rid:
        raise HTTPException(status_code=400, detail="record_id required")
    aid = payload.get("id") or str(uuid.uuid4())
    doc = {
        "id": aid,
        "record_id": rid,
        "title": (payload.get("title") or "")[:400],
        "status": payload.get("status") or "open",
        "owner": payload.get("owner"),
        "due_date": payload.get("due_date"),
        "notes": payload.get("notes"),
        "batch_id": payload.get("batch_id"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current.get("email"),
    }
    await db.actions.update_one({"record_id": rid}, {"$set": doc}, upsert=True)
    await write_audit_event(current, "action", "workflow_upsert", {"record_id": rid, "status": doc["status"]})
    return ApiResponse(data=doc)


@api.get("/records/{record_id}")
async def get_record(record_id: str, current=Depends(get_current_user)):
    doc = await db.procurement.find_one(
        {"$or": [{"id": record_id}, {"record_id": record_id}]},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return ApiResponse(data=enrich_record(doc))


@api.get("/drilldown/records")
async def drilldown_records(
    f: FilterParams = Depends(get_filter_params),
    current_status: Optional[str] = None,
    kpi_preset: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    drill: Optional[str] = Query(None, description="JSON drill overlay (KPI registry presets)"),
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "desc",
    page: int = 1,
    page_size: int = 25,
    current=Depends(get_current_user),
):
    m = build_drill_match(
        f,
        current_status=current_status,
        payment_status=f.payment_status,
        value_band_param=f.value_band,
        action_type=f.action_type,
        search=f.search,
        kpi_preset=kpi_preset,
        min_value=min_value,
        max_value=max_value,
        drill_dict=parse_drill_json(drill),
    )
    records, total = await fetch_records_page(
        db.procurement, m, page=page, page_size=page_size, sort_by=sort_by, sort_order=sort_order
    )
    summ = await aggregate_summary(db.procurement, m)
    base_applied = flatten_filter_params(f)
    applied = {
        **base_applied,
        **{k: v for k, v in {
            "current_status": current_status,
            "kpi_preset": kpi_preset,
            "min_value": min_value,
            "max_value": max_value,
        }.items() if v is not None and v != ""},
    }
    total_pages = max(1, (total + page_size - 1) // page_size) if page_size else 1
    return ApiResponse(
        data={
            "records": records,
            "summary": summ,
            "total_records": total,
            "total_value": summ["total_value"],
            "total_po_value": summ["po_value"],
            "total_paid_amount": summ["paid_amount"],
            "total_outstanding_amount": summ["outstanding_amount"],
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "applied_filters": applied,
        }
    )


@api.get("/drilldown/summary")
async def drilldown_summary(
    f: FilterParams = Depends(get_filter_params),
    current_status: Optional[str] = None,
    kpi_preset: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    drill: Optional[str] = Query(None),
    current=Depends(get_current_user),
):
    m = build_drill_match(
        f,
        current_status=current_status,
        payment_status=f.payment_status,
        value_band_param=f.value_band,
        action_type=f.action_type,
        search=f.search,
        kpi_preset=kpi_preset,
        min_value=min_value,
        max_value=max_value,
        drill_dict=parse_drill_json(drill),
    )
    summ = await aggregate_summary(db.procurement, m)
    applied = {**flatten_filter_params(f), **{k: v for k, v in {
        "current_status": current_status, "kpi_preset": kpi_preset,
        "min_value": min_value, "max_value": max_value,
    }.items() if v is not None and v != ""}}
    stmt = f.statements[0].value if f.statements else None
    title = scope_title_from_filters({**applied, "statement": stmt} if stmt else applied)
    return ApiResponse(
        data={
            "scope_title": title,
            "applied_filters": applied,
            **summ,
        }
    )


@api.get("/drilldown/facets")
async def drilldown_facets(
    f: FilterParams = Depends(get_filter_params),
    current_status: Optional[str] = None,
    kpi_preset: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    drill: Optional[str] = Query(None),
    current=Depends(get_current_user),
):
    m = build_drill_match(
        f,
        current_status=current_status,
        payment_status=f.payment_status,
        value_band_param=f.value_band,
        action_type=f.action_type,
        search=f.search,
        kpi_preset=kpi_preset,
        min_value=min_value,
        max_value=max_value,
        drill_dict=parse_drill_json(drill),
    )
    facets = await aggregate_facets(db.procurement, m)
    actions_sample = await db.procurement.distinct("action_required", m)
    facets["action_types"] = [a for a in actions_sample if a][:40]
    return ApiResponse(data=facets)


@api.get("/drilldown/top-items")
async def drilldown_top_items(
    f: FilterParams = Depends(get_filter_params),
    current_status: Optional[str] = None,
    kpi_preset: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    drill: Optional[str] = Query(None),
    metric: str = "value",
    limit: int = 10,
    current=Depends(get_current_user),
):
    m = build_drill_match(
        f,
        current_status=current_status,
        payment_status=f.payment_status,
        value_band_param=f.value_band,
        action_type=f.action_type,
        search=f.search,
        kpi_preset=kpi_preset,
        min_value=min_value,
        max_value=max_value,
        drill_dict=parse_drill_json(drill),
    )
    items = await fetch_top_items(db.procurement, m, metric=metric, limit=limit)
    return ApiResponse(data={"items": items, "metric": metric, "applied_filters": flatten_filter_params(f)})


@api.put("/records/{record_id}")
async def update_record(
    record_id: str, payload: ProcurementUpdate,
    current=Depends(require_roles(Role.SUPER_ADMIN, Role.FINANCE_TEAM, Role.SECRETARY, Role.DEPT_HEAD))
):
    existing = await db.procurement.find_one(
        {"$or": [{"id": record_id}, {"record_id": record_id}]},
        {"_id": 0},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    rid = existing.get("id")
    changes = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not changes:
        return ApiResponse(data=existing)
    # Recompute outstanding if needed
    if "paid_amount" in changes or "po_value" in changes:
        po = changes.get("po_value", existing.get("po_value", 0))
        paid = changes.get("paid_amount", existing.get("paid_amount", 0))
        changes["outstanding_amount"] = round(max(0, po - paid), 4)
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.procurement.update_one({"id": rid}, {"$set": changes})

    # Audit
    audit = AuditLogEntry(
        entity_type="procurement", entity_id=rid, action="update",
        changed_by=current["sub"], changed_by_email=current.get("email", ""),
        old_values={k: existing.get(k) for k in changes.keys() if k in existing},
        new_values=changes,
    )
    audit_doc = audit.model_dump()
    audit_doc["changed_at"] = audit_doc["changed_at"].isoformat()
    await db.audit_log.insert_one(audit_doc)

    updated = await db.procurement.find_one({"id": rid}, {"_id": 0})
    return ApiResponse(data=updated)


@api.post("/records/{record_id}/escalate")
async def escalate_record(
    record_id: str,
    current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY, Role.AUDIT_TEAM))
):
    existing = await db.procurement.find_one({"id": record_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Record not found")
    new_level = (existing.get("escalation_level") or 0) + 1
    await db.procurement.update_one(
        {"id": record_id},
        {"$set": {"escalation_level": new_level,
                  "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return ApiResponse(data={"id": record_id, "escalation_level": new_level})


# ============================================================
# ADMIN: UPLOAD
# ============================================================


async def _sync_actions_from_procurement_records(records: List[Dict[str, Any]], batch_id: Optional[str]):
    for r in records:
        rid = r.get("id")
        if not rid:
            continue
        act_id = str(uuid.uuid4())
        await db.actions.update_one(
            {"record_id": rid},
            {"$set": {
                "id": act_id,
                "record_id": rid,
                "batch_id": batch_id,
                "title": (r.get("action_required") or "")[:300],
                "status": "open",
                "department": r.get("department"),
                "value_cr": r.get("procurement_value"),
                "risk_level": r.get("risk_level"),
                "current_status": r.get("current_status"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )


@api.post("/admin/upload")
async def upload_excel(
    file: UploadFile = File(...),
    replace: bool = Query(False, description="Replace existing data"),
    current=Depends(require_roles(Role.SUPER_ADMIN))
):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx/.xls supported")
    # Save
    upload_dir = Path("/tmp/procurement_uploads")
    upload_dir.mkdir(exist_ok=True)
    fp = upload_dir / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
    content = await file.read()
    fp.write_bytes(content)

    records, stats = parse_workbook(str(fp))

    if replace and records:
        await db.procurement.delete_many({})
    if records:
        ts = datetime.now(timezone.utc).isoformat()
        bid = __import__("uuid").uuid4().hex
        for r in records:
            r["batch_id"] = bid
            r["record_id"] = r.get("id")
            r["upload_date"] = ts
        await db.procurement.insert_many(records)
        await _sync_actions_from_procurement_records(records, bid)

    await db.ingestion_log.insert_one({
        "id": __import__("uuid").uuid4().hex,
        "file_name": file.filename,
        "uploaded_by": current.get("email"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
        "records_inserted": len(records),
        "replaced": replace,
    })

    # Trigger alert check post-ingest
    alerts = []
    if records:
        try:
            alerts = await check_kpi_thresholds(db)
        except Exception as e:
            logger.error(f"Post-upload alert check failed: {e}")

    await write_audit_event(current, "upload", "legacy_excel", {"rows": len(records), "replaced": replace})
    return ApiResponse(data={"stats": stats, "records_inserted": len(records),
                              "replaced": replace, "alerts_triggered": len(alerts)})


@api.post("/admin/upload/preview")
async def admin_upload_preview(
    file: UploadFile = File(...),
    current=Depends(require_roles(Role.SUPER_ADMIN)),
):
    upload_dir = Path("/tmp/procurement_uploads")
    upload_dir.mkdir(exist_ok=True)
    batch_id = uuid.uuid4().hex
    ext = Path(file.filename or "f").suffix.lower()
    fp = upload_dir / f"{batch_id}{ext}"
    content = await file.read()
    fp.write_bytes(content)

    if ext == ".csv":
        records, stats = parse_csv_bytes(content, batch_id=batch_id, source_name=file.filename or "upload.csv")
    elif ext in (".xlsx", ".xls"):
        records, stats = parse_workbook(str(fp))
        ts = datetime.now(timezone.utc).isoformat()
        for r in records:
            r["batch_id"] = batch_id
            r["record_id"] = r.get("id")
            r["upload_date"] = ts
    else:
        raise HTTPException(status_code=400, detail="Use .csv, .xlsx, or .xls")

    score = data_quality_score(stats, len(records))
    preview = records[:50]
    await db.upload_batches.insert_one({
        "id": batch_id,
        "status": "pending",
        "filename": file.filename,
        "temp_path": str(fp),
        "stats": stats,
        "data_quality_score": score,
        "row_count": len(records),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current.get("email"),
    })
    return ApiResponse(data={
        "batch_id": batch_id,
        "stats": stats,
        "data_quality_score": score,
        "preview": preview,
        "row_count": len(records),
    })


@api.post("/admin/upload/commit")
async def admin_upload_commit(
    payload: Dict[str, Any] = Body(...),
    current=Depends(require_roles(Role.SUPER_ADMIN)),
):
    batch_id = payload.get("batch_id")
    replace = bool(payload.get("replace", False))
    if not batch_id:
        raise HTTPException(status_code=400, detail="batch_id required")
    meta = await db.upload_batches.find_one({"id": batch_id})
    if not meta or meta.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Invalid or expired batch")
    path = Path(meta["temp_path"])
    ext = path.suffix.lower()
    if ext == ".csv":
        records, stats = parse_csv_bytes(path.read_bytes(), batch_id=batch_id, source_name=meta.get("filename") or "x.csv")
    elif ext in (".xlsx", ".xls"):
        records, stats = parse_workbook(str(path))
        ts = datetime.now(timezone.utc).isoformat()
        for r in records:
            r["batch_id"] = batch_id
            r["record_id"] = r.get("id")
            r["upload_date"] = ts
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    if replace and records:
        await db.procurement.delete_many({})
    if records:
        await db.procurement.insert_many(records)
    await _sync_actions_from_procurement_records(records, batch_id)
    score = data_quality_score(stats, len(records))
    await db.upload_batches.update_one({"id": batch_id}, {"$set": {
        "status": "committed",
        "committed_at": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
        "data_quality_score": score,
        "records_inserted": len(records),
    }})
    await write_audit_event(current, "upload", "commit", {"batch_id": batch_id, "rows": len(records)})
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass
    return ApiResponse(data={"batch_id": batch_id, "records_inserted": len(records), "stats": stats})


@api.get("/admin/upload-batches")
async def list_upload_batches(current=Depends(require_roles(Role.SUPER_ADMIN))):
    docs = await db.upload_batches.find({}, {"_id": 0}).sort("created_at", -1).to_list(80)
    return ApiResponse(data=docs)


@api.delete("/admin/upload-batches/{batch_id}")
async def delete_upload_batch(batch_id: str, current=Depends(require_roles(Role.SUPER_ADMIN))):
    res = await db.procurement.delete_many({"batch_id": batch_id})
    await db.actions.delete_many({"batch_id": batch_id})
    await db.upload_batches.delete_many({"id": batch_id})
    await write_audit_event(
        current, "upload", "rollback",
        {"batch_id": batch_id, "deleted_procurement": res.deleted_count},
    )
    return ApiResponse(data={"deleted_procurement": res.deleted_count})


@api.get("/admin/data-quality/{batch_id}")
async def admin_data_quality(batch_id: str, current=Depends(require_roles(Role.SUPER_ADMIN))):
    meta = await db.upload_batches.find_one({"id": batch_id}, {"_id": 0})
    if not meta:
        raise HTTPException(status_code=404, detail="Unknown batch")
    return ApiResponse(data=meta)


@api.get("/admin/uploads")
async def list_uploads(current=Depends(require_roles(Role.SUPER_ADMIN))):
    docs = await db.ingestion_log.find({}, {"_id": 0}).sort("uploaded_at", -1).to_list(50)
    return ApiResponse(data=docs)


@api.get("/admin/users")
async def list_users(current=Depends(require_roles(Role.SUPER_ADMIN))):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(200)
    return ApiResponse(data=docs)


# ============================================================
# FILTERS / META
# ============================================================

@api.get("/meta/filters")
async def meta_filters(current=Depends(get_current_user)):
    depts = await kpi.departments_list()
    fys = await kpi.financial_years_list()
    return ApiResponse(data={
        "departments": depts,
        "financial_years": fys,
        "categories": ["Medicine", "Equipment", "Consumables", "Services", "Others"],
        "risk_levels": ["Critical", "High", "Medium", "Low"],
        "statements": [
            {"code": "A", "label": "A — PO Issued"},
            {"code": "B", "label": "B — Tender Under Process"},
            {"code": "C", "label": "C — Awaited / Retender"},
            {"code": "D", "label": "D — Expired / Cancelled"},
        ],
    })


# ============================================================
# EXPORTS
# ============================================================

@api.get("/export/drill/excel")
async def export_drill_excel(
    f: FilterParams = Depends(get_filter_params),
    current_status: Optional[str] = None,
    kpi_preset: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    drill: Optional[str] = Query(None),
    current=Depends(get_current_user),
):
    m = build_drill_match(
        f,
        current_status=current_status,
        payment_status=f.payment_status,
        value_band_param=f.value_band,
        action_type=f.action_type,
        search=f.search,
        kpi_preset=kpi_preset,
        min_value=min_value,
        max_value=max_value,
        drill_dict=parse_drill_json(drill),
    )
    records = await db.procurement.find(m, {"_id": 0}).to_list(10000)
    content = export_procurement_excel(records)
    fname = f"procurement_drilldown_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    await write_audit_event(current, "export", "drill_excel", {"filters": flatten_filter_params(f)})
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/export/excel")
async def export_excel(
    f: FilterParams = Depends(get_filter_params),
    current=Depends(get_current_user),
):
    from kpi_engine import build_match
    match = build_match(f)
    records = await db.procurement.find(match, {"_id": 0}).to_list(10000)
    content = export_procurement_excel(records)
    fname = f"procurement_register_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    await write_audit_event(current, "export", "register_excel", {"filters": flatten_filter_params(f)})
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/export/pdf")
async def export_pdf(
    f: FilterParams = Depends(get_filter_params),
    current=Depends(get_current_user),
):
    exec_data = await kpi.executive(f)
    stmt_data = await kpi.statements(f)
    dept_data = await kpi.department_summary(f)
    risk_data = await kpi.risk(f)
    fd = flatten_filter_params(f)
    parts = []
    if fd.get("fy"):
        parts.append(f"FY {fd['fy']}")
    if fd.get("department"):
        parts.append(str(fd["department"]))
    if fd.get("category"):
        parts.append(str(fd["category"]))
    if fd.get("risk_level"):
        parts.append(f"Risk: {fd['risk_level']}")
    desc = " · ".join(parts) if parts else "All data (no filters)"
    content = export_executive_pdf(exec_data, stmt_data, dept_data, risk_data, filters_desc=desc)
    fname = f"procurement_executive_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    await write_audit_event(current, "export", "executive_pdf", {"filters": fd})
    return StreamingResponse(
        io.BytesIO(content), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/export/kpi-dictionary/excel")
async def export_kpi_dictionary_xlsx(current=Depends(get_current_user)):
    content = export_kpi_dictionary_excel(get_registry())
    fname = f"kpi_dictionary_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    await write_audit_event(current, "export", "kpi_dictionary_excel", {})
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/export/kpi-summary/excel")
async def export_kpi_summary_xlsx(
    f: FilterParams = Depends(get_filter_params),
    current=Depends(get_current_user),
):
    bundle = await build_grouped_kpi_response(kpi, f)
    fd = flatten_filter_params(f)
    content = export_kpi_summary_excel(bundle.get("items") or [], fd)
    fname = f"kpi_summary_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    await write_audit_event(current, "export", "kpi_summary_excel", {"filters": fd})
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/export/action-tracker/excel")
async def export_action_tracker_xlsx(
    f: FilterParams = Depends(get_filter_params),
    current=Depends(get_current_user),
):
    rows = await action_tracker_export_rows(db, f)
    fd = flatten_filter_params(f)
    content = export_action_tracker_excel(rows, fd)
    fname = f"action_tracker_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    await write_audit_event(current, "export", "action_tracker_excel", {"filters": fd})
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/export/drilldown/pdf")
async def export_drilldown_pdf_route(
    f: FilterParams = Depends(get_filter_params),
    current_status: Optional[str] = None,
    kpi_preset: Optional[str] = None,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    drill: Optional[str] = Query(None),
    current=Depends(get_current_user),
):
    m = build_drill_match(
        f,
        current_status=current_status,
        payment_status=f.payment_status,
        value_band_param=f.value_band,
        action_type=f.action_type,
        search=f.search,
        kpi_preset=kpi_preset,
        min_value=min_value,
        max_value=max_value,
        drill_dict=parse_drill_json(drill),
    )
    summ = await aggregate_summary(db.procurement, m)
    top_v = await fetch_top_items(db.procurement, m, metric="value", limit=10)
    top_r = await fetch_top_items(db.procurement, m, metric="risk", limit=10)
    fd = flatten_filter_params(f)
    title = scope_title_from_filters({**fd, "current_status": current_status, "kpi_preset": kpi_preset})
    content = export_drilldown_pdf(title, {**fd, "drill": drill}, summ, top_v, top_r)
    fname = f"drilldown_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    await write_audit_event(current, "export", "drilldown_pdf", {"filters": fd})
    return StreamingResponse(io.BytesIO(content), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@api.get("/export/page/pdf")
async def export_page_pdf_route(
    page: str = Query("executive", description="executive|payment|tender|backlog|risk|actions"),
    f: FilterParams = Depends(get_filter_params),
    current=Depends(get_current_user),
):
    fd = flatten_filter_params(f)
    block: Dict[str, Any] = {}
    narrative = ""
    p = (page or "executive").lower()
    if p == "executive":
        block = await kpi.executive(f)
    elif p == "payment":
        block = await kpi.po_payment(f)
    elif p == "tender":
        block = await kpi.tender(f)
    elif p == "backlog":
        block = await kpi.backlog(f)
    elif p == "risk":
        block = await kpi.risk(f)
    elif p == "actions":
        block = await action_tracker_summary(db, f)
        narrative = "Action tracker summary export."
    content = export_page_pdf(p, fd, block, narrative)
    fname = f"page_{p}_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    await write_audit_event(current, "export", "page_pdf", {"page": p, "filters": fd})
    return StreamingResponse(io.BytesIO(content), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@api.get("/export/data-quality/{batch_id}/excel")
async def export_data_quality_xlsx(batch_id: str, current=Depends(require_roles(Role.SUPER_ADMIN))):
    meta = await db.upload_batches.find_one({"id": batch_id}, {"_id": 0})
    if not meta:
        raise HTTPException(status_code=404, detail="Unknown batch")
    content = export_data_quality_excel(meta)
    fname = f"data_quality_{batch_id}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api.get("/export/record/pdf")
async def export_record_pdf_route(
    record_id: str = Query(..., description="Record id or record_id"),
    current=Depends(get_current_user),
):
    doc = await db.procurement.find_one(
        {"$or": [{"id": record_id}, {"record_id": record_id}]},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    from record_normalization import normalize_record
    enriched = normalize_record(doc)
    label = current.get("email") or ""
    content = export_record_pdf(enriched, title="Procurement record detail", user_label=label)
    fname = f"record_{record_id}_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
    await write_audit_event(current, "export", "record_pdf", {"record_id": record_id})
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ============================================================
# ALERTS & NOTIFICATIONS
# ============================================================

@api.get("/alerts")
async def list_alerts(
    limit: int = 50,
    unresolved: bool = False,
    current=Depends(get_current_user),
):
    q: Dict[str, Any] = {}
    if unresolved:
        q["resolved_at"] = None
    docs = await db.alert_log.find(q, {"_id": 0}).sort("triggered_at", -1).to_list(limit)
    unread = await db.alert_log.count_documents({"resolved_at": None})
    return ApiResponse(data={"alerts": docs, "unread_count": unread,
                              "smtp_configured": smtp_configured()})


@api.put("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, current=Depends(get_current_user)):
    res = await db.alert_log.update_one(
        {"id": alert_id},
        {"$set": {"resolved_at": datetime.now(timezone.utc).isoformat(),
                  "resolved_by": current.get("email")}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return ApiResponse(data={"id": alert_id, "resolved": True})


@api.post("/alerts/run-check")
async def run_alert_check_now(current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY))):
    triggered = await check_kpi_thresholds(db)
    return ApiResponse(data={"triggered": len(triggered), "alerts": triggered})


@api.post("/alerts/run-escalation")
async def run_escalation_now(current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY))):
    bumped = await run_escalation(db)
    return ApiResponse(data=bumped)


@api.get("/notifications/prefs")
async def get_notif_prefs(current=Depends(get_current_user)):
    user_doc = await db.users.find_one({"id": current["sub"]}, {"_id": 0, "notif_email": 1, "notif_inapp": 1})
    return ApiResponse(data={
        "email": user_doc.get("notif_email", True) if user_doc else True,
        "in_app": user_doc.get("notif_inapp", True) if user_doc else True,
    })


@api.put("/notifications/prefs")
async def set_notif_prefs(prefs: Dict[str, bool], current=Depends(get_current_user)):
    update = {}
    if "email" in prefs:
        update["notif_email"] = bool(prefs["email"])
    if "in_app" in prefs:
        update["notif_inapp"] = bool(prefs["in_app"])
    if update:
        await db.users.update_one({"id": current["sub"]}, {"$set": update})
    return ApiResponse(data=update)


@api.get("/escalation/log")
async def escalation_log(
    limit: int = 100,
    current=Depends(require_roles(Role.SUPER_ADMIN, Role.SECRETARY, Role.AUDIT_TEAM)),
):
    docs = await db.escalation_log.find({}, {"_id": 0}).sort("escalated_at", -1).to_list(limit)
    return ApiResponse(data=docs)


# ============================================================
# HEALTH
# ============================================================

@api.get("/health")
async def health():
    try:
        count = await db.procurement.count_documents({})
        users_count = await db.users.count_documents({})
        return ApiResponse(data={
            "status": "ok", "db": "connected",
            "procurement_records": count, "users": users_count,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        return ApiResponse(success=False, error={"message": str(e)})


@api.get("/")
async def root():
    return {"service": "Procurement Analytics API", "version": "1.0.0"}


# Mount router
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
