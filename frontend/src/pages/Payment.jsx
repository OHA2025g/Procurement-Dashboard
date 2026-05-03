import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import KPICard from "@/components/KPICard";
import GaugeChart from "@/components/GaugeChart";
import StatusBadge from "@/components/StatusBadge";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import { api, fmtCr } from "@/lib/api";
import { useFilters } from "@/contexts/FilterContext";
import { useDrilldown } from "@/contexts/DrilldownContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { CreditCard, Wallet, FileCheck2, AlertCircle } from "lucide-react";

export default function Payment() {
  const { queryParams } = useFilters();
  const { openDrilldown } = useDrilldown();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get("/kpi/payment", { params: queryParams })
      .then((r) => setData(r.data.data))
      .finally(() => setLoading(false));
  }, [queryParams]);

  const d = data || {};
  const splitData = [
    { name: "Fully Paid", value: d["KPI-035_fully_paid_count"] || 0, color: "#0D8E74" },
    { name: "Partially Paid", value: d["KPI-036_partial_paid_count"] || 0, color: "#D68910" },
    { name: "Unpaid", value: d["KPI-037_unpaid_count"] || 0, color: "#C0392B" },
  ];

  return (
    <Layout title="PO & Payment Monitoring" subtitle="Statement A — purchase orders, payments, outstanding" page="payment">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KPICard label="PO Value" value={d["KPI-021_po_value"]} format="cr" suffix=" Cr" prefix="₹" tone="gold" icon={FileCheck2} testId="kpi-po-total"
          onClick={() => openDrilldown({ title: "KPI-021 — PO Value", kpiId: "KPI-021", source: "kpi_card", filters: { po_value_gt: true } })} />
        <KPICard label="PO Count" value={d["KPI-022_po_count"]} icon={FileCheck2} testId="kpi-po-count"
          onClick={() => openDrilldown({ title: "KPI-022 — PO Count", kpiId: "KPI-022", source: "kpi_card", filters: { po_value_gt: true } })} />
        <KPICard label="Paid Value" value={d["KPI-031_paid_value"]} format="cr" suffix=" Cr" prefix="₹" tone="med" icon={Wallet} testId="kpi-paid-value"
          onClick={() => openDrilldown({ title: "KPI-031 — Paid", kpiId: "KPI-031", source: "kpi_card", filters: { paid_amount_gt: true } })} />
        <KPICard label="Outstanding" value={d["KPI-032_outstanding_value"]} format="cr" suffix=" Cr" prefix="₹" tone="crit" icon={AlertCircle} testId="kpi-outstanding-val"
          onClick={() => openDrilldown({ title: "KPI-032 — Outstanding", kpiId: "KPI-032", source: "kpi_card", filters: { outstanding_amount_gt: true } })} />
        <KPICard label="Payment Completion" value={d["KPI-033_payment_completion_pct"]} format="pct" tone="med" testId="kpi-paycomp"
          onClick={() => openDrilldown({ title: "KPI-033 — Payment completion scope", kpiId: "KPI-033", source: "kpi_card", filters: { po_value_gt: true } })} />
        <KPICard label="Outstanding %" value={d["KPI-034_outstanding_pct"]} format="pct" tone="crit" testId="kpi-outstanding-pct"
          onClick={() => openDrilldown({ title: "KPI-034 — Payment pending %", kpiId: "KPI-034", source: "kpi_card", filters: { outstanding_amount_gt: true } })} />
        <KPICard label="Fully Paid Count" value={d["KPI-035_fully_paid_count"]} tone="med" testId="kpi-fully-paid"
          onClick={() => openDrilldown({ title: "KPI-035 — Fully paid", kpiId: "KPI-035", source: "kpi_card", filters: { payment_status: "fully_paid" } })} />
        <KPICard label="Partially Paid" value={d["KPI-036_partial_paid_count"]} tone="high" testId="kpi-partial-paid"
          onClick={() => openDrilldown({ title: "KPI-036 — Partially paid", kpiId: "KPI-036", source: "kpi_card", filters: { payment_status: "partially_paid" } })} />
        <KPICard label="Unpaid POs" value={d["KPI-037_unpaid_count"]} tone="crit" testId="kpi-unpaid"
          onClick={() => openDrilldown({ title: "KPI-037 — Unpaid", kpiId: "KPI-037", source: "kpi_card", filters: { payment_status: "unpaid" } })} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <GaugeChart value={d["KPI-033_payment_completion_pct"]} label="Payment Completion %" testId="gauge-payment-completion" />
        <GaugeChart value={d["KPI-034_outstanding_pct"]} label="Outstanding %" inverted testId="gauge-outstanding" />
        <div className="bg-white border border-gov-border rounded-sm shadow-card p-4">
          <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mb-1">Payment Status Split</div>
          <div style={{ width: "100%", height: 150 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={splitData}
                  dataKey="value"
                  outerRadius={60}
                  innerRadius={35}
                  paddingAngle={1}
                  onClick={(_, idx) => {
                    const name = splitData[idx]?.name || "";
                    const ps =
                      name === "Fully Paid" ? "fully_paid" : name === "Partially Paid" ? "partially_paid" : "unpaid";
                    openDrilldown({ title: `Payment — ${name}`, source: "chart", filters: { payment_status: ps } });
                  }}
                >
                  {splitData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-around mt-1 text-[10px] font-data">
            {splitData.map((s) => (
              <div key={s.name} className="flex items-center gap-1">
                <span className="w-2 h-2" style={{ backgroundColor: s.color }} />
                <span className="text-gov-navy">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By Department Stacked Bar */}
      <div className="bg-white border border-gov-border rounded-sm shadow-card p-5 mb-6" data-testid="chart-payment-dept">
        <div className="mb-3">
          <div className="font-heading text-[15px] text-gov-navy">Outstanding by Department</div>
          <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Top departments with payment pending</div>
        </div>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
              <BarChart data={(d.by_department || []).slice(0, 12)} margin={{ left: 4, right: 20, bottom: 40 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={{ stroke: "#D0D7E8" }} tickLine={false} interval={0} angle={-30} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `₹ ${v.toFixed(2)} Cr`} contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }} />
                <Bar
                  dataKey="value"
                  fill="#C0392B"
                  radius={[3, 3, 0, 0]}
                  name="Outstanding"
                  onClick={(e) => {
                    const dept = e?.payload?.label;
                    if (dept) openDrilldown({ title: `Outstanding — ${dept}`, source: "chart", filters: { department: dept, outstanding_amount_gt: true } });
                  }}
                />
              </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Pending Items Table */}
      <div className="bg-white border border-gov-border rounded-sm shadow-card" data-testid="top-pending-payment">
        <div className="px-5 py-4 border-b border-gov-border">
          <div className="font-heading text-[15px] text-gov-navy">Top 10 Pending Payment Items</div>
          <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Ranked by outstanding amount · Finance follow-up required</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gov-slate border-b-2 border-gov-border text-[10px] uppercase tracking-wider font-data text-gov-muted">
                <th className="text-left px-4 py-2.5">Item</th>
                <th className="text-left px-4 py-2.5">Department</th>
                <th className="text-right px-4 py-2.5 w-28">PO (Cr)</th>
                <th className="text-right px-4 py-2.5 w-24">Paid (Cr)</th>
                <th className="text-right px-4 py-2.5 w-28">Outstanding</th>
                <th className="text-left px-4 py-2.5 w-20">Risk</th>
                <th className="text-left px-4 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {(d.top10_pending || []).map((r) => (
                <tr key={r.id} onClick={() => setDetailId(r.id)}
                    className={`border-b border-gov-border hover:bg-gov-slate/60 cursor-pointer row-${r.risk_level?.toLowerCase()}`}>
                  <td className="px-4 py-2.5 max-w-[340px] truncate" title={r.item_description}>{r.item_description}</td>
                  <td className="px-4 py-2.5 text-gov-navy-mid truncate max-w-[180px]">{r.department}</td>
                  <td className="px-4 py-2.5 text-right stat-num text-gov-navy">₹ {fmtCr(r.po_value)}</td>
                  <td className="px-4 py-2.5 text-right stat-num text-gov-med">₹ {fmtCr(r.paid_amount)}</td>
                  <td className="px-4 py-2.5 text-right stat-num font-bold text-gov-crit">₹ {fmtCr(r.outstanding_amount)}</td>
                  <td className="px-4 py-2.5"><StatusBadge level={r.risk_level} /></td>
                  <td className="px-4 py-2.5 text-[11px] text-gov-navy-mid">{r.action_required}</td>
                </tr>
              ))}
              {loading && <tr><td colSpan={7} className="text-center py-6 text-gov-muted text-[12px]">Loading…</td></tr>}
              {!loading && !d.top10_pending?.length && <tr><td colSpan={7} className="text-center py-6 text-gov-muted text-[12px]">No pending payments.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <ItemDetailDrawer open={!!detailId} recordId={detailId} onClose={() => setDetailId(null)} />
    </Layout>
  );
}
