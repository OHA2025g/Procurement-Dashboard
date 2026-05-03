import React from "react";
import { Button } from "@/components/ui/button";

export default function DrilldownSuggestions({ summary, onSuggestDrill }) {
  if (!summary || typeof onSuggestDrill !== "function") return null;
  const suggestions = [];
  if ((summary.critical_count || 0) > 0) {
    suggestions.push({ label: "Critical risk", filters: { risk_level: "Critical" } });
  }
  if ((summary.high_risk_count || 0) > 0) {
    suggestions.push({ label: "High risk", filters: { risk_level: "High" } });
  }
  if ((summary.backlog_value || 0) > 0) {
    suggestions.push({ label: "Backlog scope", filters: { is_backlog: true } });
  }
  if ((summary.outstanding_amount || 0) > 0) {
    suggestions.push({ label: "Outstanding > 0", filters: { outstanding_amount_gt: true } });
  }
  if (!suggestions.length) return null;

  return (
    <div className="px-5 py-2 border-b border-gov-border bg-white shrink-0 flex flex-wrap items-center gap-2">
      <span className="text-[9px] uppercase tracking-wider text-gov-muted font-data mr-1">Quick filters</span>
      {suggestions.map((s) => (
        <Button
          key={s.label}
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[10px] font-data"
          onClick={() => onSuggestDrill(s.filters)}
        >
          {s.label}
        </Button>
      ))}
    </div>
  );
}
