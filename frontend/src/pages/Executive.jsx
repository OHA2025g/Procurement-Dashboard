import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import KPICard from "@/components/KPICard";
import GaugeChart from "@/components/GaugeChart";
import StatusBadge from "@/components/StatusBadge";
import WaterfallChart from "@/components/WaterfallChart";
import ProcurementSankey from "@/components/charts/ProcurementSankey";
import ProcurementHealthRadar from "@/components/charts/ProcurementHealthRadar";
import TrueParetoChart from "@/components/charts/TrueParetoChart";
import AgeingBucketChart from "@/components/analytics/AgeingBucketChart";
import BatchComparisonCard from "@/components/analytics/BatchComparisonCard";
import SmartNarrativeCard from "@/components/analytics/SmartNarrativeCard";
import { api, fmtCr, statementColor, statementLabel } from "@/lib/api";
import { useFilters } from "@/contexts/FilterContext";
import { useDrilldown } from "@/contexts/DrilldownContext";
import {
  IndianRupee, Package, FileCheck2, Wallet, AlertTriangle,
  Target, Activity,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export default function Executive() {
  const { queryParams } = useFilters();
  const { openDrilldown, openRecordDetail } = useDrilldown();
  const [data, setData] = useState(null);
  const [statements, setStatements] = useState(null);
  const [catData, setCatData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/kpi/executive", { params: queryParams }),
      api.get("/kpi/statements", { params: queryParams }),
      api.get("/kpi/category", { params: queryParams }),
    ])
      .then(([a, b, c]) => {
        setData(a.data.data);
        setStatements(b.data.data);
        setCatData(c.data.data);
      })
      .finally(() => setLoading(false));
  }, [queryParams]);

  const d = data || {};

  const drill = (title, filters, kpiId) => {
    openDrilldown({ title, filters, kpiId, source: "kpi_card" });
  };

  const onWaterfallBar = (seg) => {
    const label = seg?.label;
    if (label === "Total Portfolio") drill("Total procurement portfolio", { kpi_preset: "total_portfolio" }, "KPI-001");
    else if (label === "Not Yet PO") drill("Not yet converted to PO", { kpi_preset: "not_yet_po" }, "WF-01");
    else if (label === "Unpaid on PO") drill("Unpaid on purchase orders", { kpi_preset: "unpaid_on_po" }, "WF-02");
  };

  return (
    <Layout
      title="Executive Overview"
      subtitle="Consolidated snapshot of procurement lifecycle & risk · Click KPIs or charts to drill into records"
      page="executive"
    >
      {/* KPI GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KPICard label="Total Portfolio" value={d["KPI-001_total_portfolio"]} format="cr" suffix=" Cr" prefix="₹" tone="gold" icon={IndianRupee} testId="kpi-total-portfolio" onClick={() => drill("Total procurement portfolio", { kpi_preset: "total_portfolio" }, "KPI-001")} />
        <KPICard label="Total Items" value={d["KPI-002_total_items"]} icon={Package} testId="kpi-total-items" onClick={() => drill("All procurement line items", { kpi_preset: "total_items" }, "KPI-002")} />
        <KPICard label="PO Issued Value" value={d.po_issued_value} format="cr" suffix=" Cr" prefix="₹" icon={FileCheck2} testId="kpi-po-value" tone="med" onClick={() => drill("PO issued (Statement A)", { kpi_preset: "po_issued" }, "PO-VAL")} />
        <KPICard label="Paid Value" value={d.paid_value} format="cr" suffix=" Cr" prefix="₹" tone="med" icon={Wallet} testId="kpi-paid" onClick={() => drill("Paid procurement amounts", { kpi_preset: "paid" }, "PAID")} />
        <KPICard label="Outstanding" value={d.outstanding_value} format="cr" suffix=" Cr" prefix="₹" tone="high" icon={AlertTriangle} testId="kpi-outstanding" onClick={() => drill("Outstanding payments", { kpi_preset: "outstanding" }, "OUT")} />
        <KPICard label="Backlog Value" value={d.backlog_value} format="cr" suffix=" Cr" prefix="₹" tone="gold" icon={Activity} testId="kpi-backlog" onClick={() => drill("Backlog (awaited / retender)", { kpi_preset: "backlog" }, "BL")} />
        <KPICard label="PO Conversion" value={d.po_conversion_pct} format="pct" tone="med" testId="kpi-po-conversion" onClick={() => drill("PO conversion context", { kpi_preset: "po_conversion" }, "KPI-PO-CONV")} />
        <KPICard label="Payment Completion" value={d.payment_completion_pct} format="pct" tone="med" testId="kpi-payment-completion" onClick={() => drill("Payment completion scope (PO issued)", { kpi_preset: "payment_completion" }, "KPI-PAY")} />
        <KPICard label="Risk Exposure" value={d.risk_exposure_pct} format="pct" tone="crit" testId="kpi-risk-exposure" onClick={() => drill("Risk exposure (critical / high)", { kpi_preset: "risk" }, "RISK")} />
        <KPICard label="High-Value Items (>10Cr)" value={d["KPI-008_high_value_count"]} icon={Target} testId="kpi-highvalue-count" onClick={() => drill("High-value procurements (>10 Cr)", { kpi_preset: "high_value" }, "KPI-008")} />
      </div>

      {/* GAUGES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <GaugeChart value={d["KPI-010_health_score"]} label="Procurement Health Score" caption="Higher is better · Composite of 5 factors" testId="gauge-health" onGaugeClick={() => drill("Health score — full portfolio", { kpi_preset: "health_score" }, "KPI-010")} />
        <GaugeChart value={d.payment_completion_pct} label="Payment Completion %" caption="Paid vs PO issued" testId="gauge-payment" onGaugeClick={() => drill("Payment completion scope", { kpi_preset: "payment_completion" }, "GAUGE-PAY")} />
        <GaugeChart value={d.risk_exposure_pct} label="Risk Exposure %" caption="Lower is better · Inactive + backlog + outstanding" inverted testId="gauge-risk" onGaugeClick={() => drill("Risk-weighted records", { kpi_preset: "risk" }, "GAUGE-RISK")} />
      </div>

      <SmartNarrativeCard title="Executive narrative" executive={d} />

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5" data-testid="chart-statements">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-heading text-[15px] text-gov-navy">Portfolio by Statement</div>
              <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Click a segment to filter · A·B·C·D</div>
            </div>
            <div className="text-[11px] font-data text-gov-muted">₹ in Crore</div>
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={(statements?.per_statement || []).map((s) => ({
                    name: `${s.statement} — ${statementLabel[s.statement]}`,
                    value: s.value,
                    statement: s.statement,
                  }))}
                  dataKey="value"
                  outerRadius={90}
                  innerRadius={55}
                  paddingAngle={1}
                  stroke="#fff"
                  onClick={(e) => {
                    const st = e?.payload?.statement ?? e?.statement;
                    if (st) {
                      openDrilldown({
                        title: `Statement ${st} — ${statementLabel[st]}`,
                        filters: { statement: st },
                        source: "chart",
                        kpiId: `STMT-${st}`,
                      });
                    }
                  }}
                  cursor="pointer"
                >
                  {(statements?.per_statement || []).map((s) => (
                    <Cell key={s.statement} fill={statementColor[s.statement]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => `₹ ${Number(v).toFixed(2)} Cr`}
                  contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }}
                />
                <Legend verticalAlign="bottom" iconType="square" wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5" data-testid="chart-categories">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-heading text-[15px] text-gov-navy">Portfolio by Category</div>
              <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Click a bar (value stack) to filter category</div>
            </div>
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={catData?.per_category || []} margin={{ top: 12, right: 12, left: 0, bottom: 12 }}>
                <XAxis dataKey="category" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#0B1F3A" }} axisLine={{ stroke: "#D0D7E8" }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => `₹ ${Number(v).toFixed(2)} Cr`}
                  contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }}
                />
                <Bar
                  dataKey="value"
                  fill="#0B1F3A"
                  radius={[3, 3, 0, 0]}
                  cursor="pointer"
                  onClick={(e) => {
                    const cat = e?.payload?.category ?? e?.category;
                    if (cat) {
                      openDrilldown({
                        title: `Category — ${cat}`,
                        filters: { category: cat },
                        source: "chart",
                      });
                    }
                  }}
                />
                <Bar
                  dataKey="po_value"
                  fill="#D4A024"
                  radius={[3, 3, 0, 0]}
                  cursor="pointer"
                  onClick={(e) => {
                    const cat = e?.payload?.category ?? e?.category;
                    if (cat) {
                      openDrilldown({
                        title: `Category — ${cat} (PO value)`,
                        filters: { category: cat, kpi_preset: "po_issued" },
                        source: "chart",
                      });
                    }
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2 px-2">
          <div className="font-heading text-[15px] text-gov-navy">Lifecycle Cash-Flow Waterfall</div>
          <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted">₹ Crore · click a bar</div>
        </div>
        <WaterfallChart
          testId="chart-waterfall"
          onBarClick={onWaterfallBar}
          hintByLabel={{
            "Total Portfolio": "Full filtered portfolio (KPI-001).",
            "Not Yet PO": "Value not yet on purchase order.",
            "Unpaid on PO": "PO issued but not yet fully paid.",
          }}
          segments={[
            { label: "Total Portfolio", value: d["KPI-001_total_portfolio"] || 0, type: "total" },
            { label: "Not Yet PO", value: (d["KPI-001_total_portfolio"] || 0) - (d.po_issued_value || 0), type: "sub", color: "#132E55" },
            { label: "Unpaid on PO", value: (d.po_issued_value || 0) - (d.paid_value || 0), type: "sub", color: "#D68910" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ProcurementSankey executive={d} />
        <ProcurementHealthRadar executive={d} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <TrueParetoChart
          title="Pareto — category (value)"
          rows={(catData?.per_category || []).map((c) => ({ label: c.category, value: c.value }))}
          onBarClick={(row) =>
            row?.label &&
            openDrilldown({
              title: `Category — ${row.label}`,
              filters: { category: row.label },
              source: "chart",
            })
          }
        />
        <AgeingBucketChart />
      </div>

      <BatchComparisonCard />

      <div className="bg-white border border-gov-border rounded-sm shadow-card" data-testid="top10-table">
        <div className="px-5 py-4 border-b border-gov-border flex items-center justify-between">
          <div>
            <div className="font-heading text-[15px] text-gov-navy">Top 10 High-Value Items</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Click a row for record detail</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gov-slate border-b-2 border-gov-border text-[10px] uppercase tracking-wider font-data text-gov-muted">
                <th className="text-left px-4 py-2.5 w-10">#</th>
                <th className="text-left px-4 py-2.5">Item</th>
                <th className="text-left px-4 py-2.5">Department</th>
                <th className="text-left px-4 py-2.5 w-24">Category</th>
                <th className="text-right px-4 py-2.5 w-32">Value (Cr)</th>
                <th className="text-left px-4 py-2.5 w-32">Status</th>
                <th className="text-left px-4 py-2.5 w-24">Risk</th>
              </tr>
            </thead>
            <tbody>
              {(d.top10 || []).map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => openRecordDetail(r.id)}
                  className={`border-b border-gov-border hover:bg-gov-slate/60 cursor-pointer row-${r.risk_level?.toLowerCase()}`}
                  data-testid={`top10-row-${i}`}
                >
                  <td className="px-4 py-3 font-data text-gov-muted">{i + 1}</td>
                  <td className="px-4 py-3 max-w-[380px] truncate" title={r.item_description}>{r.item_description}</td>
                  <td className="px-4 py-3 text-gov-navy-mid truncate max-w-[200px]" title={r.department}>{r.department}</td>
                  <td className="px-4 py-3 font-data text-gov-muted text-[11px] uppercase">{r.category}</td>
                  <td className="px-4 py-3 text-right stat-num font-semibold text-gov-navy">₹ {fmtCr(r.procurement_value)}</td>
                  <td className="px-4 py-3 font-data text-[11px] uppercase">{r.current_status?.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3"><StatusBadge level={r.risk_level} /></td>
                </tr>
              ))}
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-gov-muted text-[12px]">Loading…</td>
                </tr>
              )}
              {!loading && (!d.top10 || d.top10.length === 0) && (
                <tr><td colSpan={7} className="text-center py-6 text-gov-muted text-[12px]">No records.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
