import React from "react";
import { fmtCr } from "@/lib/api";

/**
 * Simple heatmap grid: rows=deptsArr, cols=[{label}], values = Map(`${row}|${col}` -> number)
 * Color: green-to-red based on % of max value.
 */
export default function RiskHeatmap({ rows, cols, values, title, testId, scale = "crit", unit = "Cr" }) {
  const max = Math.max(...Object.values(values), 1);
  const colorScale = (v) => {
    if (!v) return "#F4F6FA";
    const t = v / max;
    if (scale === "crit") {
      // 0 → green, 0.5 → amber, 1 → red
      if (t < 0.2) return "#D5E8DD";
      if (t < 0.4) return "#A2CDB9";
      if (t < 0.6) return "#F0C849";
      if (t < 0.8) return "#DE8A4A";
      return "#C0392B";
    }
    return `rgba(11,31,58,${0.1 + t * 0.8})`;
  };

  return (
    <div className="bg-white border border-gov-border rounded-sm shadow-card p-4" data-testid={testId}>
      {title && (
        <div className="text-[11px] uppercase tracking-[0.14em] font-data text-gov-muted mb-3">
          {title}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[10px] uppercase tracking-wide font-data text-gov-muted p-2 w-1/3">
                Department
              </th>
              {cols.map((c) => (
                <th
                  key={c.label}
                  className="text-center text-[10px] uppercase tracking-wide font-data text-gov-muted p-2"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <td className="text-[11px] font-data text-gov-navy p-1.5 pr-3 truncate max-w-[220px]" title={r}>
                  {r}
                </td>
                {cols.map((c) => {
                  const v = values[`${r}|${c.label}`] || 0;
                  const bg = colorScale(v);
                  const txt = v > max * 0.5 ? "#fff" : "#0B1F3A";
                  return (
                    <td key={c.label} className="p-1">
                      <div
                        className="heatmap-cell rounded-sm flex items-center justify-center text-[10px] font-data font-semibold"
                        style={{ backgroundColor: bg, color: txt, minHeight: 34, padding: "4px 6px" }}
                        title={`${r} — ${c.label}: ${fmtCr(v)} ${unit}`}
                      >
                        {v ? fmtCr(v) : "—"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[10px] font-data text-gov-muted">
        <span>Low</span>
        <div className="flex h-2 w-40 rounded-sm overflow-hidden border border-gov-border">
          {["#D5E8DD", "#A2CDB9", "#F0C849", "#DE8A4A", "#C0392B"].map((c) => (
            <div key={c} className="flex-1" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span>High</span>
      </div>
    </div>
  );
}
