import React from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { fmtPct } from "@/lib/api";

export default function ProcurementHealthRadar({ executive = {} }) {
  const d = executive;
  const data = [
    { axis: "PO conv.", v: Math.min(100, Number(d.po_conversion_pct) || 0) },
    { axis: "Pay compl.", v: Math.min(100, Number(d.payment_completion_pct) || 0) },
    { axis: "Health", v: Math.min(100, Number(d["KPI-010_health_score"]) || 0) },
    { axis: "100 − Risk %", v: Math.min(100, 100 - (Number(d.risk_exposure_pct) || 0)) },
  ];
  return (
    <div className="bg-white border border-gov-border rounded-sm shadow-card p-5" data-testid="chart-health-radar">
      <div className="font-heading text-[15px] text-gov-navy mb-1">Performance profile</div>
      <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mb-2">Scaled 0–100</div>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid stroke="#D0D7E8" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: "#0B1F3A" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
            <Radar name="Score" dataKey="v" stroke="#D4A024" fill="#D4A024" fillOpacity={0.35} />
            <Tooltip formatter={(v) => fmtPct(v)} contentStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
