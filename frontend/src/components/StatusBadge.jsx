import React from "react";
import { riskColor } from "@/lib/api";

export default function StatusBadge({ level, size = "sm", testId }) {
  const color = riskColor[level] || "#5B6780";
  const px = size === "lg" ? "px-3 py-1" : "px-2 py-0.5";
  return (
    <span
      data-testid={testId || `badge-${level}`}
      className={`inline-flex items-center ${px} rounded-sm text-[10px] font-data font-semibold uppercase tracking-wider border`}
      style={{
        color,
        borderColor: `${color}55`,
        backgroundColor: `${color}12`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: color }} />
      {level}
    </span>
  );
}
