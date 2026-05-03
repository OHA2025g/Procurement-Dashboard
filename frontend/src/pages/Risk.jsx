import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import WaterfallChart from "@/components/WaterfallChart";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import { api, fmtCr, fmtNum } from "@/lib/api";
import { useFilters } from "@/contexts/FilterContext";
import { useDrilldown } from "@/contexts/DrilldownContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis } from "recharts";
import { ShieldAlert, AlertTriangle, XCircle, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Risk() {
  const { queryParams } = useFilters();
  const { openDrilldown } = useDrilldown();
  const [data, setData] = useState(null);
  const [exec, setExec] = useState(null);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/kpi/risk", { params: queryParams }),
      api.get("/kpi/executive", { params: queryParams }),
    ]).then(([r, e]) => { setData(r.data.data); setExec(e.data.data); });
  }, [queryParams]);

  const d = data || {};
  const exportable = d["KPI-116_critical_high_value"] || 0;

  // Risk matrix scatter: x=value band, y=risk severity (numeric)
  const severityMap = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  const matrixData = (d.escalation || []).map((r) => ({
    x: r.procurement_value,
    y: severityMap[r.risk_level] || 1,
    z: r.procurement_value,
    name: r.item_description,
    risk: r.risk_level,
    dept: r.department,
  }));

  return (
    <Layout title="Risk, Governance & Escalation" subtitle="Official decisions, high-risk exposure, escalation register" page="risk">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KPICard label="Failed / Inactive" value={d["KPI-071_failed_total"]} format="cr" prefix="₹" suffix=" Cr" tone="crit" icon={XCircle} testId="kpi-failed"
          onClick={() => openDrilldown({ title: "Failed / inactive", kpiId: "KPI-071", source: "kpi_card", filters: { is_inactive: true } })} />
        <KPICard label="Failed %" value={d["KPI-072_failed_pct"]} format="pct" tone="crit" testId="kpi-failed-pct"
          onClick={() => openDrilldown({ title: "Failed % scope", kpiId: "KPI-072", source: "kpi_card", filters: { is_inactive: true } })} />
        <KPICard label="Expired" value={d["KPI-065_expired_value"]} format="cr" prefix="₹" suffix=" Cr" tone="high" icon={AlertTriangle} testId="kpi-expired"
          onClick={() => openDrilldown({ title: "Expired", kpiId: "KPI-065", source: "kpi_card", filters: { current_status: "Expired" } })} />
        <KPICard label="Returned" value={d["KPI-067_returned_value"]} format="cr" prefix="₹" suffix=" Cr" tone="gold" testId="kpi-returned"
          onClick={() => openDrilldown({ title: "Returned", kpiId: "KPI-067", source: "kpi_card", filters: { current_status: "Returned" } })} />
        <KPICard label="Cancelled" value={d["KPI-069_cancelled_value"]} format="cr" prefix="₹" suffix=" Cr" tone="crit" icon={Ban} testId="kpi-cancelled"
          onClick={() => openDrilldown({ title: "Cancelled", kpiId: "KPI-069", source: "kpi_card", filters: { current_status: "Cancelled" } })} />
        <KPICard label="High-Risk Count" value={d["KPI-105_high_risk_count"]} tone="crit" icon={ShieldAlert} testId="kpi-highrisk-count"
          onClick={() => openDrilldown({ title: "High-risk cases", kpiId: "KPI-105", source: "kpi_card", filters: { risk_level: "Critical,High" } })} />
        <KPICard label="High-Risk Value" value={d["KPI-106_high_risk_value"]} format="cr" prefix="₹" suffix=" Cr" tone="crit" testId="kpi-highrisk-val"
          onClick={() => openDrilldown({ title: "High-risk value", kpiId: "KPI-106", source: "kpi_card", filters: { risk_level: "Critical,High" } })} />
        <KPICard label="Critical + High-Value" value={d["KPI-116_critical_high_value"]} format="cr" prefix="₹" suffix=" Cr" tone="crit" testId="kpi-critical-highval"
          onClick={() => openDrilldown({ title: "Critical high-value", kpiId: "KPI-116", source: "kpi_card", filters: { risk_level: "Critical", value_band: "10+" } })} />
        <KPICard label="Official Decision Pending" value={d["KPI-066_expired_count"] + (d["KPI-068_returned_count"] || 0)} tone="high" testId="kpi-decision-pending"
          onClick={() => openDrilldown({ title: "Official decision pending", source: "kpi_card", filters: { official_decision_required: true } })} />
      </div>

      {/* Risk waterfall */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2 px-2">
          <div className="font-heading text-[15px] text-gov-navy">Risk Exposure Waterfall</div>
          <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted">Portfolio → Residual Risk (₹ Cr)</div>
        </div>
        <WaterfallChart
          testId="risk-waterfall"
          segments={[
            { label: "Total Portfolio", value: exec?.["KPI-001_total_portfolio"] || 0, type: "total" },
            { label: "PO Issued (Safe)", value: exec?.po_issued_value || 0, type: "sub", color: "#0D8E74" },
            { label: "Tender Pipeline", value: (exec?.["KPI-001_total_portfolio"] || 0) - (exec?.po_issued_value || 0) - (d["KPI-071_failed_total"] || 0) - (exec?.backlog_value || 0), type: "sub", color: "#132E55" },
            { label: "Backlog (at-risk)", value: exec?.backlog_value || 0, type: "sub", color: "#D68910" },
            { label: "Failed", value: d["KPI-071_failed_total"] || 0, type: "sub", color: "#C0392B" },
          ]}
        />
      </div>

      {/* Two-up: reasons + risk matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5">
          <div className="mb-3">
            <div className="font-heading text-[15px] text-gov-navy">Failure Reasons Breakdown</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">By terminal status</div>
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={(d.reasons || []).map((r) => ({ ...r, label: r.label?.replaceAll("_", " ") }))} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={false} tickLine={false} />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={110} />
                <Tooltip formatter={(v) => `₹ ${v.toFixed(2)} Cr`} contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }} />
                <Bar dataKey="value" fill="#C0392B" radius={[0, 3, 3, 0]}>
                  {(d.reasons || []).map((r, i) => (
                    <Cell key={i} fill={["#C0392B", "#D68910", "#5B6780", "#0B1F3A"][i % 4]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5">
          <div className="mb-3">
            <div className="font-heading text-[15px] text-gov-navy">Risk × Value Matrix</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Severity (Y) × Procurement Value (X, ₹Cr)</div>
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                <XAxis type="number" dataKey="x" name="Value (Cr)" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={false} tickLine={false} />
                <YAxis type="number" dataKey="y" ticks={[1, 2, 3, 4]} domain={[0, 5]}
                       tickFormatter={(v) => ({ 1: "Low", 2: "Med", 3: "High", 4: "Crit" }[v] || "")}
                       tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={55} />
                <ZAxis type="number" dataKey="z" range={[40, 400]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }}
                  formatter={(v, n) => n === "Value (Cr)" ? `₹ ${Number(v).toFixed(2)} Cr` : v}
                />
                <Scatter data={matrixData}>
                  {matrixData.map((m, i) => (
                    <Cell key={i} fill={{ Critical: "#C0392B", High: "#D68910", Medium: "#0D8E74", Low: "#2980B9" }[m.risk]} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Escalation Register */}
      <div className="bg-white border border-gov-border rounded-sm shadow-card" data-testid="escalation-register">
        <div className="px-5 py-4 border-b border-gov-border flex items-center justify-between">
          <div>
            <div className="font-heading text-[15px] text-gov-navy">Official Escalation Register</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Critical + High risk · {d.escalation?.length || 0} cases</div>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gov-slate border-b-2 border-gov-border text-[10px] uppercase tracking-wider font-data text-gov-muted">
                <th className="text-left px-4 py-2.5 w-14">Stmt</th>
                <th className="text-left px-4 py-2.5">Item</th>
                <th className="text-left px-4 py-2.5">Department</th>
                <th className="text-right px-4 py-2.5 w-24">Value</th>
                <th className="text-left px-4 py-2.5 w-20">Risk</th>
                <th className="text-left px-4 py-2.5">Action Required</th>
                <th className="text-right px-4 py-2.5 w-16">Esc. L</th>
              </tr>
            </thead>
            <tbody>
              {(d.escalation || []).map((r) => (
                <tr key={r.id} onClick={() => setDetailId(r.id)}
                    className={`border-b border-gov-border hover:bg-gov-slate/60 cursor-pointer row-${r.risk_level?.toLowerCase()}`}>
                  <td className="px-4 py-2.5 font-data text-gov-navy font-bold">{r.statement}</td>
                  <td className="px-4 py-2.5 max-w-[280px] truncate" title={r.item_description}>{r.item_description}</td>
                  <td className="px-4 py-2.5 text-gov-navy-mid truncate max-w-[180px]">{r.department}</td>
                  <td className="px-4 py-2.5 text-right stat-num text-gov-navy">₹ {fmtCr(r.procurement_value)}</td>
                  <td className="px-4 py-2.5"><StatusBadge level={r.risk_level} /></td>
                  <td className="px-4 py-2.5 text-[11px] text-gov-navy-mid max-w-[260px] truncate">{r.action_required}</td>
                  <td className="px-4 py-2.5 text-right stat-num font-bold" style={{ color: r.escalation_level ? "#C0392B" : "#5B6780" }}>L{r.escalation_level || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ItemDetailDrawer open={!!detailId} recordId={detailId} onClose={() => setDetailId(null)} />
    </Layout>
  );
}
