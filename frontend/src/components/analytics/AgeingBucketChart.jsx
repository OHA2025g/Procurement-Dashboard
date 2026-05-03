import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { api, fmtCr } from "@/lib/api";
import { useFilters } from "@/contexts/FilterContext";

/** Buckets by days_pending from current filter scope (approximate ageing). */
export default function AgeingBucketChart() {
  const { queryParams } = useFilters();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/drilldown/records", { params: { ...queryParams, page: 1, page_size: 500, sort_by: "days_pending" } })
      .then((r) => {
        const recs = r.data?.data?.records || [];
        const b = { "0-30d": 0, "31-90d": 0, "91-180d": 0, "180d+": 0 };
        recs.forEach((rec) => {
          const days = Number(rec.days_pending) || 0;
          const v = Number(rec.procurement_value) || 0;
          if (days <= 30) b["0-30d"] += v;
          else if (days <= 90) b["31-90d"] += v;
          else if (days <= 180) b["91-180d"] += v;
          else b["180d+"] += v;
        });
        const chart = Object.entries(b).map(([name, value]) => ({ name, value }));
        if (!cancelled) setRows(chart);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [queryParams]);

  return (
    <div className="bg-white border border-gov-border rounded-sm shadow-card p-5" data-testid="chart-ageing">
      <div className="font-heading text-[15px] text-gov-navy mb-1">Ageing by value (sample)</div>
      <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mb-3">First 500 rows · ₹ Cr</div>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={rows}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => `₹ ${fmtCr(v)}`} />
            <Legend />
            <Bar dataKey="value" fill="#132E55" name="Value" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
