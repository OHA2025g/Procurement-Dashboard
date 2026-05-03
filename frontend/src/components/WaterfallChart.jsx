import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell } from "recharts";

/**
 * Waterfall chart: Total → subtract segments.
 * segments: [{ label, value, type: 'total'|'sub' }]
 */
export default function WaterfallChart({ segments = [], height = 280, testId, onBarClick, hintByLabel = {} }) {
  // Build cumulative view
  let running = 0;
  const data = segments.map((s, i) => {
    if (s.type === "total") {
      running = s.value;
      return {
        label: s.label,
        base: 0,
        delta: s.value,
        end: s.value,
        _color: "#132E55",
      };
    }
    // subtraction: bar from (running - val) to running
    const base = running - s.value;
    const color = s.color || (s.value > 0 ? "#C0392B" : "#0D8E74");
    const result = {
      label: s.label,
      base,
      delta: s.value,
      end: running,
      _color: color,
    };
    running = base;
    return result;
  });

  return (
    <div className="bg-white border border-gov-border rounded-sm shadow-card p-4" data-testid={testId}>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 24, right: 24, bottom: 24, left: 48 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#5B6780", fontFamily: "IBM Plex Mono" }}
              axisLine={{ stroke: "#D0D7E8" }}
              tickLine={false}
              interval={0}
              height={50}
              angle={-15}
              textAnchor="end"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#5B6780", fontFamily: "IBM Plex Mono" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v.toLocaleString()}`}
            />
            <Tooltip
              formatter={(_v, _n, { payload }) => [`₹ ${payload.delta.toFixed(2)} Cr`, payload.label]}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload;
                const hint = hintByLabel?.[p?.label];
                return (
                  <div className="bg-white border border-gov-border px-2 py-1.5 text-[11px] font-data shadow-sm max-w-xs">
                    <div className="font-semibold text-gov-navy">{p?.label}</div>
                    <div>₹ {p?.delta?.toFixed(2)} Cr</div>
                    {hint ? <div className="text-gov-muted mt-1">{hint}</div> : null}
                  </div>
                );
              }}
            />
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="delta" stackId="a" radius={[2, 2, 0, 0]} cursor={onBarClick ? "pointer" : "default"}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d._color}
                  onClick={onBarClick ? () => onBarClick(d, i) : undefined}
                />
              ))}
              <LabelList
                dataKey="delta"
                position="top"
                style={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#0B1F3A" }}
                formatter={(v) => `${v.toFixed(1)}`}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
