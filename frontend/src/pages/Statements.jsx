import React, { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import KPICard from "@/components/KPICard";
import StatusBadge from "@/components/StatusBadge";
import { api, fmtCr, statementColor, statementLabel } from "@/lib/api";
import { useFilters } from "@/contexts/FilterContext";
import { useDrilldown } from "@/contexts/DrilldownContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, Treemap } from "recharts";
import { Package, Layers, FileSpreadsheet, FileClock, XCircle } from "lucide-react";

export default function Statements() {
  const { queryParams } = useFilters();
  const { openDrilldown, openRecordDetail } = useDrilldown();
  const [data, setData] = useState(null);
  const [actions, setActions] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("A");

  useEffect(() => {
    setLoading(true);
    api.get("/kpi/statements", { params: queryParams })
      .then((r) => setData(r.data.data))
      .finally(() => setLoading(false));
  }, [queryParams]);

  useEffect(() => {
    api.get("/procurement/action-queue", { params: { ...queryParams, statement: activeTab, limit: 25 } })
      .then((r) => setActions((prev) => ({ ...prev, [activeTab]: r.data.data })))
      .catch(() => setActions((prev) => ({ ...prev, [activeTab]: null })));
  }, [activeTab, queryParams]);

  const statementsArr = data?.per_statement || [];

  return (
    <Layout title="Statement Analysis" subtitle="Deep-dive into A·B·C·D lifecycle stages" page="statements">
      {/* KPI cards: 2 per statement */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {statementsArr.map((s) => (
          <React.Fragment key={s.statement}>
            <KPICard
              label={`Stmt ${s.statement} — Value`}
              value={s.value} format="cr" suffix=" Cr" prefix="₹"
              tone={s.statement === "A" ? "med" : s.statement === "B" ? "default" : s.statement === "C" ? "gold" : "crit"}
              caption={statementLabel[s.statement]}
              testId={`stmt-${s.statement}-value`}
              onClick={() =>
                openDrilldown({
                  title: `Statement ${s.statement} — ${statementLabel[s.statement]}`,
                  filters: { statement: s.statement },
                  source: "kpi_card",
                })
              }
            />
          </React.Fragment>
        ))}
        {statementsArr.map((s) => (
          <KPICard
            key={`c-${s.statement}`}
            label={`Stmt ${s.statement} — Count`}
            value={s.count}
            caption={`${s.share_pct.toFixed(1)}% of portfolio`}
            testId={`stmt-${s.statement}-count`}
            icon={Package}
            onClick={() =>
              openDrilldown({
                title: `Statement ${s.statement} — line items`,
                filters: { statement: s.statement },
                source: "kpi_card",
              })
            }
          />
        ))}
      </div>

      {/* Clustered bar & treemap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5">
          <div className="mb-3">
            <div className="font-heading text-[15px] text-gov-navy">Value & Count Per Statement</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Lifecycle comparison</div>
          </div>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={statementsArr.map(s => ({ ...s, label: `${s.statement}` }))}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#D0D7E8" }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }} />
                <Bar
                  yAxisId="left"
                  dataKey="value"
                  name="Value ₹Cr"
                  radius={[3, 3, 0, 0]}
                  cursor="pointer"
                  onClick={(e) => {
                    const st = e?.payload?.statement;
                    if (st) openDrilldown({ title: `Statement ${st}`, filters: { statement: st }, source: "chart" });
                  }}
                >
                  {statementsArr.map((s) => <Cell key={s.statement} fill={statementColor[s.statement]} />)}
                </Bar>
                <Bar yAxisId="right" dataKey="count" name="Count" fill="#D4A024" radius={[3, 3, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gov-border rounded-sm shadow-card p-5">
          <div className="mb-3">
            <div className="font-heading text-[15px] text-gov-navy">Risk-Weighted Score by Statement</div>
            <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mt-0.5">Critical ×1.0 · High ×0.75 · Medium ×0.5 · Low ×0.25</div>
          </div>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={statementsArr} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#5B6780" }} axisLine={false} tickLine={false} />
                <YAxis dataKey="statement" type="category" tick={{ fontSize: 12, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono", border: "1px solid #D0D7E8" }} />
                <Bar dataKey="risk_score" name="Risk Score" radius={[0, 3, 3, 0]}>
                  {statementsArr.map((s) => <Cell key={s.statement} fill={statementColor[s.statement]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Statement Table Tabs */}
      <div className="bg-white border border-gov-border rounded-sm shadow-card" data-testid="stmt-tabs-wrapper">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="border-b border-gov-border px-4 pt-3">
            <TabsList className="bg-transparent p-0 gap-0 h-auto">
              {["A", "B", "C", "D"].map((s) => (
                <TabsTrigger
                  key={s}
                  value={s}
                  data-testid={`stmt-tab-${s}`}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-gov-gold data-[state=active]:bg-transparent data-[state=active]:text-gov-navy data-[state=active]:shadow-none px-5 py-3 text-[12px] uppercase tracking-[0.12em] font-data text-gov-muted"
                >
                  <span className="font-bold mr-1.5">{s}</span>
                  <span>{statementLabel[s]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {["A", "B", "C", "D"].map((s) => (
            <TabsContent key={s} value={s} className="m-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-gov-slate border-b-2 border-gov-border text-[10px] uppercase tracking-wider font-data text-gov-muted">
                      <th className="text-left px-4 py-2.5">Item</th>
                      <th className="text-left px-4 py-2.5">Department</th>
                      <th className="text-left px-4 py-2.5 w-24">Category</th>
                      <th className="text-right px-4 py-2.5 w-28">Value</th>
                      <th className="text-right px-4 py-2.5 w-24">Paid</th>
                      <th className="text-right px-4 py-2.5 w-28">Outstanding</th>
                      <th className="text-left px-4 py-2.5 w-24">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(actions[s]?.rows || []).map((r) => (
                      <tr key={r.id} onClick={() => openRecordDetail(r.id)}
                          className={`border-b border-gov-border hover:bg-gov-slate/60 cursor-pointer row-${r.risk_level?.toLowerCase()}`}>
                        <td className="px-4 py-2.5 max-w-[380px] truncate" title={r.item_description}>{r.item_description}</td>
                        <td className="px-4 py-2.5 text-gov-navy-mid truncate max-w-[180px]">{r.department}</td>
                        <td className="px-4 py-2.5 font-data text-[11px] uppercase text-gov-muted">{r.category}</td>
                        <td className="px-4 py-2.5 text-right stat-num text-gov-navy font-semibold">₹ {fmtCr(r.procurement_value)}</td>
                        <td className="px-4 py-2.5 text-right stat-num text-gov-med">₹ {fmtCr(r.paid_amount)}</td>
                        <td className="px-4 py-2.5 text-right stat-num text-gov-crit">₹ {fmtCr(r.outstanding_amount)}</td>
                        <td className="px-4 py-2.5"><StatusBadge level={r.risk_level} /></td>
                      </tr>
                    ))}
                    {(!actions[s] || !actions[s].rows?.length) && (
                      <tr><td colSpan={7} className="text-center py-6 text-gov-muted text-[12px]">No records in Statement {s}.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

    </Layout>
  );
}
