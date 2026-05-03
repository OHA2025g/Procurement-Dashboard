import React from "react";
import { ChevronRight } from "lucide-react";

export default function DrilldownBreadcrumb({ segments = [], onNavigate }) {
  if (!segments?.length) return null;
  return (
    <nav className="px-5 py-2 border-b border-gov-border bg-gov-slate/30 shrink-0 flex flex-wrap items-center gap-1 text-[11px] font-data" aria-label="Drill scope">
      {segments.map((seg, i) => (
        <React.Fragment key={`${seg.label}-${i}`}>
          {i > 0 && <ChevronRight size={12} className="text-gov-muted shrink-0" />}
          <button
            type="button"
            disabled={!!seg.disabled}
            onClick={() => !seg.disabled && onNavigate?.(i)}
            className={`truncate max-w-[200px] ${
              seg.disabled ? "text-gov-muted cursor-default" : "text-gov-navy hover:text-gov-gold hover:underline"
            }`}
          >
            {seg.label}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}
