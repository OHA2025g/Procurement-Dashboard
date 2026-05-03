import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import ActionWorkflowDrawer from "@/components/ActionWorkflowDrawer";
import { api, fmtCr } from "@/lib/api";
import { useFilters } from "@/contexts/FilterContext";
import { useDrilldown } from "@/contexts/DrilldownContext";
import { ListChecks, ListFilter, AlertTriangle, ArrowUpCircle, FileDown, CheckCircle2, Wallet, Briefcase, Megaphone, RotateCcw, Gavel, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function Actions() {
  const { queryParams } = useFilters();
  const { openDrilldown } = useDrilldown();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [riskOnly, setRiskOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [workflow, setWorkflow] = useState([]);
  const [wfOpen, setWfOpen] = useState(false);
  const [wfRow, setWfRow] = useState(null);
  const limit = 50;

  const load = () => {
    setLoading(true);
    api.get("/actions", { params: { ...queryParams, risk_only: riskOnly, page, limit } })
      .then((r) => setData(r.data.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [queryParams, riskOnly, page]);

  useEffect(() => {
    api.get("/workflow/actions").then((r) => setWorkflow(r.data.data || [])).catch(() => setWorkflow([]));
  }, [data]);

  const d = data || {};
  const rows = d.rows || [];
  const totalPages = Math.max(1, Math.ceil((d.total_count || 0) / limit));

  async function escalateRecord(recordId) {
    try {
      await api.post(`/records/${recordId}/escalate`);
      toast.success("Escalation level increased");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Escalation failed");
    }
  }

  async function downloadActionTrackerExcel() {
    try {
      const res = await api.get("/export/action-tracker/excel", {
        params: { ...queryParams },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `action_tracker_${Date.now()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Export failed");
    }
  }

  async function downloadPagePdf() {
    try {
      const res = await api.get("/export/page/pdf", {
        params: { ...queryParams, page: "actions" },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `actions_page_${Date.now()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Export failed");
    }
  }

  function drillForBreakdown(label) {
    const t = (label || "").trim();
    if (["Payment", "Tender", "Publish", "Retender"].includes(t)) {
      return { title: `Actions — ${t}`, kpiId: null, source: "chart", filters: { action_type: t } };
    }
    return { title: "Actions — pending", kpiId: "KPI-110", source: "chart", filters: { action_pending: true } };
  }

  return (
    <Layout title="Action Tracker" subtitle="Priority-ranked pending items across the procurement lifecycle" page="actions">
      <div className="flex flex-wrap gap-2 mb-4">
        <Button type="button" variant="outline" size="sm" className="font-data text-[11px]" onClick={downloadActionTrackerExcel}>
          <FileDown size={14} className="mr-1.5" /> Action tracker Excel
        </Button>
        <Button type="button" variant="outline" size="sm" className="font-data text-[11px]" onClick={downloadPagePdf}>
          <FileDown size={14} className="mr-1.5" /> Page PDF
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KPICard label="Action Pending Count" value={d.total_actions} tone="gold" icon={ListChecks} testId="kpi-action-count"
          onClick={() => openDrilldown({ title: "KPI-110 — Action pending", kpiId: "KPI-110", source: "kpi_card", filters: { action_pending: true } })} />
        <KPICard label="Action Pending (Cr)" value={d.action_pending_value} format="cr" prefix="₹" suffix=" Cr" tone="gold" testId="kpi-action-value"
          onClick={() => openDrilldown({ title: "KPI-111 — Action pending value", kpiId: "KPI-111", source: "kpi_card", filters: { action_pending: true } })} />
        <KPICard label="Payment follow-up (Cr)" value={d.payment_followup_value} format="cr" prefix="₹" suffix=" Cr" tone="med" icon={Wallet} testId="kpi-pay-followup"
          onClick={() => openDrilldown({ title: "KPI-112 — Payment follow-up", kpiId: "KPI-112", source: "kpi_card", filters: { action_type: "Payment" } })} />
        <KPICard label="Tender closure (Cr)" value={d.tender_closure_value} format="cr" prefix="₹" suffix=" Cr" tone="med" icon={Briefcase} testId="kpi-tender-close"
          onClick={() => openDrilldown({ title: "KPI-113 — Tender closure", kpiId: "KPI-113", source: "kpi_card", filters: { action_type: "Tender" } })} />
        <KPICard label="Publish pending (Cr)" value={d.publish_pending_value} format="cr" prefix="₹" suffix=" Cr" tone="med" icon={Megaphone} testId="kpi-publish"
          onClick={() => openDrilldown({ title: "KPI-114 — Publish pending", kpiId: "KPI-114", source: "kpi_card", filters: { action_type: "Publish" } })} />
        <KPICard label="Retender approval (Cr)" value={d.retender_approval_value} format="cr" prefix="₹" suffix=" Cr" tone="high" icon={RotateCcw} testId="kpi-retender"
          onClick={() => openDrilldown({ title: "KPI-115 — Retender approval", kpiId: "KPI-115", source: "kpi_card", filters: { action_type: "Retender" } })} />
        <KPICard label="Official decision (Cr)" value={d.official_decision_pending_value} format="cr" prefix="₹" suffix=" Cr" tone="crit" icon={Gavel} testId="kpi-official"
          onClick={() => openDrilldown({ title: "KPI-116 — Official decision", kpiId: "KPI-116", source: "kpi_card", filters: { official_decision_required: true } })} />
        <KPICard label="Recovery potential (Cr)" value={d.recovery_potential_value} format="cr" prefix="₹" suffix=" Cr" tone="med" icon={RefreshCw} testId="kpi-recovery"
          onClick={() => openDrilldown({ title: "KPI-118 — Recovery potential", kpiId: "KPI-118", source: "kpi_card", filters: { recovery_status: "Recoverable" } })} />
        <KPICard label="Escalated actions" value={d.escalated_actions} tone="crit" icon={ArrowUpCircle} testId="kpi-escalated" />
        <KPICard label="Closed actions" value={d.closed_actions} tone="med" icon={CheckCircle2} testId="kpi-closed" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KPICard label="Critical + High (actions)" value={d.critical_high_action_count} tone="crit" icon={AlertTriangle} testId="kpi-crithigh"
          onClick={() => openDrilldown({ title: "High-risk actions", kpiId: "KPI-105", source: "kpi_card", filters: { risk_level: ["Critical", "High"] } })} />
        <KPICard label="Open" value={d.open_actions} icon={ListFilter} testId="kpi-open"
          onClick={() => openDrilldown({ title: "Open actions", source: "kpi_card", filters: { action_pending: true } })} />
        <KPICard label="In progress" value={d.in_progress_actions} icon={ListFilter} testId="kpi-inprog"
          onClick={() => openDrilldown({ title: "In progress", source: "kpi_card", filters: { action_pending: true } })} />
        <KPICard label="Total (page)" value={d.total_count} icon={ListChecks} testId="kpi-page-total"
          onClick={() => openDrilldown({ title: "All actions on register", source: "table", filters: { action_pending: true } })} />
      </div>

      {workflow.length > 0 && (
        <div className="bg-white border border-gov-border rounded-sm shadow-card mb-6 p-5" data-testid="workflow-actions">
          <div className="font-heading text-[15px] text-gov-navy mb-2">Workflow registry</div>
          <p className="text-[11px] text-gov-muted font-data mb-3">Synced from uploads; update via POST /api/workflow/actions</p>
          <div className="overflow-x-auto max-h-40">
            <table className="w-full text-[12px] font-data">
              <thead>
                <tr className="text-gov-muted text-[10px] uppercase">
                  <th className="text-left py-1">Record</th>
                  <th className="text-left py-1">Title</th>
                  <th className="text-left py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {workflow.slice(0, 15).map((w) => (
                  <tr key={w.id || w.record_id} className="border-t border-gov-border">
                    <td className="py-1.5 font-mono text-[10px]">{w.record_id?.slice(0, 8)}…</td>
                    <td className="py-1.5">{w.title || "—"}</td>
                    <td className="py-1.5">{w.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white border border-gov-border rounded-sm shadow-card mb-6 p-5" data-testid="action-breakdown">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-heading text-[15px] text-gov-navy">Actions by type</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Tracker action_type · click to drill</div>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          {(d.by_action || []).slice(0, 8).map((a, i) => {
            const payload = drillForBreakdown(a.label);
            return (
              <button
                type="button"
                key={a.label}
                className="flex-1 min-w-[220px] border border-gov-border rounded-sm p-3 bg-gov-slate/40 text-left hover:border-gov-gold transition-colors"
                onClick={() => openDrilldown(payload)}
              >
                <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mb-1">{a.label}</div>
                <div className="flex items-baseline justify-between">
                  <div className="stat-num text-[17px] font-bold text-gov-navy">₹ {fmtCr(a.value)}</div>
                  <div className="text-[11px] font-data text-gov-navy-mid">· {a.count} items</div>
                </div>
                <div className="mt-2 h-1.5 bg-gov-border rounded-full overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, (a.value / (d.action_pending_value || 1)) * 100)}%`,
                      backgroundColor: ["#0B1F3A", "#D4A024", "#0D8E74", "#D68910", "#C0392B", "#2980B9", "#7D3C98", "#117864"][i % 8],
                    }}
                  />
                </div>
              </button>
            );
          })}
          {!loading && (!d.by_action || d.by_action.length === 0) && (
            <div className="text-[12px] text-gov-muted font-data">No breakdown for current filters.</div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gov-border rounded-sm shadow-card mb-4 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="text-[11px] uppercase tracking-[0.14em] font-data text-gov-navy font-semibold">
            Priority-Ranked Action Register
          </div>
          <div className="flex items-center gap-2 text-[11px] font-data text-gov-navy-mid">
            <Switch checked={riskOnly} onCheckedChange={setRiskOnly} data-testid="risk-only-toggle" />
            <span>Critical + High only</span>
          </div>
        </div>
        <div className="text-[11px] font-data text-gov-muted">
          {loading ? "Loading…" : `${d.total_count || 0} tracker rows · Page ${page}/${totalPages}`}
        </div>
      </div>

      <div className="bg-white border border-gov-border rounded-sm shadow-card" data-testid="action-table">
        <div className="overflow-x-auto max-h-[640px]">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gov-navy text-white text-[10px] uppercase tracking-wider font-data">
                <th className="text-left px-3 py-2.5 w-24">Action ID</th>
                <th className="text-left px-3 py-2.5 w-24">Record</th>
                <th className="text-left px-3 py-2.5">Department</th>
                <th className="text-left px-3 py-2.5 w-24">Category</th>
                <th className="text-left px-3 py-2.5 min-w-[200px]">Item</th>
                <th className="text-right px-3 py-2.5 w-24">Value</th>
                <th className="text-left px-3 py-2.5 w-24">Risk</th>
                <th className="text-right px-3 py-2.5 w-16">Priority</th>
                <th className="text-left px-3 py-2.5 w-20">Type</th>
                <th className="text-left px-3 py-2.5 max-w-[180px]">Next best</th>
                <th className="text-left px-3 py-2.5 w-28">Suggested</th>
                <th className="text-left px-3 py-2.5 w-28">Assigned</th>
                <th className="text-left px-3 py-2.5 w-20">Esc.</th>
                <th className="text-left px-3 py-2.5 w-24">Status</th>
                <th className="text-left px-3 py-2.5 w-28">Updated</th>
                <th className="text-left px-3 py-2.5 w-36">Ops</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.action_id || r.record_id}
                  className={`border-b border-gov-border hover:bg-gov-slate/40 row-${(r.risk_level || "").toLowerCase()}`}
                  data-testid={`action-row-${r.action_id || r.record_id}`}
                >
                  <td className="px-3 py-2 font-mono text-[10px] text-gov-muted">{r.action_id?.slice(0, 10)}…</td>
                  <td className="px-3 py-2 font-mono text-[10px]">{r.record_id?.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-gov-navy-mid truncate max-w-[140px]">{r.department}</td>
                  <td className="px-3 py-2 text-[10px] uppercase font-data text-gov-muted">{r.category}</td>
                  <td
                    className="px-3 py-2 max-w-[260px] truncate cursor-pointer hover:text-gov-gold"
                    onClick={() => setDetailId(r.record_id)}
                    title={r.item_description}
                  >
                    {r.item_description}
                  </td>
                  <td className="px-3 py-2 text-right stat-num text-gov-navy font-semibold">₹ {fmtCr(r.procurement_value)}</td>
                  <td className="px-3 py-2"><StatusBadge level={r.risk_level} /></td>
                  <td className="px-3 py-2 text-right stat-num font-bold text-gov-gold">{r.priority_score != null ? Number(r.priority_score).toFixed(1) : "—"}</td>
                  <td className="px-3 py-2 text-[10px] font-data">{r.action_type}</td>
                  <td className="px-3 py-2 text-[11px] text-gov-navy-mid truncate" title={r.next_best_action}>{r.next_best_action}</td>
                  <td className="px-3 py-2 text-[10px] truncate">{r.suggested_owner || "—"}</td>
                  <td className="px-3 py-2 text-[10px] truncate">{r.assigned_to || "—"}</td>
                  <td className="px-3 py-2 text-[10px] font-data">{r.escalation_level ?? "—"}</td>
                  <td className="px-3 py-2 text-[10px]">{r.action_status}</td>
                  <td className="px-3 py-2 text-[10px] font-data text-gov-muted">{r.updated_at ? String(r.updated_at).slice(0, 16) : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setDetailId(r.record_id)}
                        data-testid={`view-${r.record_id}`}
                        className="text-[10px] uppercase font-data tracking-wider text-gov-navy border border-gov-border hover:border-gov-gold hover:text-gov-gold px-2 py-0.5 rounded-sm"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => { setWfRow(r); setWfOpen(true); }}
                        className="text-[10px] uppercase font-data tracking-wider text-gov-navy border border-gov-border hover:border-gov-gold px-2 py-0.5 rounded-sm"
                      >
                        Workflow
                      </button>
                      <button
                        type="button"
                        onClick={() => escalateRecord(r.record_id)}
                        data-testid={`escalate-btn-${r.record_id}`}
                        className="text-[10px] uppercase font-data tracking-wider text-gov-crit border border-gov-crit/30 hover:bg-gov-crit hover:text-white px-2 py-0.5 rounded-sm"
                      >
                        Rec esc
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={16} className="text-center py-8 text-gov-muted text-[12px]">No matching actions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gov-border flex items-center justify-between text-[11px] font-data">
          <div className="text-gov-muted">
            Showing {(page - 1) * limit + 1}-{Math.min(page * limit, d.total_count || 0)} of {d.total_count || 0}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} data-testid="prev-page">Previous</Button>
            <span className="text-gov-navy">Page {page} / {totalPages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} data-testid="next-page">Next</Button>
          </div>
        </div>
      </div>

      <ItemDetailDrawer open={!!detailId} recordId={detailId} onClose={() => { setDetailId(null); load(); }} />

      <ActionWorkflowDrawer
        open={wfOpen}
        onClose={() => { setWfOpen(false); setWfRow(null); }}
        onSaved={load}
        recordId={wfRow?.record_id}
        action={wfRow}
      />
    </Layout>
  );
}
