import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { fmtCr } from "@/lib/api";

/**
 * @param {object} distributions — payload from /drilldown/facets (lists + chart_by_*)
 * @param {string} [fetchError] — when facets request failed (shown inline, not global banner)
 */
export default function DrilldownMiniCharts({ distributions, loading, fetchError }) {
  if (loading && !distributions && !fetchError) {
    return <div className="px-5 py-2 text-[11px] text-gov-muted shrink-0">Loading facet summary…</div>;
  }
  const d = distributions || {};
  const stmtChart = Array.isArray(d.chart_by_statement) ? d.chart_by_statement : [];
  const deptChart = Array.isArray(d.chart_by_department) ? d.chart_by_department : [];

  const chips = [
    ["Statements", d.statements],
    ["Departments", d.departments],
    ["Categories", d.categories],
    ["Statuses", d.statuses],
    ["Risk levels", d.risk_levels],
  ].filter(([, arr]) => Array.isArray(arr) && arr.length);

  const hasCharts = stmtChart.length > 0 || deptChart.length > 0;

  return (
    <div className="px-5 py-3 border-b border-gov-border shrink-0 space-y-4 bg-gov-slate/20">
      <div className="text-[9px] uppercase tracking-wider text-gov-muted font-data">Distribution</div>

      {fetchError && (
        <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-sm px-2 py-1.5 font-data">
          Could not load distribution data: {fetchError}
        </div>
      )}

      {hasCharts && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stmtChart.length > 0 && (
            <div className="bg-white border border-gov-border rounded-sm p-3" data-testid="drill-mini-stmt">
              <div className="text-[10px] font-data text-gov-navy mb-2">By statement (₹ Cr)</div>
              <div style={{ width: "100%", height: 160 }}>
                <ResponsiveContainer>
                  <BarChart data={stmtChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => `₹ ${fmtCr(v)}`} contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                    <Bar dataKey="value" fill="#0B1F3A" name="Value" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {deptChart.length > 0 && (
            <div className="bg-white border border-gov-border rounded-sm p-3" data-testid="drill-mini-dept">
              <div className="text-[10px] font-data text-gov-navy mb-2">Top departments (₹ Cr)</div>
              <div style={{ width: "100%", height: 160 }}>
                <ResponsiveContainer>
                  <BarChart data={deptChart} layout="vertical" margin={{ left: 4, right: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(v) => `₹ ${fmtCr(v)}`} contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                    <Bar dataKey="value" fill="#D4A024" name="Value" radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {chips.map(([label, arr]) => (
            <div key={label} className="min-w-[120px] max-w-[240px]">
              <div className="text-[9px] text-gov-muted font-data mb-0.5">{label}</div>
              <div className="text-[10px] font-data text-gov-navy line-clamp-3" title={arr.join(", ")}>
                {arr.slice(0, 8).join(" · ")}
                {arr.length > 8 ? "…" : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {!fetchError && !hasCharts && chips.length === 0 && (
        <div className="text-[11px] text-gov-muted font-data">No facet metadata for this scope (empty match or no collection access).</div>
      )}
    </div>
  );
}
