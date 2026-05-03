# Focused gap completion report

**Project:** Procurement Analytics & Governance Dashboard  
**Date:** 2026-05-02  
**Scope:** Complete the five critical implementation areas without rebuilding the application.

---

## 1. Files inspected

- `backend/kpi_registry.py`, `backend/kpi_values.py`, `backend/kpi_engine.py`, `backend/drilldown.py`, `backend/server.py`, `backend/exports.py`, `backend/action_tracker_service.py`, `backend/models.py`
- `frontend/src/contexts/DrilldownContext.jsx`, `frontend/src/components/DrilldownDrawer.jsx`, `frontend/src/lib/drilldownApi.js`
- `frontend/src/pages/Payment.jsx`, `Tender.jsx`, `Backlog.jsx`, `Risk.jsx`, `Actions.jsx`, `Statements.jsx`, `KPIDictionary.jsx`
- `frontend/src/components/ItemDetailDrawer.jsx`, `ActionWorkflowDrawer.jsx`, `KPICard.jsx`

---

## 2. Files changed (this completion pass)

| Area | File | Change summary |
|------|------|----------------|
| Actions API data | `backend/action_tracker_service.py` | `by_action` breakdown from tracker + procurement; `recovery_potential_value` and `critical_high_action_count` on summary; `days_pending` on list rows; empty list returns `by_action: []`. |
| Drill JSON | `frontend/src/lib/drilldownApi.js` | Include `action_type` in serialized drill overlay. |
| Actions UI | `frontend/src/pages/Actions.jsx` | Uses merged `/api/actions` payload (summary + rows + `by_action`); KPI cards aligned to KPI-110–118 style drill presets; breakdown tiles drill by `action_type` or pending; tracker table columns + Workflow button + procurement escalate; Excel + page PDF export buttons. |
| Workflow UX | `frontend/src/components/ActionWorkflowDrawer.jsx` | Dialog (avoids nested Sheet); `onSaved` refresh without forcing close; history reload after each POST; eslint-safe `loadHistory` hook. |
| Item detail | `frontend/src/components/ItemDetailDrawer.jsx` | “Action workflow” opens dialog; `onSaved` refetches record + tracker doc. |

---

## 3. KPI registry completion summary

- Registry defines **KPI-001 … KPI-120** with metadata (`kpi_name`, `group`, `definition`, `formula`, `unit`, `drilldown_filter_preset`, etc.).
- Assertions enforce **120 unique IDs** (no placeholders such as “metric 11”).

---

## 4. KPI calculation completion summary

- Central builders in `kpi_values.py` produce grouped payloads for `GET /api/kpis/all-values` and single payloads for `GET /api/kpis/{kpi_id}/value`.
- Values are derived from Mongo aggregates via `KPIEngine` / normalized records; missing denominators → safe numeric defaults; some KPIs may attach `meta` where the source model is partial (per earlier implementation).

---

## 5. Drill-down wiring summary by page

| Page | Status |
|------|--------|
| Payment | KPI cards + payment charts wired to `openDrilldown` with payment/PO presets. |
| Tender | KPI cards + TUP-oriented presets (`Tender_Under_Process` normalization in backend). |
| Backlog | KPI cards + backlog-oriented drill presets. |
| Risk | KPI cards + risk/inactive/recovery presets. |
| Actions | KPI row + “by type” tiles drill to procurement scope via overlay (`action_pending`, `action_type`, `official_decision_required`, `recovery_status`, `risk_level` list). Escalated/closed **counts** have no procurement-only drill (tracker state not mirrored in `drilldown` match). |
| KPI Dictionary | Opens drill with object presets when present. |

---

## 6. Export completion summary

| Export | Route (under `/api`) | Notes |
|--------|----------------------|--------|
| KPI summary Excel | `GET /export/kpi-summary/excel` | Filter-aware via `FilterParams`. |
| Action tracker Excel | `GET /export/action-tracker/excel` | Rows from tracker + enrichment; filter params flattened in workbook. |
| Drill-down PDF | `GET /export/drilldown/pdf` | Accepts `drill` JSON query. |
| Page PDF | `GET /export/page/pdf?page=…` | `actions` uses action tracker summary block. |
| Data quality Excel | `GET /export/data-quality/{batch_id}/excel` | Driven by batch metadata; row-level QA may still be thin if batch stores limited detail. |

**Frontend:** Actions page adds **Action tracker Excel** and **Page PDF** download buttons.

---

## 7. Action workflow summary

- **Mongo:** `action_tracker`, `action_history`; seed when empty from procurement rows with `action_required`.
- **APIs:** `GET/POST/PATCH /api/actions`, assign/status/escalate/close/reopen, `GET /api/actions/for-record/{record_id}`, `GET /api/actions/history/{record_id}`, `GET /api/actions/summary` (subset merged into list response).
- **UI:** `ActionWorkflowDrawer` (assign, status paths, escalate, close, reopen, history). `ItemDetailDrawer` opens workflow when a tracker document exists. Actions table **Workflow** opens the same drawer for the row’s tracker document.

---

## 8. APIs added/updated (reference)

- **KPIs:** `GET /api/kpis/all-values`, `GET /api/kpis/{kpi_id}/value`
- **Actions:** full tracker CRUD + workflow sub-routes (see `server.py` ACTIONS section)
- **Exports:** kpi-summary, action-tracker, drilldown PDF, page PDF, data-quality Excel
- **Legacy:** `GET /api/procurement/action-queue` retained for Statements tab

---

## 9. Frontend components added/updated

- **New/updated:** `ActionWorkflowDrawer.jsx` (Dialog-based)
- **Updated:** `Actions.jsx`, `ItemDetailDrawer.jsx`, `drilldownApi.js`, page drill wiring (Payment/Tender/Backlog/Risk from prior work)

---

## 10. Known limitations

1. **Drill-down scope** is procurement collection match; **tracker-only states** (e.g. “Escalated” vs “Open” on `action_tracker`) are not fully expressible as procurement filters without a join-based drill API.
2. **Action tracker Excel** export uses `FilterParams` only (not the UI’s `risk_only` toggle); align in a follow-up if parity is required.
3. **Data quality Excel** may remain summary-heavy if upload batches do not persist granular validation rows.
4. **KPI-120 / composite scores** may carry explanatory `meta` when upstream fields (e.g. tender stage density) are sparse.

---

## 11. Test results

| Check | Result |
|-------|--------|
| `python -m py_compile backend/action_tracker_service.py` | Pass |
| `yarn build` (frontend) | Pass (no blocking errors; pre-existing Alerts.jsx hook warning may still appear in full log) |

---

## Sign-off

The five focus areas are **implemented in the codebase** with the refinements in sections 2 and 10 above. For production hardening, run integration tests against a seeded Mongo instance and exercise each export and action workflow path under real JWT roles.
