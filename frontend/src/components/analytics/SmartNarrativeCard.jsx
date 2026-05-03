import React from "react";
import { fmtCr, fmtPct } from "@/lib/api";

export default function SmartNarrativeCard({ title = "Executive narrative", executive = {} }) {
  const d = executive;
  const parts = [
    `Total portfolio is ₹ ${fmtCr(d["KPI-001_total_portfolio"])} Cr across ${d["KPI-002_total_items"] ?? "—"} line items.`,
    `PO conversion is ${fmtPct(d.po_conversion_pct)} of portfolio value; payment completion on issued POs is ${fmtPct(d.payment_completion_pct)}.`,
    `Risk exposure (inactive, backlog, and outstanding) is about ${fmtPct(d.risk_exposure_pct)} of portfolio; health score is ${d["KPI-010_health_score"] ?? "—"}/100.`,
  ];
  return (
    <div className="bg-white border border-gov-border rounded-sm shadow-card p-5 mb-6 border-l-4 border-l-gov-gold" data-testid="smart-narrative">
      <div className="font-heading text-[15px] text-gov-navy mb-2">{title}</div>
      <div className="space-y-2 text-[13px] text-gov-navy-mid leading-relaxed">
        {parts.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
}
