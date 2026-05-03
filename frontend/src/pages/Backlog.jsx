import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import { api, fmtCr } from "@/lib/api";
import { useFilters } from "@/contexts/FilterContext";
import { useDrilldown } from "@/contexts/DrilldownContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ComposedChart, Line, PieChart, Pie, Legend } from "recharts";
import { Inbox, FileClock, AlertTriangle } from "lucide-react";

export default function Backlog() {
  const { queryParams } = useFilters();
  const { openDrilldown } = useDrilldown();
  const [data, setData] = useState(null);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    api.get("/kpi/backlog", { params: queryParams }).then((r) => setData(r.data.data));
  }, [queryParams]);

  const d = data || {};

  // Pareto data — top 10 + cumulative
  const top = (d.top10 || []).slice(0, 10).map((r, i) => ({ name: `#${i + 1}`, value: r.procurement_value || 0, item: r.item_description }));
  const totalTop = top.reduce((s, r) => s + r.value, 0);
  let cum = 0;
  const pareto = top.map((r) => {
    cum += r.value;
    return { ...r, cumulative: totalTop ? (cum / totalTop) * 100 : 0 };
  });

  return (
    <Layout title="Backlog & Retender" subtitle="Statement C — awaited publish & retender clearance" page="backlog">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KPICard label="Awaited Publish (Cr)" value={d["KPI-053_awaited_publish_value"]} format="cr" prefix="₹" suffix=" Cr" tone="gold" icon={FileClock} testId="kpi-awaited-val"
          onClick={() => openDrilldown({ title: "Awaited publish", kpiId: "KPI-053", source: "kpi_card", filters: { current_status: "Awaited_Publish" } })} />
        <KPICard label="Awaited Count" value={d["KPI-054_awaited_count"]} testId="kpi-awaited-count"
          onClick={() => openDrilldown({ title: "Awaited publish — count", kpiId: "KPI-054", source: "kpi_card", filters: { current_status: "Awaited_Publish" } })} />
        <KPICard label="Retender (Cr)" value={d["KPI-055_retender_value"]} format="cr" prefix="₹" suffix=" Cr" tone="high" testId="kpi-retender-val"
          onClick={() => openDrilldown({ title: "Retender", kpiId: "KPI-055", source: "kpi_card", filters: { current_status: "Retender" } })} />
        <KPICard label="Retender Count" value={d["KPI-056_retender_count"]} testId="kpi-retender-count"
          onClick={() => openDrilldown({ title: "Retender — count", kpiId: "KPI-056", source: "kpi_card", filters: { current_status: "Retender" } })} />
        <KPICard label="Total Backlog" value={d["KPI-057_total_backlog"]} format="cr" prefix="₹" suffix=" Cr" tone="crit" icon={Inbox} testId="kpi-total-backlog"
          onClick={() => openDrilldown({ title: "Total backlog", kpiId: "KPI-057", source: "kpi_card", filters: { is_backlog: true } })} />
        <KPICard label="Backlog %" value={d["KPI-058_backlog_pct"]} format="pct" tone="crit" testId="kpi-backlog-pct"
          onClick={() => openDrilldown({ title: "Backlog % scope", kpiId: "KPI-058", source: "kpi_card", filters: { is_backlog: true } })} />
        <KPICard label="Critical Backlog (>10Cr)" value={d["KPI-061_critical_backlog"]} format="cr" prefix="₹" suffix=" Cr" tone="crit" icon={AlertTriangle} testId="kpi-critical-backlog"
          onClick={() => openDrilldown({ title: "Critical backlog", kpiId: "KPI-061", source: "kpi_card", filters: { is_backlog: true, risk_level: "Critical" } })} />
        <KPICard label="Clearance Priority" value={(d.clearance_priority || []).length} tone="gold" testId="kpi-clearance-count"
          onClick={() => openDrilldown({ title: "Backlog clearance priority", kpiId: "KPI-064", source: "kpi_card", filters: { is_backlog: true, sort_by: "priority_score" } })} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5">
          <div className="mb-3">
            <div className="font-heading text-[15px] text-gov-navy">Backlog by Department (Top 10)</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Awaited + Retender combined ₹Cr</div>
          </div>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={(d.by_department || []).slice(0, 10)} margin={{ left: 4, right: 20, bottom: 40 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={{ stroke: "#D0D7E8" }} tickLine={false} interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `₹ ${v.toFixed(2)} Cr`} contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }} />
                <Bar dataKey="value" fill="#D4A024" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5">
          <div className="mb-3">
            <div className="font-heading text-[15px] text-gov-navy">Top 10 Backlog Items (Pareto)</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Cumulative % of total backlog</div>
          </div>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={pareto} margin={{ left: 4, right: 20, bottom: 20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={{ stroke: "#D0D7E8" }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }} />
                <Bar yAxisId="left" dataKey="value" fill="#C0392B" radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#0B1F3A" strokeWidth={2} dot={{ r: 3, fill: "#D4A024" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gov-border rounded-sm shadow-card" data-testid="clearance-table">
        <div className="px-5 py-4 border-b border-gov-border flex items-center justify-between">
          <div>
            <div className="font-heading text-[15px] text-gov-navy">Backlog Clearance Action Tracker</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Priority-ranked · Clearance actions required</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[10px] font-data uppercase tracking-wider">
            {[
              ["Publish Tender", "#0D8E74"],
              ["Approve Retender", "#D4A024"],
              ["Financial Approval", "#2980B9"],
              ["Close / Drop", "#C0392B"],
            ].map(([lab, c]) => (
              <span key={lab} className="inline-flex items-center gap-1 px-2 py-1 border border-gov-border rounded-sm">
                <span className="w-2 h-2" style={{ backgroundColor: c }} /> {lab}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gov-slate border-b-2 border-gov-border text-[10px] uppercase tracking-wider font-data text-gov-muted">
                <th className="text-right px-4 py-2.5 w-16">Priority</th>
                <th className="text-left px-4 py-2.5">Item</th>
                <th className="text-left px-4 py-2.5">Department</th>
                <th className="text-left px-4 py-2.5 w-20">Category</th>
                <th className="text-right px-4 py-2.5 w-24">Value</th>
                <th className="text-right px-4 py-2.5 w-16">Days</th>
                <th className="text-left px-4 py-2.5 w-24">Risk</th>
                <th className="text-left px-4 py-2.5">Next Action</th>
              </tr>
            </thead>
            <tbody>
              {(d.clearance_priority || []).map((r) => (
                <tr key={r.id} onClick={() => setDetailId(r.id)}
                    className={`border-b border-gov-border hover:bg-gov-slate/60 cursor-pointer row-${r.risk_level?.toLowerCase()}`}>
                  <td className="px-4 py-2.5 text-right stat-num font-bold text-gov-gold">{r.priority_score?.toFixed(1)}</td>
                  <td className="px-4 py-2.5 max-w-[300px] truncate" title={r.item_description}>{r.item_description}</td>
                  <td className="px-4 py-2.5 text-gov-navy-mid truncate max-w-[180px]">{r.department}</td>
                  <td className="px-4 py-2.5 text-[11px] uppercase font-data text-gov-muted">{r.category}</td>
                  <td className="px-4 py-2.5 text-right stat-num text-gov-navy">₹ {fmtCr(r.procurement_value)}</td>
                  <td className="px-4 py-2.5 text-right stat-num">{r.days_pending}</td>
                  <td className="px-4 py-2.5"><StatusBadge level={r.risk_level} /></td>
                  <td className="px-4 py-2.5 text-[11px] text-gov-navy-mid">{r.action_required}</td>
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
