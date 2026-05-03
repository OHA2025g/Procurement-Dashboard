import React, { useEffect, useState, useMemo } from "react";
import Layout from "@/components/Layout";
import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import RiskHeatmap from "@/components/RiskHeatmap";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import { api, fmtCr } from "@/lib/api";
import { useFilters } from "@/contexts/FilterContext";
import { useDrilldown } from "@/contexts/DrilldownContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, FunnelChart, Funnel, LabelList, PieChart, Pie } from "recharts";
import { Gavel, TrendingUp, Target } from "lucide-react";

const TUP = "Tender_Under_Process";

export default function Tender() {
  const { queryParams } = useFilters();
  const { openDrilldown } = useDrilldown();
  const [data, setData] = useState(null);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    api.get("/kpi/tender", { params: queryParams }).then((r) => setData(r.data.data));
  }, [queryParams]);

  const d = data || {};

  // Build heatmap from closure_priority dept × category
  const { rows, cols, values } = useMemo(() => {
    const priority = d.closure_priority || [];
    const depts = Array.from(new Set(priority.map((p) => p.department))).slice(0, 8);
    const cats = [{ label: "Medicine" }, { label: "Equipment" }, { label: "Others" }];
    const vals = {};
    priority.forEach((p) => {
      const key = `${p.department}|${p.category}`;
      vals[key] = (vals[key] || 0) + (p.procurement_value || 0);
    });
    return { rows: depts, cols: cats, values: vals };
  }, [d.closure_priority]);

  // Funnel — stages of tender maturity (approximation)
  const funnelData = [
    { name: "Proposal Received", value: (d["KPI-044_pipeline_count"] || 0) + 20, fill: "#132E55" },
    { name: "AA Approved", value: (d["KPI-044_pipeline_count"] || 0) + 10, fill: "#0B1F3A" },
    { name: "Tender Under Process", value: d["KPI-044_pipeline_count"] || 0, fill: "#D4A024" },
    { name: "Evaluation", value: Math.round((d["KPI-044_pipeline_count"] || 0) * 0.5), fill: "#0D8E74" },
    { name: "PO Ready", value: Math.round((d["KPI-044_pipeline_count"] || 0) * 0.2), fill: "#0B1F3A" },
  ];

  return (
    <Layout title="Tender Pipeline Dashboard" subtitle="Statement B — tenders under evaluation & negotiation" page="tender">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KPICard label="Pipeline Value" value={d["KPI-043_pipeline_value"]} format="cr" prefix="₹" suffix=" Cr" tone="gold" icon={Gavel} testId="kpi-pipe-value"
          onClick={() => openDrilldown({ title: "Tender pipeline value", kpiId: "KPI-043", source: "kpi_card", filters: { current_status: TUP } })} />
        <KPICard label="Pipeline Count" value={d["KPI-044_pipeline_count"]} testId="kpi-pipe-count"
          onClick={() => openDrilldown({ title: "Tender pipeline count", kpiId: "KPI-044", source: "kpi_card", filters: { current_status: TUP } })} />
        <KPICard label="Avg Pipeline" value={d["KPI-048_avg_pipeline"]} format="cr" prefix="₹" suffix=" Cr" testId="kpi-pipe-avg"
          onClick={() => openDrilldown({ title: "Avg tender value", kpiId: "KPI-048", source: "kpi_card", filters: { current_status: TUP } })} />
        <KPICard label="High-Value (>10Cr)" value={d["KPI-049_high_value_count"]} tone="high" icon={Target} testId="kpi-pipe-high"
          onClick={() => openDrilldown({ title: "High-value tenders", kpiId: "KPI-049", source: "kpi_card", filters: { current_status: TUP, value_band: "10+,5-10" } })} />
        <KPICard label="Pipeline %" value={d["KPI-045_pipeline_pct"]} format="pct" tone="gold" testId="kpi-pipe-pct"
          onClick={() => openDrilldown({ title: "Pipeline % scope", kpiId: "KPI-045", source: "kpi_card", filters: { current_status: TUP } })} />
        <KPICard label="Closure Priority" value={(d.closure_priority || []).length} tone="crit" icon={TrendingUp} testId="kpi-closure-prio"
          onClick={() => openDrilldown({ title: "Tender closure priority", kpiId: "KPI-051", source: "kpi_card", filters: { current_status: TUP, sort_by: "priority_score" } })} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5 lg:col-span-2">
          <div className="mb-3">
            <div className="font-heading text-[15px] text-gov-navy">Tender Pipeline by Department</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">₹ Cr · top 10 departments</div>
          </div>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={(d.by_department || []).slice(0, 10)} margin={{ left: 4, right: 20, bottom: 40 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={{ stroke: "#D0D7E8" }} tickLine={false} interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `₹ ${v.toFixed(2)} Cr`} contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }} />
                <Bar dataKey="value" fill="#132E55" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5">
          <div className="mb-3">
            <div className="font-heading text-[15px] text-gov-navy">Pipeline by Category</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Medicine vs Equipment</div>
          </div>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={d.by_category || []}
                  dataKey="value"
                  outerRadius={100} innerRadius={60} paddingAngle={2}
                  label={(e) => `${e.label}: ₹${e.value.toFixed(1)}`}
                  labelLine={false}
                >
                  {(d.by_category || []).map((e, i) => (
                    <Cell key={i} fill={["#0B1F3A", "#D4A024", "#0D8E74"][i]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `₹ ${v.toFixed(2)} Cr`} contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Funnel + Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5">
          <div className="mb-3">
            <div className="font-heading text-[15px] text-gov-navy">Tender Maturity Funnel</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">From proposal received to PO issuance</div>
          </div>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <FunnelChart>
                <Tooltip contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }} />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  <LabelList position="right" fill="#0B1F3A" stroke="none" dataKey="name" style={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        </div>

        <RiskHeatmap
          testId="tender-heatmap"
          title="Pipeline Value: Department × Category"
          rows={rows}
          cols={cols}
          values={values}
          unit="Cr"
        />
      </div>

      {/* Closure Priority Table */}
      <div className="bg-white border border-gov-border rounded-sm shadow-card" data-testid="closure-priority">
        <div className="px-5 py-4 border-b border-gov-border">
          <div className="font-heading text-[15px] text-gov-navy">Closure Priority Table</div>
          <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Ranked by priority score</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gov-slate border-b-2 border-gov-border text-[10px] uppercase tracking-wider font-data text-gov-muted">
                <th className="text-left px-4 py-2.5 w-10">#</th>
                <th className="text-left px-4 py-2.5">Item</th>
                <th className="text-left px-4 py-2.5">Department</th>
                <th className="text-left px-4 py-2.5 w-20">Category</th>
                <th className="text-right px-4 py-2.5 w-24">Value</th>
                <th className="text-right px-4 py-2.5 w-24">Days</th>
                <th className="text-right px-4 py-2.5 w-20">Priority</th>
                <th className="text-left px-4 py-2.5 w-20">Risk</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {(d.closure_priority || []).map((r, i) => (
                <tr key={r.id} onClick={() => setDetailId(r.id)}
                    className={`border-b border-gov-border hover:bg-gov-slate/60 cursor-pointer row-${r.risk_level?.toLowerCase()}`}>
                  <td className="px-4 py-2.5 font-data text-gov-muted">{i + 1}</td>
                  <td className="px-4 py-2.5 max-w-[280px] truncate" title={r.item_description}>{r.item_description}</td>
                  <td className="px-4 py-2.5 text-gov-navy-mid truncate max-w-[180px]">{r.department}</td>
                  <td className="px-4 py-2.5 text-[11px] uppercase font-data text-gov-muted">{r.category}</td>
                  <td className="px-4 py-2.5 text-right stat-num text-gov-navy">₹ {fmtCr(r.procurement_value)}</td>
                  <td className="px-4 py-2.5 text-right stat-num">{r.days_pending}</td>
                  <td className="px-4 py-2.5 text-right stat-num font-bold text-gov-gold">{r.priority_score?.toFixed(1)}</td>
                  <td className="px-4 py-2.5"><StatusBadge level={r.risk_level} /></td>
                  <td className="px-4 py-2.5 text-[11px] text-gov-navy-mid max-w-[220px] truncate" title={r.action_required}>{r.action_required}</td>
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
