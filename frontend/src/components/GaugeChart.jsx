import React from "react";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";

/**
 * Circular gauge. Value 0-100. Colored zones.
 * inverted=true means HIGH values are bad (e.g. Risk Exposure).
 */
export default function GaugeChart({ value = 0, label, caption, inverted = false, testId, onGaugeClick }) {
  const v = Math.max(0, Math.min(100, value || 0));
  // Determine color
  let color;
  if (inverted) {
    color = v > 60 ? "#C0392B" : v > 30 ? "#D68910" : "#0D8E74";
  } else {
    color = v > 70 ? "#0D8E74" : v > 40 ? "#D68910" : "#C0392B";
  }
  const data = [{ name: label, value: v, fill: color }];

  return (
    <div
      className={`bg-white border border-gov-border rounded-sm shadow-card p-4 ${onGaugeClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
      data-testid={testId}
      role={onGaugeClick ? "button" : undefined}
      tabIndex={onGaugeClick ? 0 : undefined}
      onClick={onGaugeClick}
      onKeyDown={onGaugeClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onGaugeClick()) : undefined}
    >
      <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mb-1">{label}</div>
      <div className="relative w-full" style={{ height: 150 }}>
        <ResponsiveContainer>
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={data}
            startAngle={210}
            endAngle={-30}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: "#ECF0F6" }} clockWise dataKey="value" cornerRadius={4} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
          <div className="stat-num text-[26px] font-bold" style={{ color }}>
            {v.toFixed(1)}
          </div>
          <div className="text-[10px] font-data text-gov-muted uppercase tracking-wide">/100</div>
        </div>
      </div>
      {caption && (
        <div className="text-[10px] font-data text-gov-muted text-center mt-1 tracking-wide">{caption}</div>
      )}
    </div>
  );
}
