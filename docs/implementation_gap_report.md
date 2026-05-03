# Implementation Gap Report — Procurement Dashboard

**Date:** 2026-05-02  
**Scope:** Baseline inventory vs official-grade upgrade plan (Phases 1–20).  
**Build / lint:** Run `pytest` / `npm run build` in CI or locally after changes; this report documents state at inventory time.

---

## 1. API routes inventory (`backend/server.py`)

| Method | Path | Auth / notes |
|--------|------|----------------|
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | JWT |
| GET | `/api/kpi/executive` … `/api/kpi/governance` | JWT — legacy KPI bundles |
| GET | `/api/actions` | JWT — reads procurement via `kpi.actions()`, not persisted workflow |
| GET | `/api/records/{record_id}` | JWT |
| GET | `/api/drilldown/records`, `summary`, `facets`, `top-items` | JWT — extended drill query params present |
| PUT | `/api/records/{record_id}` | Role-restricted |
| POST | `/api/records/{record_id}/escalate` | Role-restricted |
| POST | `/api/admin/upload` | Super admin — Excel only (`ingestion_log`) |
| GET | `/api/admin/uploads` | Super admin |
| GET | `/api/admin/users` | Super admin |
| GET | `/api/meta/filters` | JWT |
| GET | `/api/export/drill/excel`, `/api/export/excel`, `/api/export/pdf` | JWT |
| GET | `/api/alerts`, … notifications, escalation | JWT / roles |

**Gaps vs plan:** No `GET /api/kpi-dictionary`, `GET /api/kpis/*`, CSV upload, preview/commit, `upload_batches` rollback, record PDF, dictionary export, workflow `actions` CRUD on dedicated collection, structured audit for upload/export/actions (partial: `audit_log` on record update only).

---

## 2. KPI keys (engine reality)

**Location:** `backend/kpi_engine.py`

- **Executive:** `KPI-001`–`KPI-010` plus legacy keys (`po_issued_value`, `top10`, etc.).
- **Statements:** `total`, `per_statement`, `execution_gap` — not uniformly `KPI-011`+.
- **Payment:** `KPI-021`–`KPI-037` (skips 023–030 in numbering).
- **Tender:** `KPI-043`–`KPI-049`.
- **Backlog:** `KPI-053`–`KPI-058`, `KPI-061`.
- **Risk:** `KPI-065`–`KPI-072`, `KPI-105`–`KPI-106`, `KPI-116`.
- **Governance:** `KPI-103`–`KPI-104`.
- **Category / department:** Returned as nested structures, not full `KPI-079`–`KPI-102` flat IDs.

**Gap:** No complete **120-ID** registry with uniform metadata; many spec ranges (023–024, 027–030, 040–042, 046–047, 050–052, 059–064, 073–078, 079–089, 090–102, 107–120, etc.) missing or aliased differently. `ACTIVE_STATUSES` includes `Retender` while some specs define “active value” without it — needs explicit reconciliation in registry notes.

---

## 3. Drill-down

**Backend:** `backend/drilldown.py` — `build_drill_match`, `enrich_record`, presets, payment/value band/search.  
**Routes:** Rich query surface on `/api/drilldown/*`.

**Gaps:** Global `FilterParams` did not include all drill dimensions (batch, tender_stage, recovery, etc.) until extended; facets `action_types` empty; response contracts could add `summary` block parity everywhere.

**Frontend:** `DrilldownContext.jsx`, `DrilldownShell.jsx`, `ItemDetailDrawer.jsx` — partial UX vs plan (URL-synced filters, column picker, export-in-drawer).

---

## 4. Filters

**Backend:** `FilterParams` + `parse_filters` historically: FY, department, category, risk, statement, value min/max only.

**Gap:** No payment status, value band, batch, search, current_status, data_source, recovery, official decision, tender stage in the **global** filter model (drill had some separately).

**Frontend:** `FilterContext.jsx` — no URL sync; hardcoded category list; pills limited.

---

## 5. Data model (`backend/models.py`)

- `Category`: Equipment, Medicine, Others — **no** Consumables/Services.
- `escalation_level`: int — plan prefers string tiers for display/API.
- No `batch_id`, `record_id` mirror, `payment_status` persisted, `tender_stage`, `recovery_status`, `official_decision_required` on model.

---

## 6. Upload / ETL

**`backend/etl.py`:** Excel-oriented (`openpyxl`).  
**Gap:** CSV path, preview, validation report, `upload_batches` collection with rollback-by-batch.

---

## 7. Exports & audit

**`backend/exports.py`:** Excel register + executive PDF.  
**Gap:** KPI dictionary export, single-record PDF, metadata headers everywhere, audit entries for upload/export/workflow.

---

## 8. Frontend pages (`frontend/src/pages`, `App.js`)

Pages exist: Executive, Statements, Payment, Tender, Backlog, Risk, Actions, KPIDictionary (hardcoded ~8 rows), Admin.

**Gap:** Wire all to registry IDs, TanStack table for dictionary where applicable, actions from new APIs.

---

## 9. Dead / low-value code

No major orphaned modules identified; `alerts.py` ties to KPI keys — preserve when adding parallel `KPI-NNN` APIs.

---

## 10. Indexes (startup)

Existing: `statement`, `department`, `category`, `current_status`, `risk_level`, `financial_year`, `procurement_value`, `priority_score`.

**Recommended adds:** `batch_id`, `record_id` (if stored), text/search if needed.

---

## 11. Summary

| Area | Status |
|------|--------|
| Routes | Core KPI + drill + auth present; registry/KPI v2/upload v2/workflow exports missing |
| KPIs | Partial `KPI-NNN` keys; not 120 with metadata |
| Filters | Drill-rich; global filters and URL sync thin |
| Model | Extend for batch, categories, governance fields |
| Upload | Excel only; no CSV/preview/rollback |
| Dictionary UI | Hardcoded small set |

**Strategy (unchanged):** Add parallel canonical APIs and fields; keep `/kpi/*` response shapes until frontend cutover.
