import React from "react";
import { fmtCr } from "@/lib/api";

/** Simplified lifecycle strip (full Sankey deferred — values from executive KPI bundle). */
export default function ProcurementSankey({ executive = {} }) {
  const d = executive;
  const steps = [
    { label: "Total portfolio", value: d["KPI-001_total_portfolio"] },
    { label: "PO issued", value: d.po_issued_value },
    { label: "Paid", value: d.paid_value },
    { label: "Outstanding", value: d.outstanding_value },
  ];
  return (
    <div className="bg-white border border-gov-border rounded-sm shadow-card p-5" data-testid="chart-sankey-lite">
      <div className="font-heading text-[15px] text-gov-navy mb-1">Lifecycle value chain</div>
      <div className="text-[10px] uppercase tracking-[0.14em] font-data text-gov-muted mb-4">₹ Crore · directional flow</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {steps.map((s) => (
          <div key={s.label} className="border border-gov-border rounded-sm p-3 bg-gov-slate/40 text-center">
            <div className="text-[9px] uppercase text-gov-muted font-data mb-1">{s.label}</div>
            <div className="stat-num text-[15px] font-bold text-gov-navy">₹ {fmtCr(s.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
