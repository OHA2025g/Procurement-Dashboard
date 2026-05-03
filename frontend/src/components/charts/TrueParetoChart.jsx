import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { fmtCr } from "@/lib/api";

export default function TrueParetoChart({ title = "Pareto", rows = [], onBarClick }) {
  const data = useMemo(() => {
    const list = (rows || []).map((r) => ({
      label: r.label || r.category || "—",
      value: Number(r.value) || 0,
    }));
    return list.sort((a, b) => b.value - a.value).slice(0, 12);
  }, [rows]);

  return (
    <div className="bg-white border border-gov-border rounded-sm shadow-card p-5" data-testid="chart-pareto">
      <div className="font-heading text-[15px] text-gov-navy mb-3">{title}</div>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => `₹ ${fmtCr(v)} Cr`} contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
            <Bar
              dataKey="value"
              radius={[0, 2, 2, 0]}
              cursor="pointer"
              onClick={(e) => onBarClick?.(e?.payload)}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={i < 3 ? "#0B1F3A" : "#5B6780"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
