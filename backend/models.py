"""Pydantic models + enums for Procurement Analytics."""
from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List, Dict, Any
import uuid

from pydantic import BaseModel, Field, ConfigDict, EmailStr


# ========== ENUMS ==========

class Statement(str, Enum):
    A = "A"  # PO Issued - active execution
    B = "B"  # Tender Under Process - pipeline
    C = "C"  # Awaited Publish / Retender - backlog
    D = "D"  # Expired / Returned / Cancelled - inactive/failed


class Category(str, Enum):
    EQUIPMENT = "Equipment"
    MEDICINE = "Medicine"
    CONSUMABLES = "Consumables"
    SERVICES = "Services"
    OTHERS = "Others"


class Status(str, Enum):
    PO_ISSUED = "PO_Issued"
    TENDER_UNDER_PROCESS = "Tender_Under_Process"
    AWAITED_PUBLISH = "Awaited_Publish"
    RETENDER = "Retender"
    EXPIRED = "Expired"
    RETURNED = "Returned"
    CANCELLED = "Cancelled"
    CLOSED = "Closed"


class RiskLevel(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class Role(str, Enum):
    VIEWER = "VIEWER"
    MINISTER = "MINISTER"
    SECRETARY = "SECRETARY"
    DEPT_HEAD = "DEPT_HEAD"
    FINANCE_TEAM = "FINANCE_TEAM"
    AUDIT_TEAM = "AUDIT_TEAM"
    SUPER_ADMIN = "SUPER_ADMIN"


# ========== USER MODELS ==========

class UserBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    email: EmailStr
    name: str
    role: Role
    department: Optional[str] = None
    is_active: bool = True


class UserCreate(UserBase):
    password: str


class User(UserBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


# ========== PROCUREMENT RECORD ==========

class ProcurementRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    record_id: Optional[str] = None  # mirror of id for external APIs
    batch_id: Optional[str] = None
    upload_date: Optional[str] = None
    statement: Statement
    department: str
    bureau: Optional[str] = None
    category: Category
    item_description: str
    procurement_value: float  # in ₹ Crore
    po_value: float = 0.0  # in ₹ Crore
    paid_amount: float = 0.0  # in ₹ Crore
    outstanding_amount: float = 0.0  # computed: po_value - paid_amount
    current_status: Status
    risk_level: RiskLevel = RiskLevel.LOW
    action_required: str = ""
    priority_score: float = 0.0
    days_pending: int = 0
    financial_year: str = "2024-25"
    budget_source: Optional[str] = None
    po_number: Optional[str] = None
    tender_number: Optional[str] = None
    proposal_date: Optional[str] = None
    approval_date: Optional[str] = None
    assigned_to: Optional[str] = None
    escalation_level: int = 0
    escalation_level_label: Optional[str] = None
    due_date: Optional[str] = None
    remarks: Optional[str] = None
    data_source: Optional[str] = None
    tender_stage: Optional[str] = None
    recovery_status: Optional[str] = None
    official_decision_required: bool = False
    payment_status_cached: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProcurementUpdate(BaseModel):
    current_status: Optional[Status] = None
    paid_amount: Optional[float] = None
    po_value: Optional[float] = None
    action_required: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    remarks: Optional[str] = None
    escalation_level: Optional[int] = None


# ========== AUDIT / ALERT / ESCALATION ==========

class AuditLogEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_type: str
    entity_id: str
    action: str
    changed_by: str
    changed_by_email: str
    changed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    old_values: Dict[str, Any] = {}
    new_values: Dict[str, Any] = {}


class AlertEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kpi_id: str
    kpi_name: str
    threshold: float
    actual_value: float
    severity: RiskLevel
    message: str
    triggered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: Optional[datetime] = None


# ========== FILTER / QUERY ==========

class FilterParams(BaseModel):
    statements: Optional[List[Statement]] = None
    departments: Optional[List[str]] = None
    categories: Optional[List[Category]] = None
    risk_levels: Optional[List[RiskLevel]] = None
    financial_year: Optional[str] = None
    value_min: Optional[float] = None
    value_max: Optional[float] = None
    current_statuses: Optional[List[str]] = None
    payment_status: Optional[str] = None
    value_band: Optional[str] = None
    batch_id: Optional[str] = None
    data_source: Optional[str] = None
    search: Optional[str] = None
    action_type: Optional[str] = None
    recovery_status: Optional[str] = None
    official_decision_required: Optional[bool] = None
    tender_stage: Optional[str] = None


# ========== RESPONSE WRAPPERS ==========

class ApiResponse(BaseModel):
    success: bool = True
    data: Any = None
    meta: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None
