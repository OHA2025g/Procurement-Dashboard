/** Build axios params for drilldown + export APIs from global filters + drill overlay. */

const DRILL_JSON_KEYS = [
  "is_backlog",
  "is_inactive",
  "is_risk",
  "is_active_pipeline",
  "action_pending",
  "action_type",
  "current_status",
  "po_value_gt",
  "po_value_eq",
  "paid_amount_gt",
  "outstanding_amount_gt",
  "official_decision_required",
  "recovery_status",
  "risk_level",
  "top",
  "sort_by",
  "dimension",
  "metric",
];

export function mergeDrillParams(globalFilters = {}, drill = {}) {
  const p = {};
  const g = globalFilters || {};
  if (g.fy) p.fy = g.fy;
  if (g.department) p.department = g.department;
  if (g.category) p.category = g.category;
  if (g.risk_level) p.risk_level = g.risk_level;
  if (g.statement) p.statement = g.statement;
  if (g.payment_status) p.payment_status = g.payment_status;
  if (g.value_band) p.value_band = g.value_band;
  if (g.batch_id) p.batch_id = g.batch_id;
  if (g.search) p.search = g.search;
  if (g.procurement_status) p.procurement_status = g.procurement_status;
  if (g.action_type) p.action_type = g.action_type;
  if (g.recovery_status) p.recovery_status = g.recovery_status;
  if (g.tender_stage) p.tender_stage = g.tender_stage;
  if (g.data_source) p.data_source = g.data_source;
  if (g.official_decision_required != null) p.official_decision_required = g.official_decision_required;
  const d = drill || {};
  if (d.statement) p.statement = d.statement;
  if (d.department) p.department = d.department;
  if (d.category) p.category = d.category;
  if (d.risk_level != null && !Array.isArray(d.risk_level)) p.risk_level = d.risk_level;
  if (d.current_status) p.current_status = d.current_status;
  if (d.payment_status) p.payment_status = d.payment_status;
  if (d.value_band) p.value_band = d.value_band;
  if (d.action_type) p.action_type = d.action_type;
  if (d.search) p.search = d.search;
  if (d.kpi_preset) p.kpi_preset = d.kpi_preset;
  if (d.min_value != null) p.min_value = d.min_value;
  if (d.max_value != null) p.max_value = d.max_value;

  const drillObj = {};
  for (const k of DRILL_JSON_KEYS) {
    if (d[k] !== undefined && d[k] !== null && d[k] !== "") drillObj[k] = d[k];
  }
  if (Object.keys(drillObj).length) {
    try {
      p.drill = JSON.stringify(drillObj);
    } catch {
      /* ignore */
    }
  }
  return p;
}
