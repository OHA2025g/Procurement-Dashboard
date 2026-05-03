import React from "react";
import { useFilters } from "@/contexts/FilterContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Filter as FilterIcon, RotateCcw } from "lucide-react";

const ALL = "__all__";

const FilterSelect = ({ testId, value, onChange, placeholder, options }) => (
  <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
    <SelectTrigger
      data-testid={testId}
      className="h-9 w-[160px] bg-white border-gov-border text-[12px] font-data text-gov-navy rounded-sm focus:ring-1 focus:ring-gov-gold"
    >
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent className="font-data text-[12px]">
      <SelectItem value={ALL}>All</SelectItem>
      {options.map((o) => (
        <SelectItem key={o.value || o} value={o.value || o}>
          {o.label || o}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export default function FilterBar() {
  const { filters, updateFilter, clearFilters, meta, activePills } = useFilters();

  const hasActive = activePills.length > 0;

  return (
    <div className="bg-white border border-gov-border rounded-sm shadow-card px-4 py-3 mb-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] font-data text-gov-navy font-semibold">
          <FilterIcon size={13} className="text-gov-gold" /> Filter By
        </div>
        <FilterSelect
          testId="filter-fy"
          value={filters.fy}
          onChange={(v) => updateFilter("fy", v)}
          placeholder="Financial Year"
          options={(meta.financial_years || []).map((fy) => ({ value: fy, label: `FY ${fy}` }))}
        />
        <FilterSelect
          testId="filter-department"
          value={filters.department}
          onChange={(v) => updateFilter("department", v)}
          placeholder="Department"
          options={meta.departments || []}
        />
        <FilterSelect
          testId="filter-category"
          value={filters.category}
          onChange={(v) => updateFilter("category", v)}
          placeholder="Category"
          options={meta.categories || []}
        />
        <FilterSelect
          testId="filter-risk"
          value={filters.risk_level}
          onChange={(v) => updateFilter("risk_level", v)}
          placeholder="Risk Level"
          options={meta.risk_levels || []}
        />
        <FilterSelect
          testId="filter-statement"
          value={filters.statement}
          onChange={(v) => updateFilter("statement", v)}
          placeholder="Statement"
          options={(meta.statements || []).map((s) => ({ value: s.code, label: s.label }))}
        />
        <FilterSelect
          testId="filter-payment"
          value={filters.payment_status}
          onChange={(v) => updateFilter("payment_status", v)}
          placeholder="Payment status"
          options={["fully_paid", "partially_paid", "unpaid", "no_po"].map((x) => ({
            value: x,
            label: x.replace(/_/g, " "),
          }))}
        />
        <Input
          data-testid="filter-search"
          className="h-9 w-[180px] text-[12px] font-data border-gov-border rounded-sm"
          placeholder="Search text…"
          value={filters.search || ""}
          onChange={(e) => updateFilter("search", e.target.value)}
        />
        <Input
          data-testid="filter-batch"
          className="h-9 w-[120px] text-[12px] font-data border-gov-border rounded-sm"
          placeholder="Batch ID"
          value={filters.batch_id || ""}
          onChange={(e) => updateFilter("batch_id", e.target.value)}
        />
        <div className="flex-1" />
        {hasActive && (
          <Button
            onClick={clearFilters}
            variant="ghost"
            size="sm"
            data-testid="filter-clear-btn"
            className="h-9 px-3 text-[11px] uppercase tracking-wider text-gov-crit hover:bg-gov-crit/10 font-data"
          >
            <RotateCcw size={13} className="mr-1.5" /> Clear All
          </Button>
        )}
      </div>
      {hasActive && (
        <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-gov-border">
          <span className="text-[10px] uppercase tracking-[0.14em] text-gov-muted font-data">Active:</span>
          {activePills.map(([k, v]) => (
            <span key={k} className="filter-pill" data-testid={`pill-${k}`}>
              {k.replace("_", " ")}: {v}
              <button onClick={() => updateFilter(k, "")} className="hover:text-gov-gold-soft">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
